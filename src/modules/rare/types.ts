/** Normalized item shape used by the Rare Sticker finder across SM/PS. */

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
}

export interface RareResult extends RareItem {
  matches: RareStickerMatch[];
  stickerSum: number;
  profit: number;
  roi: number;
}

/** CS.Money-specific shape — different fields. */
export interface CsMoneyItem {
  id: string | number;
  name: string;
  weaponPriceUsd: number;
  stickersTotalUsd: number;
  netUsd: number;
  stickers: Array<{ name: string; priceUsd: number; wear: number }>;
}
