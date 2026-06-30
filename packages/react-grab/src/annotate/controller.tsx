import type { ReactGrabAPI } from "../types.js";
import { createElementSelector } from "../utils/create-element-selector.js";
import { generateId } from "../utils/generate-id.js";
import { logRecoverableError } from "../utils/log-recoverable-error.js";
import { createAnnotateClient, type AnnotateClient } from "./client.js";
import { ANNOTATE_DEFAULT_SERVER_URL, ANNOTATE_TOAST_DURATION_MS } from "./constants.js";
import { mountAnnotateOverlay } from "./mount.js";
import { captureElementPng, captureRegionPng } from "./screenshot.js";
import { createAnnotateStore, type AnnotateStore } from "./store.js";
import { AnnotateOverlay } from "./components/annotate-overlay.js";
import type { AnnotateAnchor, Annotation, CommentSubmitInput } from "./types.js";

export interface AnnotateControllerOptions {
  serverUrl?: string;
  sessionId?: string;
}

export interface AnnotateController {
  handleCommentSubmit: (input: CommentSubmitInput) => void;
  notifyActiveChange: (isActive: boolean) => void;
  enter: () => void;
  submit: () => void;
  dispose: () => void;
}

const createSessionId = (): string => generateId("session");

export const createAnnotateController = (
  api: ReactGrabAPI,
  options: AnnotateControllerOptions = {},
): AnnotateController => {
  const store: AnnotateStore = createAnnotateStore();
  const client: AnnotateClient = createAnnotateClient(
    options.serverUrl ?? ANNOTATE_DEFAULT_SERVER_URL,
  );
  let sessionId = options.sessionId ?? createSessionId();
  let toastTimerId: ReturnType<typeof setTimeout> | undefined;

  const showToast = (message: string): void => {
    store.setToast(message);
    if (toastTimerId !== undefined) clearTimeout(toastTimerId);
    toastTimerId = setTimeout(() => store.setToast(null), ANNOTATE_TOAST_DURATION_MS);
  };

  const startSession = (): void => {
    sessionId = options.sessionId ?? createSessionId();
    store.clear();
    store.setActiveCard(null);
  };

  const onEnter = (): void => {
    api.activate();
  };

  const onCancel = (): void => {
    const toDiscard = [...store.annotations];
    store.clear();
    store.setActiveCard(null);
    api.deactivate();
    for (const annotation of toDiscard) {
      void client.remove(sessionId, annotation.id);
    }
  };

  const onSubmit = async (): Promise<void> => {
    if (store.isSubmitting()) return;
    const count = store.count();
    store.setSubmitting(true);
    try {
      const result = await client.submit(sessionId);
      const markdownPath = result?.markdownPath ?? `<annotate-server unreachable>`;
      store.clear();
      store.setActiveCard(null);
      api.deactivate();
      showToast(`已保存 ${count} 条标注，提示语已复制到剪贴板`);
      // Fire-and-forget: the clipboard write triggers a permission prompt on
      // first use, which must not block the toast / mode exit.
      const message = `我把 ${count} 条标注信息保存到 ${markdownPath}，你读完之后进行项目修改。`;
      void navigator.clipboard
        .writeText(message)
        .catch((error) => logRecoverableError("annotate:clipboard", error));
    } finally {
      store.setSubmitting(false);
    }
  };

  const onSaveCard = (id: string, comment: string): void => {
    store.patch(id, { comment });
    store.setActiveCard(null);
    void client.update(sessionId, id, comment);
  };

  const onDeleteCard = (id: string): void => {
    store.remove(id);
    store.setActiveCard(null);
    void client.remove(sessionId, id);
  };

  const overlay = mountAnnotateOverlay(() => (
    <AnnotateOverlay
      store={store}
      onEnter={onEnter}
      onCancel={onCancel}
      onSubmit={() => void onSubmit()}
      onSaveCard={onSaveCard}
      onDeleteCard={onDeleteCard}
    />
  ));

  api.registerPlugin({
    name: "annotate-anchor",
    // Annotation mode owns the entry UI (single "标注" button + Cancel/Submit),
    // so the built-in three-button toolbar is hidden.
    theme: { toolbar: { enabled: false } },
  });

  // Resolves source location, component stack and screenshot off the critical
  // path, then patches the already-rendered mark and persists it. snapDOM /
  // fiber work must not block the mark from appearing instantly.
  const finalizeAnnotation = async (
    id: string,
    element: Element,
    region: CommentSubmitInput["region"],
  ): Promise<void> => {
    const [source, stackContext, screenshotDataUrl] = await Promise.all([
      api.getSource(element).catch(() => null),
      api.getStackContext(element).catch(() => ""),
      region ? captureRegionPng(region) : captureElementPng(element),
    ]);

    store.patch(id, {
      filePath: source?.filePath ?? "",
      lineNumber: source?.lineNumber ?? null,
      componentName: source?.componentName ?? api.getDisplayName(element),
      stackContext,
      screenshotDataUrl,
    });

    const annotation = store.annotations.find((entry) => entry.id === id);
    if (!annotation) return;
    const saved = await client.save(sessionId, annotation);
    if (saved?.screenshotFile) {
      store.patch(id, { screenshotFile: saved.screenshotFile });
    }
  };

  const buildAnnotation = (input: CommentSubmitInput): void => {
    const element = input.element;
    const rect = element.getBoundingClientRect();

    // The anchor point comes from core (click point for a click, release point
    // for a box selection). It is stored relative to the resolved element so the
    // mark follows that element on scroll; coords are intentionally not clamped
    // so a release point outside the element still pins the mark exactly there.
    const point = input.anchorPoint;
    const anchor: AnnotateAnchor = {
      element,
      mode: point?.mode ?? "click",
      relativeX: point && rect.width > 0 ? (point.x - rect.left) / rect.width : 0.5,
      relativeY: point && rect.height > 0 ? (point.y - rect.top) / rect.height : 0.5,
    };

    // Box selection captures the drawn rectangle as a region (like a screenshot
    // crop); a click captures the selected element itself.
    const region = input.region ?? null;
    const bounds = region
      ? { x: region.pageX, y: region.pageY, width: region.width, height: region.height }
      : {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        };

    const id = generateId("annotation");
    const annotation: Annotation = {
      id,
      number: store.nextNumber(),
      comment: input.comment,
      filePath: "",
      lineNumber: null,
      componentName: api.getDisplayName(element),
      tagName: element.tagName.toLowerCase(),
      selector: createElementSelector(element),
      stackContext: "",
      bounds,
      url: window.location.href,
      anchor,
      screenshotFile: null,
      screenshotDataUrl: null,
    };

    // Render the mark synchronously; fill in the heavy bits afterwards.
    store.add(annotation);
    void finalizeAnnotation(id, element, region);
  };

  return {
    handleCommentSubmit: (input) => {
      buildAnnotation(input);
    },
    notifyActiveChange: (isActive) => {
      if (isActive && !store.isActive() && store.count() === 0) {
        startSession();
      }
      store.setActive(isActive);
    },
    enter: onEnter,
    submit: () => void onSubmit(),
    dispose: () => {
      if (toastTimerId !== undefined) clearTimeout(toastTimerId);
      overlay.dispose();
      api.unregisterPlugin("annotate-anchor");
    },
  };
};
