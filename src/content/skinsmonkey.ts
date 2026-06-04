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
import { t } from '../modules/shared/i18n';
import {
  applyStoredLocale,
  applyStoredProfitParams,
  getSkinsmonkeyMode,
  watchSettings,
} from '../modules/shared/settings';
import { applyFilter, buildExportPayload, getCsrf, scanAll } from '../modules/arbitrage/scanner';
import { applyRareFilter, collectAll, findRareResults } from '../modules/rare/finder';
import { renderRareCard } from '../modules/rare/render';
import { wireSteamButtons } from '../modules/oracles/steam-ui';
import type { RareResult } from '../modules/rare/types';

const ROOT_ID = 'skinsight-sm-overlay';
const PERSIST_KEY_ARB = 'skinsmonkey-arb';
const PERSIST_KEY_RARE = 'skinsmonkey-rare';

/* ──────────────────────────────────────────────────── ARBITRAGE ── */

function arbFilters(): FilterField[] {
  return [
    {
      id: 'q',
      label: t('filter.search'),
      type: 'text',
      placeholder: t('filter.ph.allStar'),
      value: '*',
    },
    { id: 'pages', label: t('filter.maxPages'), type: 'number', value: '5' },
    {
      id: 'exteriors',
      label: t('filter.exteriors'),
      type: 'select',
      options: [
        { value: 'all', label: t('ext.all') },
        { value: 'fn,mw', label: t('ext.fnmw') },
        { value: 'ft,ww,bs', label: t('ext.ftwwbs') },
      ],
    },
  ];
}

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
    renderFilterGrid(arbFilters()),
    renderScanBar({ info: t('sm.arbReadyHint'), actionLabel: t('scan.scan') }),
    `<div class="sh-hint">${t('sm.handoffHint')}</div>`,
  ].join('');
}

async function runArbScan(): Promise<void> {
  if (!overlay || arbState.running) return;
  const csrf = getCsrf();
  if (!csrf) {
    setStatus(t('sm.noCsrf'), 'err');
    return;
  }
  arbState.running = true;
  arbState.abort = new AbortController();
  // try/catch/finally: an abort or any throw becomes a clear status and
  // `finally` always resets state — the bar never stays stuck on "Stop".
  try {
    const filters = readFilterValues(overlay.body);
    const q = (filters['q'] ?? '*').trim() || '*';
    const maxPages = Math.max(1, Math.min(80, parseInt(filters['pages'] ?? '5', 10) || 5));
    const exteriors = EXT_MAP[filters['exteriors'] ?? 'all'] ?? [];

    updateScanBar(overlay.body, {
      actionLabel: t('scan.stop'),
      info: t('sm.starting'),
      progressPct: 0,
    });
    setStatus(t('sm.scanning'), 'info');

    const all = await scanAll({
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
          info: t('sm.collecting', { n: total ? `${loaded} / ${total}` : `${loaded}` }),
        });
      },
    });

    const filtered = applyFilter(all, {});
    if (!overlay) return;
    updateScanBar(overlay.body, {
      progressPct: 95,
      info: t('sm.handingOff', { n: filtered.length }),
    });
    setStatus(t('sm.sending', { n: filtered.length }), 'info');

    const payload = buildExportPayload(filtered);
    const res = await send({ type: 'arbitrage:start', payload });
    if (!overlay) return;
    if (res.ok) {
      updateScanBar(overlay.body, { progressPct: 100, info: t('sm.doneOpenTab') });
      setStatus(t('sm.sent', { n: payload.items.length }), 'ok');
    } else {
      setStatus(t('sm.handoffFail', { err: res.error ?? 'unknown' }), 'err');
    }
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') setStatus(t('scan.stopped'), 'info');
    else if (overlay) setStatus(t('scan.error', { msg: err.message }), 'err');
  } finally {
    finishArbScan();
  }
}

function finishArbScan(): void {
  arbState.running = false;
  arbState.abort = null;
  if (overlay) updateScanBar(overlay.body, { actionLabel: t('scan.scan') });
}

function abortArbScan(): void {
  if (arbState.running && arbState.abort) arbState.abort.abort();
}

/* ──────────────────────────────────────────────────────── RARE ── */

function rareFilters(): FilterField[] {
  return [
    { id: 'pages', label: t('filter.pages'), type: 'number', value: '5' },
    {
      id: 'maxPrice',
      label: t('filter.maxPrice'),
      type: 'number',
      placeholder: t('filter.ph.none'),
    },
    {
      id: 'sort',
      label: t('filter.sort'),
      type: 'select',
      options: [
        { value: 'roi', label: t('sort.roi') },
        { value: 'stickerSum', label: t('sort.stickerSum') },
        { value: 'profit', label: t('sort.profit') },
        { value: 'priceAsc', label: t('sort.priceAsc') },
        { value: 'priceDesc', label: t('sort.priceDesc') },
      ],
    },
  ];
}

interface RareState {
  running: boolean;
  aborted: { aborted: boolean };
  /** Last collected match set — kept so reactive filters can re-apply +
   *  re-render in place without a fresh network scan. */
  results: RareResult[];
  /** Pending debounce timer for filter inputs. */
  debounce: ReturnType<typeof setTimeout> | null;
}

const RARE_FILTER_DEBOUNCE_MS = 250;
const rareState: RareState = {
  running: false,
  aborted: { aborted: false },
  results: [],
  debounce: null,
};

type RareSortKey = 'roi' | 'stickerSum' | 'profit' | 'priceAsc' | 'priceDesc';

/** Read filter values + build the current rare-filter opts. */
function currentRareFilterOpts(): { maxPrice?: number; sort: RareSortKey } {
  if (!overlay) return { sort: 'roi' };
  const filters = readFilterValues(overlay.body);
  const maxPriceRaw = filters['maxPrice'] ?? '';
  const maxPrice = maxPriceRaw.trim() ? parseFloat(maxPriceRaw) : undefined;
  const sort = (filters['sort'] ?? 'roi') as RareSortKey;
  return maxPrice !== undefined ? { maxPrice, sort } : { sort };
}

/** Apply the current filters to `rareState.results` and (re)render in place. */
function renderRareResults(): void {
  if (!overlay) return;
  const list = overlay.body.querySelector<HTMLElement>('[data-role=results]');
  if (!list) return;
  const filtered = applyRareFilter(rareState.results, currentRareFilterOpts());
  list.innerHTML =
    renderResultsHeader(t('results.header.detected'), t('results.worth')) +
    (filtered.length
      ? filtered.map(renderRareCard).join('')
      : `<div class="sh-empty">
          <div class="sh-empty-icon">⌖</div>
          <div class="sh-empty-title">${t('rare.empty.title')}</div>
          <div class="sh-empty-sub">${t('rare.empty.sub')}</div>
        </div>`);
}

/** Schedule a reactive re-render. `instant` skips the debounce (for selects). */
function scheduleRareFilterApply(instant: boolean): void {
  if (rareState.debounce !== null) {
    clearTimeout(rareState.debounce);
    rareState.debounce = null;
  }
  if (instant) {
    renderRareResults();
    return;
  }
  rareState.debounce = setTimeout(() => {
    rareState.debounce = null;
    renderRareResults();
  }, RARE_FILTER_DEBOUNCE_MS);
}

function rareBodyHtml(): string {
  return [
    renderFilterGrid(rareFilters()),
    renderScanBar({ info: t('scan.readyHint'), actionLabel: t('scan.scan') }),
    `<div data-role="results"></div>`,
  ].join('');
}

async function runRareScan(): Promise<void> {
  if (!overlay || rareState.running) return;
  rareState.running = true;
  rareState.aborted = { aborted: false };
  // try/catch/finally so a throw never leaves the bar stuck on "Stop".
  try {
    // Opportunistic, TTL-gated remote rare-list refresh (no-op if cache < 24h).
    void send({ type: 'rares:refresh', force: false });
    const filters = readFilterValues(overlay.body);
    const pages = Math.max(1, Math.min(80, parseInt(filters['pages'] ?? '5', 10) || 5));

    updateScanBar(overlay.body, {
      actionLabel: t('scan.stop'),
      info: t('csm.collecting'),
      progressPct: 0,
    });
    setStatus(t('sm.collectingInv'), 'info');

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
      setStatus(t('scan.stopped'), 'info');
      return;
    }

    updateScanBar(overlay.body, {
      info: t('scan.matching', { n: items.length }),
      progressPct: 80,
    });
    rareState.results = await findRareResults(items);

    if (!overlay) return;
    renderRareResults();
    const filtered = applyRareFilter(rareState.results, currentRareFilterOpts());
    updateScanBar(overlay.body, {
      info: t('scan.complete.hits', { n: filtered.length }),
      progressPct: 100,
    });
    setStatus(t('rare.found', { n: filtered.length }), 'ok');

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
  } catch (e) {
    if (overlay) {
      updateScanBar(overlay.body, { info: t('scan.failed') });
      setStatus(t('scan.error', { msg: (e as Error)?.message ?? String(e) }), 'err');
    }
  } finally {
    finishRareScan();
  }
}

function finishRareScan(): void {
  rareState.running = false;
  if (overlay) updateScanBar(overlay.body, { actionLabel: t('scan.scan') });
}

function abortRareScan(): void {
  rareState.aborted.aborted = true;
  if (rareState.debounce !== null) {
    clearTimeout(rareState.debounce);
    rareState.debounce = null;
  }
}

/* ─────────────────────────────────────────────── mount / unmount ── */

function mount(mode: 'arbitrage' | 'rare'): void {
  if (overlay && currentMode === mode) return;
  if (overlay) unmount();
  currentMode = mode;
  overlay = createOverlay({
    rootId: ROOT_ID,
    mode,
    modeLabel: mode === 'arbitrage' ? t('popup.modes.arb.title') : t('popup.modes.rare.title'),
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
  wireSteamButtons(overlay.body);
  setStatus(t('scan.ready'), 'info');

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

// Reactive filters (Rare mode): re-apply + re-render in place when the user
// changes a filter after a scan (no rescan). SkinsMonkey is a Nuxt/Vue SPA, so
// — like PirateSwap — we listen on `document` in the CAPTURE phase scoped to
// our overlay, since the host framework can swallow bubble-phase events. These
// are registered once (not in `mount`, which re-runs on mode flips) to avoid
// leaking duplicate listeners. The `rareState.results.length` guard makes them
// no-ops in Arbitrage mode (which has no in-overlay filterable results).
function registerRareFilterListeners(): void {
  const onFilterEvent = (instant: boolean) => (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || !overlay || currentMode !== 'rare') return;
    if (!overlay.root.contains(t) || !t.matches?.('[data-filter]')) return;
    if (!rareState.results.length) return;
    scheduleRareFilterApply(instant);
  };
  // `<select>` → instant; text/number inputs → debounced.
  document.addEventListener('change', onFilterEvent(true), true);
  document.addEventListener('input', onFilterEvent(false), true);
}

async function bootstrap(): Promise<void> {
  console.debug('[Skinsight] loaded on skinsmonkey');
  await applyStoredLocale();
  await applyStoredProfitParams();
  registerRareFilterListeners();
  mount(await getSkinsmonkeyMode());
  watchSettings((s) => {
    // Only SkinsMonkey reacts to the per-site mode toggle.
    mount(s.skinsmonkeyMode);
  });
}

void bootstrap();
