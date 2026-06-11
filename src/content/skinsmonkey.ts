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
 *
 * Shared Rare plumbing (state, pattern query, mode tag, debounce, filter
 * listeners) lives in modules/rare/scan-controller.ts.
 */
import { createOverlay, type OverlayHandle } from '../modules/shared/overlay';
import {
  readFilterValues,
  renderBanner,
  renderFilterGrid,
  renderScanBar,
  updateScanBar,
  type FilterField,
} from '../modules/shared/ui';
import { esc } from '../modules/shared/fmt';
import {
  agoLabel,
  flagNew,
  loadSnapshot,
  resultKey,
  saveSnapshot,
  type ScanSnapshot,
} from '../modules/shared/scan-memory';
import { csvFilename, downloadTextFile, toCsv } from '../modules/shared/export';
import { send } from '../modules/shared/messaging';
import { t } from '../modules/shared/i18n';
import {
  applyStoredLocale,
  applyStoredProfitParams,
  getRareSubmode,
  getSkinsmonkeyMode,
  watchSettings,
} from '../modules/shared/settings';
import { applyFilter, buildExportPayload, getCsrf, scanAll } from '../modules/arbitrage/scanner';
import { applyRareFilter, collectAll, findRareResults } from '../modules/rare/finder';
import {
  createRareController,
  readRareFilterOpts,
  renderRareList,
} from '../modules/rare/scan-controller';
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
    {
      id: 'show',
      label: t('filter.show'),
      type: 'select',
      options: [
        { value: 'all', label: t('filter.show.all') },
        { value: 'new', label: t('filter.show.new') },
      ],
    },
  ];
}

/** True when the "Show" filter is set to new-only (v0.10 diff filter). */
function onlyNewActive(): boolean {
  return overlay ? readFilterValues(overlay.body)['show'] === 'new' : false;
}

/** Last collected match set — kept so reactive filters can re-apply +
 *  re-render in place without a fresh network scan. */
let rareResults: RareResult[] = [];

const ctl = createRareController({
  site: 'skinsmonkey',
  getOverlay: () => overlay,
  isActive: () => currentMode === 'rare',
  hasResults: () => rareResults.length > 0,
  renderStickerResults: (list) => {
    if (!overlay) return;
    // Shared chunked/virtualized path — a deep scan (80 pages × 120 items)
    // can match thousands; the virtual list keeps the DOM windowed.
    ctl.state.renderHandle = renderRareList({
      overlay,
      list,
      results: rareResults,
      filterOpts: readRareFilterOpts(overlay.body),
      onlyNew: onlyNewActive(),
    });
  },
});

/* ── Scan memory: snapshot restore + CSV export (v0.10) ───────────── */

const SNAP_SCOPE = 'skinsmonkey:sticker';
let pendingSnap: ScanSnapshot<RareResult> | null = null;

/** Offer to restore the last sticker scan when the rare overlay mounts empty. */
async function offerRestore(): Promise<void> {
  if (!overlay || currentMode !== 'rare' || rareResults.length) return;
  if ((await getRareSubmode()) !== 'sticker') return;
  const snap = await loadSnapshot<RareResult>(SNAP_SCOPE);
  if (!snap || snap.results.length === 0 || !overlay || currentMode !== 'rare') return;
  const list = overlay.body.querySelector<HTMLElement>('[data-role=results]');
  if (!list || list.innerHTML.trim() !== '') return;
  pendingSnap = snap;
  list.innerHTML = renderBanner(
    esc(t('snap.offer', { ago: agoLabel(snap.ts), n: snap.results.length })),
    t('snap.restore'),
  );
}

function restoreFromSnap(): void {
  if (!pendingSnap || ctl.state.running) return;
  rareResults = pendingSnap.results;
  setStatus(t('snap.restored', { n: rareResults.length, ago: agoLabel(pendingSnap.ts) }), 'ok');
  pendingSnap = null;
  ctl.renderResults();
}

function exportCurrent(): void {
  let rows: Array<Record<string, string | number | null | undefined>>;
  let mode: string;
  if (ctl.state.submode === 'pattern') {
    mode = 'pattern';
    rows = ctl.state.patternResults.map((r) => ({
      name: r.marketHashName || r.name,
      seed: r.paintSeed,
      tier: r.tierLabel,
      family: r.family,
      fade_pct: r.fadePct,
      price_usd: r.price,
      new: r.isNew ? 1 : 0,
      csfloat: r.link,
      site: r.siteLink ?? '',
    }));
  } else {
    mode = 'sticker';
    if (!overlay) return;
    const pool = onlyNewActive() ? rareResults.filter((r) => r.isNew) : rareResults;
    rows = applyRareFilter(pool, readRareFilterOpts(overlay.body)).map((r) => ({
      name: r.name,
      listed_usd: r.price,
      stickers_usd: Math.round(r.stickerSum * 100) / 100,
      roi: Math.round(r.roi * 100) / 100,
      profit_usd: Math.round(r.profit * 100) / 100,
      overpay_est_usd: Math.round(r.csMoneyOverpayEst * 100) / 100,
      new: r.isNew ? 1 : 0,
      stickers: r.matches.map((m) => m.name).join(' | '),
      inspect: r.inspectUrl,
    }));
  }
  if (!rows.length) {
    setStatus(t('export.empty'), 'info');
    return;
  }
  downloadTextFile(csvFilename('skinsmonkey', mode), toCsv(rows));
  setStatus(t('export.done', { n: rows.length }), 'ok');
}

function rareBodyHtml(): string {
  return [
    renderFilterGrid(rareFilters()),
    renderScanBar({ info: t('scan.readyHint'), actionLabel: t('scan.scan') }),
    `<div data-role="results"></div>`,
  ].join('');
}

async function runRareScan(): Promise<void> {
  if (!ctl.beginScan()) return;
  if (!overlay) return;
  // try/catch/finally so a throw never leaves the bar stuck on "Stop".
  try {
    ctl.state.submode = await getRareSubmode();
    ctl.setModeTagFor(ctl.state.submode);
    if (ctl.state.submode === 'pattern') {
      // Targeted query-by-name path (v0.9.1) — no full-inventory walk.
      await ctl.runPatternQuery();
      return;
    }
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

    let schemaWarn: string | null = null;
    const items = await collectAll({
      site: 'skinsmonkey',
      maxPages: pages,
      signal: ctl.state.aborted,
      onProgress: (msg, collected) => {
        if (!overlay) return;
        const pct = Math.min(70, Math.round((collected / (pages * 120)) * 70));
        updateScanBar(overlay.body, { info: msg, progressPct: pct });
      },
      onWarn: (msg) => {
        schemaWarn = msg;
      },
    });

    if (ctl.state.aborted.aborted) {
      setStatus(t('scan.stopped'), 'info');
      return;
    }

    updateScanBar(overlay.body, {
      info: t('scan.matching', { n: items.length }),
      progressPct: 80,
    });

    rareResults = await findRareResults(items);

    // Scan memory (v0.10): diff against the seen-set (NOVO badges), then
    // snapshot so the scan survives a tab close. Both never throw.
    await flagNew(SNAP_SCOPE, rareResults, resultKey);
    void saveSnapshot(SNAP_SCOPE, rareResults);
    pendingSnap = null;

    if (!overlay) return;
    ctl.renderResults();
    const filtered = applyRareFilter(rareResults, readRareFilterOpts(overlay.body));
    updateScanBar(overlay.body, {
      info: t('scan.complete.hits', { n: filtered.length }),
      progressPct: 100,
    });
    // Schema warning + empty scan = likely API change, not an empty inventory.
    if (schemaWarn && items.length === 0) setStatus(schemaWarn, 'err');
    else setStatus(t('rare.found', { n: filtered.length }), 'ok');

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
    ctl.finish();
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
    // Close now hides (the shell minimizes itself); we only abort the scan.
    // The hard teardown lives in unmount() for the popup's mode flip.
    onClose: () => {
      if (mode === 'arbitrage') abortArbScan();
      else ctl.abort();
    },
  });
  overlay.body.innerHTML = mode === 'arbitrage' ? arbBodyHtml() : rareBodyHtml();
  wireSteamButtons(overlay.body);
  setStatus(t('scan.ready'), 'info');
  void ctl.refreshModeTag();

  overlay.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (mode === 'rare' && target.closest('[data-role=banner-cta]')) {
      e.preventDefault();
      restoreFromSnap();
      return;
    }
    if (mode === 'rare' && target.closest('[data-role=export-csv]')) {
      e.preventDefault();
      exportCurrent();
      return;
    }
    const btn = target.closest<HTMLElement>('[data-role=scan-action]');
    if (!btn) return;
    e.preventDefault();
    if (mode === 'arbitrage') {
      if (arbState.running) abortArbScan();
      else void runArbScan();
    } else {
      if (ctl.state.running) ctl.abort();
      else void runRareScan();
    }
  });

  // Offer to restore the last rare scan (v0.10) — only while the body is empty.
  if (mode === 'rare') void offerRestore();
}

function unmount(): void {
  abortArbScan();
  ctl.abort();
  overlay?.destroy();
  overlay = null;
  currentMode = null;
}

async function bootstrap(): Promise<void> {
  console.debug('[Skinsight] loaded on skinsmonkey');
  await applyStoredLocale();
  await applyStoredProfitParams();
  // Registered once (not in `mount`, which re-runs on mode flips) to avoid
  // leaking duplicate listeners. The controller's isActive/hasResults guards
  // make them no-ops in Arbitrage mode.
  ctl.registerFilterListeners();
  mount(await getSkinsmonkeyMode());
  watchSettings((s) => {
    // Only SkinsMonkey reacts to the per-site mode toggle.
    mount(s.skinsmonkeyMode);
    // And reflect a Rare sub-mode flip in the header tag (rare overlay only).
    void ctl.refreshModeTag();
  });
}

void bootstrap();
