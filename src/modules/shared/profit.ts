/**
 * SM→CS.Money net-profit estimate (v0.8 T1).
 *
 *   valor_CSM = base CS.Money value + overpay   (overpay is real on CS.Money,
 *                                                 overpay_est on SM/PS cards)
 *   proceeds  = valor_CSM × (1 − tradeLockDiscount) × (1 − sellFee) × (1 − withdrawFee)
 *   lucro_liq = proceeds − custo_SM
 *
 * The sell fee is tiered (CS.Money Market): a lower rate at/above a USD
 * threshold. All inputs are USD; conversion happens only at display time.
 *
 * Parameters are NOT hardcoded — they come from `settings.profit` (options
 * page) and are pushed in via `setProfitParams()` at the start of each context
 * that renders cards, mirroring the i18n locale override. `estimateNetProfit`
 * reads the current params synchronously so it can be called while building HTML.
 */
import { DEFAULT_PROFIT_PARAMS, type ProfitParams } from './storage';

let _params: ProfitParams = { ...DEFAULT_PROFIT_PARAMS };

/** Set by `settings.applyStoredProfitParams()` from the stored preference. */
export function setProfitParams(p: ProfitParams): void {
  _params = { ...p };
}

export function getProfitParams(): ProfitParams {
  return _params;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Tiered CS.Money Market sell fee for a sale value (USD). */
export function sellFeeFor(valueUsd: number, p: ProfitParams = _params): number {
  return valueUsd >= p.sellFeeThreshold ? p.sellFeeOver : p.sellFeeUnder;
}

/**
 * Net profit (USD) of buying at `costUsd` and reselling on CS.Money for
 * `csMoneyValueUsd` (= base + overpay). Negative when the fees outweigh the
 * overpay — which is exactly the signal the card should surface.
 */
export function estimateNetProfit(
  costUsd: number,
  csMoneyValueUsd: number,
  p: ProfitParams = _params,
): number {
  const value = Math.max(0, csMoneyValueUsd);
  const cost = Math.max(0, costUsd);
  const afterLock = value * (1 - clamp01(p.tradeLockDiscount));
  const proceeds = afterLock * (1 - clamp01(sellFeeFor(value, p))) * (1 - clamp01(p.withdrawFee));
  return proceeds - cost;
}
