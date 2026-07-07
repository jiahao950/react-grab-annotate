import { snapdom, preCache } from "@zumer/snapdom";
import { ANNOTATE_SCREENSHOT_WEBP_QUALITY } from "./constants.js";
import { logRecoverableError } from "../utils/log-recoverable-error.js";

// Our own overlay/shadow hosts — never serialized into a capture.
const OVERLAY_SELECTORS = ["[data-react-grab-annotate]", "[data-react-grab]"];

// A solid border frames the crop as the annotated selection.
const HIGHLIGHT_STROKE = "rgba(79, 70, 229, 0.95)";
const HIGHLIGHT_BORDER_PX = 2;
const FALLBACK_BACKGROUND = "#ffffff";

/** Highlight rectangle in viewport (client) coordinates. */
export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The capture is a small crop of the selection, so render it crisp: at least 2x
// (so text stays sharp when the image is viewed larger than 1:1) and at most 3x
// (to bound the source canvas size). Not tied to the device's ratio, which can
// be 1 on a plain display and leave the crop blurry.
const getCaptureDpr = (): number => Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);

// The slow part of a capture is embedFonts (fetch + base64 every font file).
// Warm snapDOM's font/resource cache once when entering annotate mode — while
// the user is still selecting — so the capture at submit time is fast. Fonts
// stay cached across captures (default "soft" cache keeps them). Fire-and-forget.
export const warmScreenshotCache = (): void => {
  try {
    // 2.12.9 signature is positional: preCache(root, options).
    void preCache(document.body, { embedFonts: true }).catch((error) =>
      logRecoverableError("annotate:screenshot-precache", error),
    );
  } catch (error) {
    logRecoverableError("annotate:screenshot-precache", error);
  }
};

const isOverlayElement = (element: Element): boolean =>
  element.hasAttribute("data-react-grab-annotate") || element.hasAttribute("data-react-grab");

const isTransparentColor = (color: string): boolean =>
  !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";

// Most app content has a transparent background (the page color lives on <body>
// or <html>), so a cropped subtree capture comes out transparent. Resolve the
// nearest opaque background up the ancestor chain and paint it behind the crop
// so the screenshot always has a solid, on-brand backdrop.
const resolveBackgroundColor = (element: Element): string => {
  for (let el: Element | null = element; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (!isTransparentColor(color)) return color;
  }
  const bodyColor = getComputedStyle(document.body).backgroundColor;
  if (!isTransparentColor(bodyColor)) return bodyColor;
  const htmlColor = getComputedStyle(document.documentElement).backgroundColor;
  return isTransparentColor(htmlColor) ? FALLBACK_BACKGROUND : htmlColor;
};

const unionRect = (rects: HighlightRect[]): HighlightRect | null => {
  const valid = rects.filter((rect) => rect.width > 0 && rect.height > 0);
  if (valid.length === 0) return null;
  const left = Math.min(...valid.map((rect) => rect.x));
  const top = Math.min(...valid.map((rect) => rect.y));
  const right = Math.max(...valid.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...valid.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

// Smallest element that fully contains the region (viewport coords), skipping
// our overlay and any scroll container. snapDOM cannot render a scroll container
// (nor document.body containing a virtualized list) — it comes out blank — but a
// small, non-scrolled subtree below it captures reliably.
const findRegionContainer = (region: HighlightRect): Element => {
  const centerX = region.x + region.width / 2;
  const centerY = region.y + region.height / 2;
  const candidates = document.elementsFromPoint(centerX, centerY);
  let container: Element | null = candidates.find((el) => !isOverlayElement(el)) ?? null;
  while (container && container !== document.body) {
    const rect = container.getBoundingClientRect();
    const style = getComputedStyle(container);
    const isScroller =
      container.scrollTop > 0 ||
      ((style.overflowY === "auto" || style.overflowY === "scroll") &&
        container.scrollHeight > container.clientHeight + 1);
    if (
      !isScroller &&
      rect.left <= region.x &&
      rect.top <= region.y &&
      rect.right >= region.x + region.width &&
      rect.bottom >= region.y + region.height
    ) {
      return container;
    }
    container = container.parentElement;
  }
  return document.body;
};

// Screenshot of the user's selection at annotation time, as WebP. Always
// captures the smallest non-scroll element containing the selection and crops to
// it (this is the only thing snapDOM renders reliably inside virtualized/custom
// scroll containers), paints a solid background behind it so it's never
// transparent, and frames it with a highlight border. Zero DOM injection.
export const captureAnnotationScreenshot = async (
  highlights: HighlightRect[],
  anchor: Element,
): Promise<string | null> => {
  try {
    const region = unionRect(highlights) ?? anchor.getBoundingClientRect();
    if (region.width < 1 || region.height < 1) return null;

    const container = findRegionContainer(region);
    const backgroundColor = resolveBackgroundColor(container);
    const source = await snapdom.toCanvas(container, {
      dpr: getCaptureDpr(),
      embedFonts: true,
      exclude: OVERLAY_SELECTORS,
    });
    const containerRect = container.getBoundingClientRect();
    const scaleX = containerRect.width > 0 ? source.width / containerRect.width : getCaptureDpr();
    const scaleY = containerRect.height > 0 ? source.height / containerRect.height : getCaptureDpr();

    const crop = document.createElement("canvas");
    crop.width = Math.max(1, Math.round(region.width * scaleX));
    crop.height = Math.max(1, Math.round(region.height * scaleY));
    const context = crop.getContext("2d");
    if (!context) return null;

    // Solid backdrop first, so transparent content never leaves a checkerboard.
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, crop.width, crop.height);
    context.drawImage(
      source,
      (region.x - containerRect.left) * scaleX,
      (region.y - containerRect.top) * scaleY,
      region.width * scaleX,
      region.height * scaleY,
      0,
      0,
      crop.width,
      crop.height,
    );
    context.lineWidth = HIGHLIGHT_BORDER_PX * scaleX;
    context.strokeStyle = HIGHLIGHT_STROKE;
    context.strokeRect(0, 0, crop.width, crop.height);
    return crop.toDataURL("image/webp", ANNOTATE_SCREENSHOT_WEBP_QUALITY);
  } catch (error) {
    logRecoverableError("annotate:screenshot", error);
    return null;
  }
};
