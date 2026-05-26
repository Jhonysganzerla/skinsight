/**
 * SkinsMonkey content script.
 *
 * The only site that supports BOTH modes:
 *   - Arbitrage (v0.2): collects /api/inventory, hands off to CSFloat.
 *   - Rare      (v0.3): collects /api/inventory with stickers, matches
 *                       against the bundled rare DB, renders breakdown.
 *
 * The popup's mutex ensures only one mode is active at a time. We mount
 * the matching overlay and tear it down if the user flips the mode.
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
import { send } from '../modules/shared/messaging';
import { watchSettings } from '../modules/shared/settings';
import { getActiveMode } from '../modules/shared/settings';
import {
  applyFilter,
  buildExportPayload,
  getCsrf,
  scanAll,
  type RawAsset,
} from '../modules/arbitrage/scanner';
import { applyRareFilter, collectAll, findRareResults } from '../modules/rare/finder';
import { renderRareCard } from '../modules/rare/render';

const ROOT_ID = 'skinsight-sm-overlay';
const PERSIST_KEY_ARB = 'skinsmonkey-arb';
const PERSIST_KEY_RARE = 'skinsmonkey-rare';

/* ──────────────────────────────────────────────────── ARBITRAGE ── */

const ARB_FILTERS: FilterField[] = [
  { id: 'q', label: 'Search', type: 'text', placeholder: '* (all)', value: '*' },
  { id: 'pages', label: 'Max pages', type: 'number', value: '5' },
  {
    id: 'exteriors',
    label: 'Exteriors',
    type: 'select',
    options: [
      { value: 'all', label: 'All' },
      { value: 'fn,mw', label: 'FN + MW' },
      { value: 'ft,ww,bs', label: 'FT + WW + BS' },
    ],
  },
];

const EXT_MAP: Record<string, string[]> = {
  all: [],
  'fn,mw': ['FACTORY_NEW', 'MINIMAL_WEAR'],
  'ft,ww,bs': ['FIELD_TESTED', 'WELL_WORN', 'BATTLE_SCARRED'],
};

interface ArbState {
  running: boolean;
  abort: AbortController | null;
}

let overlay: OverlayHandle | null = null;
let currentMode: 'arbitrage' | 'rare' | null = null;
const arbState: ArbState = { running: false, abort: null };

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
}

function arbBodyHtml(): string {
  return [
    renderFilterGrid(ARB_FILTERS),
    renderScanBar({ info: 'Ready. Configure filters and start a scan.', actionLabel: 'Scan' }),
    `<div class="sh-hint">Results show up in the CSFloat tab once analysis finishes.</div>`,
  ].join('');
}

async function runArbScan(): Promise<void> {
  if (!overlay || arbState.running) return;
  const csrf = getCsrf();
  if (!csrf) {
    setStatus('No CSRF token detected — log in on SkinsMonkey and reload.', 'err');
    return;
  }
  const filters = readFilterValues(overlay.body);
  const q = (filters['q'] ?? '*').trim() || '*';
  const maxPages = Math.max(1, Math.min(80, parseInt(filters['pages'] ?? '5', 10) || 5));
  const exteriors = EXT_MAP[filters['exteriors'] ?? 'all'] ?? [];

  arbState.running = true;
  arbState.abort = new AbortController();
  updateScanBar(overlay.body, { actionLabel: 'Stop', info: 'Starting scan…', progressPct: 0 });
  setStatus('Scanning SkinsMonkey…', 'info');

  let all: RawAsset[] = [];
  try {
    all = await scanAll({
      q,
      exteriors,
      withCharm: false,
      csrf,
      maxPages,
      signal: arbState.abort.signal,
      onPage: (loaded, total) => {
        if (!overlay) return;
        const pct = total
          ? Math.min(93, Math.round((loaded / total) * 93))
          : Math.min(88, Math.round((loaded / (maxPages * 120)) * 88));
        updateScanBar(overlay.body, {
          progressPct: pct,
          info: `Collected ${loaded}${total ? ' / ' + total : ''}…`,
        });
      },
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') setStatus('Scan stopped.', 'info');
    else setStatus('Scan failed: ' + err.message, 'err');
    finishArbScan();
    return;
  }

  const filtered = applyFilter(all, {});
  if (!overlay) {
    finishArbScan();
    return;
  }
  updateScanBar(overlay.body, {
    progressPct: 95,
    info: `Collected ${filtered.length} items. Handing off to CSFloat…`,
  });
  setStatus(`Sending ${filtered.length} items to CSFloat analyzer…`, 'info');

  const payload = buildExportPayload(filtered);
  const res = await send({ type: 'arbitrage:start', payload });
  if (!overlay) {
    finishArbScan();
    return;
  }
  if (res.ok) {
    updateScanBar(overlay.body, { progressPct: 100, info: 'Done. Open the CSFloat tab.' });
    setStatus(`Sent ${payload.items.length} items. Analysis runs in the CSFloat tab.`, 'ok');
  } else {
    setStatus('Failed to hand off: ' + (res.error ?? 'unknown'), 'err');
  }
  finishArbScan();
}

function finishArbScan(): void {
  arbState.running = false;
  arbState.abort = null;
  if (overlay) updateScanBar(overlay.body, { actionLabel: 'Scan' });
}

function abortArbScan(): void {
  if (arbState.running && arbState.abort) arbState.abort.abort();
}

/* ──────────────────────────────────────────────────────── RARE ── */

const RARE_FILTERS: FilterField[] = [
  { id: 'pages', label: 'Pages', type: 'number', value: '5' },
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

interface RareState {
  running: boolean;
  aborted: { aborted: boolean };
}

const rareState: RareState = { running: false, aborted: { aborted: false } };

function rareBodyHtml(): string {
  return [
    renderFilterGrid(RARE_FILTERS),
    renderScanBar({ info: 'Ready. Click Scan to begin.', actionLabel: 'Scan' }),
    `<div data-role="results"></div>`,
  ].join('');
}

async function runRareScan(): Promise<void> {
  if (!overlay || rareState.running) return;
  rareState.running = true;
  rareState.aborted = { aborted: false };
  const filters = readFilterValues(overlay.body);
  const pages = Math.max(1, Math.min(80, parseInt(filters['pages'] ?? '5', 10) || 5));
  const maxPriceRaw = filters['maxPrice'] ?? '';
  const maxPrice = maxPriceRaw.trim() ? parseFloat(maxPriceRaw) : undefined;
  const sort = (filters['sort'] ?? 'roi') as
    | 'roi'
    | 'stickerSum'
    | 'profit'
    | 'priceAsc'
    | 'priceDesc';

  updateScanBar(overlay.body, { actionLabel: 'Stop', info: 'Collecting…', progressPct: 0 });
  setStatus('Collecting SkinsMonkey inventory…', 'info');

  const items = await collectAll({
    site: 'skinsmonkey',
    maxPages: pages,
    signal: rareState.aborted,
    onProgress: (msg, collected) => {
      if (!overlay) return;
      const pct = Math.min(70, Math.round((collected / (pages * 120)) * 70));
      updateScanBar(overlay.body, { info: msg, progressPct: pct });
    },
  });

  if (rareState.aborted.aborted) {
    setStatus('Scan stopped.', 'info');
    finishRareScan();
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
    finishRareScan();
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

  const top = filtered[0];
  if (top) {
    void send({
      type: 'hit:record',
      site: 'skinsmonkey',
      name: top.name,
      sub: `${top.matches.length} rare stickers · listed $${top.price.toFixed(2)}`,
      profitUsd: top.profit,
    });
  }
  finishRareScan();
}

function finishRareScan(): void {
  rareState.running = false;
  if (overlay) updateScanBar(overlay.body, { actionLabel: 'Scan' });
}

function abortRareScan(): void {
  rareState.aborted.aborted = true;
}

/* ─────────────────────────────────────────────── mount / unmount ── */

function mount(mode: 'arbitrage' | 'rare'): void {
  if (overlay && currentMode === mode) return;
  if (overlay) unmount();
  currentMode = mode;
  overlay = createOverlay({
    rootId: ROOT_ID,
    mode,
    modeLabel: mode === 'arbitrage' ? 'Arbitrage' : 'Rare stickers',
    persistKey: mode === 'arbitrage' ? PERSIST_KEY_ARB : PERSIST_KEY_RARE,
    onClose: () => {
      if (mode === 'arbitrage') abortArbScan();
      else abortRareScan();
      overlay?.destroy();
      overlay = null;
      currentMode = null;
    },
  });
  overlay.body.innerHTML = mode === 'arbitrage' ? arbBodyHtml() : rareBodyHtml();
  setStatus('Ready.', 'info');

  overlay.body.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('[data-role=scan-action]');
    if (!btn) return;
    e.preventDefault();
    if (mode === 'arbitrage') {
      if (arbState.running) abortArbScan();
      else void runArbScan();
    } else {
      if (rareState.running) abortRareScan();
      else void runRareScan();
    }
  });
}

function unmount(): void {
  abortArbScan();
  abortRareScan();
  overlay?.destroy();
  overlay = null;
  currentMode = null;
}

async function bootstrap(): Promise<void> {
  console.debug('[Skinsight] loaded on skinsmonkey');
  const initial = await getActiveMode();
  if (initial === 'arbitrage' || initial === 'rare') mount(initial);
  watchSettings((s) => {
    if (s.activeMode === 'arbitrage' || s.activeMode === 'rare') mount(s.activeMode);
    else unmount();
  });
}

void bootstrap();
