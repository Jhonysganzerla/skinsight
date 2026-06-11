/**
 * Network helpers (v0.8 hardening).
 *
 * `fetchWithTimeout` wraps `fetch` with an AbortController so a hung connection
 * can't stall a flow forever (e.g. a Steam request holding a rate-limit slot, or
 * the popup's "refresh rares" button stuck on "Atualizando…"). It rejects with
 * an AbortError on timeout — callers already wrap in try/catch and treat any
 * rejection as a failure. The timer is always cleared.
 *
 * Scope: every fetch that doesn't carry its own AbortSignal — the Steam
 * oracle, the remote rare list, and (since v0.9.x) the paged Rare collectors
 * in finder/csmoney, whose `{aborted}` flag is only checked between pages and
 * so couldn't unstick a hung request. The arbitrage scanner passes a real
 * AbortSignal per request and is left untouched.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 12_000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
