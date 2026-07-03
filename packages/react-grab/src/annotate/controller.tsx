import type { ReactGrabAPI } from "../types.js";
import { createElementSelector } from "../utils/create-element-selector.js";
import { generateId } from "../utils/generate-id.js";
import { logRecoverableError } from "../utils/log-recoverable-error.js";
import { createAnnotateClient, type AnnotateClient, type SessionImage } from "./client.js";
import { ANNOTATE_DEFAULT_SERVER_URL, ANNOTATE_TOAST_DURATION_MS } from "./constants.js";
import { mountAnnotateOverlay } from "./mount.js";
import { captureElementPng, captureRegionPng } from "./screenshot.js";
import { createAnnotateStore, type AnnotateStore } from "./store.js";
import { AnnotateOverlay } from "./components/annotate-overlay.js";
import type { AnnotateAnchor, Annotation, AnnotationRecord, CommentSubmitInput } from "./types.js";

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

// Short, path-friendly session id (the folder name in the copied prompt path).
const createSessionId = (): string =>
  `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;

const toRecord = (annotation: Annotation): AnnotationRecord => ({
  number: annotation.number,
  comment: annotation.comment,
  filePath: annotation.filePath,
  lineNumber: annotation.lineNumber,
  componentName: annotation.componentName,
  tagName: annotation.tagName,
  selector: annotation.selector,
  url: annotation.url,
  screenshotFile: annotation.screenshotFile,
});

export const createAnnotateController = (
  api: ReactGrabAPI,
  options: AnnotateControllerOptions = {},
): AnnotateController => {
  const store: AnnotateStore = createAnnotateStore();
  const client: AnnotateClient = createAnnotateClient(
    options.serverUrl ?? ANNOTATE_DEFAULT_SERVER_URL,
  );
  let sessionId = options.sessionId ?? createSessionId();
  let lastMarkdownPath = "";
  let toastTimerId: ReturnType<typeof setTimeout> | undefined;

  const showToast = (message: string): void => {
    store.setToast(message);
    if (toastTimerId !== undefined) clearTimeout(toastTimerId);
    toastTimerId = setTimeout(() => store.setToast(null), ANNOTATE_TOAST_DURATION_MS);
  };

  // The client store is the source of truth; every change re-syncs the full
  // snapshot so the server just rewrites annotations.md.
  const syncToServer = async (image?: SessionImage | null): Promise<void> => {
    const records = store.annotations.map(toRecord);
    const result = await client.sync(sessionId, records, image);
    if (result?.markdownPath) lastMarkdownPath = result.markdownPath;
  };

  const startSession = (): void => {
    sessionId = options.sessionId ?? createSessionId();
    lastMarkdownPath = "";
    store.clear();
    store.setActiveCard(null);
  };

  const onEnter = (): void => {
    api.activate();
  };

  const onCancel = (): void => {
    const discardedSessionId = sessionId;
    store.clear();
    store.setActiveCard(null);
    api.deactivate();
    void client.remove(discardedSessionId);
  };

  const onSubmit = async (): Promise<void> => {
    if (store.isSubmitting()) return;
    const count = store.count();
    store.setSubmitting(true);
    try {
      await syncToServer();
      const markdownPath = lastMarkdownPath || "<annotate-server unreachable>";
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
    void syncToServer();
  };

  const onDeleteCard = (id: string): void => {
    store.remove(id);
    store.setActiveCard(null);
    void syncToServer();
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

  // Resolves source location + screenshot off the critical path, then patches
  // the already-rendered mark and syncs. snapDOM / fiber work must not block the
  // mark from appearing instantly.
  const finalizeAnnotation = async (
    id: string,
    element: Element,
    region: CommentSubmitInput["region"],
  ): Promise<void> => {
    const number = store.annotations.find((entry) => entry.id === id)?.number;
    const [source, screenshotDataUrl] = await Promise.all([
      api.getSource(element).catch(() => null),
      region ? captureRegionPng(region) : captureElementPng(element),
    ]);

    const screenshotFile = screenshotDataUrl && number !== undefined ? `image-${number}.png` : null;
    store.patch(id, {
      filePath: source?.filePath ?? "",
      lineNumber: source?.lineNumber ?? null,
      componentName: source?.componentName ?? api.getDisplayName(element),
      screenshotDataUrl,
      screenshotFile,
    });

    const image: SessionImage | null =
      screenshotFile && screenshotDataUrl
        ? { file: screenshotFile, base64: screenshotDataUrl }
        : null;
    await syncToServer(image);
  };

  const buildAnnotation = (input: CommentSubmitInput): void => {
    const element = input.element;
    const rect = element.getBoundingClientRect();

    // Anchor comes from core (click point for a click, release point for a box
    // selection), stored relative to the element so the mark follows on scroll.
    const point = input.anchorPoint;
    const anchor: AnnotateAnchor = {
      element,
      mode: point?.mode ?? "click",
      relativeX: point && rect.width > 0 ? (point.x - rect.left) / rect.width : 0.5,
      relativeY: point && rect.height > 0 ? (point.y - rect.top) / rect.height : 0.5,
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
      url: window.location.href,
      anchor,
      screenshotFile: null,
      screenshotDataUrl: null,
    };

    // Render the mark synchronously; fill in the heavy bits afterwards.
    store.add(annotation);
    void finalizeAnnotation(id, element, input.region ?? null);
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
