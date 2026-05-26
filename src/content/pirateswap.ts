/**
 * PirateSwap content script — Rare mode (v0.3 + v0.4.1).
 *
 * Always-on Rare overlay. Pages /inventory/v2/ExchangerInventory, matches
 * against the bundled rare_stickers DB, renders sticker-breakdown cards
 * with chunked render + reactive filters (v0.4.1).
 */
import { createOverlay, type OverlayHandle } from '../modules/shared/overlay';
import {
  readFilterValues,
  renderChunked,
  renderFilterGrid,
  renderResultsHeader,
  renderScanBar,
  updateScanBar,
  type FilterField,
} from '../modules/shared/ui';
import { applyRareFilter, collectAll, findRareResults } from '../modules/rare/finder';
import { renderRareCard } from '../modules/rare/render';
import { send } from '../modules/shared/messaging';
import type { RareResult } from '../modules/rare/types';

const ROOT_ID = 'skinsight-ps-overlay';
const PERSIST_KEY = 'pirateswap';
const FILTER_DEBOUNCE_MS = 250;

type SortKey = 'roi' | 'stickerSum' | 'profit' | 'priceAsc' | 'priceDesc';

const FILTERS: FilterField[] = [
  {
    id: 'pages',
    label: 'Max pages',
    type: 'select',
    value: '50',
    options: [
      { value: '10', label: '10' },
      { value: '25', label: '25' },
      { value: '50', label: '50' },
      { value: '100', label: '100' },
      { value: '200', label: '200' },
    ],
    hint: 'Max pages to scan. Each page is 40 items. PirateSwap inventory rotates — 50 covers a typical session well.',
  },
  { id: 'maxPrice', label: 'Max price ($)', type: 'number', placeholder: 'none' },
  {
    id: 'sort',
    label: 'Sort',
    type: 'select',
    options: [
      { value: 'roi', label: 'ROI ↓' },
      { value: 'stickerSum', label: 'Stickers $ ↓' },
      { value: 'profit', label: 'Profit ↓' },
      { value: 'priceAsc', label: 'Price ↑' },
      { value: 'priceDesc', label: 'Price ↓' },
    ],
  },
];

interface State {
  running: boolean;
  aborted: { aborted: boolean };
  /** Last collected match set — kept in memory so reactive filters can
   *  re-apply + re-render without a fresh network scan. */
  results: RareResult[];
  /** Active chunked-render handle, so a filter change can cancel it. */
  renderAbort: (() => void) | null;
  /** Pending debounce timer for filter inputs. */
  debounce: ReturnType<typeof setTimeout> | null;
}

let overlay: OverlayHandle | null = null;
const state: State = {
  running: false,
  aborted: { aborted: false },
  results: [],
  renderAbort: null,
  debounce: null,
};

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
}

function bodyHtml(): string {
  return [
    renderFilterGrid(FILTERS),
    renderScanBar({ info: 'Ready. Click Scan to begin.', actionLabel: 'Scan' }),
    `<div data-role="results"></div>`,
  ].join('');
}

const EMPTY_HTML = `<div class="sh-empty">
  <div class="sh-empty-icon">⌖</div>
  <div class="sh-empty-title">No rare stickers found</div>
  <div class="sh-empty-sub">Widen filters or scan more pages.</div>
</div>`;

/** Read filter values + apply the current ones to `state.results`. */
function currentFilterOpts(): { maxPrice?: number; sort: SortKey } {
  if (!overlay) return { sort: 'roi' };
  const filters = readFilterValues(overlay.body);
  const maxPriceRaw = filters['maxPrice'] ?? '';
  const maxPrice = maxPriceRaw.trim() ? parseFloat(maxPriceRaw) : undefined;
  const sort = (filters['sort'] ?? 'roi') as SortKey;
  return maxPrice !== undefined ? { maxPrice, sort } : { sort };
}

/** Apply filters + render via the chunked renderer; cancels any in-flight render. */
function applyAndRender(): void {
  if (!overlay) return;
  const list = overlay.body.querySelector<HTMLElement>('[data-role=results]');
  if (!list) return;
  // Cancel any in-flight render before starting a new one.
  state.renderAbort?.();
  state.renderAbort = null;

  const filtered = applyRareFilter(state.results, currentFilterOpts());
  const header = renderResultsHeader('Item · stickers detected', 'Worth');
  if (!filtered.length) {
    list.innerHTML = header + EMPTY_HTML;
    return;
  }
  const handle = renderChunked({
    container: list,
    items: filtered,
    render: renderRareCard,
    prefixHtml: header,
  });
  state.renderAbort = handle.abort;
  void handle.done.then(() => {
    if (state.renderAbort === handle.abort) state.renderAbort = null;
  });
}

/** Schedule a reactive re-render. `instant` skips the debounce (for selects). */
function scheduleFilterApply(instant: boolean): void {
  if (state.debounce !== null) {
    clearTimeout(state.debounce);
    state.debounce = null;
  }
  if (instant) {
    applyAndRender();
    return;
  }
  state.debounce = setTimeout(() => {
    state.debounce = null;
    applyAndRender();
  }, FILTER_DEBOUNCE_MS);
}

async function runScan(): Promise<void> {
  if (!overlay || state.running) return;
  state.running = true;
  state.aborted = { aborted: false };
  const filters = readFilterValues(overlay.body);
  const pages = Math.max(1, Math.min(200, parseInt(filters['pages'] ?? '50', 10) || 50));

  updateScanBar(overlay.body, { actionLabel: 'Stop', info: 'Collecting…', progressPct: 0 });
  setStatus('Collecting PirateSwap inventory…', 'info');

  const items = await collectAll({
    site: 'pirateswap',
    maxPages: pages,
    signal: state.aborted,
    onProgress: (msg, collected) => {
      if (!overlay) return;
      const pct = Math.min(70, Math.round((collected / (pages * 40)) * 70));
      updateScanBar(overlay.body, { info: msg, progressPct: pct });
    },
  });

  if (state.aborted.aborted) {
    setStatus('Scan stopped.', 'info');
    finish();
    return;
  }

  updateScanBar(overlay.body, {
    info: `Matching ${items.length} items against rare DB…`,
    progressPct: 80,
  });
  state.results = await findRareResults(items);

  if (!overlay) {
    finish();
    return;
  }
  applyAndRender();
  updateScanBar(overlay.body, {
    info: `Scan complete — ${state.results.length} hits.`,
    progressPct: 100,
  });
  setStatus(`Found ${state.results.length} items with rare stickers.`, 'ok');

  const top = applyRareFilter(state.results, currentFilterOpts())[0];
  if (top) {
    void send({
      type: 'hit:record',
      site: 'pirateswap',
      name: top.name,
      sub: `${top.matches.length} rare stickers · listed ${formatUsd(top.price)}`,
      profitUsd: top.profit,
    });
  }
  finish();
}

function formatUsd(n: number): string {
  return '$' + n.toFixed(2);
}

function abort(): void {
  state.aborted.aborted = true;
  state.renderAbort?.();
  state.renderAbort = null;
  if (state.debounce !== null) {
    clearTimeout(state.debounce);
    state.debounce = null;
  }
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
  setStatus('Ready.', 'info');

  overlay.body.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('[data-role=scan-action]');
    if (!btn) return;
    e.preventDefault();
    if (state.running) abort();
    else void runScan();
  });

  // Reactive filters (B1.d): re-apply + re-render in place when the user
  // changes any filter. Inputs get a 250 ms debounce; selects are instant.
  overlay.body.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (!t.matches('[data-filter]')) return;
    // Don't re-render before there's anything to render.
    if (!state.results.length) return;
    scheduleFilterApply(false);
  });
  overlay.body.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (!t.matches('[data-filter]')) return;
    if (!state.results.length) return;
    scheduleFilterApply(true);
  });
}

async function bootstrap(): Promise<void> {
  console.debug('[Skinsight] loaded on pirateswap');
  mount();
}

void bootstrap();
