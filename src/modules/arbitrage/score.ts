/**
 * Score algorithm — MIGRATED VERBATIM from builder-csf.js scoreItem().
 *
 *   valorTotal = preçoCSFloat + (stickers × 0.50) + (charm × 0.85)
 *   lucro      = valorTotal − preçoSM
 *   margem%    = lucro / preçoSM × 100
 *   score      = lucro × 0.6 + margem% × 0.4
 *   trade lock ativo → score × 0.5   (liquidez reduzida)
 *   float < 0.01     → score × 1.3   (float muito baixo é raro)
 *   score < 0        → clampeia em 0
 *
 * **Do not refactor.** Reference: busca_pattern_cs2/README.md §"Algoritmo de Score".
 */
import type { ArbitrageItem, ScoreResult } from './types';

export function scoreItem(item: ArbitrageItem, csfPrice: number, estimated: boolean): ScoreResult {
  const stickerTotal = (item.stickers ?? []).reduce((s, x) => s + (x.steamPrice ?? 0), 0) * 0.5;
  const charmTotal = (item.charm?.steamPrice ?? 0) * 0.85;
  const totalValue = (csfPrice ?? 0) + stickerTotal + charmTotal;
  const grossProfit = totalValue - (item.smPrice ?? 0);
  const profitPct = (item.smPrice ?? 0) > 0 ? (grossProfit / (item.smPrice ?? 0)) * 100 : 0;
  let score = grossProfit * 0.6 + profitPct * 0.4;
  if (item.tradeLock) score *= 0.5;
  if ((item.paintWear ?? 1) < 0.01) score *= 1.3;
  return {
    score: Math.max(0, score),
    grossProfit,
    profitPct,
    stickerTotal,
    charmTotal,
    totalValue,
    csfPrice,
    estimated: !!estimated,
    flagStickers: stickerTotal > (item.smPrice ?? 0) && stickerTotal > 0,
    flagCharm:
      (item.charm?.steamPrice ?? 0) * 0.85 > (item.smPrice ?? 0) &&
      (item.charm?.steamPrice ?? 0) > 0,
  };
}
