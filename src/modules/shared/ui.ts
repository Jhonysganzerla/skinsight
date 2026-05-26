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
}

/** Renders a 3-column grid. Caller reads values via root.querySelector. */
export function renderFilterGrid(fields: FilterField[]): string {
  const cells = fields
    .map((f) => {
      const id = 'sh-f-' + esc(f.id);
      if (f.type === 'select') {
        const opts = (f.options ?? [])
          .map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`)
          .join('');
        return `
          <div class="sh-field">
            <label for="${id}">${esc(f.label)}</label>
            <select id="${id}" class="sh-select" data-filter="${esc(f.id)}">${opts}</select>
          </div>`;
      }
      const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
      const val = f.value != null ? ` value="${esc(f.value)}"` : '';
      const t = f.type;
      return `
        <div class="sh-field">
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
  const thumb = p.imageUrl
    ? `<img src="${safeUrl(p.imageUrl)}" alt="" loading="lazy" />`
    : esc(p.thumbEmoji ?? '⌖');
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

export type StickerKind = 'matte' | 'foil' | 'holo';

export interface StickerChipProps {
  name: string;
  priceUsd?: number | null;
  kind?: StickerKind;
  imageUrl?: string | null;
}

export function renderStickerChip(p: StickerChipProps): string {
  const kindCls = p.kind && p.kind !== 'matte' ? ' ' + p.kind : '';
  const inner = p.imageUrl ? `<img src="${safeUrl(p.imageUrl)}" alt="" />` : '';
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

/* ───────────────────────────────────────────────── Banner ──────── */

export function renderBanner(html: string, ctaLabel?: string): string {
  const cta = ctaLabel
    ? `<button class="sh-btn sh-btn-sm" data-role="banner-cta" type="button">${esc(ctaLabel)}</button>`
    : '';
  return `<div class="sh-banner"><div class="sh-banner-body">${html}</div>${cta}</div>`;
}
