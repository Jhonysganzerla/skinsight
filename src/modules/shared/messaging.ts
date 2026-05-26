/** Typed message bus on top of chrome.runtime.sendMessage. */

import type { ExportPayload } from '../arbitrage/types';

export type Message =
  | { type: 'arbitrage:export'; payload: ExportPayload }
  | { type: 'arbitrage:open-csfloat' }
  | { type: 'hit:record'; site: string; name: string; sub: string; profitUsd: number };

export interface MessageResponse {
  ok: boolean;
  error?: string;
}

export async function send<T extends Message>(msg: T): Promise<MessageResponse> {
  try {
    const r = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;
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
