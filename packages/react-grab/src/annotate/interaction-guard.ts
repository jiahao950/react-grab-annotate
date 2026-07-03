import { isEventFromOverlay } from "../utils/is-event-from-overlay.js";

// Annotate mode keeps the page LIVE (unlike the copy flow, which freezes it with
// `html { pointer-events: none }` + `body { touch-action: none }`). A frozen page
// can't scroll — custom scroll containers (e.g. simplebar) never receive the
// wheel event because their target inherits pointer-events:none — and the
// freeze/unfreeze cycle on exit flushes queued React updates, which makes page
// tooltips (floating-ui, etc.) flash for a frame.
//
// So instead of freezing, annotate mode installs this lightweight guard: it
// swallows the page's hover + legacy mouse side effects (so hovering to place a
// mark never triggers page tooltips/hover styles, and a placement click never
// activates the underlying control) while leaving wheel / scroll / touch / key
// events completely untouched — the page scrolls exactly as normal.
//
// Events originating inside the annotate overlay pass straight through, so its
// own cards, tooltips, and comment textarea keep working.

// Hover side effects to suppress on the page (page tooltips, hover styling).
// react-grab drives its own selection off pointermove / pointerdown / pointerup,
// none of which are in this list, so blocking these is safe.
const HOVER_EVENTS = [
  "mouseover",
  "mouseout",
  "mouseenter",
  "mouseleave",
  "pointerover",
  "pointerout",
  "pointerenter",
  "pointerleave",
] as const;

// Legacy mouse click duplicates react-grab does NOT already stop in capture
// (it handles pointerdown / pointerup / click / contextmenu itself). Blocking
// these stops a placement click from focusing/activating the page control
// beneath the cursor. Pointer events are intentionally absent so react-grab
// still receives them.
const CLICK_EVENTS = ["mousedown", "mouseup", "dblclick", "auxclick"] as const;

const GUARDED_EVENTS = [...HOVER_EVENTS, ...CLICK_EVENTS] as const;

const guard = (event: Event): void => {
  // Let the annotate overlay's own UI (cards, tooltips, textarea) interact.
  if (isEventFromOverlay(event, "data-react-grab-ignore-events")) return;
  event.stopImmediatePropagation();
  // preventDefault on the presses stops page focus / text-selection / default
  // activation; harmless for the hover events.
  if (event.cancelable) event.preventDefault();
};

let installed = false;

export const installAnnotateInteractionGuard = (): void => {
  if (installed) return;
  installed = true;
  for (const type of GUARDED_EVENTS) {
    document.addEventListener(type, guard, true);
  }
};

export const removeAnnotateInteractionGuard = (): void => {
  if (!installed) return;
  installed = false;
  for (const type of GUARDED_EVENTS) {
    document.removeEventListener(type, guard, true);
  }
};
