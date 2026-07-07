export const ANNOTATE_STYLES = `
:host {
  all: initial;
  direction: ltr;
}
* { box-sizing: border-box; }

.rga-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  /* Prefer the host app design tokens (Manus) so the overlay blends in; fall
     back to neutral defaults when they aren't defined. Custom properties inherit
     through the shadow boundary (the all:initial reset does not touch them), and
     the Manus tokens already adapt to its light/dark theme. */
  --rga-accent: var(--Button-blue, #4f46e5);
  --rga-accent-text: var(--text-white, #ffffff);
  --rga-panel-bg: var(--background-menu-white, #ffffff);
  --rga-text: var(--text-primary, #1f2330);
  --rga-text-dim: var(--text-tertiary, #6b7280);
  --rga-border: var(--border-main, rgba(0, 0, 0, 0.1));
  --rga-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  --rga-danger: var(--function-error, #dc2626);
}
@media (prefers-color-scheme: dark) {
  .rga-root {
    --rga-panel-bg: var(--background-menu-white, #1c1f27);
    --rga-text: var(--text-primary, #f3f4f6);
    --rga-text-dim: var(--text-tertiary, #9ca3af);
    --rga-border: var(--border-main, rgba(255, 255, 255, 0.12));
    --rga-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  }
}

.rga-dock {
  position: fixed;
  right: 20px;
  bottom: 20px;
  display: flex;
  gap: 8px;
  pointer-events: none;
}
/* Matches the Manus Button spec (medium: 36px, 8px radius, 14px medium, opacity
   hover/active). */
.rga-btn {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  min-width: 72px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--rga-shadow);
  transition: opacity 0.12s ease;
  font-family: inherit;
}
.rga-btn:hover { opacity: 0.9; }
.rga-btn:active { opacity: 0.8; }
.rga-btn:disabled { cursor: default; opacity: 0.5; }
/* The entry control is a round icon button, not a labelled button. */
.rga-icon-btn {
  position: relative;
  width: 44px;
  height: 44px;
  min-width: 0;
  padding: 0;
  border-radius: 50%;
}
.rga-icon-btn svg { width: 20px; height: 20px; display: block; }
.rga-count-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--rga-danger);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 0 0 2px var(--rga-panel-bg);
}
.rga-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: var(--rga-accent-text);
  border-radius: 50%;
  animation: rga-spin 0.7s linear infinite;
}
@keyframes rga-spin { to { transform: rotate(360deg); } }
.rga-btn-primary { background: var(--rga-accent); color: var(--rga-accent-text); }
.rga-btn-secondary { background: var(--rga-panel-bg); color: var(--rga-text); }
.rga-btn[data-rga-tooltip] { position: relative; }
.rga-btn[data-rga-tooltip]::after {
  content: attr(data-rga-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  white-space: nowrap;
  background: #1f2330;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 9px;
  border-radius: 7px;
  box-shadow: var(--rga-shadow);
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.rga-btn[data-rga-tooltip]:hover::after {
  opacity: 1;
  transform: translateY(0);
}
.rga-toast {
  position: fixed;
  left: 50%;
  top: 24px;
  transform: translateX(-50%);
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 90vw;
  padding: 10px 16px;
  border-radius: 10px;
  background: #1f2330;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--rga-shadow);
  animation: rga-toast-in 0.16s ease;
}
.rga-toast-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #16a34a;
  color: #ffffff;
  font-size: 12px;
  flex: none;
}
@keyframes rga-toast-in {
  from { opacity: 0; transform: translate(-50%, -8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
.rga-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: 4px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.25);
  font-size: 11px;
  font-weight: 700;
}

.rga-highlight {
  position: fixed;
  background: color-mix(in srgb, var(--rga-accent) 16%, transparent);
  border: 2px solid var(--rga-accent);
  border-radius: 3px;
  box-sizing: border-box;
  pointer-events: none;
}

.rga-mark {
  position: fixed;
  width: var(--rga-mark-size, 24px);
  height: var(--rga-mark-size, 24px);
  margin-left: calc(var(--rga-mark-size, 24px) / -2);
  margin-top: calc(var(--rga-mark-size, 24px) / -2);
  border-radius: 50% 50% 50% 2px;
  background: var(--rga-accent);
  color: var(--rga-accent-text);
  border: 2px solid var(--rga-accent-text);
  box-shadow: var(--rga-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  transition: transform 0.1s ease;
}
.rga-mark:hover { transform: scale(1.12); }
.rga-mark-active { transform: scale(1.12); outline: 2px solid var(--rga-accent); outline-offset: 2px; }

.rga-card {
  position: fixed;
  width: var(--rga-card-width, 280px);
  background: var(--rga-panel-bg);
  color: var(--rga-text);
  border: 1px solid var(--rga-border);
  border-radius: 12px;
  box-shadow: var(--rga-shadow);
  pointer-events: auto;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.rga-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--rga-border);
}
.rga-card-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--rga-accent);
  color: var(--rga-accent-text);
  font-size: 11px;
  font-weight: 700;
  flex: none;
}
.rga-card-loc {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--rga-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rga-card-shot {
  width: 100%;
  max-height: 140px;
  object-fit: contain;
  background: rgba(127, 127, 127, 0.08);
  border-bottom: 1px solid var(--rga-border);
}
.rga-card-body { padding: 10px 12px; }
.rga-textarea {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  border: 1px solid var(--rga-border);
  border-radius: 8px;
  background: transparent;
  color: var(--rga-text);
  font-size: 13px;
  font-family: inherit;
  padding: 8px;
  outline: none;
}
.rga-textarea:focus { border-color: var(--rga-accent); }
.rga-card-footer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--rga-border);
}
.rga-card-footer .rga-spacer { flex: 1; }
.rga-fbtn {
  pointer-events: auto;
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--rga-border);
  background: transparent;
  color: var(--rga-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.rga-fbtn-danger { color: var(--rga-danger); border-color: transparent; }
.rga-fbtn-primary { background: var(--rga-accent); color: var(--rga-accent-text); border-color: transparent; }
.rga-fbtn:hover { filter: brightness(0.96); }
`;
