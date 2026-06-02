/**
 * Per-site mutex (v0.4) + migration from v0.2/v0.3 settings shapes.
 *
 * The Settings type changed three times:
 *   v0.2: { modes: { arbitrage_sm, arbitrage_csf, rare_smps, rare_csm } }
 *   v0.3: { activeMode: 'arbitrage' | 'rare' | null }
 *   v0.4: { skinsmonkeyMode: 'arbitrage' | 'rare' }
 *
 * normalizeSettings() is exercised here via a tiny in-memory stub of
 * chrome.storage.local so we don't need a real Chrome runtime.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SETTINGS,
  getSettings,
  patchSettings,
  type Settings,
} from '../../src/modules/shared/storage';

// Minimal in-memory chrome.storage.local stub.
type StorageBag = Record<string, unknown>;
let bag: StorageBag = {};

const stubChrome = {
  storage: {
    local: {
      async get(key: string): Promise<StorageBag> {
        return key in bag ? { [key]: bag[key] } : {};
      },
      async set(items: StorageBag): Promise<void> {
        Object.assign(bag, items);
      },
      async remove(key: string): Promise<void> {
        delete bag[key];
      },
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};

beforeEach(() => {
  bag = {};
  (globalThis as unknown as { chrome: typeof stubChrome }).chrome = stubChrome;
});

describe('settings — v0.4 per-site mutex', () => {
  it('default is Rare (v0.4 repositioning)', async () => {
    const s = await getSettings();
    expect(s.skinsmonkeyMode).toBe('rare');
    expect(DEFAULT_SETTINGS.skinsmonkeyMode).toBe('rare');
  });

  it('patchSettings flips skinsmonkeyMode without touching overlay', async () => {
    await patchSettings({ overlay: { 'foo.com': { minimized: true } } });
    await patchSettings({ skinsmonkeyMode: 'arbitrage' });
    const s = await getSettings();
    expect(s.skinsmonkeyMode).toBe('arbitrage');
    expect(s.overlay['foo.com']?.minimized).toBe(true);
  });

  it('reads v0.3 activeMode as the migration source', async () => {
    bag['settings'] = { activeMode: 'arbitrage', overlay: {} };
    const s = await getSettings();
    expect(s.skinsmonkeyMode).toBe('arbitrage');
  });

  it('reads v0.3 activeMode=null and falls to default', async () => {
    bag['settings'] = { activeMode: null, overlay: {} };
    const s = await getSettings();
    expect(s.skinsmonkeyMode).toBe('rare'); // default
  });

  it('reads v0.2 modes shape as the deeper migration source', async () => {
    bag['settings'] = {
      modes: { arbitrage_sm: true, arbitrage_csf: true, rare_smps: false, rare_csm: false },
    };
    const s = await getSettings();
    expect(s.skinsmonkeyMode).toBe('arbitrage');
  });

  it('preserves a valid v0.4 skinsmonkeyMode untouched', async () => {
    bag['settings'] = {
      skinsmonkeyMode: 'arbitrage',
      locale: 'auto',
      overlay: {},
    } satisfies Settings;
    const s = await getSettings();
    expect(s.skinsmonkeyMode).toBe('arbitrage');
  });
});

describe('settings — v0.7 locale preference', () => {
  it('defaults to auto when absent', async () => {
    const s = await getSettings();
    expect(s.locale).toBe('auto');
    expect(DEFAULT_SETTINGS.locale).toBe('auto');
  });

  it('preserves a valid locale (en / pt-BR / auto)', async () => {
    for (const locale of ['en', 'pt-BR', 'auto'] as const) {
      bag['settings'] = { skinsmonkeyMode: 'rare', locale, overlay: {} } satisfies Settings;
      const s = await getSettings();
      expect(s.locale).toBe(locale);
    }
  });

  it('falls back to auto for an unknown locale value', async () => {
    bag['settings'] = { skinsmonkeyMode: 'rare', locale: 'fr', overlay: {} };
    const s = await getSettings();
    expect(s.locale).toBe('auto');
  });

  it('patchSettings flips locale without touching skinsmonkeyMode', async () => {
    await patchSettings({ skinsmonkeyMode: 'arbitrage' });
    await patchSettings({ locale: 'pt-BR' });
    const s = await getSettings();
    expect(s.locale).toBe('pt-BR');
    expect(s.skinsmonkeyMode).toBe('arbitrage');
  });
});
