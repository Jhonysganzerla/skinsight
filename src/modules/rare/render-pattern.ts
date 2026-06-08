/**
 * Renders a Rare Pattern hit (v0.9). No $ value — pattern overpay is fuzzy;
 * the card shows the seal/tier + paint seed + (fade) % and links out to CSFloat
 * (name + seed) for verification. Reuses the shared `sh-` card skeleton; the
 * action column carries the seal instead of a profit number.
 */
import { esc, safeUrl, fmtUsd, shortExterior, wearCode } from '../shared/fmt';
import { t } from '../shared/i18n';
import type { PatternResult } from './types';

/** Heat by tier / fade %: T1 (or ≥99%) → hot, T2 (or ≥97%) → warm, else neutral. */
function variantCls(r: PatternResult): string {
  if (r.fadePct != null) return r.fadePct >= 99 ? ' hot' : r.fadePct >= 97 ? ' warm' : '';
  if (r.tier === 1) return ' hot';
  if (r.tier === 2) return ' warm';
  return '';
}

/** Compact badge for the action column — the long label rides a left chip. */
function sealText(r: PatternResult): string {
  if (r.fadePct != null) return `${Math.round(r.fadePct * 10) / 10}%`;
  if (r.tier != null) return `T${r.tier}`;
  return r.tierLabel.split(' ')[0] || '★'; // variant short (Gold / Purple)
}

const WEAR_STYLE =
  'font-size:10px;font-weight:700;color:var(--accent);border:1px solid var(--border);' +
  'border-radius:4px;padding:0 4px;margin-right:6px;vertical-align:middle;';

export function renderPatternCard(r: PatternResult): string {
  const wear = wearCode(r.exterior || r.marketHashName);
  const thumb = r.image
    ? `<img src="${safeUrl(r.image)}" alt="" loading="lazy" onerror="this.style.display='none'" />`
    : `<span class="sh-item-thumb-fallback">⌖</span>`;
  const chips = [
    r.tierLabel,
    `${t('pattern.seed')} ${r.paintSeed}`,
    r.price > 0 ? fmtUsd(r.price) : '',
  ]
    .filter(Boolean)
    .map((c) => `<span class="sh-meta-chip">${esc(c)}</span>`)
    .join('');
  const wearBadge = wear ? `<span class="sh-wear" style="${WEAR_STYLE}">${esc(wear)}</span>` : '';
  return `
    <div class="sh-item-card${variantCls(r)}" data-item-id="${esc(r.id)}">
      <div class="sh-item-thumb">${thumb}</div>
      <div class="sh-item-info">
        <div class="sh-item-name">${wearBadge}${esc(shortExterior(r.name || '—'))}</div>
        <div class="sh-item-meta">${chips}</div>
      </div>
      <div class="sh-item-action">
        <div class="sh-pattern-seal">${esc(sealText(r))}</div>
        <a class="sh-open-link" href="${safeUrl(r.link)}" target="_blank" rel="noopener" data-role="open">${esc(t('pattern.verify'))}</a>
      </div>
    </div>
  `;
}
