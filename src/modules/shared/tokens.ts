/**
 * Design tokens (verbatim from mockup-ui-skinhawk.html section 5) + the
 * component styles used by the OverlayShell across all four content scripts.
 * Class prefix `sh-` to dodge host-site collisions; the root container also
 * declares `all: initial` to reset inheritable styles from the host page.
 */
export const OVERLAY_CSS = `
.sh-root, .sh-root *, .sh-minbar { box-sizing: border-box; }
.sh-root {
  all: initial;
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: 460px; max-width: calc(100vw - 24px); max-height: 86vh;
  background: #11151c; color: #e7eaf0;
  border: 1px solid #2a3142; border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.7);
  font: 13px/1.5 'Inter', ui-sans-serif, system-ui, sans-serif;
  display: flex; flex-direction: column; overflow: hidden;
  --bg:#0c0f16; --bg-elevated:#11151c; --bg-input:#0a1020;
  --border:#2a3142; --border-strong:#303a52;
  --text:#e7eaf0; --text-muted:#9aa3b8; --text-dim:#6b7488;
  --primary:#3a76ff; --primary-hover:#5187ff; --primary-dim:rgba(58,118,255,.15);
  --success:#2c8a4a; --success-bright:#4cc870;
  --danger:#ff5555; --warn:#f5a623; --accent:#88aaff;
}
.sh-root * { font-family: inherit; color: inherit; box-sizing: border-box; margin: 0; padding: 0; }
.sh-root.sh-minimized { width: 56px !important; max-height: none !important; right: 16px; }
.sh-root.sh-minimized .sh-header, .sh-root.sh-minimized .sh-body { display: none; }
.sh-root:not(.sh-minimized) .sh-minbar { display: none; }

.sh-header {
  padding: 12px 14px; background: linear-gradient(180deg, #161b27 0%, #11151c 100%);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 10px; cursor: move; user-select: none;
}
.sh-title {
  font-size: 13px; font-weight: 700; flex: 1;
  display: flex; align-items: center; gap: 8px;
}
.sh-title-icon { font-size: 14px; }
.sh-mode-tag {
  font-size: 10.5px; padding: 2px 8px; border-radius: 4px;
  background: var(--primary-dim); color: var(--accent);
  font-weight: 600; letter-spacing: .3px; text-transform: uppercase;
}
.sh-mode-tag.rare { background: rgba(245,166,35,.15); color: var(--warn); }
.sh-actions { display: flex; gap: 6px; }
.sh-icon-btn {
  all: unset; cursor: pointer; width: 26px; height: 26px;
  border-radius: 6px; display: flex; align-items: center; justify-content: center;
  color: var(--text-dim); font-size: 14px; line-height: 1;
}
.sh-icon-btn:hover { background: var(--bg-input); color: var(--text); }

.sh-body {
  padding: 14px; flex: 1; min-height: 0; overflow-y: auto;
}
.sh-body::-webkit-scrollbar { width: 8px; }
.sh-body::-webkit-scrollbar-thumb { background: #2a3142; border-radius: 4px; }

/* Filter grid */
.sh-filter-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 8px; margin-bottom: 12px;
}
.sh-field { display: flex; flex-direction: column; min-width: 0; }
.sh-field label {
  display: block; font-size: 10.5px; color: var(--text-muted); margin-bottom: 4px;
}
.sh-input, .sh-select {
  all: unset; display: block; width: 100%; padding: 7px 9px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text); font-size: 12px;
  font-family: inherit;
}
.sh-input:focus, .sh-select:focus { border-color: var(--primary); }
.sh-input[type=checkbox] { all: revert; width: auto; }
.sh-checkbox { display: flex; align-items: center; gap: 7px; cursor: pointer; font-size: 12px; color: var(--text-muted); }

/* Scan bar */
.sh-scan-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px;
}
.sh-scan-info { flex: 1; font-size: 11.5px; color: var(--text-muted); min-width: 0; }
.sh-progress {
  height: 4px; background: var(--border); border-radius: 2px;
  overflow: hidden; margin-top: 4px;
}
.sh-progress-fill {
  height: 100%; width: 0; background: linear-gradient(90deg, var(--primary), var(--accent));
  transition: width .25s;
}

/* Buttons */
.sh-btn {
  all: unset; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 14px; background: var(--primary); color: #fff;
  border-radius: 8px; font-weight: 600; font-size: 13px;
  font-family: inherit; text-align: center;
}
.sh-btn:hover { background: var(--primary-hover); }
.sh-btn:disabled { opacity: .4; cursor: not-allowed; }
.sh-btn-sm { padding: 7px 14px; font-size: 12px; }
.sh-btn-ghost { background: transparent; border: 1px solid var(--border-strong); color: var(--text); }
.sh-btn-ghost:hover { background: var(--bg-input); }
.sh-btn-warn { background: var(--warn); color: #1a1003; }
.sh-btn-warn:hover { background: #ffb43d; }
.sh-btn-block { width: 100%; }

/* Results */
.sh-results-header {
  display: flex; justify-content: space-between;
  font-size: 10.5px; color: var(--text-dim);
  margin: 8px 4px 6px; text-transform: uppercase; letter-spacing: .5px;
}
.sh-item-card {
  padding: 10px; background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 8px; margin-bottom: 8px;
  display: grid; grid-template-columns: 56px 1fr auto; gap: 12px; align-items: center;
}
.sh-item-card.hot { border-color: var(--success); box-shadow: inset 3px 0 0 0 var(--success-bright); }
.sh-item-card.warm { border-color: var(--warn); box-shadow: inset 3px 0 0 0 var(--warn); }
.sh-item-thumb {
  position: relative;
  width: 56px; height: 42px;
  background: linear-gradient(135deg, #2b2438 0%, #1d2336 100%);
  border-radius: 4px; display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: var(--text-dim); overflow: hidden;
}
.sh-item-thumb img { position: relative; z-index: 1; width: 100%; height: 100%; object-fit: contain; }
.sh-item-thumb-fallback {
  display: inline-flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; font-size: 18px; color: var(--text-dim);
}
.sh-item-info { min-width: 0; }
.sh-item-name {
  font-size: 12.5px; font-weight: 600; margin-bottom: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sh-item-meta {
  font-size: 11px; color: var(--text-muted);
  display: flex; gap: 10px; flex-wrap: wrap;
}
.sh-meta-chip { display: inline-flex; align-items: center; gap: 4px; }
.sh-item-action { text-align: right; }
.sh-profit-big { font-size: 16px; font-weight: 700; color: var(--success-bright); line-height: 1; }
.sh-profit-big.warm { color: var(--warn); }
.sh-profit-big.neutral { color: var(--text); font-size: 14px; }
.sh-profit-pct { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.sh-open-link {
  font-size: 10.5px; color: var(--accent); text-decoration: none;
  margin-top: 4px; display: inline-block; cursor: pointer;
}
.sh-open-link:hover { text-decoration: underline; }

/* Sticker breakdown */
.sh-sticker-breakdown {
  grid-column: 1 / -1; margin-top: 10px; padding-top: 10px;
  border-top: 1px dashed var(--border);
  display: flex; gap: 8px; flex-wrap: wrap;
}
.sh-sticker-chip {
  display: flex; align-items: center; gap: 6px;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 16px; padding: 4px 10px 4px 4px; font-size: 11px;
}
.sh-sticker-mini {
  width: 22px; height: 22px; border-radius: 50%;
  background: linear-gradient(135deg, #5a4a8a, #3a76ff);
  flex-shrink: 0; overflow: hidden;
}
.sh-sticker-mini img { width: 100%; height: 100%; object-fit: contain; }
/* Four real CS2 sticker tiers. Paper (default, the .sh-sticker-mini base
   indigo gradient) → Foil (silver) → Holo (rainbow conic) → Gold (gold). */
.sh-sticker-mini.foil { background: linear-gradient(135deg, #e4e4e7 0%, #a1a1aa 100%); }
.sh-sticker-mini.holo {
  background: conic-gradient(from 0deg, #ff5555, #f5a623, #4cc870, #3a76ff, #ff5555);
}
.sh-sticker-mini.gold { background: linear-gradient(135deg, #facc15 0%, #d4af37 100%); }
.sh-sticker-price { color: var(--success-bright); font-weight: 600; }

/* Pills */
.sh-pill-mini {
  display: inline-block; padding: 1px 6px; border-radius: 3px;
  font-size: 10px; font-weight: 600;
}
.sh-pill-success { background: rgba(76,200,112,.15); color: var(--success-bright); }
.sh-pill-warn { background: rgba(245,166,35,.15); color: var(--warn); }
.sh-pill-info { background: var(--primary-dim); color: var(--accent); }
.sh-pill-danger { background: rgba(255,85,85,.15); color: var(--danger); }

/* Empty state */
.sh-empty { text-align: center; padding: 40px 20px; }
.sh-empty-icon { font-size: 40px; opacity: .4; margin-bottom: 12px; }
.sh-empty-title { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.sh-empty-sub { color: var(--text-muted); font-size: 12px; margin: 0 auto 20px; max-width: 280px; }

/* Status line under header */
.sh-status {
  padding: 8px 14px; font-size: 11.5px; color: var(--text-muted);
  border-bottom: 1px solid var(--border); background: var(--bg);
  flex-shrink: 0; min-height: 18px;
}
.sh-status.err { color: var(--danger); }
.sh-status.ok { color: var(--success-bright); }
.sh-status.info { color: var(--accent); }

/* Minimized bar */
.sh-minbar {
  position: fixed; right: 16px; top: 16px; z-index: 2147483647;
  width: 56px; padding: 14px 6px;
  display: none; flex-direction: column; align-items: center; gap: 4px;
  background: linear-gradient(180deg, #161b27, #11151c);
  border: 1px solid var(--border); border-radius: 10px 0 0 10px;
  color: var(--text); cursor: pointer;
  font: 13px/1 'Inter', ui-sans-serif, system-ui, sans-serif;
}
.sh-minbar-ico { font-size: 18px; }
.sh-minbar-count { font-size: 13px; font-weight: 700; color: var(--accent); }
.sh-minbar-sub { font-size: 9px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .06em; }

/* Banner (e.g. pending analysis on CSFloat) */
.sh-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; background: rgba(58,118,255,.1);
  border: 1px solid rgba(58,118,255,.3); border-radius: 8px;
  margin-bottom: 12px; font-size: 12px; color: var(--accent);
}
.sh-banner-body { flex: 1; }

/* Inline checkbox row */
.sh-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.sh-row > * { flex-shrink: 0; }

/* Small text */
.sh-hint { font-size: 11px; color: var(--text-dim); margin-top: 6px; line-height: 1.45; }
.sh-footnote { color: var(--text-dim); font-size: 11.5px; margin-top: 16px; font-style: italic; }
`;
