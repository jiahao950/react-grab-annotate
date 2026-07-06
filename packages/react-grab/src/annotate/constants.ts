export const ANNOTATE_HOST_ATTRIBUTE = "data-react-grab-annotate";
export const ANNOTATE_DEFAULT_SERVER_URL = "http://127.0.0.1:5179";
export const ANNOTATE_DRAG_THRESHOLD_PX = 6;
export const ANNOTATE_MARK_SIZE_PX = 24;
export const ANNOTATE_SCREENSHOT_PADDING_PX = 4;
export const ANNOTATE_SCREENSHOT_MAX_DPR = 2;
// Full-viewport captures are large, so cap the DPR lower than a cropped region
// would need and lean on WebP compression to keep the saved file small.
export const ANNOTATE_SCREENSHOT_FULL_MAX_DPR = 1.5;
export const ANNOTATE_SCREENSHOT_WEBP_QUALITY = 0.82;
export const ANNOTATE_CARD_WIDTH_PX = 280;
export const ANNOTATE_CARD_OFFSET_PX = 12;
export const ANNOTATE_CARD_VIEWPORT_MARGIN_PX = 12;
export const ANNOTATE_Z_INDEX = 2147483646;
export const ANNOTATE_TOAST_DURATION_MS = 3200;
