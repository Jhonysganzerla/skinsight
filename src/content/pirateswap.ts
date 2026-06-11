/**
 * PirateSwap content script — Rare mode (v0.3 + v0.4.1).
 *
 * Always-on Rare overlay. Pages /inventory/v2/ExchangerInventory, matches
 * against the bundled rare_stickers DB, renders sticker-breakdown cards
 * with chunked/virtualized render + reactive filters.
 *
 * Shared scan plumbing (state, pattern query, mode tag, debounce, filter
 * listeners) lives in modules/rare/scan-controller.ts.
 */
import { createOverlay, type OverlayHandle } from '../modules/shared/overlay';
import {
  readFilterValues,
  renderFilterGrid,
  renderScanBar,
  updateScanBar,
  type FilterField,
} from '../modules/shared/ui';
import { applyRareFilter, collectAll, findRareResults } from '../modules/rare/finder';
import {
  createRareController,
  readRareFilterOpts,
  renderRareList,
} from '../modules/rare/scan-controller';
import { wireSteamButtons } from '../modules/oracles/steam-ui';
import { send } from '../modules/shared/messaging';
import {
  applyStoredLocale,
  applyStoredProfitParams,
  getRareSubmode,
  watchSettings,
} from '../modules/shared/settings';
import { t } from '../modules/shared/i18n';
import type { RareResult } from '../modules/rare/types';

const ROOT_ID = 'skinsight-ps-overlay';
const PERSIST_KEY = 'pirateswap';

// v0.4.1: page-count filter removed. Scan walks the inventory to the end
// (PS reports `empty=true` on the trailing page). Safety cap 250 pages.
// Built lazily so labels reflect the locale resolved at render time.
function filters(): FilterField[] {
  return [
    {
      id: 'maxPages',
      label: t('filter.maxPages'),
      type: 'number',
      value: '',
      placeholder: t('filter.ph.all'),
      hint: t('filter.maxPages.hint'),
    },
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

let overlay: OverlayHandle | null = null;
/** Last collected match set — kept in memory so reactive filters can
 *  re-apply + re-render without a fresh network scan. */
let results: RareResult[] = [];

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
}

function bodyHtml(): string {
  return [
    renderFilterGrid(filters()),
    renderScanBar({ info: t('scan.readyHint'), actionLabel: t('scan.scan') }),
    `<div data-role="results"></div>`,
  ].join('');
}

const DEV_PERF = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/**
 * Diagnostics gate that works in a *production* build too. The DEV flag is
 * compiled to `false` in the shipped extension, so none of the perf marks
 * above ever print for an end user. To debug a live page, run
 *   localStorage.setItem('skinsight:debug', '1')
 * in the page console and reload — `dbg()` then logs the filter→render path.
 */
function debugEnabled(): boolean {
  if (DEV_PERF) return true;
  try {
    return (
      (globalThis as { localStorage?: Storage }).localStorage?.getItem('skinsight:debug') === '1'
    );
  } catch {
    return false; // some host pages sandbox localStorage and throw on access
  }
}
/**
 * Freeze-surviving log. A hard tab freeze (main thread blocked) loses console
 * output, so we persist milestones to a capped ring buffer in localStorage.
 * After a freeze, reload the tab and read them with `__skinsightLog()` in the
 * console (or inspect `localStorage['skinsight:log']`). The LAST entry written
 * before the freeze pinpoints which stage blocked: scan / match / render.
 * Gated by the same debug flag — enable with
 *   localStorage.setItem('skinsight:debug','1')
 * then reload BEFORE scanning.
 */
const FLOG_KEY = 'skinsight:log';
const FLOG_MAX = 300;
function flog(msg: string): void {
  if (!debugEnabled()) return;
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  console.debug('[Skinsight]', line);
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return;
    const prev = ls.getItem(FLOG_KEY);
    const arr: string[] = prev ? (JSON.parse(prev) as string[]) : [];
    arr.push(line);
    if (arr.length > FLOG_MAX) arr.splice(0, arr.length - FLOG_MAX);
    ls.setItem(FLOG_KEY, JSON.stringify(arr));
  } catch {
    /* localStorage may be sandboxed / full — non-fatal */
  }
}
// Console helper to dump the buffer after a freeze+reload: just type
// `__skinsightLog()` in the page console — the returned string is printed as
// the expression result (no console.log needed).
(globalThis as { __skinsightLog?: () => string }).__skinsightLog = () => {
  try {
    const raw = (globalThis as { localStorage?: Storage }).localStorage?.getItem(FLOG_KEY);
    return (JSON.parse(raw ?? '[]') as string[]).join('\n');
  } catch {
    return '(no skinsight log)';
  }
};

const ctl = createRareController({
  site: 'pirateswap',
  getOverlay: () => overlay,
  hasResults: () => results.length > 0,
  log: flog,
  renderStickerResults: (list) => {
    if (!overlay) return;
    ctl.state.renderHandle = renderRareList({
      overlay,
      list,
      results,
      filterOpts: readRareFilterOpts(overlay.body),
      log: flog,
    });
  },
});

async function runScan(): Promise<void> {
  if (!ctl.beginScan()) return;
  if (!overlay) return;

  try {
    ctl.state.submode = await getRareSubmode();
    ctl.setModeTagFor(ctl.state.submode);
    if (ctl.state.submode === 'pattern') {
      // Targeted query-by-name path (v0.9.2) — autocomplete resolves the PS
      // hashcodes, the server filters by seed/fade. No full-inventory walk,
      // so the ~60-page throttle window stops being a coverage limit.
      await ctl.runPatternQuery();
      return;
    }
    // Opportunistic, TTL-gated remote rare-list refresh. Fire-and-forget: the SW
    // only hits the network if the cache is older than 24h, and the freshly
    // cached list applies on the next page load (this scan uses the loaded map).
    void send({ type: 'rares:refresh', force: false });

    // No progress bar — we don't know the total ahead of time. Indeterminate
    // status only; the user can Stop at any moment.
    updateScanBar(overlay.body, { actionLabel: t('scan.stop'), info: t('ps.scanningShort') });
    setStatus(t('ps.scanning'), 'info');
    flog('scan: begin');

    // Optional "Max pages": blank → scan to inventory end (collectAll caps at
    // PS_SAFETY_CAP_PAGES); a positive number caps the scan early.
    const filterVals = readFilterValues(overlay.body);
    const maxPagesRaw = (filterVals['maxPages'] ?? '').trim();
    const maxPagesNum = parseInt(maxPagesRaw, 10);
    const maxPages = maxPagesRaw && maxPagesNum > 0 ? maxPagesNum : undefined;

    let schemaWarn: string | null = null;
    const items = await collectAll({
      site: 'pirateswap',
      ...(maxPages !== undefined ? { maxPages } : {}),
      signal: ctl.state.aborted,
      onProgress: (msg, collected) => {
        if (!overlay) return;
        updateScanBar(overlay.body, { info: msg });
        flog(`scan: ${msg} (collected=${collected})`);
      },
      onWarn: (msg) => {
        schemaWarn = msg;
        flog(`scan: WARN ${msg}`);
      },
    });
    // Diagnostic for the "0 rare hits" report: how many scanned items actually
    // carry stickers, and a few example names to eyeball against the rare DB
    // (whose keys are norm("Sticker | Name (Variant) | Tournament")). If
    // withStickers=0 the endpoint isn't returning sticker data at all (param /
    // endpoint issue); if it's >0 but hits stay 0, it's a name-matching issue.
    const withStickers = items.filter((it) => it.stickers.length > 0).length;
    const totalStickers = items.reduce((n, it) => n + it.stickers.length, 0);
    const sampleNames = items
      .flatMap((it) => it.stickers.map((s) => s.name))
      .filter(Boolean)
      .slice(0, 5);
    flog(
      `scan: done — ${items.length} items, ${withStickers} with stickers, ` +
        `${totalStickers} stickers total; samples=${JSON.stringify(sampleNames)}`,
    );

    if (ctl.state.aborted.aborted) {
      setStatus(t('scan.stopped'), 'info');
      return;
    }

    updateScanBar(overlay.body, {
      info: t('scan.matching', { n: items.length }),
    });

    flog(`match: begin findRareResults over ${items.length} items`);
    results = await findRareResults(items);
    flog(`match: done — ${results.length} hits`);

    if (!overlay) return;
    flog('render: begin initial renderResults');
    ctl.renderResults();
    flog('render: initial renderResults returned');
    updateScanBar(overlay.body, {
      info: t('scan.complete.hits', { n: results.length }),
    });
    // A schema warning + an empty scan is almost certainly an API change, not
    // a genuinely empty inventory — surface it instead of a quiet "0 hits".
    if (schemaWarn && items.length === 0) setStatus(schemaWarn, 'err');
    else setStatus(t('rare.found', { n: results.length }), 'ok');

    const top = applyRareFilter(results, readRareFilterOpts(overlay.body))[0];
    if (top) {
      void send({
        type: 'hit:record',
        site: 'pirateswap',
        name: top.name,
        sub: `${top.matches.length} rare stickers · listed ${formatUsd(top.price)}`,
        profitUsd: top.profit,
      });
    }
  } catch (e) {
    // Never leave the overlay stuck on "Matching…/Scanning…": surface the error
    // and let finally clear `running` so the user can rescan.
    flog(`scan: ERROR ${(e as Error)?.message ?? String(e)}`);
    if (overlay) {
      updateScanBar(overlay.body, { info: t('scan.failed') });
      setStatus(t('scan.error', { msg: (e as Error)?.message ?? String(e) }), 'err');
    }
  } finally {
    ctl.finish();
  }
}

function formatUsd(n: number): string {
  return '$' + n.toFixed(2);
}

function mount(): void {
  if (overlay) return;
  overlay = createOverlay({
    rootId: ROOT_ID,
    mode: 'rare',
    modeLabel: 'Rare stickers',
    persistKey: PERSIST_KEY,
    // Close now hides (the shell minimizes itself); we only abort the scan.
    // Results and listeners survive, the minbar restores everything.
    onClose: () => ctl.abort(),
  });
  overlay.body.innerHTML = bodyHtml();
  wireSteamButtons(overlay.body);
  setStatus(t('scan.ready'), 'info');

  overlay.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-role=scan-action]');
    if (!btn) return;
    e.preventDefault();
    if (ctl.state.running) ctl.abort();
    else void runScan();
  });

  // Reactive filters: re-apply + re-render in place when the user changes any
  // filter. Capture-phase document listeners — see scan-controller.ts.
  ctl.registerFilterListeners();
}

async function bootstrap(): Promise<void> {
  console.debug('[Skinsight] loaded on pirateswap');
  await applyStoredLocale();
  await applyStoredProfitParams();
  mount();
  void ctl.refreshModeTag();
  // Live-update the header tag when the popup flips the Rare sub-mode.
  watchSettings(() => void ctl.refreshModeTag());
}

void bootstrap();
