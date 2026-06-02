/**
 * Lightweight debug flag, opt-in per page via the browser console:
 *
 *   localStorage['skinsight:debug'] = '1'   // enable
 *   localStorage.removeItem('skinsight:debug') // disable
 *
 * Used to gate extra logging and one-off data dumps (e.g. the CS.Money overpay
 * calibration dump). Never gates production UI or behavior — it is purely
 * additive diagnostics, off by default, and must be turned on deliberately.
 */
export function isDebug(): boolean {
  try {
    return Boolean(globalThis.localStorage?.getItem('skinsight:debug'));
  } catch {
    return false;
  }
}

/**
 * `console.log` gated to debug mode. Centralizing the (intentional) console.log
 * here keeps the rest of the codebase no-console clean — the project's ESLint
 * config only permits warn/error/debug, but debug DUMPS want plain log so they
 * show without the DevTools "Verbose" filter. No-op unless isDebug().
 */
export function debugLog(...args: unknown[]): void {
  if (!isDebug()) return;
  // eslint-disable-next-line no-console -- intentional debug-only diagnostic output
  console.log(...args);
}
