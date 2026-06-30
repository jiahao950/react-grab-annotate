import { createSignal, onCleanup, type Accessor } from "solid-js";
import { nativeRequestAnimationFrame, nativeCancelAnimationFrame } from "../utils/native-raf.js";

export const createViewportTicker = (shouldRun: Accessor<boolean>): Accessor<number> => {
  const [version, setVersion] = createSignal(0, { equals: false });
  const bump = (): void => {
    setVersion((current) => current + 1);
  };

  // Capture phase catches scroll events from any nested scroll container,
  // not just the document — scroll does not bubble, so a bubbling-phase
  // listener on window would miss inner containers.
  window.addEventListener("scroll", bump, { capture: true, passive: true });
  window.addEventListener("resize", bump, { passive: true });
  window.visualViewport?.addEventListener("scroll", bump, { passive: true });
  window.visualViewport?.addEventListener("resize", bump, { passive: true });

  let frameId = 0;
  const tick = (): void => {
    if (shouldRun()) bump();
    frameId = nativeRequestAnimationFrame(tick);
  };
  frameId = nativeRequestAnimationFrame(tick);

  onCleanup(() => {
    window.removeEventListener("scroll", bump, { capture: true });
    window.removeEventListener("resize", bump);
    window.visualViewport?.removeEventListener("scroll", bump);
    window.visualViewport?.removeEventListener("resize", bump);
    nativeCancelAnimationFrame(frameId);
  });

  return version;
};
