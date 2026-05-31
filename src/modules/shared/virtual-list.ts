/**
 * Virtualized list renderer — windowing for large rare-scan result sets.
 *
 * v0.4.1 (Issue 1, decision #16): the chunked renderer in `ui.ts` still
 * mounts every card's DOM (it only spreads the *cost* across idle ticks).
 * With 600–6000 cards — each carrying ~2 sticker `<img>` plus conic-gradient
 * mini-chips — the live node count alone freezes the overlay on filter /
 * scroll (eager image decode + GPU layer blow-up). Real windowing fixes the
 * root cause: only the cards inside the viewport (± a buffer) ever exist in
 * the DOM.
 *
 * Layout written into `container`:
 *   {prefixHtml}                         ← static header (results header)
 *   <div class="sh-vlist">
 *     <div class="sh-vlist-pad" />       ← top spacer  (start * rowHeight)
 *     <div class="sh-vlist-window" />    ← the mounted window of cards
 *     <div class="sh-vlist-pad" />       ← bottom spacer ((total-end) * rowHeight)
 *   </div>
 *
 * The two pads reserve the off-window scroll height so the scrollbar behaves
 * as if all `total` rows were present. Cards inside the window flow normally,
 * so variable card heights render correctly within the window; `rowHeight` is
 * only an estimate used for the off-window spacers (minor scrollbar drift is
 * acceptable — see prompt T1 "altura média").
 *
 * `IntersectionObserver` watches the two pads against the scroll root: when a
 * pad edge approaches the viewport (user scrolled toward un-mounted rows) the
 * window is recomputed and re-rendered. A rAF-throttled scroll listener backs
 * it up and is the primary trigger; the observer also covers programmatic
 * scrolls and resizes the scroll handler can miss.
 */

export interface VirtualWindow {
  /** First item index to mount (inclusive). */
  start: number;
  /** One past the last item index to mount (exclusive). */
  end: number;
}

export interface ComputeWindowInput {
  /** How far the list's top has scrolled above the viewport top, in px.
   *  Negative when the list top is still below the viewport top. */
  scrolledIntoList: number;
  /** Visible height of the scroll root, in px. */
  viewportH: number;
  /** Estimated row height, in px. */
  rowHeight: number;
  /** Extra rows mounted above and below the visible range. */
  buffer: number;
  /** Total number of items in the (filtered) data set. */
  total: number;
}

/**
 * Pure windowing math — no DOM. Given the scroll geometry, returns the
 * `[start, end)` index range to mount. The mounted count is bounded by
 * `ceil(viewportH / rowHeight) + 2 * buffer + 1` regardless of `total`,
 * which is what keeps a 6000-card set cheap.
 */
export function computeWindow(input: ComputeWindowInput): VirtualWindow {
  const { scrolledIntoList, viewportH, rowHeight, buffer, total } = input;
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const firstVisible = Math.floor(scrolledIntoList / rowHeight);
  const lastVisible = Math.floor((scrolledIntoList + viewportH) / rowHeight);
  const start = clamp(firstVisible - buffer, 0, total);
  // +1 so a row straddling the bottom edge is included.
  const end = clamp(lastVisible + buffer + 1, start, total);
  return { start, end };
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

export interface VirtualListOpts<T> {
  /** Scrollable ancestor (the overlay body). */
  scrollRoot: HTMLElement;
  /** Element the list mounts into (the `[data-role=results]` div). */
  container: HTMLElement;
  /** Filtered data set. */
  items: readonly T[];
  /** Pure HTML producer per item (same contract as `renderChunked`). */
  render: (item: T, index: number) => string;
  /** Static HTML prepended before the list (e.g. results header). */
  prefixHtml?: string;
  /** Estimated row height in px (off-window spacer sizing). Default 88. */
  rowHeight?: number;
  /** Buffer rows above/below the viewport. Default 10. */
  buffer?: number;
}

export interface VirtualListHandle {
  /** Tear down listeners + observer and clear the container. */
  destroy(): void;
  /** Force a window recompute (e.g. after an external resize). */
  refresh(): void;
}

const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/** Build-independent debug gate (mirrors pirateswap.ts): a production build
 *  compiles `DEV` to false, so the window-size log below never prints for an
 *  end user. `localStorage['skinsight:debug']='1'` turns it on at runtime —
 *  the single most useful signal for a "filter freezes" report, since it
 *  shows exactly how many cards each recompute mounts. */
function debugEnabled(): boolean {
  if (DEV) return true;
  try {
    return (
      (globalThis as { localStorage?: Storage }).localStorage?.getItem('skinsight:debug') === '1'
    );
  } catch {
    return false;
  }
}

const DEFAULT_ROW_HEIGHT = 88;
const DEFAULT_BUFFER = 10;

/**
 * Measure the real per-row stride (height + gap) from a rendered window.
 *
 * v0.7 T1.c: the 88px default badly under-estimated the PirateSwap rare cards
 * (image + sticker breakdown + Steam cell ≈ 2×), so the geometry (real px ÷
 * rowHeight) over-shot the row index — every scroll nudge mounted a window much
 * further down, shifting content, firing another scroll → the list ran away to
 * the end (and overshot to the start on the way back). We self-correct from the
 * first real render instead of trusting the estimate.
 *
 * Uses the MEDIAN of consecutive `offsetTop` deltas (gap-aware and robust to a
 * single outlier tall card); falls back to the first card's `offsetHeight`.
 * Returns 0 when nothing is measurable (e.g. no layout, as in unit tests) so the
 * caller keeps its current estimate.
 */
export function measureRowHeight(win: HTMLElement): number {
  const kids = win.children;
  const n = kids.length;
  if (n === 0) return 0;
  if (n === 1) return (kids[0] as HTMLElement).offsetHeight || 0;
  const deltas: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = (kids[i] as HTMLElement).offsetTop - (kids[i - 1] as HTMLElement).offsetTop;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return (kids[0] as HTMLElement).offsetHeight || 0;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)]!;
}

export function renderVirtualList<T>(opts: VirtualListOpts<T>): VirtualListHandle {
  const { scrollRoot, container, items, render, prefixHtml = '', buffer = DEFAULT_BUFFER } = opts;
  // Mutable: T1.c re-adopts the real stride after the first render (see below).
  let rowHeight = opts.rowHeight ?? DEFAULT_ROW_HEIGHT;
  let measured = false;
  const total = items.length;
  const doc = container.ownerDocument;

  container.innerHTML = prefixHtml;
  const listEl = doc.createElement('div');
  listEl.className = 'sh-vlist';
  const padTop = doc.createElement('div');
  padTop.className = 'sh-vlist-pad';
  const win = doc.createElement('div');
  win.className = 'sh-vlist-window';
  const padBottom = doc.createElement('div');
  padBottom.className = 'sh-vlist-pad';
  listEl.appendChild(padTop);
  listEl.appendChild(win);
  listEl.appendChild(padBottom);
  container.appendChild(listEl);

  let mounted: VirtualWindow = { start: -1, end: -1 };
  let destroyed = false;
  let rafId: number | null = null;

  function geometry(): { scrolledIntoList: number; viewportH: number } {
    const rootRect = scrollRoot.getBoundingClientRect();
    const listRect = listEl.getBoundingClientRect();
    return {
      // listRect.top is the top of padTop = the list content origin and does
      // not shift when pad heights change (only listEl's height grows).
      scrolledIntoList: rootRect.top - listRect.top,
      viewportH: scrollRoot.clientHeight,
    };
  }

  function recompute(): void {
    if (destroyed) return;
    const { scrolledIntoList, viewportH } = geometry();
    const next = computeWindow({ scrolledIntoList, viewportH, rowHeight, buffer, total });
    if (next.start === mounted.start && next.end === mounted.end) return;
    mounted = next;
    padTop.style.height = next.start * rowHeight + 'px';
    padBottom.style.height = Math.max(0, total - next.end) * rowHeight + 'px';
    let buf = '';
    for (let i = next.start; i < next.end; i++) buf += render(items[i]!, i);
    win.innerHTML = buf;
    // T1.c: on the first non-empty render, replace the rowHeight estimate with
    // the measured stride and re-run once so the spacers/index match reality.
    // `measured` guards against re-entry, so this never loops.
    if (!measured && next.end > next.start) {
      measured = true;
      const real = measureRowHeight(win);
      if (real > 0 && Math.abs(real - rowHeight) > 4) {
        rowHeight = real;
        mounted = { start: -1, end: -1 }; // invalidate so the corrected window applies
        recompute();
        return;
      }
    }
    if (debugEnabled()) {
      // console.warn (visible at the default DevTools level, unlike
      // console.debug/Verbose) so the scroll smoke can read it. scrolledIntoList
      // + rowH are the key geometry inputs for the runaway diagnosis.
      console.warn(
        `[Skinsight] vlist window [${next.start}-${next.end}) of ${total} — ` +
          `${next.end - next.start} cards mounted ` +
          `(scrolledIntoList=${Math.round(scrolledIntoList)} viewportH=${viewportH} rowH=${Math.round(rowHeight)} measured=${measured})`,
      );
    }
  }

  function scheduleRecompute(): void {
    if (destroyed || rafId !== null) return;
    const raf =
      typeof (globalThis as { requestAnimationFrame?: (cb: () => void) => number })
        .requestAnimationFrame === 'function'
        ? (cb: () => void) =>
            (
              globalThis as { requestAnimationFrame: (cb: () => void) => number }
            ).requestAnimationFrame(cb)
        : (cb: () => void) => setTimeout(cb, 16) as unknown as number;
    rafId = raf(() => {
      rafId = null;
      recompute();
    });
  }

  const onScroll = (): void => scheduleRecompute();
  scrollRoot.addEventListener('scroll', onScroll, { passive: true });
  // `window` is undefined outside a browser (unit tests run in node); guard it.
  const view: Window | undefined = typeof window !== 'undefined' ? window : undefined;
  view?.addEventListener('resize', onScroll, { passive: true });

  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(() => scheduleRecompute(), {
      root: scrollRoot,
      // Wake up before the pad fully enters view so the next window is ready.
      rootMargin: `${buffer * rowHeight}px 0px`,
    });
    observer.observe(padTop);
    observer.observe(padBottom);
  }

  // Initial paint (synchronous so the user sees the first window immediately).
  recompute();

  return {
    destroy(): void {
      destroyed = true;
      scrollRoot.removeEventListener('scroll', onScroll);
      view?.removeEventListener('resize', onScroll);
      observer?.disconnect();
      observer = null;
    },
    refresh(): void {
      recompute();
    },
  };
}
