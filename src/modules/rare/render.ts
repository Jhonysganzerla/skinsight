/**
 * Adapter between the rare-finder data layer and the shared UI primitives.
 *
 * Takes a `RareResult` (or CS.Money item) and produces the HTML for an
 * ItemCard with the sticker breakdown attached.  matte / foil / holo
 * classification is heuristic — derived from the sticker name. The legacy
 * `app.template.js` did not draw foil/holo specially; this is the v0.3 UX
 * lift dictated by the mockup §3.
 */
import {
  renderItemCard,
  renderStickerBreakdown,
  renderSteamCell,
  variantByRoi,
  type ItemCardProps,
  type MetaChip,
  type StickerChipProps,
  type StickerKind,
} from '../shared/ui';
import { fmtUsd, shortExterior, stripStickerPrefix, wearCode } from '../shared/fmt';
import { t } from '../shared/i18n';
import { getSteamPriceCached } from '../oracles/steam';
import type { CsMoneyItem, RareResult } from './types';

/**
 * Heuristic sticker-tier detection from the market_hash_name. CS2 stickers
 * canonically come in four tiers — Paper / Holo / Foil / Gold — plus a
 * couple of special variants (Lenticular ≈ Holo, Champion ≈ Gold).
 *
 *   (Holo)        → holo
 *   (Lenticular)  → holo
 *   (Foil)        → foil   (silver visual; v0.4 corrected from gold)
 *   (Gold)        → gold
 *   (Champion)    → gold   (Austin 2025 champion stickers are gold-tier)
 *   anything else → paper  (alias for matte)
 */
export function classifyStickerKind(name: string): StickerKind {
  const n = name || '';
  if (/\(\s*Holo(\s*-\s*Foil)?\s*\)/i.test(n)) return 'holo';
  if (/\(\s*Lenticular\s*\)/i.test(n)) return 'holo';
  if (/\(\s*Foil\s*\)/i.test(n)) return 'foil';
  if (/\(\s*Gold\s*\)/i.test(n)) return 'gold';
  if (/\(\s*Champion\s*\)/i.test(n)) return 'gold';
  return 'paper';
}

/** Render a SkinsMonkey / PirateSwap rare result. */
export function renderRareCard(r: RareResult): string {
  const meta: MetaChip[] = [
    { label: 'Listed ' + fmtUsd(r.price) },
    {
      label: `${r.matches.length} rare ${r.matches.length === 1 ? 'sticker' : 'stickers'}`,
      kind: 'warn',
    },
    { label: 'Stickers ' + fmtUsd(r.stickerSum) },
  ];
  // "Possível lucro" bonus (v0.7): estimated CS.Money sticker overpay. Always an
  // estimate on SM/PS — labelled "(est.)". Net economics (fees) deferred.
  if (r.csMoneyOverpayEst > 0) {
    meta.push({
      label: `${t('rare.csmoneyBonusEst')} +${fmtUsd(r.csMoneyOverpayEst)}`,
      kind: 'success',
    });
  }

  const chips: StickerChipProps[] = r.matches.map((m) => ({
    name: stripStickerPrefix(m.name),
    priceUsd: m.refMinPrice,
    kind: classifyStickerKind(m.name),
    imageUrl: m.image,
  }));

  const props: ItemCardProps = {
    id: r.id,
    imageUrl: r.image,
    thumbEmoji: '⌖',
    name: shortExterior(r.name || '—'),
    wear: wearCode(r.exterior || r.name),
    meta,
    profitUsd: r.profit,
    profitFraction: r.roi - 1, // ROI of 1.5 means +50% over the listing.
    variant: variantByRoi(r.roi),
    extraHtml: renderStickerBreakdown(chips),
    steamHtml: renderSteamCell(
      r.marketHashName || r.name,
      getSteamPriceCached(r.marketHashName || r.name),
    ),
  };
  return renderItemCard(props);
}

/** Render a CS.Money rare result (different shape — net USD, no ROI). */
export function renderCsMoneyCard(it: CsMoneyItem): string {
  const meta: MetaChip[] = [
    { label: 'Listed ' + fmtUsd(it.weaponPriceUsd) },
    {
      label: `${it.stickers.length} ${it.stickers.length === 1 ? 'sticker' : 'stickers'}`,
      kind: 'warn',
    },
    { label: 'Stickers ' + fmtUsd(it.stickersTotalUsd) },
  ];
  // CS.Money reports the real sticker overpay — show it directly, no estimate.
  if (it.overpayStickers > 0) {
    meta.push({
      label: `${t('rare.csmoneyBonus')} +${fmtUsd(it.overpayStickers)}`,
      kind: 'success',
    });
  }

  const chips: StickerChipProps[] = it.stickers.map((s) => ({
    name: stripStickerPrefix(s.name),
    priceUsd: s.priceUsd,
    kind: classifyStickerKind(s.name),
    imageUrl: s.imageUrl,
  }));

  // CS.Money has no ROI metric; classify by margin relative to listing.
  const margin = it.weaponPriceUsd > 0 ? it.netUsd / it.weaponPriceUsd : 0;
  const variant = margin >= 0.5 ? 'hot' : margin >= 0 ? 'warm' : 'neutral';

  const props: ItemCardProps = {
    id: String(it.id) || it.name,
    imageUrl: it.imageUrl,
    thumbEmoji: '⌖',
    name: shortExterior(it.name || '—'),
    wear: wearCode(it.name),
    meta,
    profitUsd: it.netUsd,
    profitFraction: margin,
    variant,
    extraHtml: renderStickerBreakdown(chips),
    steamHtml: renderSteamCell(it.name, getSteamPriceCached(it.name)),
  };
  return renderItemCard(props);
}
