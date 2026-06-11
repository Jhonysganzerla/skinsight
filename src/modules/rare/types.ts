/** Normalized item shape used by the Rare Sticker finder across SM/PS. */
import type { PatternFamily } from './pattern-data';

export interface RareStickerMatch {
  name: string;
  image: string | null;
  /** Sticker's own listing price (when site provides it). */
  itemPrice: number | null;
  /** Min-market reference price for this rare sticker (USD). */
  refMinPrice: number;
}

export interface RareItem {
  id: string;
  name: string;
  image: string | null;
  /** Listing price in USD (floats — both PS and SM are USD). */
  price: number;
  exterior: string;
  inspectUrl: string;
  marketHashName: string;
  stickers: Array<{ name: string; price: number | null; image: string | null }>;
  /** Paint seed (pattern index). SM: game730.paintSeed; PS: item.pattern. null when absent. */
  paintSeed: number | null;
  /** PirateSwap-provided fade % (already computed). Absent on SM. */
  fadePercentage?: number | null;
  /** PirateSwap item category ("Knife" / "Gloves" / …) — for weapon-only filtering. */
  category?: string | null;
}

export interface RareResult extends RareItem {
  matches: RareStickerMatch[];
  stickerSum: number;
  profit: number;
  roi: number;
  /** Set by shared/scan-memory.ts `flagNew()`: absent from the seen-set when
   *  this scan completed → "NOVO" badge. Transient diff state (v0.10). */
  isNew?: boolean;
  /**
   * Estimated CS.Money sticker overpay (USD) for this item — the "possível
   * lucro" bonus from reselling on CS.Money (v0.7). Always an estimate on
   * SM/PS (labelled "(est.)" in the UI); see shared/overpay.ts. The full
   * SM→CS.Money net economics (fees, trade lock) is not folded in yet.
   */
  csMoneyOverpayEst: number;
}

/** CS.Money-specific shape — different fields. */
export interface CsMoneyItem {
  /** Diff state — see RareResult.isNew. */
  isNew?: boolean;
  id: string | number;
  name: string;
  /** Weapon thumbnail URL. Resolved via the v0.4 fallback chain
   *  (item.img → steamImg → preview → screenshot). May be null if all are
   *  missing — UI falls back to an inline SVG placeholder. */
  imageUrl: string | null;
  weaponPriceUsd: number;
  stickersTotalUsd: number;
  netUsd: number;
  /** Paint seed from CS.Money's `item.pattern`. null when absent. (v0.9 Rare Pattern) */
  paintSeed: number | null;
  /** steam:// in-game inspect link when the API carries one. (v0.9.1) */
  inspectUrl?: string | null;
  /**
   * CS.Money's own per-item sticker-overpay figure (USD), from the raw
   * `item.overpay.stickers` field. Captured for the v0.7 overpay-formula
   * calibration dump (debug only). 0 when absent. Not used by the UI yet.
   */
  overpayStickers: number;
  stickers: Array<{
    name: string;
    priceUsd: number;
    wear: number;
    /** Sticker icon URL (Steam CDN). Null when the API omitted it. */
    imageUrl: string | null;
    /**
     * CS.Money's per-sticker overpay contribution (USD), from the raw sticker
     * `overprice` field. Captured for calibration (debug only). 0 when absent.
     */
    overprice: number;
  }>;
}

/* ── Rare Pattern (v0.9) ─────────────────────────────────────────────── */

/** Minimal per-item input to the pattern finder (adapted from RareItem /
 *  CsMoneyItem by each content script). USD internal. */
export interface PatternInput {
  id: string;
  /** Display name (may include wear). */
  name: string;
  /** Canonical market hash name — used for bank lookup, def-index + the link. */
  marketHashName: string;
  image: string | null;
  /** Listing price (USD). Context only — pattern overpay is NOT priced in $. */
  price: number;
  exterior: string;
  inspectUrl: string;
  paintSeed: number | null;
  /** Site-provided fade % (PirateSwap); else computed from the seed. */
  fadePercentage?: number | null;
  /** Site-provided category (PirateSwap "Knife"); else derived from the name. */
  category?: string | null;
}

/** A confirmed rare-pattern hit. */
export interface PatternResult extends PatternInput {
  paintSeed: number;
  family: PatternFamily;
  /** Human label: tier ("Blue Gem T1 (top)"), variant ("Gold Pattern") or "98.4% fade". */
  tierLabel: string;
  /** Tier number (1..4) for seed-list hits; null for variants and fade. */
  tier: number | null;
  /** Computed/provided fade % for fade hits; null otherwise. */
  fadePct: number | null;
  /** External verification link (CSFloat search by name + seed). */
  link: string;
  /** Search link back into the marketplace the item was found on (v0.9.1). */
  siteLink?: string;
  /** Diff state — see RareResult.isNew. */
  isNew?: boolean;
}
