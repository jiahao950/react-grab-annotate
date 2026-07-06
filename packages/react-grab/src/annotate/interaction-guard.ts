import { isEventFromOverlay } from "../utils/is-event-from-overlay.js";

// Annotate mode keeps the page LIVE (unlike the copy flow, which freezes it with
// `html { pointer-events: none }` + `body { touch-action: none }`). A frozen page
// can't scroll — custom scroll containers (e.g. simplebar) never receive the
// wheel event because their target inherits pointer-events:none — and the
// freeze/unfreeze cycle on exit flushes queued React updates, which makes page
// tooltips (floating-ui, etc.) flash for a frame.
//
// So instead of freezing, annotate mode installs this lightweight guard: it
// swallows the page's hover / focus / press side effects (so interacting to
// place a mark never triggers page tooltips, hover styling, focus rings, or
// activates the underlying control) while leaving wheel / scroll / touchmove /
// key events untouched — the page scrolls exactly as normal.
//
// It is important to block a tooltip's *show* AND *hide* triggers symmetrically:
// on touch devices the show can fire via touchstart/focus while the hide fires
// via pointerleave/blur. If only the hide were blocked, a tooltip would appear
// and then stay on screen forever. Covering hover + touch + focus keeps the page
// from ever showing one.
//
// Events originating inside the annotate overlay pass straight through, so its
// own cards, tooltips, and comment textarea keep working.

// Hover side effects to suppress (page tooltips, hover styling). react-grab
// drives its own selection off pointermove / pointerdown / pointerup, none of
// which are here, so blocking these is safe.
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
// these stops a placement click from focusing/activating the page control.
const PRESS_EVENTS = ["mousedown", "mouseup", "dblclick", "auxclick"] as const;

// Focus-triggered tooltips/popovers (floating-ui `useFocus`, etc.). Blocking
// focusin stops the reference element from opening on tap-focus.
const FOCUS_EVENTS = ["focusin", "focusout"] as const;

// Events stopped WITHOUT preventDefault — see `guardTouch`. Touch must not be
// prevented or native scrolling breaks. `mousemove` must not be prevented
// either, but it MUST be stopped: floating-ui's useHover opens a tooltip on
// mouse-move over the reference (its `move` option, on by default), so blocking
// only enter/over lets the tooltip slip through on the first move and — because
// the matching leave is blocked too — pile up and never dismiss. react-grab
// tracks the pointer via `pointermove` (not `mousemove`), so stopping the legacy
// `mousemove` is safe for its own hit-testing.
const STOP_ONLY_EVENTS = ["touchstart", "touchend", "touchcancel", "mousemove"] as const;

const fromOverlay = (event: Event): boolean =>
  isEventFromOverlay(event, "data-react-grab-ignore-events");

// Hover / press / focus: stop propagation and cancel the default (focus, text
// selection, control activation) — none of these affect page scrolling.
const guard = (event: Event): void => {
  if (fromOverlay(event)) return;
  event.stopImmediatePropagation();
  if (event.cancelable) event.preventDefault();
};

// Touch: stop the page's handlers but never preventDefault — the browser's
// native scroll is a default action on the touch sequence and must survive.
const guardTouch = (event: Event): void => {
  if (fromOverlay(event)) return;
  event.stopImmediatePropagation();
};

const PREVENTABLE_EVENTS = [...HOVER_EVENTS, ...PRESS_EVENTS, ...FOCUS_EVENTS] as const;

let installed = false;

export const installAnnotateInteractionGuard = (): void => {
  if (installed) return;
  installed = true;
  for (const type of PREVENTABLE_EVENTS) {
    document.addEventListener(type, guard, true);
  }
  for (const type of STOP_ONLY_EVENTS) {
    // passive:false so stopImmediatePropagation is honored; we still never
    // preventDefault, so scrolling is unaffected.
    document.addEventListener(type, guardTouch, { capture: true, passive: false });
  }
};

export const removeAnnotateInteractionGuard = (): void => {
  if (!installed) return;
  installed = false;
  for (const type of PREVENTABLE_EVENTS) {
    document.removeEventListener(type, guard, true);
  }
  for (const type of STOP_ONLY_EVENTS) {
    document.removeEventListener(type, guardTouch, true);
  }
};
