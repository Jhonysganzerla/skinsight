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
import { renderVirtualList } from '../modules/shared/virtual-list';
import { applyRareFilter, collectAll, findRareResults } from '../modules/rare/finder';
import { queryPatternResults, siteSearchUrl } from '../modules/rare/pattern-query';
import { renderRareCard } from '../modules/rare/render';
import { renderPatternCard } from '../modules/rare/render-pattern';
import { wireSteamButtons } from '../modules/oracles/steam-ui';
import { send } from '../modules/shared/messaging';
import {
  applyStoredLocale,
  applyStoredProfitParams,
  getRareSubmode,
  watchSettings,
} from '../modules/shared/settings';
import { t } from '../modules/shared/i18n';
import type { PatternResult, RareResult } from '../modules/rare/types';
import type { RareSubmode } from '../modules/shared/storage';

const ROOT_ID = 'skinsight-ps-overlay';
const PERSIST_KEY = 'pirateswap';
const FILTER_DEBOUNCE_MS = 250;

/**
 * Above this many filtered results, switch from `renderChunked` (which still
 * mounts every card) to true windowing via `renderVirtualList`. Below it, the
 * windowing overhead (observer + scroll math) isn't worth it. (Issue 1 / #16.)
 */
const VIRT_THRESHOLD = 200;

type SortKey = 'roi' | 'stickerSum' | 'profit' | 'priceAsc' | 'priceDesc';

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

interface State {
  running: boolean;
  aborted: { aborted: boolean };
  /** Last collected match set — kept in memory so reactive filters can
   *  re-apply + re-render without a fresh network scan. */
  results: RareResult[];
  /** Rare detector sub-mode for the current scan (v0.9). */
  submode: RareSubmode;
  /** Last pattern hits (when submode === 'pattern'). */
  patternResults: PatternResult[];
  /** Active render handle (chunked or virtualized) so a filter change can
   *  tear it down before starting a new one. */
  renderHandle: { destroy(): void } | null;
  /** Pending debounce timer for filter inputs. */
  debounce: ReturnType<typeof setTimeout> | null;
}

let overlay: OverlayHandle | null = null;
const state: State = {
  running: false,
  aborted: { aborted: false },
  results: [],
  submode: 'sticker',
  patternResults: [],
  renderHandle: null,
  debounce: null,
};

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
}

/** Reflect the Rare sub-mode (sticker/pattern) in the overlay header tag. */
function setModeTagFor(sub: RareSubmode): void {
  overlay?.setModeTag(
    sub === 'pattern' ? t('pattern.title') : t('popup.modes.rare.title'),
    sub === 'pattern' ? 'pattern' : 'rare',
  );
}
async function refreshModeTag(): Promise<void> {
  setModeTagFor(await getRareSubmode());
}

function bodyHtml(): string {
  return [
    renderFilterGrid(filters()),
    renderScanBar({ info: t('scan.readyHint'), actionLabel: t('scan.scan') }),
    `<div data-role="results"></div>`,
  ].join('');
}

const emptyHtml = (): string => `<div class="sh-empty">
  <div class="sh-empty-icon">⌖</div>
  <div class="sh-empty-title">${t('rare.empty.title')}</div>
  <div class="sh-empty-sub">${t('rare.empty.sub')}</div>
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

/** Apply filters + render; cancels any in-flight render. Never throws. */
function applyAndRender(): void {
  try {
    applyAndRenderUnsafe();
  } catch (e) {
    // A throw here used to silently abort the re-render with no visible
    // change — looking exactly like "changing the Sort select does nothing".
    // Surface it instead of swallowing it.
    console.error('[Skinsight] applyAndRender failed:', e);
    setStatus(t('scan.renderError', { msg: (e as Error).message }), 'err');
  }
}

function applyAndRenderUnsafe(): void {
  if (!overlay) return;
  const list = overlay.body.querySelector<HTMLElement>('[data-role=results]');
  if (!list) return;
  // Tear down any in-flight render (chunked) or live virtual list before
  // starting a new one.
  state.renderHandle?.destroy();
  state.renderHandle = null;

  // Rare Pattern submode: render the (small) pattern hit set. No virtual list
  // — rare seeds are uncommon, so the result count is tiny.
  if (state.submode === 'pattern') {
    const rows = state.patternResults;
    const header = renderResultsHeader(t('pattern.results.header'), t('pattern.results.right'));
    if (!rows.length) {
      list.innerHTML =
        header +
        `<div class="sh-empty">
          <div class="sh-empty-icon">⌖</div>
          <div class="sh-empty-title">${t('pattern.empty.title')}</div>
          <div class="sh-empty-sub">${t('pattern.empty.sub')}</div>
        </div>`;
      return;
    }
    const ph = renderChunked({
      container: list,
      items: rows,
      render: renderPatternCard,
      prefixHtml: header,
    });
    const patHandle = { destroy: ph.abort };
    state.renderHandle = patHandle;
    void ph.done.then(() => {
      if (state.renderHandle === patHandle) state.renderHandle = null;
    });
    return;
  }

  const t0 = performance.now();
  const opts = currentFilterOpts();
  const filtered = applyRareFilter(state.results, opts);
  flog(
    `applyAndRender sort=${opts.sort} maxPrice=${opts.maxPrice ?? '∅'} ` +
      `results=${state.results.length} → filtered=${filtered.length} ` +
      `filter+sort=${(performance.now() - t0).toFixed(1)}ms ` +
      `path=${filtered.length > VIRT_THRESHOLD ? 'virtual' : 'chunked'}`,
  );

  const header = renderResultsHeader(t('results.header.detected'), t('results.worth'));
  if (!filtered.length) {
    list.innerHTML = header + emptyHtml();
    return;
  }

  // Large sets: true windowing — only the viewport (± buffer) is ever in the
  // DOM. Filter change resets scroll to the top (prompt T1). Small sets: the
  // cheaper chunked render, whose full DOM cost is negligible at this size.
  if (filtered.length > VIRT_THRESHOLD) {
    overlay.body.scrollTop = 0;
    const vh = renderVirtualList({
      scrollRoot: overlay.body,
      container: list,
      items: filtered,
      render: renderRareCard,
      prefixHtml: header,
    });
    state.renderHandle = { destroy: vh.destroy };
    return;
  }

  const handle = renderChunked({
    container: list,
    items: filtered,
    render: renderRareCard,
    prefixHtml: header,
  });
  const chunkHandle = { destroy: handle.abort };
  state.renderHandle = chunkHandle;
  void handle.done.then(() => {
    if (state.renderHandle === chunkHandle) state.renderHandle = null;
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

/** Run the targeted per-skin pattern hunt (v0.9.2 query-by-name). */
async function runPatternQuery(): Promise<void> {
  if (!overlay) return;
  updateScanBar(overlay.body, { actionLabel: t('scan.stop'), info: '', progressPct: 0 });
  flog('pattern query: begin');
  const res = await queryPatternResults('pirateswap', {
    signal: state.aborted,
    onProgress: (i, n, name, p) => {
      if (!overlay) return;
      updateScanBar(overlay.body, {
        info: t('pattern.querying', { i, n, name, p }),
        progressPct: Math.round((i / n) * 95),
      });
    },
  });
  if (state.aborted.aborted) {
    setStatus(t('scan.stopped'), 'info');
    return;
  }
  state.patternResults = res.map((r) => ({
    ...r,
    siteLink: siteSearchUrl('pirateswap', r.marketHashName),
  }));
  flog(`pattern query: done — ${state.patternResults.length} hits`);
  if (!overlay) return;
  applyAndRender();
  updateScanBar(overlay.body, {
    info: t('pattern.found', { n: state.patternResults.length }),
    progressPct: 100,
  });
  setStatus(t('pattern.found', { n: state.patternResults.length }), 'ok');
}

async function runScan(): Promise<void> {
  if (!overlay || state.running) return;
  state.running = true;
  state.aborted = { aborted: false };

  try {
    state.submode = await getRareSubmode();
    setModeTagFor(state.submode);
    if (state.submode === 'pattern') {
      // Targeted query-by-name path (v0.9.2) — autocomplete resolves the PS
      // hashcodes, the server filters by seed/fade. No full-inventory walk,
      // so the ~60-page throttle window stops being a coverage limit.
      await runPatternQuery();
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
    const filters = readFilterValues(overlay.body);
    const maxPagesRaw = (filters['maxPages'] ?? '').trim();
    const maxPagesNum = parseInt(maxPagesRaw, 10);
    const maxPages = maxPagesRaw && maxPagesNum > 0 ? maxPagesNum : undefined;

    const items = await collectAll({
      site: 'pirateswap',
      ...(maxPages !== undefined ? { maxPages } : {}),
      signal: state.aborted,
      onProgress: (msg, collected) => {
        if (!overlay) return;
        updateScanBar(overlay.body, { info: msg });
        flog(`scan: ${msg} (collected=${collected})`);
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

    if (state.aborted.aborted) {
      setStatus(t('scan.stopped'), 'info');
      return;
    }

    updateScanBar(overlay.body, {
      info: t('scan.matching', { n: items.length }),
    });

    flog(`match: begin findRareResults over ${items.length} items`);
    state.results = await findRareResults(items);
    flog(`match: done — ${state.results.length} hits`);

    if (!overlay) return;
    flog('render: begin initial applyAndRender');
    applyAndRender();
    flog('render: initial applyAndRender returned');
    updateScanBar(overlay.body, {
      info: t('scan.complete.hits', { n: state.results.length }),
    });
    setStatus(t('rare.found', { n: state.results.length }), 'ok');

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
  } catch (e) {
    // Never leave the overlay stuck on "Matching…/Scanning…": surface the error
    // and let finally clear `running` so the user can rescan.
    flog(`scan: ERROR ${(e as Error)?.message ?? String(e)}`);
    if (overlay) {
      updateScanBar(overlay.body, { info: t('scan.failed') });
      setStatus(t('scan.error', { msg: (e as Error)?.message ?? String(e) }), 'err');
    }
  } finally {
    finish();
  }
}

function formatUsd(n: number): string {
  return '$' + n.toFixed(2);
}

function abort(): void {
  state.aborted.aborted = true;
  state.renderHandle?.destroy();
  state.renderHandle = null;
  if (state.debounce !== null) {
    clearTimeout(state.debounce);
    state.debounce = null;
  }
}

function finish(): void {
  state.running = false;
  if (overlay) updateScanBar(overlay.body, { actionLabel: t('scan.scan') });
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
  setStatus(t('scan.ready'), 'info');

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
  //
  // PirateSwap is a React SPA. A delegated listener on `overlay.body` (bubble
  // phase) was unreliable here — the host's framework appears to interfere
  // with `change`/`input` propagation (the Scan *click* still bubbled, but
  // filter `change` did not reach us). We therefore listen on `document` in
  // the CAPTURE phase, which fires on the way down before any host handler can
  // stop propagation, and scope it to events originating inside our overlay.
  const onFilterEvent = (instant: boolean) => (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || !overlay) return;
    const inOverlay = overlay.root.contains(t);
    const isFilter = inOverlay && !!t.matches?.('[data-filter]');
    flog(
      `${e.type} event: tag=${t.tagName ?? '∅'} inOverlay=${inOverlay} isFilter=${isFilter} ` +
        `filter=${t.getAttribute?.('data-filter') ?? '∅'} ` +
        `value=${(t as HTMLInputElement).value ?? '∅'} hasResults=${state.results.length}`,
    );
    if (!isFilter) return;
    // Don't re-render before there's anything to render.
    if (!state.results.length) return;
    scheduleFilterApply(instant);
  };
  // `<select>` → instant; text/number inputs → debounced.
  document.addEventListener('change', onFilterEvent(true), true);
  document.addEventListener('input', onFilterEvent(false), true);
}

async function bootstrap(): Promise<void> {
  console.debug('[Skinsight] loaded on pirateswap (build=diag-capture)');
  await applyStoredLocale();
  await applyStoredProfitParams();
  mount();
  void refreshModeTag();
  // Live-update the header tag when the popup flips the Rare sub-mode.
  watchSettings(() => void refreshModeTag());
}

void bootstrap();
