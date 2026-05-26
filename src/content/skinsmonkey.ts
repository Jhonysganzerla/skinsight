/**
 * SkinsMonkey content script — Arbitrage mode (v0.2).
 *
 * Mounts the overlay panel on skinsmonkey.com pages (only when the user
 * enabled Arbitrage on the popup). On "Scan":
 *   1. Reads CSRF token from the live session.
 *   2. Pages through `/api/inventory` collecting raw assets.
 *   3. Applies local filters (min profit, max price, max pages).
 *   4. Builds the ExportPayload and ships it to the SW via
 *      `arbitrage:start` (no clipboard).
 *
 * The actual price analysis happens in `content/csfloat.ts` (oracle), wired
 * by the service worker.
 */
import { createOverlay, type OverlayHandle } from '../modules/shared/overlay';
import {
  renderFilterGrid,
  renderScanBar,
  updateScanBar,
  readFilterValues,
  type FilterField,
} from '../modules/shared/ui';
import { send } from '../modules/shared/messaging';
import { isModeActive, watchSettings } from '../modules/shared/settings';
import {
  buildExportPayload,
  getCsrf,
  scanAll,
  applyFilter,
  type RawAsset,
} from '../modules/arbitrage/scanner';

const ROOT_ID = 'skinsight-sm-overlay';
const PERSIST_KEY = 'skinsmonkey';

const FILTERS: FilterField[] = [
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

interface ScanState {
  running: boolean;
  abort: AbortController | null;
}

const state: ScanState = { running: false, abort: null };
let overlay: OverlayHandle | null = null;

function bodyHtml(): string {
  return [
    renderFilterGrid(FILTERS),
    renderScanBar({ info: 'Ready. Configure filters and start a scan.', actionLabel: 'Scan' }),
    `<div data-role="hint" class="sh-hint">Results show up in the CSFloat tab once analysis finishes.</div>`,
  ].join('');
}

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
}

async function runScan(): Promise<void> {
  if (!overlay) return;
  if (state.running) return;
  const csrf = getCsrf();
  if (!csrf) {
    setStatus('No CSRF token detected — log in on SkinsMonkey and reload.', 'err');
    return;
  }
  const filters = readFilterValues(overlay.body);
  const q = (filters['q'] ?? '*').trim() || '*';
  const maxPages = Math.max(1, Math.min(80, parseInt(filters['pages'] ?? '5', 10) || 5));
  const exteriors = EXT_MAP[filters['exteriors'] ?? 'all'] ?? [];

  state.running = true;
  state.abort = new AbortController();
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
      signal: state.abort.signal,
      onPage: (loaded, total) => {
        const pct = total
          ? Math.min(93, Math.round((loaded / total) * 93))
          : Math.min(88, Math.round((loaded / (maxPages * 120)) * 88));
        updateScanBar(overlay!.body, {
          progressPct: pct,
          info: `Collected ${loaded}${total ? ' / ' + total : ''}…`,
        });
      },
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      setStatus('Scan stopped.', 'info');
    } else {
      setStatus('Scan failed: ' + err.message, 'err');
    }
    finishScan();
    return;
  }

  // Local filter pass (just shrinks the payload before shipping to CSFloat).
  const filtered = applyFilter(all, {});
  updateScanBar(overlay.body, {
    progressPct: 95,
    info: `Collected ${filtered.length} items. Handing off to CSFloat…`,
  });
  setStatus(`Sending ${filtered.length} items to CSFloat analyzer…`, 'info');

  const payload = buildExportPayload(filtered);
  const res = await send({ type: 'arbitrage:start', payload });
  if (res.ok) {
    updateScanBar(overlay.body, { progressPct: 100, info: 'Done. Open the CSFloat tab.' });
    setStatus(`Sent ${payload.items.length} items. Analysis runs in the CSFloat tab.`, 'ok');
  } else {
    setStatus('Failed to hand off: ' + (res.error ?? 'unknown'), 'err');
  }
  finishScan();
}

function finishScan(): void {
  state.running = false;
  state.abort = null;
  if (overlay) {
    updateScanBar(overlay.body, { actionLabel: 'Scan' });
  }
}

function abortScan(): void {
  if (!state.running || !state.abort) return;
  state.abort.abort();
}

function mount(): void {
  if (overlay) return;
  overlay = createOverlay({
    rootId: ROOT_ID,
    mode: 'arbitrage',
    modeLabel: 'Arbitrage',
    persistKey: PERSIST_KEY,
    onClose: () => {
      abortScan();
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
    if (state.running) {
      abortScan();
    } else {
      void runScan();
    }
  });
}

function unmount(): void {
  abortScan();
  overlay?.destroy();
  overlay = null;
}

async function bootstrap(): Promise<void> {
  console.debug('[Skinsight] loaded on skinsmonkey');
  if (await isModeActive('arbitrage')) mount();
  watchSettings((s) => {
    if (s.activeMode === 'arbitrage') mount();
    else unmount();
  });
}

void bootstrap();
