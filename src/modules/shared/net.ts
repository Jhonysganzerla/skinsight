/**
 * Network helpers (v0.8 hardening).
 *
 * `fetchWithTimeout` wraps `fetch` with an AbortController so a hung connection
 * can't stall a flow forever (e.g. a Steam request holding a rate-limit slot, or
 * the popup's "refresh rares" button stuck on "Atualizando…"). It rejects with
 * an AbortError on timeout — callers already wrap in try/catch and treat any
 * rejection as a failure. The timer is always cleared.
 *
 * Scope: single-shot fetches that don't carry their own signal (Steam oracle,
 * remote rare list). The long paged scans (scanner/finder/analyzer/csmoney)
 * pass their own abort signal and own their retry semantics — left untouched.
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
