/**
 * PirateSwap content script — Rare mode (v0.3).
 *
 * Only supports the Rare mode; the popup hides Arbitrage on PS.
 * Pages through web.pirateswap.com/inventory/v2/ExchangerInventory,
 * runs findRareResults against the bundled rare_stickers DB, renders
 * sticker-breakdown cards.
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
import { applyRareFilter, collectAll, findRareResults } from '../modules/rare/finder';
import { renderRareCard } from '../modules/rare/render';
import { send } from '../modules/shared/messaging';

const ROOT_ID = 'skinsight-ps-overlay';
const PERSIST_KEY = 'pirateswap';

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
}

let overlay: OverlayHandle | null = null;
const state: State = { running: false, aborted: { aborted: false } };

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

async function runScan(): Promise<void> {
  if (!overlay || state.running) return;
  state.running = true;
  state.aborted = { aborted: false };
  const filters = readFilterValues(overlay.body);
  const pages = Math.max(1, Math.min(200, parseInt(filters['pages'] ?? '50', 10) || 50));
  const maxPriceRaw = filters['maxPrice'] ?? '';
  const maxPrice = maxPriceRaw.trim() ? parseFloat(maxPriceRaw) : undefined;
  const sort = (filters['sort'] ?? 'roi') as
    | 'roi'
    | 'stickerSum'
    | 'profit'
    | 'priceAsc'
    | 'priceDesc';

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
  const results = await findRareResults(items);
  const filtered = applyRareFilter(results, {
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    sort,
  });

  if (!overlay) {
    finish();
    return;
  }
  const list = overlay.body.querySelector<HTMLElement>('[data-role=results]');
  if (list) {
    list.innerHTML =
      renderResultsHeader('Item · stickers detected', 'Worth') +
      (filtered.length
        ? filtered.map(renderRareCard).join('')
        : `<div class="sh-empty">
            <div class="sh-empty-icon">⌖</div>
            <div class="sh-empty-title">No rare stickers found</div>
            <div class="sh-empty-sub">Widen filters or scan more pages.</div>
          </div>`);
  }
  updateScanBar(overlay.body, {
    info: `Scan complete — ${filtered.length} hits.`,
    progressPct: 100,
  });
  setStatus(`Found ${filtered.length} items with rare stickers.`, 'ok');

  // Report the top hit (if any) to the popup feed.
  const top = filtered[0];
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
}

async function bootstrap(): Promise<void> {
  // PirateSwap is always-on Rare. It ignores any popup-driven mode toggle —
  // the user's choice over there only affects SkinsMonkey. A scan running
  // here therefore survives any setting change in another tab.
  console.debug('[Skinsight] loaded on pirateswap');
  mount();
}

void bootstrap();
