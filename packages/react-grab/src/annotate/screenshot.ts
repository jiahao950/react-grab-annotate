import { snapdom } from "@zumer/snapdom";
import {
  ANNOTATE_SCREENSHOT_FULL_MAX_DPR,
  ANNOTATE_SCREENSHOT_WEBP_QUALITY,
} from "./constants.js";
import { logRecoverableError } from "../utils/log-recoverable-error.js";

// Never serialize our own overlay hosts (marks/cards) or react-grab's overlay
// into a capture, even when the chosen container is an ancestor of them.
const OVERLAY_EXCLUDE_SELECTORS = ["[data-react-grab-annotate]", "[data-react-grab]"];

// Highlight styling. A translucent fill plus a solid border mirrors the
// on-screen selection block so the reader immediately sees what was annotated.
const HIGHLIGHT_FILL = "rgba(79, 70, 229, 0.18)";
const HIGHLIGHT_STROKE = "rgba(79, 70, 229, 0.95)";
const HIGHLIGHT_BORDER_PX = 2;

/** Highlight rectangle in viewport (client) coordinates. */
export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const getFullCaptureDpr = (): number =>
  Math.min(window.devicePixelRatio || 1, ANNOTATE_SCREENSHOT_FULL_MAX_DPR);

// The highlight must render under the SAME transforms snapDOM applies to the
// target — a fixed/centered modal, a translated dialog, etc. snapDOM re-lays-out
// those out-of-flow subtrees at a different origin than the live viewport, so a
// highlight drawn at live coordinates would land in the wrong place. Injecting
// it into the target's containing block (the ancestor absolute positioning
// resolves against) makes it move together with the target, wherever snapDOM
// puts that subtree. Falls back to <body> for normal-flow content.
const findContainingBlock = (element: Element): Element => {
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (
      style.position !== "static" ||
      style.transform !== "none" ||
      style.translate !== "none" ||
      style.rotate !== "none" ||
      style.scale !== "none" ||
      style.perspective !== "none" ||
      style.filter !== "none" ||
      style.willChange.includes("transform")
    ) {
      return ancestor;
    }
  }
  return document.body;
};

// Absolutely-positioned highlight overlays, positioned relative to the target's
// containing block so they track it through snapDOM's re-layout. Returns a
// cleanup that removes them.
const injectHighlights = (highlights: HighlightRect[], anchor: Element): (() => void) => {
  const containingBlock = findContainingBlock(anchor);
  const blockRect = containingBlock.getBoundingClientRect();
  const injected: HTMLElement[] = [];
  for (const rect of highlights) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const overlay = document.createElement("div");
    // Offset from the containing block's padding edge (getBoundingClientRect
    // already accounts for page scroll; clientLeft/Top strip its border, and
    // scrollLeft/Top account for its own scroll).
    const left = rect.x - blockRect.left - containingBlock.clientLeft + containingBlock.scrollLeft;
    const top = rect.y - blockRect.top - containingBlock.clientTop + containingBlock.scrollTop;
    overlay.style.cssText = [
      "position:absolute",
      `left:${left}px`,
      `top:${top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      `background:${HIGHLIGHT_FILL}`,
      `border:${HIGHLIGHT_BORDER_PX}px solid ${HIGHLIGHT_STROKE}`,
      "box-sizing:border-box",
      "border-radius:2px",
      "pointer-events:none",
      "margin:0",
      "z-index:2147483000",
    ].join(";");
    containingBlock.appendChild(overlay);
    injected.push(overlay);
  }
  return () => {
    for (const overlay of injected) overlay.remove();
  };
};

// Snapshot the whole page, then crop to the currently visible viewport. This is
// "the page at the moment of annotation" — the element in its surrounding
// context — rather than an isolated crop that carries no positional meaning.
const captureViewportCanvas = async (): Promise<HTMLCanvasElement | null> => {
  const dpr = getFullCaptureDpr();
  const root = document.documentElement;
  const sourceCanvas = await snapdom.toCanvas(root, {
    dpr,
    embedFonts: true,
    exclude: OVERLAY_EXCLUDE_SELECTORS,
  });

  const rootRect = root.getBoundingClientRect();
  // Canvas pixels per CSS pixel. When the page is scrolled, the root element's
  // top-left sits at (rootRect.left, rootRect.top) in viewport coords (negative
  // when scrolled), so the visible viewport maps to (-left, -top) in the canvas.
  const scale = rootRect.width > 0 ? sourceCanvas.width / rootRect.width : dpr;
  const sourceX = -rootRect.left * scale;
  const sourceY = -rootRect.top * scale;
  const sourceWidth = window.innerWidth * scale;
  const sourceHeight = window.innerHeight * scale;

  const viewportCanvas = document.createElement("canvas");
  viewportCanvas.width = Math.max(1, Math.round(sourceWidth));
  viewportCanvas.height = Math.max(1, Math.round(sourceHeight));
  const context = viewportCanvas.getContext("2d");
  if (!context) return null;
  context.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    viewportCanvas.width,
    viewportCanvas.height,
  );
  return viewportCanvas;
};

// Full-viewport screenshot with the selection highlight(s) drawn on top,
// encoded as WebP. Combined with the comment and source location this is the
// most self-explanatory record: an agent can see exactly what was pointed at
// and where it lives on the page. `anchor` is an element inside the selection;
// its containing block anchors the highlight so it tracks modals/transforms.
export const captureAnnotationScreenshot = async (
  highlights: HighlightRect[],
  anchor: Element,
): Promise<string | null> => {
  let removeHighlights: (() => void) | null = null;
  try {
    removeHighlights = injectHighlights(highlights, anchor);
    const canvas = await captureViewportCanvas();
    if (!canvas) return null;
    return canvas.toDataURL("image/webp", ANNOTATE_SCREENSHOT_WEBP_QUALITY);
  } catch (error) {
    logRecoverableError("annotate:screenshot", error);
    return null;
  } finally {
    if (removeHighlights) removeHighlights();
  }
};
