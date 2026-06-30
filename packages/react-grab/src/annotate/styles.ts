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
  --rga-accent: #4f46e5;
  --rga-accent-text: #ffffff;
  --rga-panel-bg: #ffffff;
  --rga-text: #1f2330;
  --rga-text-dim: #6b7280;
  --rga-border: rgba(0, 0, 0, 0.1);
  --rga-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  --rga-danger: #dc2626;
}
@media (prefers-color-scheme: dark) {
  .rga-root {
    --rga-panel-bg: #1c1f27;
    --rga-text: #f3f4f6;
    --rga-text-dim: #9ca3af;
    --rga-border: rgba(255, 255, 255, 0.12);
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
.rga-btn {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--rga-shadow);
  transition: transform 0.08s ease, filter 0.12s ease;
  font-family: inherit;
}
.rga-btn:active { transform: translateY(1px); }
.rga-btn:disabled { cursor: default; opacity: 0.85; }
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
.rga-btn-primary:hover { filter: brightness(1.08); }
.rga-btn-secondary { background: var(--rga-panel-bg); color: var(--rga-text); }
.rga-btn-secondary:hover { filter: brightness(0.96); }
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
