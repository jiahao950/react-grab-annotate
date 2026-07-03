import { snapdom } from "@zumer/snapdom";
import { ANNOTATE_SCREENSHOT_MAX_DPR } from "./constants.js";
import { logRecoverableError } from "../utils/log-recoverable-error.js";

// Never serialize our own overlay hosts (marks/cards) or react-grab's overlay
// into a capture, even when the chosen container is an ancestor of them.
const OVERLAY_EXCLUDE_SELECTORS = ["[data-react-grab-annotate]", "[data-react-grab]"];

const getDpr = (): number => Math.min(window.devicePixelRatio || 1, ANNOTATE_SCREENSHOT_MAX_DPR);

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolvePromise, rejectPromise) => {
    const reader = new FileReader();
    reader.onload = () => resolvePromise(String(reader.result));
    reader.onerror = () =>
      rejectPromise(reader.error ?? new Error("Failed to read screenshot blob"));
    reader.readAsDataURL(blob);
  });

export const captureElementPng = async (element: Element): Promise<string | null> => {
  try {
    // `type` (not `format`) selects the raster output for toBlob — with the
    // wrong key snapDOM returns an SVG blob, which saves as a "corrupt" .png.
    //
    // `embedFonts: true` is essential for fidelity: without it snapDOM renders
    // text in a fallback font, so any app with custom web fonts produces a
    // screenshot that looks completely different from what's on screen. Icon
    // fonts embed regardless; this covers the non-icon (body/heading) fonts.
    const blob = await snapdom.toBlob(element, {
      type: "png",
      dpr: getDpr(),
      embedFonts: true,
      exclude: OVERLAY_EXCLUDE_SELECTORS,
    });
    return await blobToDataUrl(blob);
  } catch (error) {
    logRecoverableError("annotate:screenshot", error);
    return null;
  }
};

const isOverlayElement = (element: Element): boolean =>
  element.hasAttribute("data-react-grab-annotate") || element.hasAttribute("data-react-grab");

// Smallest page element that fully contains the region. Capturing this (rather
// than document.body) keeps snapDOM's SVG small enough to rasterize reliably
// (a body-sized foreignObject rasterizes to a blank/transparent canvas).
const findRegionContainer = (
  viewportLeft: number,
  viewportTop: number,
  width: number,
  height: number,
): Element => {
  const candidates = document.elementsFromPoint(viewportLeft + width / 2, viewportTop + height / 2);
  let container: Element | null = candidates.find((element) => !isOverlayElement(element)) ?? null;
  while (container) {
    const rect = container.getBoundingClientRect();
    if (
      rect.left <= viewportLeft &&
      rect.top <= viewportTop &&
      rect.right >= viewportLeft + width &&
      rect.bottom >= viewportTop + height
    ) {
      return container;
    }
    container = container.parentElement;
  }
  return document.body;
};

// Captures the drawn rectangle region (like a screenshot crop): snapshot the
// smallest element containing the region, then crop the canvas to the region.
export const captureRegionPng = async (region: {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}): Promise<string | null> => {
  try {
    if (region.width < 1 || region.height < 1) return null;
    const viewportLeft = region.pageX - window.scrollX;
    const viewportTop = region.pageY - window.scrollY;
    const container = findRegionContainer(viewportLeft, viewportTop, region.width, region.height);
    const dpr = getDpr();
    const sourceCanvas = await snapdom.toCanvas(container, {
      dpr,
      embedFonts: true,
      exclude: OVERLAY_EXCLUDE_SELECTORS,
    });
    const containerRect = container.getBoundingClientRect();
    const scaleX = containerRect.width > 0 ? sourceCanvas.width / containerRect.width : dpr;
    const scaleY = containerRect.height > 0 ? sourceCanvas.height / containerRect.height : dpr;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.max(1, Math.round(region.width * scaleX));
    cropCanvas.height = Math.max(1, Math.round(region.height * scaleY));
    const context = cropCanvas.getContext("2d");
    if (!context) return null;
    context.drawImage(
      sourceCanvas,
      (viewportLeft - containerRect.left) * scaleX,
      (viewportTop - containerRect.top) * scaleY,
      region.width * scaleX,
      region.height * scaleY,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height,
    );
    return cropCanvas.toDataURL("image/png");
  } catch (error) {
    logRecoverableError("annotate:screenshot-region", error);
    return null;
  }
};
