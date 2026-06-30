import { snapdom } from "@zumer/snapdom";
import { ANNOTATE_SCREENSHOT_MAX_DPR } from "./constants.js";
import { logRecoverableError } from "../utils/log-recoverable-error.js";

// Never serialize our own overlay hosts (marks/cards) or react-grab's overlay
// into a capture, even when the chosen container is an ancestor of them.
const OVERLAY_EXCLUDE_SELECTORS = ["[data-react-grab-annotate]", "[data-react-grab]"];

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
    const dpr = Math.min(window.devicePixelRatio || 1, ANNOTATE_SCREENSHOT_MAX_DPR);
    const blob = await snapdom.toBlob(element, {
      format: "png",
      dpr,
      fast: true,
      exclude: OVERLAY_EXCLUDE_SELECTORS,
    });
    return await blobToDataUrl(blob);
  } catch (error) {
    logRecoverableError("annotate:screenshot", error);
    return null;
  }
};

// Captures the drawn rectangle region (like a screenshot crop). It snapshots
// document.body (whose box always equals its full content, so the canvas maps
// 1:1 to page coordinates at `dpr` — no overflow/scroll scale mismatch) and
// crops to the region.
export const captureRegionPng = async (region: {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}): Promise<string | null> => {
  try {
    if (region.width < 1 || region.height < 1) return null;
    const body = document.body;
    const dpr = Math.min(window.devicePixelRatio || 1, ANNOTATE_SCREENSHOT_MAX_DPR);
    const sourceCanvas = await snapdom.toCanvas(body, {
      dpr,
      fast: true,
      exclude: OVERLAY_EXCLUDE_SELECTORS,
    });
    const bodyRect = body.getBoundingClientRect();
    const scaleX = bodyRect.width > 0 ? sourceCanvas.width / bodyRect.width : dpr;
    const scaleY = bodyRect.height > 0 ? sourceCanvas.height / bodyRect.height : dpr;

    // bodyRect.left/top are in viewport space; the region is in page space.
    const viewportLeft = region.pageX - window.scrollX;
    const viewportTop = region.pageY - window.scrollY;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.max(1, Math.round(region.width * scaleX));
    cropCanvas.height = Math.max(1, Math.round(region.height * scaleY));
    const context = cropCanvas.getContext("2d");
    if (!context) return null;
    context.drawImage(
      sourceCanvas,
      (viewportLeft - bodyRect.left) * scaleX,
      (viewportTop - bodyRect.top) * scaleY,
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
