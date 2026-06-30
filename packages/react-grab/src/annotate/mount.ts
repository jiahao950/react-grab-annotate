import { render } from "solid-js/web";
import type { JSX } from "solid-js";
import { detectCspNonce } from "../utils/detect-csp-nonce.js";
import { USER_IGNORE_ATTRIBUTE } from "../constants.js";
import { ANNOTATE_HOST_ATTRIBUTE, ANNOTATE_Z_INDEX } from "./constants.js";
import { ANNOTATE_STYLES } from "./styles.js";

export interface AnnotateMount {
  dispose: () => void;
}

export const mountAnnotateOverlay = (component: () => JSX.Element): AnnotateMount => {
  const host = document.createElement("div");
  host.setAttribute(ANNOTATE_HOST_ATTRIBUTE, "true");
  // Both attributes are required so react-grab never treats this overlay as a
  // grabbable element (USER_IGNORE_ATTRIBUTE) and never lets pointer/keyboard
  // events fall through to page content behind our controls
  // (data-react-grab-ignore-events, checked via composedPath).
  host.setAttribute(USER_IGNORE_ATTRIBUTE, "true");
  host.setAttribute("data-react-grab-ignore-events", "true");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = String(ANNOTATE_Z_INDEX);
  host.style.contain = "strict";

  const shadowRoot = host.attachShadow({ mode: "open" });
  const styleElement = document.createElement("style");
  const nonce = detectCspNonce();
  if (nonce) styleElement.nonce = nonce;
  styleElement.textContent = ANNOTATE_STYLES;
  shadowRoot.appendChild(styleElement);

  const mountPoint = document.createElement("div");
  mountPoint.className = "rga-root";
  shadowRoot.appendChild(mountPoint);

  const attach = (): void => {
    if (document.body) document.body.appendChild(host);
    else document.documentElement.appendChild(host);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  } else {
    attach();
  }

  const disposeRender = render(component, mountPoint);

  return {
    dispose: () => {
      disposeRender();
      host.remove();
    },
  };
};
