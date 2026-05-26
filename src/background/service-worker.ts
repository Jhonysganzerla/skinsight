/**
 * Background service worker — message router for the Arbitrage flow.
 *
 * Data flow (v0.2):
 *   1. SkinsMonkey content script finishes scanning → sends `arbitrage:start`
 *      with the full payload (replaces the legacy clipboard hand-off).
 *   2. SW persists the payload in `chrome.storage.local` (TTL 30 min via
 *      `exported_at`) and opens / focuses a CSFloat tab.
 *   3. CSFloat content script mounts → sends `arbitrage:ready`.
 *   4. SW reads pending payload and forwards it to that tab via
 *      `chrome.tabs.sendMessage({ type: 'arbitrage:payload', payload })`.
 *   5. CSFloat content script runs analyzer → sends `arbitrage:result` with
 *      the scored rows. SW writes each row into the "Today's hits" feed.
 */
import { onMessage, sendToTab, type Message, type MessageResponse } from '../modules/shared/messaging';
import {
  setPendingArbitrage,
  getPendingArbitrage,
  clearPendingArbitrage,
  addHit,
} from '../modules/shared/storage';

const CSFLOAT_URL = 'https://csfloat.com/';

async function findOrOpenCsfloatTab(): Promise<chrome.tabs.Tab | null> {
  const matches = await chrome.tabs.query({
    url: ['https://csfloat.com/*', 'https://*.csfloat.com/*'],
  });
  if (matches.length > 0) {
    const tab = matches[0]!;
    if (tab.id) {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    }
    return tab;
  }
  return chrome.tabs.create({ url: CSFLOAT_URL });
}

onMessage(async (msg: Message, sender): Promise<MessageResponse> => {
  switch (msg.type) {
    case 'arbitrage:start': {
      // Persist the payload first; the CSFloat tab may navigate before our
      // sendMessage attempt lands. The CSF content script also re-checks
      // pending payload on mount.
      await setPendingArbitrage(msg.payload);
      await findOrOpenCsfloatTab();
      return { ok: true };
    }

    case 'arbitrage:ready': {
      const pending = await getPendingArbitrage();
      if (!pending) return { ok: false, error: 'no pending payload' };
      // Stale check — 30 min.
      const ageMs = Date.now() - pending.storedAt;
      if (ageMs > 30 * 60 * 1000) {
        await clearPendingArbitrage();
        return { ok: false, error: 'pending payload expired' };
      }
      if (sender.tab?.id) {
        await sendToTab(sender.tab.id, { type: 'arbitrage:payload', payload: pending.payload });
      }
      return { ok: true };
    }

    case 'arbitrage:result': {
      const now = Date.now();
      // Only persist genuinely profitable rows (skip neutral / negative).
      const positive = msg.rows.filter((r) => r.profitUsd > 0);
      for (const row of positive) {
        await addHit({
          ts: now,
          site: 'csfloat',
          name: row.name,
          sub: row.sub,
          profitUsd: row.profitUsd,
        });
      }
      return { ok: true };
    }

    case 'hit:record': {
      await addHit({
        ts: Date.now(),
        site: msg.site,
        name: msg.name,
        sub: msg.sub,
        profitUsd: msg.profitUsd,
      });
      return { ok: true };
    }

    default:
      return { ok: false, error: 'unknown message type' };
  }
});

chrome.runtime.onInstalled.addListener(() => {
  // Reserved for future onboarding.
});
