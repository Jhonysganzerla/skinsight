/** Typed message bus on top of chrome.runtime.sendMessage. */

import type { AnalysisRow, ExportPayload } from '../arbitrage/types';

/**
 * Message taxonomy (v0.2 — Arbitrage):
 *
 *   SM tab        → SW:  arbitrage:start     (payload of scanned items)
 *   CSFloat tab   → SW:  arbitrage:ready     (analyzer mounted, ask for payload)
 *   SW            → CSF: arbitrage:payload   (sent via chrome.tabs.sendMessage)
 *   CSFloat tab   → SW:  arbitrage:result    (final scored rows; SW writes hits)
 *
 *   any tab       → SW:  hit:record          (popup feed, when not driven by result)
 */
export type Message =
  | { type: 'arbitrage:start'; payload: ExportPayload }
  | { type: 'arbitrage:ready' }
  | { type: 'arbitrage:payload'; payload: ExportPayload }
  | { type: 'arbitrage:result'; rows: HitRow[] }
  | { type: 'hit:record'; site: string; name: string; sub: string; profitUsd: number }
  // CSFloat rate-limit gate (v0.4):
  // Content script awaits a slot before each fetch; reports 429s back.
  | { type: 'csf:request-slot' }
  | { type: 'csf:got-429' }
  // Remote rare-list refresh (v0.4.1):
  //   any tab/popup → SW: rares:refresh  (force=true from the popup button;
  //                                        false from scan-start = TTL-gated)
  //   popup         → SW: rares:status   (read cached count + fetchedAt)
  | { type: 'rares:refresh'; force?: boolean }
  | { type: 'rares:status' }
  // Steam Market per-item oracle (v0.5):
  //   any tab → SW: steam:price  (on-demand price for one market_hash_name)
  //   any tab → SW: steam:quota  (token-bucket usage for the UI indicator)
  | { type: 'steam:price'; marketHashName: string }
  | { type: 'steam:quota' }
  // Skinport bulk price oracle (v0.6):
  //   any tab → SW: skinport:refresh  (scan-start; TTL-gated, fetches only if
  //                                     the 5-min cache has expired)
  | { type: 'skinport:refresh'; force?: boolean };

/** Subset of AnalysisRow we hand back to the SW for the "Today's hits" feed. */
export interface HitRow {
  name: string;
  sub: string;
  profitUsd: number;
}

export interface MessageResponse {
  ok: boolean;
  error?: string;
  /** Optional payload returned by handler (e.g. arbitrage:ready → the queued items). */
  data?: unknown;
}

export async function send<T extends Message>(msg: T): Promise<MessageResponse> {
  try {
    const r = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;
    return r ?? { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/** Send a message directly to a specific tab. SW-only. */
export async function sendToTab(tabId: number, msg: Message): Promise<MessageResponse> {
  try {
    const r = (await chrome.tabs.sendMessage(tabId, msg)) as MessageResponse | undefined;
    return r ?? { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

export function onMessage(
  handler: (
    msg: Message,
    sender: chrome.runtime.MessageSender,
  ) => Promise<MessageResponse> | MessageResponse,
): void {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    Promise.resolve(handler(msg as Message, sender))
      .then(sendResponse)
      .catch((e) => {
        sendResponse({ ok: false, error: String((e as Error)?.message ?? e) });
      });
    return true; // async
  });
}

/** Helper to derive a hit row from an analyzer result (for arbitrage:result). */
export function hitRowFromAnalysisRow(r: AnalysisRow): HitRow {
  return {
    name: r.item.marketName,
    sub:
      'SM ' +
      formatUsdInline(r.item.smPrice / 100) +
      ' → CSF ' +
      formatUsdInline((r.result.csfPrice ?? 0) / 100),
    profitUsd: r.result.grossProfit / 100,
  };
}

function formatUsdInline(usd: number): string {
  return '$' + usd.toFixed(2);
}
