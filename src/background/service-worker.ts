/**
 * Background service worker. Two jobs:
 *   1) Route the arbitrage payload from SkinsMonkey → CSFloat. Persists to
 *      chrome.storage.local (replaces the clipboard hand-off from the legacy
 *      builder.js → builder-csf.js flow) and opens/focuses a CSFloat tab.
 *   2) Record "today's hits" for the popup.
 */
import { onMessage, type Message, type MessageResponse } from '../modules/shared/messaging';
import { setPendingArbitrage, addHit } from '../modules/shared/storage';

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

onMessage(async (msg: Message): Promise<MessageResponse> => {
  switch (msg.type) {
    case 'arbitrage:export': {
      await setPendingArbitrage(msg.payload);
      await findOrOpenCsfloatTab();
      return { ok: true };
    }
    case 'arbitrage:open-csfloat': {
      await findOrOpenCsfloatTab();
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

// First-install: open a small "you're set" tab? Skipping — install is silent.
chrome.runtime.onInstalled.addListener(() => {
  // Reserved for future onboarding.
});
