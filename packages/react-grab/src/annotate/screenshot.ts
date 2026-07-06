import { snapdom } from "@zumer/snapdom";
import {
  ANNOTATE_SCREENSHOT_FULL_MAX_DPR,
  ANNOTATE_SCREENSHOT_WEBP_QUALITY,
} from "./constants.js";
import { logRecoverableError } from "../utils/log-recoverable-error.js";

// Never serialize our own overlay hosts (marks/cards) or react-grab's overlay
// into a capture, even when the chosen container is an ancestor of them. The
// selection highlight is drawn onto the canvas afterwards instead, so the shot
// stays a clean page snapshot plus one crisp highlight.
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

// Snapshot the whole page, then crop to the currently visible viewport. This is
// "the page at the moment of annotation" — the element in its surrounding
// context — rather than an isolated crop that carries no positional meaning.
const captureViewportCanvas = async (): Promise<{
  canvas: HTMLCanvasElement;
  scale: number;
} | null> => {
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
  return { canvas: viewportCanvas, scale };
};

const drawHighlights = (
  context: CanvasRenderingContext2D,
  highlights: HighlightRect[],
  scale: number,
): void => {
  for (const rect of highlights) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const x = rect.x * scale;
    const y = rect.y * scale;
    const width = rect.width * scale;
    const height = rect.height * scale;
    context.save();
    context.fillStyle = HIGHLIGHT_FILL;
    context.fillRect(x, y, width, height);
    context.lineWidth = HIGHLIGHT_BORDER_PX * scale;
    context.strokeStyle = HIGHLIGHT_STROKE;
    context.strokeRect(x, y, width, height);
    context.restore();
  }
};

// Full-viewport screenshot with the selection highlight(s) drawn on top,
// encoded as WebP. Combined with the comment and source location this is the
// most self-explanatory record: an agent can see exactly what was pointed at
// and where it lives on the page.
export const captureAnnotationScreenshot = async (
  highlights: HighlightRect[],
): Promise<string | null> => {
  try {
    const result = await captureViewportCanvas();
    if (!result) return null;
    const context = result.canvas.getContext("2d");
    if (context) drawHighlights(context, highlights, result.scale);
    return result.canvas.toDataURL("image/webp", ANNOTATE_SCREENSHOT_WEBP_QUALITY);
  } catch (error) {
    logRecoverableError("annotate:screenshot", error);
    return null;
  }
};
