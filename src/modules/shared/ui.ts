/**
 * Overlay UI primitives — HTML builders matching `mockup-ui-skinsight.html`
 * section 2 (Arbitrage) and 3 (Rare). Pure functions; the host script wires
 * event listeners after `innerHTML =`.
 *
 * Class prefix `sh-` ensures host sites can't restyle us. See `tokens.ts`.
 */
import { esc, fmtUsd, fmtPct, safeUrl } from './fmt';

/* ───────────────────────────────────────────────── FilterGrid ── */

export interface FilterField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select';
  value?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  /** Optional native tooltip rendered as `title` on the field wrapper. */
  hint?: string;
}

/** Renders a 3-column grid. Caller reads values via root.querySelector. */
export function renderFilterGrid(fields: FilterField[]): string {
  const cells = fields
    .map((f) => {
      const id = 'sh-f-' + esc(f.id);
      const titleAttr = f.hint ? ` title="${esc(f.hint)}"` : '';
      if (f.type === 'select') {
        const opts = (f.options ?? [])
          .map((o) => {
            const sel = f.value != null && o.value === f.value ? ' selected' : '';
            return `<option value="${esc(o.value)}"${sel}>${esc(o.label)}</option>`;
          })
          .join('');
        return `
          <div class="sh-field"${titleAttr}>
            <label for="${id}">${esc(f.label)}</label>
            <select id="${id}" class="sh-select" data-filter="${esc(f.id)}">${opts}</select>
          </div>`;
      }
      const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
      const val = f.value != null ? ` value="${esc(f.value)}"` : '';
      const t = f.type;
      return `
        <div class="sh-field"${titleAttr}>
          <label for="${id}">${esc(f.label)}</label>
          <input id="${id}" type="${t}" class="sh-input" data-filter="${esc(f.id)}"${val}${ph} />
        </div>`;
    })
    .join('');
  return `<div class="sh-filter-grid">${cells}</div>`;
}

/** Read current values back from a filter grid root. */
export function readFilterValues(root: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-filter]').forEach((el) => {
    const key = el.dataset.filter;
    if (key) out[key] = el.value;
  });
  return out;
}

/* ───────────────────────────────────────────────── ScanBar ──── */

export interface ScanBarOptions {
  info: string;
  /** 0..100 (omit to hide the progress bar). */
  progressPct?: number;
  /** Primary action button label, e.g. "Scan" / "Stop" / "Rescan". */
  actionLabel: string;
  /** Optional secondary label that toggles when running (kept the same here). */
  actionVariant?: 'primary' | 'warn';
}

export function renderScanBar(o: ScanBarOptions): string {
  const showBar = typeof o.progressPct === 'number';
  const pct = Math.max(0, Math.min(100, o.progressPct ?? 0));
  const variantCls = o.actionVariant === 'warn' ? 'sh-btn-warn' : '';
  return `
    <div class="sh-scan-bar">
      <div class="sh-scan-info">
        <span data-role="scan-info-text">${esc(o.info)}</span>
        ${
          showBar
            ? `<div class="sh-progress"><div class="sh-progress-fill" data-role="scan-fill" style="width:${pct}%"></div></div>`
            : ''
        }
      </div>
      <button class="sh-btn sh-btn-sm ${variantCls}" data-role="scan-action" type="button">${esc(o.actionLabel)}</button>
    </div>
  `;
}

/** Update an already-rendered scan bar without re-creating DOM. */
export function updateScanBar(
  root: HTMLElement,
  patch: { info?: string; progressPct?: number; actionLabel?: string },
): void {
  if (patch.info != null) {
    const el = root.querySelector<HTMLElement>('[data-role=scan-info-text]');
    if (el) el.textContent = patch.info;
  }
  if (patch.progressPct != null) {
    const fill = root.querySelector<HTMLElement>('[data-role=scan-fill]');
    if (fill) fill.style.width = Math.max(0, Math.min(100, patch.progressPct)) + '%';
  }
  if (patch.actionLabel != null) {
    const btn = root.querySelector<HTMLElement>('[data-role=scan-action]');
    if (btn) btn.textContent = patch.actionLabel;
  }
}

/* ───────────────────────────────────────────────── ItemCard ─── */

export type ItemCardVariant = 'hot' | 'warm' | 'neutral';

export interface MetaChip {
  label: string;
  kind?: 'info' | 'warn' | 'success' | 'danger';
}

export interface ItemCardProps {
  /** Stable id for event wiring. */
  id: string;
  /** Thumbnail URL; falls back to emoji-only when missing. */
  imageUrl?: string | null;
  /** Fallback emoji when imageUrl is missing. */
  thumbEmoji?: string;
  name: string;
  /** Inline meta chips ("SM $42.10", "CSF $58.00", "2 stickers", …). */
  meta: MetaChip[];
  /** Headline profit, in USD. */
  profitUsd: number;
  /** Percentage as a fraction (0.31 = 31%). */
  profitFraction: number;
  variant: ItemCardVariant;
  /** Optional link rendered as "Open … ↗". */
  openUrl?: string;
  openLabel?: string;
  /** Optional extra block rendered inside the card (e.g. sticker breakdown). */
  extraHtml?: string;
  /** Optional Steam-price cell (see `renderSteamCell`), shown in the action column. */
  steamHtml?: string;
}

/* ───────────────────────────────────────────── Steam price cell ── */

/** Minimal view of a Steam price (structurally matches oracles' SteamPrice). */
export interface SteamPriceView {
  lowestCents: number | null;
  medianCents: number | null;
  volume: number | null;
}

/**
 * Per-card Steam Market price cell (v0.5 T3). Pure HTML — the host script wires
 * the click via `[data-role=steam-price]` and replaces the wrapper on response.
 *
 * `lowest_price` is the PRIMARY number (per approval); median + volume go in the
 * native tooltip. Price is labelled **USD** explicitly, never BRL. The cell
 * always re-derives from the (cached) price, so it survives virtual-list
 * re-mounts — the loaded value lives in the oracle mirror, never in the DOM.
 */
export function renderSteamCell(marketHashName: string, p: SteamPriceView | null): string {
  const wrap = (inner: string): string =>
    `<div class="sh-steam-cell" data-role="steam-cell" data-mhn="${esc(marketHashName)}">${inner}</div>`;
  if (!p) {
    return wrap(
      `<button class="sh-btn sh-btn-sm" data-role="steam-price" type="button">Steam price</button>`,
    );
  }
  const primaryCents = p.lowestCents ?? p.medianCents;
  if (primaryCents == null) {
    return wrap(`<span class="sh-meta-chip sh-pill-mini sh-pill-warn">Steam — no data</span>`);
  }
  const bits: string[] = [];
  if (p.medianCents != null) bits.push('med ' + fmtUsd(p.medianCents / 100));
  if (p.volume != null) bits.push('vol ' + p.volume);
  const title = bits.length ? ` title="${esc(bits.join(' · '))}"` : '';
  return wrap(
    `<span class="sh-meta-chip sh-pill-mini sh-pill-success"${title}>Steam ${esc(fmtUsd(primaryCents / 100))} USD</span>`,
  );
}

/** The transient "loading" inner markup, swapped in on click before the fetch. */
export function steamCellLoadingHtml(): string {
  return `<span class="sh-meta-chip">Steam …</span>`;
}

export function renderItemCard(p: ItemCardProps): string {
  const variantCls = p.variant === 'hot' ? ' hot' : p.variant === 'warm' ? ' warm' : '';
  const profitCls = p.variant === 'hot' ? '' : p.variant === 'warm' ? ' warm' : ' neutral';
  const profitSign = p.profitUsd >= 0 ? '+' : '−';
  const profitAbs = Math.abs(p.profitUsd);
  const profitText = profitSign + fmtUsd(profitAbs);
  const pctText = (p.profitFraction >= 0 ? '+' : '−') + fmtPct(Math.abs(p.profitFraction));
  const chips = p.meta
    .map((m) => {
      const k = m.kind ? ' sh-pill-mini sh-pill-' + m.kind : '';
      return `<span class="sh-meta-chip${k}">${esc(m.label)}</span>`;
    })
    .join('');
  const link = p.openUrl
    ? `<a class="sh-open-link" href="${safeUrl(p.openUrl)}" target="_blank" rel="noopener" data-role="open">${esc(p.openLabel ?? 'Open ↗')}</a>`
    : '';
  // When `imageUrl` is missing OR the <img> emits onerror, we hide the img
  // and the .sh-item-thumb's CSS pseudo-element (::after, set in tokens.ts)
  // renders the ⌖ placeholder against the existing gradient background.
  const fallbackEmoji = esc(p.thumbEmoji ?? '⌖');
  const thumb = p.imageUrl
    ? `<img src="${safeUrl(p.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'" />`
    : `<span class="sh-item-thumb-fallback">${fallbackEmoji}</span>`;
  return `
    <div class="sh-item-card${variantCls}" data-item-id="${esc(p.id)}">
      <div class="sh-item-thumb">${thumb}</div>
      <div class="sh-item-info">
        <div class="sh-item-name">${esc(p.name)}</div>
        <div class="sh-item-meta">${chips}</div>
      </div>
      <div class="sh-item-action">
        <div class="sh-profit-big${profitCls}">${profitText}</div>
        <div class="sh-profit-pct">${pctText}</div>
        ${link}
        ${p.steamHtml ?? ''}
      </div>
      ${p.extraHtml ?? ''}
    </div>
  `;
}

/** Classify by profit percentage (used by Arbitrage). */
export function variantByProfitPct(pct: number): ItemCardVariant {
  if (pct >= 20) return 'hot';
  if (pct >= 10) return 'warm';
  return 'neutral';
}

/** Classify by ROI fraction (used by Rare; 1.5 = stickers worth 150% of listing). */
export function variantByRoi(roi: number): ItemCardVariant {
  if (roi >= 1.5) return 'hot';
  if (roi >= 1.0) return 'warm';
  return 'neutral';
}

/* ───────────────────────────────────────────────── StickerChip ── */

/**
 * CS2 stickers come in four tiers. v0.4 maps each to a distinct CSS look:
 *   paper / matte — neutral indigo gradient (default)
 *   foil          — silver-grey gradient (was incorrectly gold in v0.3)
 *   holo          — rainbow conic-gradient
 *   gold          — gold gradient (new; covers "(Gold)" and "(Champion)")
 *
 * The CSS class names keep the legacy `foil` / `holo` selectors so existing
 * markup keeps rendering; `gold` and the explicit `paper` selectors are new.
 */
export type StickerKind = 'paper' | 'matte' | 'foil' | 'holo' | 'gold';

export interface StickerChipProps {
  name: string;
  priceUsd?: number | null;
  kind?: StickerKind;
  imageUrl?: string | null;
}

export function renderStickerChip(p: StickerChipProps): string {
  // 'paper' is an alias for 'matte' (default gradient, no extra class).
  const kindCls = p.kind && p.kind !== 'matte' && p.kind !== 'paper' ? ' ' + p.kind : '';
  // When the image URL is present, render <img> with onerror=hide so the
  // gradient classified by tier (matte/foil/holo) shows underneath on 404.
  const inner = p.imageUrl
    ? `<img src="${safeUrl(p.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'" />`
    : '';
  const price =
    p.priceUsd != null ? `<span class="sh-sticker-price">${fmtUsd(p.priceUsd)}</span>` : '';
  return `
    <div class="sh-sticker-chip">
      <div class="sh-sticker-mini${kindCls}">${inner}</div>
      <span>${esc(p.name)}</span>
      ${price}
    </div>
  `;
}

export function renderStickerBreakdown(chips: StickerChipProps[]): string {
  if (!chips.length) return '';
  return `<div class="sh-sticker-breakdown">${chips.map(renderStickerChip).join('')}</div>`;
}

/* ───────────────────────────────────────────────── Results header ── */

export function renderResultsHeader(left: string, right: string): string {
  return `
    <div class="sh-results-header">
      <span>${esc(left)}</span>
      <span>${esc(right)}</span>
    </div>
  `;
}

/* ───────────────────────────────────────────────── Chunked render ── */

interface ChunkedRenderHandle {
  /** Resolves when every chunk has been appended or the controller aborts. */
  done: Promise<void>;
  /** Aborts the render at the next chunk boundary. */
  abort(): void;
}

interface ChunkedRenderOpts<T> {
  container: HTMLElement;
  items: readonly T[];
  /** Pure HTML producer per item. */
  render: (item: T, index: number) => string;
  /** Static HTML prepended before the first chunk (e.g. results header). */
  prefixHtml?: string;
  /** Items per chunk. Default 50 — balances paint cadence with overhead. */
  chunkSize?: number;
}

/**
 * Render `items` into `container` in chunks, yielding the main thread
 * between batches via `requestIdleCallback` (or `setTimeout(0)` fallback).
 *
 * Returns a handle whose `abort()` lets a caller interrupt mid-render —
 * essential for reactive filters that re-render as the user types.
 *
 * Uses a DocumentFragment + `Range#createContextualFragment` to append
 * each chunk without re-parsing the full HTML buffer. Empty `items`
 * still writes the `prefixHtml` if provided.
 */
export function renderChunked<T>(opts: ChunkedRenderOpts<T>): ChunkedRenderHandle {
  const { container, items, render, prefixHtml = '', chunkSize = 50 } = opts;
  let aborted = false;
  let resolve: () => void;
  const done = new Promise<void>((r) => {
    resolve = r;
  });

  container.innerHTML = prefixHtml;

  let cursor = 0;
  const schedule: (cb: () => void) => void =
    typeof (globalThis as { requestIdleCallback?: (cb: () => void) => unknown })
      .requestIdleCallback === 'function'
      ? (cb) =>
          (
            globalThis as {
              requestIdleCallback: (cb: () => void) => unknown;
            }
          ).requestIdleCallback(cb)
      : (cb) => setTimeout(cb, 0);

  const range = container.ownerDocument.createRange();
  range.selectNodeContents(container);
  range.collapse(false);

  const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  const sessionId = DEV ? `rc-${Math.random().toString(36).slice(2, 8)}` : '';
  let chunkN = 0;

  function step(): void {
    if (aborted) {
      if (DEV)
        console.debug(`[Skinsight perf] ${sessionId} aborted at cursor=${cursor}/${items.length}`);
      resolve();
      return;
    }
    if (cursor >= items.length) {
      resolve();
      return;
    }
    const end = Math.min(cursor + chunkSize, items.length);
    const chunkLabel = DEV ? `${sessionId} chunk#${++chunkN} [${cursor}-${end})` : '';
    if (DEV) performance.mark(`${chunkLabel} start`);
    let buf = '';
    for (let i = cursor; i < end; i++) buf += render(items[i]!, i);
    const fragment = range.createContextualFragment(buf);
    container.appendChild(fragment);
    if (DEV) {
      performance.mark(`${chunkLabel} end`);
      try {
        const m = performance.measure(chunkLabel, `${chunkLabel} start`, `${chunkLabel} end`);
        console.debug(`[Skinsight perf] ${chunkLabel} ${m.duration.toFixed(1)} ms`);
      } catch {
        /* mark may have been cleared by user; non-fatal */
      }
    }
    cursor = end;
    if (cursor >= items.length) {
      if (DEV)
        console.debug(
          `[Skinsight perf] ${sessionId} done — ${chunkN} chunks, ${items.length} items`,
        );
      resolve();
      return;
    }
    schedule(step);
  }

  // Kick off without yielding first so the user sees the first chunk asap.
  step();
  return {
    done,
    abort() {
      aborted = true;
    },
  };
}

/* ───────────────────────────────────────────────── Banner ──────── */

export function renderBanner(html: string, ctaLabel?: string): string {
  const cta = ctaLabel
    ? `<button class="sh-btn sh-btn-sm" data-role="banner-cta" type="button">${esc(ctaLabel)}</button>`
    : '';
  return `<div class="sh-banner"><div class="sh-banner-body">${html}</div>${cta}</div>`;
}
