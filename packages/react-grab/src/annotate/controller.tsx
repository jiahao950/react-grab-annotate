import type { ReactGrabAPI } from "../types.js";
import { createElementSelector } from "../utils/create-element-selector.js";
import { generateId } from "../utils/generate-id.js";
import { logRecoverableError } from "../utils/log-recoverable-error.js";
import { createAnnotateClient, type AnnotateClient, type SessionImage } from "./client.js";
import { ANNOTATE_DEFAULT_SERVER_URL, ANNOTATE_TOAST_DURATION_MS } from "./constants.js";
import { mountAnnotateOverlay } from "./mount.js";
import { captureAnnotationScreenshot, warmScreenshotCache } from "./screenshot.js";
import { createAnnotateStore, type AnnotateStore } from "./store.js";
import { AnnotateOverlay } from "./components/annotate-overlay.js";
import type {
  AnnotateAnchor,
  AnnotateHighlight,
  Annotation,
  AnnotationRecord,
  CommentSubmitInput,
  ComponentChainEntry,
} from "./types.js";

export interface AnnotateControllerOptions {
  serverUrl?: string;
  sessionId?: string;
}

export interface AnnotateController {
  handleCommentSubmit: (input: CommentSubmitInput) => void;
  notifyActiveChange: (isActive: boolean) => void;
  enter: () => void;
  submit: () => void;
  /** Leave annotation mode without submitting (same as the Cancel button). */
  exit: () => void;
  dispose: () => void;
}

// Runs work after the browser has had a chance to paint, so a freshly-added
// mark shows instantly before snapDOM's heavy synchronous work (font embedding
// + rasterization) starts. Always resolves — even in a backgrounded tab where
// requestAnimationFrame is throttled — so a later submit never hangs waiting.
const deferCapture = (work: () => Promise<void>): Promise<void> =>
  new Promise((resolve) => {
    let started = false;
    const run = (): void => {
      if (started) return;
      started = true;
      void work().then(resolve, resolve);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(run));
      setTimeout(run, 120);
    } else {
      setTimeout(run, 0);
    }
  });

// Short, path-friendly session id (the folder name in the copied prompt path).
const createSessionId = (): string =>
  `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;

const toRecord = (annotation: Annotation): AnnotationRecord => ({
  number: annotation.number,
  comment: annotation.comment,
  filePath: annotation.filePath,
  lineNumber: annotation.lineNumber,
  componentName: annotation.componentName,
  componentChain: annotation.componentChain,
  coveredComponents: annotation.coveredComponents,
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

  // In-flight screenshot/sync work. Submit must wait for these so it never
  // persists before a screenshot finishes, and so a late task can't clobber
  // the submitted markdown.
  const pendingTasks = new Set<Promise<unknown>>();
  const track = <T,>(promise: Promise<T>): Promise<T> => {
    pendingTasks.add(promise);
    void promise.finally(() => pendingTasks.delete(promise));
    return promise;
  };

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
    // Warm snapDOM's font/resource cache while the user selects, so the
    // screenshot at submit time isn't stalled fetching + embedding fonts.
    warmScreenshotCache();
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
      // Wait for every in-flight screenshot/sync to finish (spinner shows
      // meanwhile), then write the final snapshot.
      await Promise.allSettled([...pendingTasks]);
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
    void track(syncToServer());
  };

  const onDeleteCard = (id: string): void => {
    store.remove(id);
    store.setActiveCard(null);
    void track(syncToServer());
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
    elements: Element[],
    region: CommentSubmitInput["region"],
  ): Promise<void> => {
    const stored = store.annotations.find((entry) => entry.id === id);
    const number = stored?.number;
    // Reuse the highlight captured at creation (fixed viewport coords) as the
    // screenshot highlight, so the shot matches the on-screen overlay exactly.
    const highlights = stored?.highlights ?? [];

    const [source, componentChain, screenshotDataUrl] = await Promise.all([
      api.getSource(element).catch(() => null),
      api.getComponentChain(element).catch(() => []),
      captureAnnotationScreenshot(highlights, element),
    ]);

    // A box/region selection means "act on all of these sibling elements", so
    // list EVERY selected element's innermost feature component. Do NOT merge or
    // dedupe by component: two siblings that share a component (e.g. rows in a
    // list) are distinct targets and must both appear.
    let coveredComponents: ComponentChainEntry[] = [];
    if (region && elements.length > 1) {
      const covered = elements.slice(0, 24);
      const chains = await Promise.all(
        covered.map((entry) => api.getComponentChain(entry).catch(() => [])),
      );
      chains.forEach((chain, index) => {
        const head = chain[0];
        // Sibling elements often share a component + source line, so tag each
        // with its own selector to keep them distinguishable.
        if (head) coveredComponents.push({ ...head, selector: createElementSelector(covered[index]) });
      });
      if (coveredComponents.length <= 1) coveredComponents = [];
    }

    const screenshotFile = screenshotDataUrl && number !== undefined ? `image-${number}.webp` : null;
    store.patch(id, {
      filePath: source?.filePath ?? "",
      lineNumber: source?.lineNumber ?? null,
      // Take the name from the SAME resolution as the file (resolveSource, which
      // now resolves both from the element's `_debugOwner` author). Using the
      // sync getDisplayName here instead would let the name and the file:line
      // disagree (e.g. name OptionItem, file OptionsDialogContentSimpleBar.tsx).
      // The innermost feature component in the chain is the selected thing;
      // fall back to the resolved source / sync name when there's no chain.
      componentName:
        coveredComponents.length > 1
          ? Array.from(new Set(coveredComponents.map((entry) => entry.name))).join(" / ")
          : (componentChain[0]?.name ?? source?.componentName ?? api.getDisplayName(element) ?? null),
      componentChain,
      coveredComponents,
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
    // selection). We pin the mark to the viewport position at creation (x/y) so
    // it's an independent overlay layer — it never vanishes when the element
    // unmounts (virtualized lists) or scrolls.
    const point = input.anchorPoint;
    const anchor: AnnotateAnchor = {
      element,
      mode: point?.mode ?? "click",
      relativeX: point && rect.width > 0 ? (point.x - rect.left) / rect.width : 0.5,
      relativeY: point && rect.height > 0 ? (point.y - rect.top) / rect.height : 0.5,
      x: point?.x ?? rect.left + rect.width / 2,
      y: point?.y ?? rect.top + rect.height / 2,
    };

    // Selection highlight box(es) in viewport coords, captured now: the drag
    // rectangle for a box selection, the element's bounds for a click. Rendered
    // as a fixed overlay and reused as the screenshot highlight.
    const highlights: AnnotateHighlight[] = input.region
      ? [
          {
            x: input.region.pageX - window.scrollX,
            y: input.region.pageY - window.scrollY,
            width: input.region.width,
            height: input.region.height,
          },
        ]
      : [{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }];

    const id = generateId("annotation");
    const annotation: Annotation = {
      id,
      number: store.nextNumber(),
      comment: input.comment,
      filePath: "",
      lineNumber: null,
      componentName: api.getDisplayName(element),
      componentChain: [],
      coveredComponents: [],
      tagName: element.tagName.toLowerCase(),
      selector: createElementSelector(element),
      url: window.location.href,
      anchor,
      highlights,
      screenshotFile: null,
      screenshotDataUrl: null,
    };

    // Render the mark synchronously so Enter feels instant (optimistic). The
    // heavy source-resolution + screenshot work is deferred to after paint and
    // tracked, so only the final submit shows a spinner while it drains.
    store.add(annotation);
    const elements = input.elements.length > 0 ? input.elements : [element];
    void track(deferCapture(() => finalizeAnnotation(id, element, elements, input.region ?? null)));
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
    exit: onCancel,
    dispose: () => {
      if (toastTimerId !== undefined) clearTimeout(toastTimerId);
      overlay.dispose();
      api.unregisterPlugin("annotate-anchor");
    },
  };
};
