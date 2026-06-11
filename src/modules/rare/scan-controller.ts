/**
 * Shared Rare-scan controller (v0.9.x refactor).
 *
 * SkinsMonkey, PirateSwap and CS.Money duplicated ~60-70% of their Rare
 * plumbing: scan state, the per-skin pattern query, the sub-mode header tag,
 * the filter debounce and the capture-phase document listeners. The
 * duplication had real cost — fixes landed on one site and not the others
 * (the virtual-list path existed only on PirateSwap). This module owns the
 * shared pieces; each content script supplies only its site-specific
 * collector and sticker renderer.
 *
 * Capture-phase rationale (applies to all three hosts): they are React/Vue
 * SPAs whose frameworks can swallow bubble-phase `change`/`input` events
 * before a delegated listener on the overlay body sees them. Listening on
 * `document` in the CAPTURE phase fires on the way down, before any host
 * handler can stop propagation; we scope to events originating inside our
 * overlay root.
 */
import type { OverlayHandle } from '../shared/overlay';
import {
  exportButtonHtml,
  readFilterValues,
  renderChunked,
  renderResultsHeader,
  updateScanBar,
} from '../shared/ui';
import { flagNew, resultKey } from '../shared/scan-memory';
import { renderVirtualList } from '../shared/virtual-list';
import { applyRareFilter, type RareFilterOpts, type RareSortKey } from './finder';
import { renderRareCard } from './render';
import { mountPatternView } from './pattern-view';
import {
  patternStatus,
  queryPatternResults,
  siteSearchUrl,
  type PatternQuerySite,
} from './pattern-query';
import { send } from '../shared/messaging';
import { getRareSubmode } from '../shared/settings';
import { t } from '../shared/i18n';
import type { PatternResult, RareResult } from './types';
import type { RareSubmode } from '../shared/storage';

export const RARE_FILTER_DEBOUNCE_MS = 250;

/**
 * Above this many filtered results, switch from `renderChunked` (which still
 * mounts every card) to true windowing via `renderVirtualList`. Below it, the
 * windowing overhead (observer + scroll math) isn't worth it. (Issue 1 / #16.)
 */
export const VIRT_THRESHOLD = 200;

export interface RareRenderHandle {
  destroy(): void;
}

export interface RareScanState {
  running: boolean;
  aborted: { aborted: boolean };
  /** Rare detector sub-mode for the current scan (v0.9). */
  submode: RareSubmode;
  /** Last pattern hits (when submode === 'pattern'). */
  patternResults: PatternResult[];
  /** Active render handle (chunked, virtualized or pattern view) so a filter
   *  change can tear it down before starting a new one. */
  renderHandle: RareRenderHandle | null;
  /** Pending debounce timer for filter inputs. */
  debounce: ReturnType<typeof setTimeout> | null;
}

export interface RareControllerOpts {
  site: PatternQuerySite;
  getOverlay(): OverlayHandle | null;
  /** Render the site's sticker results into the given list container. */
  renderStickerResults(list: HTMLElement): void;
  /** Rare overlay currently active? SkinsMonkey flips between modes; the
   *  always-on sites omit this (defaults to true). */
  isActive?(): boolean;
  /** Are there results worth re-rendering on a filter change? */
  hasResults(): boolean;
  /** Optional diagnostic logger (PirateSwap's freeze-surviving log). */
  log?(msg: string): void;
}

export interface RareController {
  state: RareScanState;
  /** Reflect the Rare sub-mode in the header tag and hide the sticker filter
   *  grid in Pattern submode (the pattern view brings its own controls). */
  setModeTagFor(sub: RareSubmode): void;
  refreshModeTag(): Promise<void>;
  /** Pattern-vs-sticker dispatch with render teardown. Never throws — a
   *  throw here used to look exactly like "changing Sort does nothing". */
  renderResults(): void;
  /** Run the targeted per-skin pattern hunt (query-by-name). */
  runPatternQuery(): Promise<void>;
  /** Schedule a reactive re-render. `instant` skips the debounce (selects). */
  scheduleFilterApply(instant: boolean): void;
  /** Register the capture-phase document listeners. Call ONCE per page —
   *  never from a re-runnable mount() — to avoid leaking duplicates. */
  registerFilterListeners(): void;
  /** Claim the running flag. False when already running or no overlay. */
  beginScan(): boolean;
  /** Reset running + restore the Scan action label. */
  finish(): void;
  /** Signal abort, tear down renders, clear the debounce. */
  abort(): void;
}

/** Read the shared sticker filters (maxPrice + sort) from the overlay body. */
export function readRareFilterOpts(body: HTMLElement): { maxPrice?: number; sort: RareSortKey } {
  const filters = readFilterValues(body);
  const maxPriceRaw = filters['maxPrice'] ?? '';
  const maxPrice = maxPriceRaw.trim() ? parseFloat(maxPriceRaw) : undefined;
  const sort = (filters['sort'] ?? 'roi') as RareSortKey;
  return maxPrice !== undefined ? { maxPrice, sort } : { sort };
}

const emptyHtml = (): string => `<div class="sh-empty">
  <div class="sh-empty-icon">⌖</div>
  <div class="sh-empty-title">${t('rare.empty.title')}</div>
  <div class="sh-empty-sub">${t('rare.empty.sub')}</div>
</div>`;

/**
 * Filter + render a sticker result set, choosing chunked vs virtualized by
 * size. Shared by SkinsMonkey and PirateSwap — before the refactor only PS
 * had the virtual path, so an 80-page SkinsMonkey scan still mounted every
 * card in the DOM. Returns the live render handle (null for the empty state).
 */
export function renderRareList(opts: {
  overlay: OverlayHandle;
  list: HTMLElement;
  results: RareResult[];
  filterOpts: RareFilterOpts;
  /** Diff filter (v0.10): keep only results flagged isNew by flagNew(). */
  onlyNew?: boolean;
  log?(msg: string): void;
}): RareRenderHandle | null {
  const { overlay, list, results, filterOpts, log } = opts;
  const t0 = performance.now();
  const pool = opts.onlyNew ? results.filter((r) => r.isNew) : results;
  const filtered = applyRareFilter(pool, filterOpts);
  log?.(
    `renderRareList sort=${filterOpts.sort ?? 'roi'} maxPrice=${filterOpts.maxPrice ?? '∅'} ` +
      `results=${results.length} → filtered=${filtered.length} ` +
      `filter+sort=${(performance.now() - t0).toFixed(1)}ms ` +
      `path=${filtered.length > VIRT_THRESHOLD ? 'virtual' : 'chunked'}`,
  );

  const header = renderResultsHeader(
    t('results.header.detected'),
    t('results.worth'),
    filtered.length ? exportButtonHtml(t('export.csv')) : '',
  );
  if (!filtered.length) {
    list.innerHTML = header + emptyHtml();
    return null;
  }

  // Large sets: true windowing — only the viewport (± buffer) is ever in the
  // DOM. Filter change resets scroll to the top. Small sets: the cheaper
  // chunked render, whose full DOM cost is negligible at this size.
  if (filtered.length > VIRT_THRESHOLD) {
    overlay.body.scrollTop = 0;
    const vh = renderVirtualList({
      scrollRoot: overlay.body,
      container: list,
      items: filtered,
      render: renderRareCard,
      prefixHtml: header,
    });
    return { destroy: vh.destroy };
  }

  const handle = renderChunked({
    container: list,
    items: filtered,
    render: renderRareCard,
    prefixHtml: header,
  });
  return { destroy: handle.abort };
}

export function createRareController(opts: RareControllerOpts): RareController {
  const { site, getOverlay, log } = opts;
  const isActive = opts.isActive ?? ((): boolean => true);

  const state: RareScanState = {
    running: false,
    aborted: { aborted: false },
    submode: 'sticker',
    patternResults: [],
    renderHandle: null,
    debounce: null,
  };

  function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
    getOverlay()?.setStatus(text, kind);
  }

  function setModeTagFor(sub: RareSubmode): void {
    if (!isActive()) return;
    const overlay = getOverlay();
    overlay?.setModeTag(
      sub === 'pattern' ? t('pattern.title') : t('popup.modes.rare.title'),
      sub === 'pattern' ? 'pattern' : 'rare',
    );
    // The sticker filter grid is dead weight in Pattern submode (the pattern
    // view brings its own controls) — hide it instead of ignoring it.
    overlay?.body
      .querySelector('.sh-filter-grid')
      ?.classList.toggle('sh-hidden', sub === 'pattern');
  }

  async function refreshModeTag(): Promise<void> {
    if (!isActive()) return;
    setModeTagFor(await getRareSubmode());
  }

  function destroyRender(): void {
    state.renderHandle?.destroy();
    state.renderHandle = null;
  }

  function renderResultsUnsafe(): void {
    const overlay = getOverlay();
    if (!overlay) return;
    const list = overlay.body.querySelector<HTMLElement>('[data-role=results]');
    if (!list) return;
    // Tear down whatever the previous render mounted (pattern view listeners /
    // in-flight chunked render / live virtual list) before writing again.
    destroyRender();
    if (state.submode === 'pattern') {
      const view = mountPatternView(list, state.patternResults);
      state.renderHandle = { destroy: view.destroy };
      return;
    }
    opts.renderStickerResults(list);
  }

  function renderResults(): void {
    try {
      renderResultsUnsafe();
    } catch (e) {
      // A throw here used to silently abort the re-render with no visible
      // change — looking exactly like "changing the Sort select does nothing".
      console.error('[Skinsight] renderResults failed:', e);
      setStatus(t('scan.renderError', { msg: (e as Error).message }), 'err');
    }
  }

  async function runPatternQuery(): Promise<void> {
    const overlay = getOverlay();
    if (!overlay) return;
    // Opportunistic TTL-gated refresh of the remote pattern bank (no-op < 24h).
    void send({ type: 'rares:refresh', force: false });
    updateScanBar(overlay.body, { actionLabel: t('scan.stop'), info: '', progressPct: 0 });
    log?.('pattern query: begin');
    const rep = await queryPatternResults(site, {
      signal: state.aborted,
      onProgress: (i, n, name, p) => {
        const o = getOverlay();
        if (!o) return;
        updateScanBar(o.body, {
          info: t('pattern.querying', { i, n, name, p }),
          progressPct: Math.round((i / n) * 95),
        });
      },
    });
    // A user Stop keeps the partial hit set — 40 of 50 queried skins are still
    // 40 queried skins. patternStatus() words the outcome (partial/failures).
    state.patternResults = rep.results.map((r) => ({
      ...r,
      siteLink: siteSearchUrl(site, r.marketHashName),
    }));
    // Diff badge (v0.10): mark hits unseen by previous pattern queries on this
    // site. First query is a silent baseline — see scan-memory.flagNew.
    await flagNew(`${site}:pattern`, state.patternResults, resultKey);
    log?.(
      `pattern query: done — ${rep.results.length} hits, failed=${rep.failedSkins}, ` +
        `noHash=${rep.noHashcodeSkins}, throttled=${rep.throttled}, aborted=${rep.aborted}`,
    );
    const o = getOverlay();
    if (!o) return;
    renderResults();
    const st = patternStatus(rep);
    updateScanBar(o.body, { info: st.text, ...(rep.aborted ? {} : { progressPct: 100 }) });
    setStatus(st.text, st.kind);
  }

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
    }, RARE_FILTER_DEBOUNCE_MS);
  }

  function registerFilterListeners(): void {
    const onFilterEvent = (instant: boolean) => (e: Event) => {
      const target = e.target as HTMLElement | null;
      const overlay = getOverlay();
      if (!target || !overlay || !isActive()) return;
      if (!overlay.root.contains(target) || !target.matches?.('[data-filter]')) return;
      // Don't re-render before there's anything to render.
      if (!opts.hasResults()) return;
      scheduleFilterApply(instant);
    };
    // `<select>` → instant; text/number inputs → debounced.
    document.addEventListener('change', onFilterEvent(true), true);
    document.addEventListener('input', onFilterEvent(false), true);
  }

  function beginScan(): boolean {
    if (!getOverlay() || state.running) return false;
    state.running = true;
    state.aborted = { aborted: false };
    return true;
  }

  function finish(): void {
    state.running = false;
    const overlay = getOverlay();
    if (overlay) updateScanBar(overlay.body, { actionLabel: t('scan.scan') });
  }

  function abort(): void {
    state.aborted.aborted = true;
    destroyRender();
    if (state.debounce !== null) {
      clearTimeout(state.debounce);
      state.debounce = null;
    }
  }

  return {
    state,
    setModeTagFor,
    refreshModeTag,
    renderResults,
    runPatternQuery,
    scheduleFilterApply,
    registerFilterListeners,
    beginScan,
    finish,
    abort,
  };
}
