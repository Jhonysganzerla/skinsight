/**
 * CS.Money content script — Rare mode + DB regenerator (v0.3).
 *
 * Pulls /5.0/load_bots_inventory/730 with hasRareStickers=true, renders
 * sticker-breakdown ItemCards keyed off net USD (stickers − weapon). A
 * <details> drawer at the bottom of the overlay exposes the legacy
 * "Regenerate rare_stickers.json" workflow — it downloads a fresh JSON
 * report to the user's Downloads folder. The bundled rare DB is NOT
 * replaced in runtime; Jhony reviews and ships a new version in a
 * subsequent release.
 */
import { createOverlay, type OverlayHandle } from '../modules/shared/overlay';
import {
  readFilterValues,
  renderFilterGrid,
  renderResultsHeader,
  renderScanBar,
  updateScanBar,
  type FilterField,
} from '../modules/shared/ui';
import { buildRareReport, collectCsMoney } from '../modules/rare/csmoney';
import { renderCsMoneyCard } from '../modules/rare/render';
import { wireSteamButtons } from '../modules/oracles/steam-ui';
import { send } from '../modules/shared/messaging';
import { esc } from '../modules/shared/fmt';
import type { CsMoneyItem } from '../modules/rare/types';

const ROOT_ID = 'skinsight-csm-overlay';
const PERSIST_KEY = 'csmoney';

const FILTERS: FilterField[] = [
  { id: 'pages', label: 'Pages', type: 'number', value: '6' },
  { id: 'delayMs', label: 'Delay (ms)', type: 'number', value: '900' },
  {
    id: 'sort',
    label: 'Sort',
    type: 'select',
    options: [
      { value: 'net_desc', label: 'Net $ ↓' },
      { value: 'stickers_desc', label: 'Stickers $ ↓' },
      { value: 'weapon_asc', label: 'Cheapest weapon ↑' },
      { value: 'count_desc', label: 'Sticker count ↓' },
    ],
  },
];

interface State {
  running: boolean;
  aborted: { aborted: boolean };
  /** Last collected inventory — kept so reactive filters can re-sort +
   *  re-render in place without a fresh network scan. */
  items: CsMoneyItem[];
  /** Pending debounce timer for filter inputs. */
  debounce: ReturnType<typeof setTimeout> | null;
  /** Regenerate (deep DB scan) in flight + its own abort signal. */
  regenerating: boolean;
  regenAborted: { aborted: boolean };
}

const FILTER_DEBOUNCE_MS = 250;

/** Safety cap for the regenerate deep scan (collector stops earlier on empty). */
const REGEN_MAX_PAGES = 250;
const REGEN_DELAY_MS = 900;

let overlay: OverlayHandle | null = null;
const state: State = {
  running: false,
  aborted: { aborted: false },
  items: [],
  debounce: null,
  regenerating: false,
  regenAborted: { aborted: false },
};

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
}

function regenerateBlockHtml(disabled: boolean): string {
  return `
    <details class="sh-hint" style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;">
      <summary style="cursor:pointer;color:var(--text-muted);user-select:none;">⚙ Rare-DB maintenance</summary>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
        <p>Downloads a fresh <code>rare_stickers.json</code> report from the current
          CS.Money inventory. The bundled DB is updated only via Skinsight releases —
          this button just produces the file for the maintainer.</p>
        <button class="sh-btn sh-btn-sm sh-btn-ghost" data-role="regen" type="button" ${disabled ? 'disabled' : ''}>
          ${disabled ? 'Collect inventory first' : 'Regenerate rare_stickers.json'}
        </button>
      </div>
    </details>
  `;
}

function bodyHtml(): string {
  return [
    renderFilterGrid(FILTERS),
    renderScanBar({ info: 'Ready. Click Scan to begin.', actionLabel: 'Scan' }),
    `<div data-role="results"></div>`,
    regenerateBlockHtml(true),
  ].join('');
}

function sortItems(arr: CsMoneyItem[], key: string): CsMoneyItem[] {
  const cmps: Record<string, (a: CsMoneyItem, b: CsMoneyItem) => number> = {
    net_desc: (a, b) => b.netUsd - a.netUsd,
    stickers_desc: (a, b) => b.stickersTotalUsd - a.stickersTotalUsd,
    weapon_asc: (a, b) => a.weaponPriceUsd - b.weaponPriceUsd,
    count_desc: (a, b) => b.stickers.length - a.stickers.length,
  };
  return [...arr].sort(cmps[key] ?? cmps['net_desc']!);
}

/** Re-sort `state.items` by the current Sort filter and (re)render in place.
 *  Called once after a scan and again on every reactive filter change. */
function renderResults(): void {
  if (!overlay) return;
  const list = overlay.body.querySelector<HTMLElement>('[data-role=results]');
  if (!list) return;
  const filters = readFilterValues(overlay.body);
  const sortKey = filters['sort'] ?? 'net_desc';
  const sorted = sortItems(state.items, sortKey);
  list.innerHTML =
    renderResultsHeader('Item · stickers', 'Net') +
    (sorted.length
      ? sorted.map(renderCsMoneyCard).join('')
      : `<div class="sh-empty">
          <div class="sh-empty-icon">⌖</div>
          <div class="sh-empty-title">No items collected</div>
          <div class="sh-empty-sub">Try increasing pages or check CS.Money rate limit.</div>
        </div>`);
}

/** Schedule a reactive re-render. `instant` skips the debounce (for selects). */
function scheduleFilterApply(instant: boolean): void {
  if (state.debounce !== null) {
    clearTimeout(state.debounce);
    state.debounce = null;
  }
  if (instant) {
    renderResults();
    return;
  }
  state.debounce = setTimeout(() => {
    state.debounce = null;
    renderResults();
  }, FILTER_DEBOUNCE_MS);
}

async function runScan(): Promise<void> {
  if (!overlay || state.running) return;
  state.running = true;
  state.aborted = { aborted: false };
  // Opportunistic, TTL-gated remote rare-list refresh (no-op if cache < 24h).
  void send({ type: 'rares:refresh', force: false });
  const filters = readFilterValues(overlay.body);
  const pages = Math.max(1, Math.min(50, parseInt(filters['pages'] ?? '6', 10) || 6));
  const delayMs = Math.max(100, Math.min(5000, parseInt(filters['delayMs'] ?? '900', 10) || 900));
  const sortKey = filters['sort'] ?? 'net_desc';

  updateScanBar(overlay.body, { actionLabel: 'Stop', info: 'Collecting…', progressPct: 0 });
  setStatus('Collecting CS.Money inventory…', 'info');

  const collected = await collectCsMoney({
    maxPages: pages,
    delayMs,
    signal: state.aborted,
    onStatus: (msg) => {
      if (!overlay) return;
      updateScanBar(overlay.body, { info: msg });
    },
  });

  if (state.aborted.aborted) {
    setStatus('Scan stopped.', 'info');
    finish();
    return;
  }

  state.items = collected;

  if (!overlay) {
    finish();
    return;
  }
  renderResults();

  // Enable the Regenerate button.
  const drawer = overlay.body.querySelector<HTMLElement>('details');
  if (drawer) drawer.outerHTML = regenerateBlockHtml(false);

  updateScanBar(overlay.body, {
    info: `Scan complete — ${collected.length} items, ${collected.filter((i) => i.netUsd > 0).length} profitable.`,
    progressPct: 100,
  });
  setStatus(`Collected ${collected.length} items.`, 'ok');

  const top = sortItems(collected, sortKey)[0];
  if (top && top.netUsd > 0) {
    void send({
      type: 'hit:record',
      site: 'csmoney',
      name: top.name,
      sub: `${top.stickers.length} stickers · ${esc(toFixed(top.stickersTotalUsd))}$ in stickers`,
      profitUsd: top.netUsd,
    });
  }
  finish();
}

function toFixed(n: number): string {
  return n.toFixed(2);
}

function regenButton(): HTMLButtonElement | null {
  return overlay?.body.querySelector<HTMLButtonElement>('[data-role=regen]') ?? null;
}

/**
 * Deep-scan CS.Money (hasRareStickers=true) and download a fresh
 * rare_stickers.json. This is a *dedicated* full walk — it does NOT reuse the
 * shallow page set from the normal Scan — with live progress (pages scanned,
 * rare stickers found so far) and elapsed time. The bundled DB is never
 * replaced at runtime; the maintainer commits the downloaded file in a release.
 */
async function regenerate(): Promise<void> {
  if (!overlay || state.regenerating || state.running) return;
  state.regenerating = true;
  state.regenAborted = { aborted: false };
  const t0 = Date.now();
  const elapsed = (): string => ((Date.now() - t0) / 1000).toFixed(0) + 's';

  const btn = regenButton();
  if (btn) btn.textContent = 'Stop regenerate';
  setStatus('Regenerating rare DB — deep-scanning CS.Money…', 'info');

  let pagesSeen = 0;
  const collected = await collectCsMoney({
    maxPages: REGEN_MAX_PAGES,
    delayMs: REGEN_DELAY_MS,
    signal: state.regenAborted,
    onStatus: (msg) => {
      if (!overlay) return;
      if (/^Collecting page/.test(msg)) pagesSeen += 1;
      setStatus(`Scanned ${pagesSeen} pages — ${elapsed()} elapsed. ${msg}`, 'info');
    },
  });

  if (state.regenAborted.aborted) {
    setStatus(`Regenerate stopped after ${pagesSeen} pages (${elapsed()}).`, 'info');
    finishRegen();
    return;
  }

  const report = buildRareReport(collected);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rare_stickers.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(
    `Downloaded rare_stickers.json — ${pagesSeen} pages, ${report.rare_count} rare stickers (≥ $${report.inferred_threshold_usd.toFixed(2)}) in ${elapsed()}.`,
    'ok',
  );
  finishRegen();
}

function finishRegen(): void {
  state.regenerating = false;
  const btn = regenButton();
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Regenerate rare_stickers.json';
  }
}

function abort(): void {
  state.aborted.aborted = true;
  state.regenAborted.aborted = true;
}

function finish(): void {
  state.running = false;
  if (overlay) updateScanBar(overlay.body, { actionLabel: 'Scan' });
}

function mount(): void {
  if (overlay) return;
  overlay = createOverlay({
    rootId: ROOT_ID,
    mode: 'rare',
    modeLabel: 'Rare stickers',
    persistKey: PERSIST_KEY,
    onClose: () => {
      abort();
      overlay?.destroy();
      overlay = null;
    },
  });
  overlay.body.innerHTML = bodyHtml();
  wireSteamButtons(overlay.body);
  setStatus('Ready.', 'info');

  overlay.body.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-role=scan-action]')) {
      e.preventDefault();
      if (state.running) abort();
      else void runScan();
      return;
    }
    if (t.closest('[data-role=regen]')) {
      e.preventDefault();
      if (state.regenerating) {
        state.regenAborted.aborted = true;
      } else {
        void regenerate();
      }
      return;
    }
  });

  // Reactive filters: re-sort + re-render in place when the user changes a
  // filter after a scan (no rescan). CS.Money is a React SPA, so — like
  // PirateSwap — we listen on `document` in the CAPTURE phase scoped to our
  // overlay: the host framework can swallow bubble-phase change/input events.
  const onFilterEvent = (instant: boolean) => (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || !overlay) return;
    if (!overlay.root.contains(t) || !t.matches?.('[data-filter]')) return;
    if (!state.items.length) return;
    scheduleFilterApply(instant);
  };
  // `<select>` → instant; text/number inputs → debounced.
  document.addEventListener('change', onFilterEvent(true), true);
  document.addEventListener('input', onFilterEvent(false), true);
}

async function bootstrap(): Promise<void> {
  // CS.Money is always-on Rare. The popup's mode toggle only affects
  // SkinsMonkey; a scan running here survives any change there.
  console.debug('[Skinsight] loaded on cs.money');
  mount();
}

void bootstrap();
