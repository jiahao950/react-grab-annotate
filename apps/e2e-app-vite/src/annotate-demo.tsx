import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { init } from "react-grab";
import "./index.css";
import App from "./App.tsx";

// Cmd/Ctrl+. toggle is owned by the annotate controller, so no activationKey
// needs to be configured here.
const api = init({
  annotate: true,
  telemetry: false,
});

declare global {
  interface Window {
    __ANNOTATE_API__: typeof api;
  }
}
window.__ANNOTATE_API__ = api;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
