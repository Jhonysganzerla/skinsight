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
 * Storage GC on startup/install: hits + steam_price cache.
 */
import {
  onMessage,
  sendToTab,
  type Message,
  type MessageResponse,
} from '../modules/shared/messaging';
import {
  setPendingArbitrage,
  getPendingArbitrage,
  clearPendingArbitrage,
  addHit,
  runHitsGc,
} from '../modules/shared/storage';
import { csfloatBucket } from '../modules/shared/throttle';
import {
  getRareRemoteCache,
  refreshPatternsRemote,
  refreshRareRemote,
} from '../modules/rare/remote';
import { getSteamPrice, steamQuota, runSteamPriceGc } from '../modules/oracles/steam';
import { runScanMemoryGc } from '../modules/shared/scan-memory';

const CSFLOAT_URL = 'https://csfloat.com/';

/**
 * Shared CSFloat throttle. Lives at module scope so every CSFloat tab
 * shares the same budget — opening 3 tabs doesn't multiply the rate.
 * Empirically CSFloat tolerates ~90 requests before 429ing; 45 req/min
 * (12% headroom under the steady-state ceiling) keeps the analyzer
 * stable across long scans.
 */
const csfBucket = csfloatBucket();
const CSF_429_PAUSE_MS = 30_000;

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

    case 'csf:request-slot': {
      // Block until a token is available. The await yields to other handlers.
      await csfBucket.acquire();
      return { ok: true };
    }

    case 'csf:got-429': {
      csfBucket.pause(CSF_429_PAUSE_MS);
      return { ok: true };
    }

    case 'rares:refresh': {
      // force=true (popup button) bypasses the TTL; false (scan-start) only
      // hits the network if the cache is older than REMOTE_RARE_TTL_MS.
      // The pattern bank refreshes on the same triggers (fire-and-forget —
      // its result never gates the sticker-list response).
      void refreshPatternsRemote(msg.force ?? true);
      const r = await refreshRareRemote(msg.force ?? true);
      return r.error !== undefined ? { ok: r.ok, error: r.error, data: r } : { ok: r.ok, data: r };
    }

    case 'rares:status': {
      const c = await getRareRemoteCache();
      return {
        ok: true,
        data: c ? { count: c.data.length, fetchedAt: c.fetchedAt } : null,
      };
    }

    case 'steam:price': {
      // On-demand Steam Market price for one item. Fetch runs here (CORS needs
      // a background origin), gated by the 15/min bucket inside getSteamPrice.
      const p = await getSteamPrice(msg.marketHashName);
      return { ok: p !== null, data: p };
    }

    case 'steam:quota': {
      return { ok: true, data: steamQuota() };
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

/** Drop expired "Today's hits" on both onStartup (cold boot, browser open)
 *  and onInstalled (extension install / update). Either fires before the
 *  popup can request the feed, so users never see stale entries. */
chrome.runtime.onStartup.addListener(() => {
  void runHitsGc();
  void runSteamPriceGc();
  void runScanMemoryGc();
  void refreshRareRemote(false);
  void refreshPatternsRemote(false);
});
chrome.runtime.onInstalled.addListener((details) => {
  void runHitsGc();
  void runSteamPriceGc();
  void runScanMemoryGc();
  // Pull the live rare list once on install/update (force, since a fresh
  // install has no cache and an update may ship behind the published list).
  void refreshRareRemote(true);
  void refreshPatternsRemote(true);
  // First-install onboarding (v0.7 T5): open the welcome tab exactly once.
  // Scoped to reason === 'install' so it never fires on update/chrome_update —
  // i.e. not a recurring flow, so opening a tab outside a user gesture is fine.
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') });
  }
});
