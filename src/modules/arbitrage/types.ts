/** Cross-module shape for the arbitrage flow. */

export interface StickerInfo {
  name: string;
  /** Steam market price in USD cents — null when unknown. */
  steamPrice: number | null;
}

export interface CharmInfo {
  name: string;
  steamPrice: number | null;
}

export interface ArbitrageItem {
  assetId: string;
  marketName: string;
  source: 'skinsmonkey';
  source_url: string;
  source_item_url: string;
  /** Listing price on the source site, in USD cents. */
  smPrice: number;
  paintSeed: number | null;
  paintWear: number | null;
  paintIndex: number | null;
  defIndex: number | null;
  exterior: string;
  statTrak: boolean;
  souvenir?: boolean;
  tradeLock: boolean;
  tradeLockUntil: string | null;
  imageUrl: string;
  inspectUrl: string;
  stickers: StickerInfo[];
  charm: CharmInfo | null;
}

export interface ExportPayload {
  exported_at: string;
  items: ArbitrageItem[];
}

export interface ScoreResult {
  score: number;
  grossProfit: number;
  profitPct: number;
  stickerTotal: number;
  charmTotal: number;
  totalValue: number;
  csfPrice: number;
  estimated: boolean;
  flagStickers: boolean;
  flagCharm: boolean;
}

/** Result row used by the CSFloat analyzer UI. */
export interface AnalysisRow {
  item: ArbitrageItem;
  result: ScoreResult;
}
