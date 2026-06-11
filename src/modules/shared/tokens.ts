/**
 * Design tokens v2 — "Aurora/Obsidian" (v0.9 UI refresh).
 *
 * Visual-only reskin of the original mockup tokens: every selector/class from
 * v1 is preserved (content scripts and tests depend on them); only colors,
 * shapes, motion and the new `.sh-wear` chip changed. Class prefix `sh-`
 * dodges host-site collisions; the root container declares `all: initial` to
 * reset inheritable styles from the host page.
 *
 * Language: deep obsidian glass (backdrop blur) + an indigo→cyan "aurora"
 * gradient as the single accent, neon-tinted heat states (hot/warm), soft
 * card-entrance motion. Anything structural (grid templates, paddings that
 * affect virtual-list row math) kept identical.
 */
export const OVERLAY_CSS = `
.sh-root, .sh-root *, .sh-minbar { box-sizing: border-box; }
.sh-root {
  all: initial;
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: 460px; max-width: calc(100vw - 24px); max-height: 86vh;
  background: linear-gradient(165deg, rgba(17,21,34,.97) 0%, rgba(9,11,19,.97) 55%, rgba(13,14,26,.97) 100%);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  color: #e9ecf5;
  border: 1px solid rgba(125,135,255,.16); border-radius: 16px;
  box-shadow: 0 24px 70px rgba(0,0,0,.65), 0 0 0 1px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.04);
  font: 13px/1.5 'Inter', ui-sans-serif, system-ui, sans-serif;
  display: flex; flex-direction: column; overflow: hidden;
  --bg:#090b13; --bg-elevated:#10141f; --bg-input:#0c111c;
  --border:rgba(125,135,255,.14); --border-strong:rgba(125,135,255,.3);
  --text:#e9ecf5; --text-muted:#9aa4c0; --text-dim:#646e8c;
  --primary:#6366f1; --primary-hover:#7c7ff5; --primary-dim:rgba(99,102,241,.16);
  --aurora:linear-gradient(90deg,#6366f1,#22d3ee);
  --success:#10b981; --success-bright:#34d399;
  --danger:#fb7185; --warn:#fbbf24; --accent:#8b9bff; --cyan:#22d3ee;
}
.sh-root * { font-family: inherit; color: inherit; box-sizing: border-box; margin: 0; padding: 0; }
.sh-root.sh-minimized { width: 56px !important; max-height: none !important; right: 16px; }
.sh-root.sh-minimized .sh-header, .sh-root.sh-minimized .sh-body { display: none; }
.sh-root:not(.sh-minimized) .sh-minbar { display: none; }

/* Aurora hairline across the very top of the panel — now alive: the gradient
   drifts slowly, reading as a faint "scanning" pulse even at idle. */
.sh-root::before {
  content: ''; display: block; height: 2px; flex-shrink: 0;
  background: linear-gradient(90deg,#6366f1,#22d3ee,#8b5cf6,#6366f1);
  background-size: 300% 100%;
  animation: sh-aurora-drift 7s linear infinite;
  opacity: .9;
}
@keyframes sh-aurora-drift { to { background-position: -300% 0; } }

.sh-header {
  padding: 12px 14px;
  background: linear-gradient(180deg, rgba(125,135,255,.07) 0%, transparent 100%);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 10px; cursor: move; user-select: none;
}
.sh-title {
  font-size: 13px; font-weight: 700; flex: 1; letter-spacing: .2px;
  display: flex; align-items: center; gap: 8px;
}
.sh-title-icon {
  font-size: 13px; width: 22px; height: 22px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 7px; background: var(--aurora); color: #07090f;
  box-shadow: 0 2px 10px rgba(99,102,241,.45);
  animation: sh-icon-breathe 4s ease-in-out infinite;
}
@keyframes sh-icon-breathe {
  0%, 100% { box-shadow: 0 2px 10px rgba(99,102,241,.45); }
  50% { box-shadow: 0 2px 16px rgba(34,211,238,.55); }
}
.sh-mode-tag {
  font-size: 10px; padding: 3px 9px; border-radius: 999px;
  background: var(--primary-dim); color: var(--accent);
  border: 1px solid rgba(139,155,255,.25);
  font-weight: 700; letter-spacing: .6px; text-transform: uppercase;
}
.sh-mode-tag.rare {
  background: rgba(251,191,36,.12); color: var(--warn);
  border-color: rgba(251,191,36,.3);
}
.sh-mode-tag.pattern {
  background: rgba(34,211,238,.12); color: var(--cyan);
  border-color: rgba(34,211,238,.3);
}
.sh-actions { display: flex; gap: 6px; }
.sh-icon-btn {
  all: unset; cursor: pointer; width: 26px; height: 26px;
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
  color: var(--text-dim); font-size: 14px; line-height: 1;
  transition: background .15s, color .15s;
}
.sh-icon-btn:hover { background: rgba(125,135,255,.12); color: var(--text); }

.sh-body {
  padding: 14px; flex: 1; min-height: 0; overflow-y: auto;
  /* v0.7 T1.c: the virtual list replaces its window nodes + resizes spacers on
     every scroll. With scroll anchoring on (default), Chrome adjusts scrollTop
     to keep the (now-destroyed) anchor visible, firing another scroll →
     recompute → runaway auto-scroll. Disabling anchoring breaks that loop. */
  overflow-anchor: none;
}
.sh-vlist, .sh-vlist-pad, .sh-vlist-window { overflow-anchor: none; }
.sh-body::-webkit-scrollbar { width: 6px; }
.sh-body::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg,#6366f1,#22d3ee); border-radius: 3px;
}
.sh-body::-webkit-scrollbar-track { background: transparent; }

/* Filter grid */
.sh-filter-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 8px; margin-bottom: 12px;
}
.sh-field { display: flex; flex-direction: column; min-width: 0; }
.sh-field label {
  display: block; font-size: 10px; font-weight: 600; letter-spacing: .4px;
  text-transform: uppercase; color: var(--text-dim); margin-bottom: 5px;
}
.sh-input, .sh-select {
  all: unset; display: block; width: 100%; padding: 7px 9px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 12px;
  font-family: inherit; transition: border-color .15s, box-shadow .15s;
}
.sh-input:focus, .sh-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(99,102,241,.18);
}
.sh-input[type=checkbox] { all: revert; width: auto; }
.sh-checkbox { display: flex; align-items: center; gap: 7px; cursor: pointer; font-size: 12px; color: var(--text-muted); }

/* Scan bar */
.sh-scan-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(99,102,241,.07), rgba(34,211,238,.04));
  border: 1px solid var(--border); border-radius: 10px; margin-bottom: 12px;
}
.sh-scan-info { flex: 1; font-size: 11.5px; color: var(--text-muted); min-width: 0; }
.sh-progress {
  height: 4px; background: rgba(125,135,255,.12); border-radius: 2px;
  overflow: hidden; margin-top: 5px;
}
.sh-progress-fill {
  height: 100%; width: 0; border-radius: 2px;
  background: linear-gradient(90deg,#6366f1,#22d3ee,#6366f1);
  background-size: 200% 100%;
  animation: sh-shimmer 1.6s linear infinite;
  transition: width .25s;
}
@keyframes sh-shimmer { to { background-position: -200% 0; } }

/* Buttons — primary gets a light-sweep on hover (the ::after sheen slides
   across once). position+overflow are safe additions on top of all:unset. */
.sh-btn {
  all: unset; cursor: pointer;
  position: relative; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 16px; color: #fff;
  background: linear-gradient(135deg,#6366f1 0%,#4f46e5 60%,#0ea5e9 160%);
  border-radius: 9px; font-weight: 600; font-size: 13px;
  font-family: inherit; text-align: center;
  box-shadow: 0 4px 16px rgba(99,102,241,.35), inset 0 1px 0 rgba(255,255,255,.12);
  transition: filter .15s, transform .1s, box-shadow .2s;
}
.sh-btn::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.18) 50%, transparent 70%);
  transform: translateX(-120%);
}
.sh-btn:hover::after { transform: translateX(120%); transition: transform .6s ease; }
.sh-btn:hover { filter: brightness(1.12); box-shadow: 0 6px 22px rgba(99,102,241,.5), inset 0 1px 0 rgba(255,255,255,.12); }
.sh-btn:active { transform: translateY(1px); }
.sh-btn:disabled { opacity: .4; cursor: not-allowed; }
.sh-btn-sm { padding: 7px 14px; font-size: 12px; }
.sh-btn-ghost {
  background: transparent; border: 1px solid var(--border-strong); color: var(--text);
  box-shadow: none;
}
.sh-btn-ghost:hover { background: rgba(125,135,255,.08); filter: none; }
.sh-btn-warn {
  background: linear-gradient(135deg,#fbbf24,#f59e0b); color: #1a1003;
  box-shadow: 0 4px 16px rgba(251,191,36,.3);
}
.sh-btn-warn:hover { filter: brightness(1.08); }
.sh-btn-block { width: 100%; }

/* Results */
.sh-results-header {
  display: flex; justify-content: space-between;
  font-size: 10px; font-weight: 600; color: var(--text-dim);
  margin: 8px 4px 6px; text-transform: uppercase; letter-spacing: .7px;
}
/* Virtualized list (v0.4.1): pads reserve off-window scroll height so the
   scrollbar matches the full data set while only the window is in the DOM. */
.sh-vlist { position: relative; }
.sh-vlist-pad { flex: none; }
.sh-vlist-window { display: block; }
.sh-item-card {
  padding: 10px; background: rgba(125,135,255,.045);
  border: 1px solid var(--border);
  border-radius: 12px; margin-bottom: 8px;
  display: grid; grid-template-columns: 56px 1fr auto; gap: 12px; align-items: center;
  animation: sh-rise .18s ease-out both;
  transition: border-color .15s, background .15s, transform .15s, box-shadow .2s;
}
.sh-item-card:hover {
  border-color: var(--border-strong); background: rgba(125,135,255,.07);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0,0,0,.35);
}
@keyframes sh-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.sh-item-card.hot {
  border-color: rgba(52,211,153,.45);
  box-shadow: inset 3px 0 0 0 var(--success-bright), 0 0 18px rgba(52,211,153,.07);
}
.sh-item-card.warm {
  border-color: rgba(251,191,36,.4);
  box-shadow: inset 3px 0 0 0 var(--warn), 0 0 18px rgba(251,191,36,.06);
}
.sh-item-thumb {
  position: relative;
  width: 56px; height: 42px;
  background: linear-gradient(135deg, rgba(99,102,241,.25) 0%, rgba(34,211,238,.12) 100%);
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
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
/* "NOVO" diff badge (v0.10) — marks results unseen before this scan. */
.sh-new {
  font-size: 9px; font-weight: 800; letter-spacing: .5px;
  color: #07090f; background: linear-gradient(90deg,#34d399,#22d3ee);
  border-radius: 5px; padding: 1px 5px; margin-right: 6px;
  vertical-align: middle; text-transform: uppercase;
  animation: sh-new-pop .25s ease-out both;
}
@keyframes sh-new-pop { from { opacity: 0; transform: scale(.8); } to { opacity: 1; transform: none; } }

/* CSV export button in the results header (v0.10). */
.sh-export-btn {
  all: unset; cursor: pointer; font-size: 10px; font-weight: 700;
  color: var(--accent); margin-left: 10px; letter-spacing: .5px;
  border: 1px solid var(--border); border-radius: 6px; padding: 1px 7px;
  transition: color .15s, border-color .15s, background .15s;
}
.sh-export-btn:hover { color: var(--cyan); border-color: var(--border-strong); background: rgba(34,211,238,.07); }

/* Wear/float badge next to the name (FN/MW/FT/WW/BS) — class-only since v0.9. */
.sh-wear {
  font-size: 9.5px; font-weight: 700; letter-spacing: .3px;
  color: var(--cyan); background: rgba(34,211,238,.1);
  border: 1px solid rgba(34,211,238,.28); border-radius: 5px;
  padding: 0 5px; margin-right: 6px; vertical-align: middle;
}
.sh-item-meta {
  font-size: 11px; color: var(--text-muted);
  display: flex; gap: 10px; flex-wrap: wrap;
}
.sh-meta-chip { display: inline-flex; align-items: center; gap: 4px; }
/* Action column stacks vertically (seal/profit on top, one link per line) so
   multiple links can never widen the column and crush the name/meta area. */
.sh-item-action {
  text-align: right;
  display: flex; flex-direction: column; align-items: flex-end; gap: 3px;
  flex-shrink: 0; max-width: 170px;
}
.sh-item-action .sh-open-link { margin-top: 0; white-space: nowrap; }
.sh-profit-big {
  font-size: 16px; font-weight: 800; line-height: 1;
  background: linear-gradient(90deg,#34d399,#22d3ee);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.sh-profit-big.warm { background: linear-gradient(90deg,#fbbf24,#fb923c); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sh-profit-big.neutral { background: none; color: var(--text); font-size: 14px; }
.sh-profit-pct { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.sh-open-link {
  font-size: 10.5px; color: var(--accent); text-decoration: none;
  margin-top: 4px; display: inline-block; cursor: pointer;
}
.sh-open-link:hover { color: var(--cyan); text-decoration: underline; }
.sh-pattern-seal {
  font-size: 12px; font-weight: 800; line-height: 1.1; color: var(--cyan);
  background: rgba(34,211,238,.08);
  border: 1px solid rgba(34,211,238,.4); border-radius: 8px;
  padding: 4px 8px; display: inline-block; white-space: nowrap;
  text-shadow: 0 0 12px rgba(34,211,238,.5);
}
.sh-item-card.hot .sh-pattern-seal {
  color: var(--success-bright); border-color: rgba(52,211,153,.5);
  background: rgba(52,211,153,.08); text-shadow: 0 0 12px rgba(52,211,153,.5);
}
.sh-item-card.warm .sh-pattern-seal {
  color: var(--warn); border-color: rgba(251,191,36,.5);
  background: rgba(251,191,36,.08); text-shadow: 0 0 12px rgba(251,191,36,.45);
}
.sh-pattern-seed { font-size: 11px; color: var(--text-dim); margin-top: 3px; }

/* Generic hide (e.g. the sticker filter grid in Pattern submode, whose
   fields the pattern view replaces with its own controls) */
.sh-hidden { display: none !important; }

/* Pattern weapon tabs + toolbar (v0.9.2) */
.sh-pattern-tabs {
  display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0;
}
.sh-pattern-tabs.sub { margin-top: 6px; padding-left: 10px; }
.sh-tab {
  all: unset; box-sizing: border-box; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 11px; border-radius: 999px;
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  background: var(--bg-input); border: 1px solid var(--border);
  transition: border-color .15s, color .15s, background .15s;
}
.sh-tab:hover { color: var(--text); border-color: var(--border-strong); }
.sh-tab.active {
  color: var(--text); border-color: var(--primary);
  background: linear-gradient(135deg, rgba(99,102,241,.18), rgba(34,211,238,.08));
}
.sh-pattern-tabs.sub .sh-tab { padding: 4px 9px; font-size: 10.5px; }
.sh-tab-n {
  font-size: 9.5px; font-weight: 700; color: var(--text-dim);
  background: rgba(255,255,255,.07); border-radius: 999px; padding: 2px 6px;
}
.sh-tab.active .sh-tab-n { color: var(--cyan); background: rgba(34,211,238,.12); }
.sh-pattern-toolbar {
  display: flex; align-items: center; gap: 14px; margin: 10px 0 0;
}
.sh-pattern-toolbar .sh-select { width: auto; padding: 5px 9px; font-size: 11px; }
.sh-pt-count { margin-left: auto; font-size: 11px; color: var(--text-muted); white-space: nowrap; }

/* Sticker breakdown */
.sh-sticker-breakdown {
  grid-column: 1 / -1; margin-top: 10px; padding-top: 10px;
  border-top: 1px dashed var(--border);
  display: flex; gap: 8px; flex-wrap: wrap;
}
.sh-sticker-chip {
  display: flex; align-items: center; gap: 6px;
  background: rgba(9,11,19,.6); border: 1px solid var(--border);
  border-radius: 16px; padding: 4px 10px 4px 4px; font-size: 11px;
}
.sh-sticker-mini {
  width: 22px; height: 22px; border-radius: 50%;
  background: linear-gradient(135deg, #5a4a8a, #6366f1);
  flex-shrink: 0; overflow: hidden;
}
.sh-sticker-mini img { width: 100%; height: 100%; object-fit: contain; }
/* Four real CS2 sticker tiers. Paper (default, the .sh-sticker-mini base
   indigo gradient) → Foil (silver) → Holo (rainbow conic) → Gold (gold). */
.sh-sticker-mini.foil { background: linear-gradient(135deg, #e4e4e7 0%, #a1a1aa 100%); }
.sh-sticker-mini.holo {
  background: conic-gradient(from 0deg, #fb7185, #fbbf24, #34d399, #6366f1, #fb7185);
}
.sh-sticker-mini.gold { background: linear-gradient(135deg, #facc15 0%, #d4af37 100%); }
.sh-sticker-price { color: var(--success-bright); font-weight: 600; }

/* Pills */
.sh-pill-mini {
  display: inline-block; padding: 1px 7px; border-radius: 999px;
  font-size: 10px; font-weight: 600;
}
.sh-pill-success { background: rgba(52,211,153,.13); color: var(--success-bright); }
.sh-pill-warn { background: rgba(251,191,36,.13); color: var(--warn); }
.sh-pill-info { background: var(--primary-dim); color: var(--accent); }
.sh-pill-danger { background: rgba(251,113,133,.13); color: var(--danger); }

/* Empty state — the crosshair drifts gently, like idle radar. */
.sh-empty { text-align: center; padding: 40px 20px; }
.sh-empty-icon {
  font-size: 38px; margin-bottom: 12px;
  background: var(--aurora);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  opacity: .65;
  display: inline-block;
  animation: sh-float 3.5s ease-in-out infinite;
}
@keyframes sh-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
.sh-empty-title { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.sh-empty-sub { color: var(--text-muted); font-size: 12px; margin: 0 auto 20px; max-width: 280px; }

/* Status line under header */
.sh-status {
  padding: 8px 14px; font-size: 11.5px; color: var(--text-muted);
  border-bottom: 1px solid var(--border); background: rgba(9,11,19,.45);
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
  background: linear-gradient(165deg, rgba(17,21,34,.97), rgba(9,11,19,.97));
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(125,135,255,.18); border-right: 0;
  border-radius: 12px 0 0 12px;
  box-shadow: 0 10px 35px rgba(0,0,0,.55);
  color: var(--text); cursor: pointer;
  font: 13px/1 'Inter', ui-sans-serif, system-ui, sans-serif;
}
.sh-minbar-ico { font-size: 18px; }
.sh-minbar-count {
  font-size: 13px; font-weight: 800;
  background: linear-gradient(90deg,#6366f1,#22d3ee);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.sh-minbar-sub { font-size: 9px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .06em; }

/* Banner (e.g. pending analysis on CSFloat) */
.sh-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(99,102,241,.1), rgba(34,211,238,.06));
  border: 1px solid rgba(99,102,241,.3); border-radius: 10px;
  margin-bottom: 12px; font-size: 12px; color: var(--accent);
}
.sh-banner-body { flex: 1; }

/* Inline checkbox row */
.sh-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.sh-row > * { flex-shrink: 0; }

/* Small text */
.sh-hint { font-size: 11px; color: var(--text-dim); margin-top: 6px; line-height: 1.45; }
.sh-footnote { color: var(--text-dim); font-size: 11.5px; margin-top: 16px; font-style: italic; }

/* Keyboard a11y: visible focus ring on every interactive element. */
.sh-btn:focus-visible, .sh-icon-btn:focus-visible, .sh-tab:focus-visible,
.sh-input:focus-visible, .sh-select:focus-visible, .sh-open-link:focus-visible {
  outline: 2px solid var(--cyan); outline-offset: 2px;
}

/* Respect the OS "reduce motion" preference: kill decorative animation but
   keep state transitions (they communicate, not decorate). */
@media (prefers-reduced-motion: reduce) {
  .sh-root::before, .sh-title-icon, .sh-empty-icon,
  .sh-progress-fill, .sh-item-card { animation: none; }
  .sh-btn::after { display: none; }
  .sh-item-card:hover { transform: none; }
}
`;
