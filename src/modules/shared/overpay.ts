/**
 * CS.Money sticker-overpay model (v0.7), calibrated on ~300 items + a high
 * price anchor. CS.Money pays extra for stickered skins ("overpay"); this lets
 * SkinsMonkey/PirateSwap cards estimate that bonus, since those sites don't
 * expose CS.Money's own figure.
 *
 * Item-level ground truth (CS.Money, confirmed):
 *   overpay.stickers ≈ Σ(sticker.overprice) × 0.93
 *
 * Estimate from market data (SM/PS, where overprice is unknown):
 *   overpay_est = min(RATE × Σ(sticker_market_price), CAP × skin_price)
 *
 * RATE 0.07 ≈ ~7.7% captured per sticker × 0.93 platform fee. The CAP only
 * bites on cheap skins (a big sticker stack on a $2 skin can't overpay $50).
 *
 * Validation: Medusa skin $3274 + sticker $58 → est. $4.06 vs real $4.19 (~3%).
 *
 * NOTE: this is the gross sticker bonus only. The full SM→CS.Money economics
 * (withdrawal fee, trade lock discount) is intentionally NOT modeled here yet.
 */
export const OVERPAY_STICKER_RATE = 0.07;
export const OVERPAY_SKIN_CAP = 0.25;

/**
 * Estimated CS.Money sticker overpay (USD) for an item, from the summed sticker
 * market price and the skin's own price. Clamped to non-negative inputs.
 */
export function estimateCsMoneyOverpay(stickerMarketSum: number, skinPrice: number): number {
  const stickers = Math.max(0, stickerMarketSum || 0);
  const skin = Math.max(0, skinPrice || 0);
  return Math.min(OVERPAY_STICKER_RATE * stickers, OVERPAY_SKIN_CAP * skin);
}
