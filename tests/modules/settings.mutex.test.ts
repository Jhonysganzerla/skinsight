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
  DEFAULT_PROFIT_PARAMS,
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
      rareSubmode: 'sticker',
      profit: DEFAULT_PROFIT_PARAMS,
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
      bag['settings'] = {
        skinsmonkeyMode: 'rare',
        locale,
        rareSubmode: 'sticker',
        profit: DEFAULT_PROFIT_PARAMS,
        overlay: {},
      } satisfies Settings;
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

describe('settings — v0.9 rareSubmode', () => {
  it('defaults to sticker', async () => {
    const s = await getSettings();
    expect(s.rareSubmode).toBe('sticker');
    expect(DEFAULT_SETTINGS.rareSubmode).toBe('sticker');
  });

  it('accepts pattern; anything else falls to sticker', async () => {
    bag['settings'] = { skinsmonkeyMode: 'rare', rareSubmode: 'pattern' };
    expect((await getSettings()).rareSubmode).toBe('pattern');
    bag['settings'] = { skinsmonkeyMode: 'rare', rareSubmode: 'nope' };
    expect((await getSettings()).rareSubmode).toBe('sticker');
  });

  it('patchSettings flips rareSubmode without touching mode', async () => {
    await patchSettings({ skinsmonkeyMode: 'arbitrage' });
    await patchSettings({ rareSubmode: 'pattern' });
    const s = await getSettings();
    expect(s.rareSubmode).toBe('pattern');
    expect(s.skinsmonkeyMode).toBe('arbitrage');
  });
});

describe('settings — v0.8 profit params', () => {
  it('defaults to the calibrated CS.Money fees when absent', async () => {
    const s = await getSettings();
    expect(s.profit).toEqual(DEFAULT_PROFIT_PARAMS);
    expect(s.profit.sellFeeUnder).toBe(0.05);
    expect(s.profit.sellFeeOver).toBe(0.03);
    expect(s.profit.sellFeeThreshold).toBe(1000);
  });

  it('clamps fractions to [0, 0.95] and falls back per-field on garbage', async () => {
    bag['settings'] = {
      skinsmonkeyMode: 'rare',
      profit: { sellFeeUnder: 2, sellFeeOver: -1, withdrawFee: 'x', tradeLockDiscount: 0.1 },
    };
    const s = await getSettings();
    expect(s.profit.sellFeeUnder).toBe(0.95); // clamped from 2
    expect(s.profit.sellFeeOver).toBe(0); // clamped from -1
    expect(s.profit.withdrawFee).toBe(0); // default (non-number)
    expect(s.profit.tradeLockDiscount).toBe(0.1); // valid
    expect(s.profit.sellFeeThreshold).toBe(1000); // default (absent)
  });

  it('patchSettings persists profit without touching other fields', async () => {
    await patchSettings({ skinsmonkeyMode: 'arbitrage' });
    await patchSettings({ profit: { ...DEFAULT_PROFIT_PARAMS, sellFeeOver: 0.02 } });
    const s = await getSettings();
    expect(s.profit.sellFeeOver).toBe(0.02);
    expect(s.skinsmonkeyMode).toBe('arbitrage');
  });
});
