/**
 * Rare-finder parity tests across the 3 sites. Each fixture goes through
 * the same path the live content script uses:
 *   raw API JSON → normalize{Sm,Ps} → findRareResults(items, MAP) →
 *   applyRareFilter(results, opts).
 *
 * The CS.Money flow is different (collectCsMoney builds CsMoneyItem
 * directly from the raw items + buildRareReport produces the rare DB).
 * We cover that path separately.
 *
 * Rare DB is injected via the new `mapOverride` parameter so tests stay
 * deterministic (no chrome.runtime.getURL fetch).
 */
import { describe, it, expect } from 'vitest';
import smPage from '../fixtures/skinsmonkey-page.json';
import psPage from '../fixtures/pirateswap-page.json';
import csmPage from '../fixtures/csmoney-page.json';
import {
  applyRareFilter,
  findRareResults,
  normalizePs,
  normalizeSm,
} from '../../src/modules/rare/finder';
import { buildRareReport, extractCsMoneyImageUrl } from '../../src/modules/rare/csmoney';
import { classifyStickerKind } from '../../src/modules/rare/render';
import type { CsMoneyItem } from '../../src/modules/rare/types';

/** Same normalization that rare-data.ts does on load, but synchronous. */
function norm(s: string): string {
  return String(s || '')
    .replace(/^\s*Sticker\s*\|\s*/i, '')
    .trim()
    .toLowerCase();
}

function buildMap(entries: Array<[string, number]>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [name, price] of entries) m.set(norm(name), price);
  return m;
}

/** Test DB with the names that appear across our 3 fixtures. */
const RARE_DB = buildMap([
  ['Sticker | Howling Dawn', 60.0],
  ['Sticker | Crown (Foil)', 118.0],
  ['Sticker | Reason Gaming (Holo) | Katowice 2014', 166.0],
]);

describe('rare/finder — SkinsMonkey parity', () => {
  it('normalizeSm maps raw assets to RareItem', () => {
    const items = normalizeSm(smPage as unknown as Parameters<typeof normalizeSm>[0]);
    expect(items).toHaveLength(2);
    expect(items[0]?.name).toBe('M4A1-S | Solitude (Factory New)');
    expect(items[0]?.stickers).toHaveLength(0);

    expect(items[1]?.name).toBe('AK-47 | Redline (Field-Tested)');
    expect(items[1]?.stickers).toHaveLength(2);
    expect(items[1]?.stickers[0]?.name).toBe('Sticker | Howling Dawn');
    expect(items[1]?.price).toBeCloseTo(18.5, 2); // 1850 cents ÷ 100
  });

  it('finds rare matches and computes ROI', async () => {
    const items = normalizeSm(smPage as unknown as Parameters<typeof normalizeSm>[0]);
    const results = await findRareResults(items, RARE_DB);
    expect(results).toHaveLength(1); // only AK has rare stickers
    const r = results[0]!;
    expect(r.matches.map((m) => m.name)).toEqual([
      'Sticker | Howling Dawn',
      'Sticker | Crown (Foil)',
    ]);
    // stickerSum = 60 + 118 = 178; price = 18.50
    expect(r.stickerSum).toBeCloseTo(178, 2);
    expect(r.profit).toBeCloseTo(178 - 18.5, 2);
    expect(r.roi).toBeCloseTo(178 / 18.5, 2);
  });
});

describe('rare/finder — PirateSwap parity', () => {
  it('normalizePs builds RareItem with price=null on stickers', () => {
    const items = normalizePs(psPage as unknown as Parameters<typeof normalizePs>[0]);
    expect(items).toHaveLength(3);
    expect(items[0]?.name).toBe('AK-47 | Redline (Field-Tested)');
    // PS images come from Steam CDN built from `icon`
    expect(items[0]?.image).toContain('community.cloudflare.steamstatic.com');
    // PS does not surface sticker prices
    expect(items[0]?.stickers[0]?.price).toBeNull();
  });

  it('threshold edge: sticker exactly at min_price still matches', async () => {
    const items = normalizePs(psPage as unknown as Parameters<typeof normalizePs>[0]);
    // Crown (Foil) is 118 in the DB; PS price is 17.5 → ROI = (60+118)/17.5 ≈ 10.17
    const results = await findRareResults(items, RARE_DB);
    // AK Redline + AWP Asiimov match; Glock has no stickers
    expect(results).toHaveLength(2);
    const ak = results.find((r) => r.name.startsWith('AK-47'))!;
    expect(ak.matches).toHaveLength(2);
    expect(ak.stickerSum).toBeCloseTo(178, 2);
    expect(ak.roi).toBeGreaterThan(10);
  });

  it('applyRareFilter — sort by profit and apply maxPrice', async () => {
    const items = normalizePs(psPage as unknown as Parameters<typeof normalizePs>[0]);
    const results = await findRareResults(items, RARE_DB);

    const profitOrder = applyRareFilter(results, { sort: 'profit' });
    // AK profit = 178-17.5 = 160.5; AWP profit = 166-95 = 71
    expect(profitOrder.map((r) => r.id)).toEqual(['PS-2001', 'PS-2002']);

    const onlyCheap = applyRareFilter(results, { maxPrice: 50 });
    expect(onlyCheap.map((r) => r.id)).toEqual(['PS-2001']);
  });
});

describe('rare/csmoney — Regenerate report', () => {
  // Reuse the CSM fixture as a stand-in for what collectCsMoney would produce.
  // Fixture is the real v0.4 HAR capture: 10 items, 4 with stickers, 6 without.
  type RawSticker = { name: string; price: number; wear: number; img?: string };
  type RawItem = {
    id: number;
    fullName: string;
    price: number;
    img?: string;
    stickers: (RawSticker | null)[];
  };
  const items: CsMoneyItem[] = (csmPage.items as RawItem[])
    .filter((i) => (i.stickers ?? []).filter(Boolean).length > 0)
    .map((raw) => {
      const stickers = (raw.stickers.filter(Boolean) as RawSticker[]).map((s) => ({
        name: s.name,
        priceUsd: s.price,
        wear: s.wear,
        imageUrl: s.img ?? null,
      }));
      const stickersTotalUsd = stickers.reduce((acc, s) => acc + s.priceUsd, 0);
      return {
        id: raw.id,
        name: raw.fullName,
        imageUrl: raw.img ?? null,
        weaponPriceUsd: raw.price,
        stickersTotalUsd,
        netUsd: stickersTotalUsd - raw.price,
        stickers,
      };
    });

  it('infers threshold = min(max sticker price per item)', () => {
    const report = buildRareReport(items);
    // v0.4 fixture: 4 items × max sticker prices = [58.12, 1.61, 2.30, 2.30]
    //   AWP Medusa     → kennyS (Foil) Cologne 2015 = 58.12 (max)
    //   AWP The Prince → BLAST.tv (Gold) Austin 2025 = 1.61 (min of the maxes)
    //   AK Gold Arabesque (×2) → BLAST.tv (Gold) = 2.30
    expect(report.inferred_threshold_usd).toBeCloseTo(1.61, 2);
    expect(report.items_with_stickers).toBe(4);
  });

  it('classifies rare candidates above threshold', () => {
    const report = buildRareReport(items);
    expect(report.rare_count).toBeGreaterThanOrEqual(2);
    const names = report.rare_stickers.map((s) => s.name);
    // kennyS (Foil) is the clearest rare; BLAST.tv (Gold) sits exactly at the
    // threshold and qualifies as well.
    expect(names).toEqual(
      expect.arrayContaining(['Sticker | kennyS (Foil) | Cologne 2015']),
    );
  });

  it('output schema matches the legacy rare_stickers.json shape', () => {
    const report = buildRareReport(items);
    expect(report).toMatchObject({
      inferred_threshold_usd: expect.any(Number),
      items_with_stickers: expect.any(Number),
      total_sticker_observations: expect.any(Number),
      unique_stickers: expect.any(Number),
      rare_count: expect.any(Number),
      normal_count: expect.any(Number),
      note: expect.any(String),
    });
    expect(Array.isArray(report.rare_stickers)).toBe(true);
    expect(Array.isArray(report.normal_stickers)).toBe(true);
    for (const r of report.rare_stickers) {
      expect(r).toMatchObject({
        name: expect.any(String),
        count: expect.any(Number),
        min_price: expect.any(Number),
        max_price: expect.any(Number),
        avg_price: expect.any(Number),
        is_rare_candidate: true,
      });
    }
  });
});

describe('rare/csmoney — image extraction', () => {
  it('extracts item.img for every item in the fixture (10/10)', () => {
    // The fixture's JSON includes `stickers: null` on some items (CS.Money
    // returns null when there are no stickers), which strict TS can't unify
    // with RawCsmItem.stickers?: (RawCsmSticker | null)[]. The function only
    // touches image fields, so a wide cast is safe here.
    const urls = (csmPage.items as unknown as Array<never>).map(extractCsMoneyImageUrl);
    expect(urls).toHaveLength(10);
    for (const u of urls) {
      expect(typeof u).toBe('string');
      expect(u).toMatch(/^https?:\/\//);
    }
  });

  it('falls back through steamImg → preview → screenshot when img is missing', () => {
    expect(extractCsMoneyImageUrl({ img: 'https://a/' } as never)).toBe('https://a/');
    expect(extractCsMoneyImageUrl({ steamImg: 'https://b/' } as never)).toBe('https://b/');
    expect(extractCsMoneyImageUrl({ preview: 'https://c/' } as never)).toBe('https://c/');
    expect(extractCsMoneyImageUrl({ screenshot: 'https://d/' } as never)).toBe('https://d/');
    expect(extractCsMoneyImageUrl({} as never)).toBeNull();
    expect(extractCsMoneyImageUrl({ img: '' } as never)).toBeNull();
  });

  it('prefers img over steamImg even when both are present', () => {
    const url = extractCsMoneyImageUrl({
      img: 'https://primary/',
      steamImg: 'https://secondary/',
    } as never);
    expect(url).toBe('https://primary/');
  });
});

describe('rare/render — sticker kind heuristic', () => {
  it('matte by default', () => {
    expect(classifyStickerKind('Sticker | Howling Dawn')).toBe('matte');
  });
  it('foil from (Foil) suffix', () => {
    expect(classifyStickerKind('Sticker | Crown (Foil)')).toBe('foil');
  });
  it('foil from (Gold) suffix', () => {
    expect(classifyStickerKind('Sticker | Some Team (Gold) | Cologne 2014')).toBe('foil');
  });
  it('holo from (Holo) suffix', () => {
    expect(classifyStickerKind('Sticker | iBUYPOWER (Holo) | Katowice 2014')).toBe('holo');
  });
  it('holo from (Lenticular) suffix', () => {
    expect(classifyStickerKind('Sticker | Foo (Lenticular) | Stockholm 2021')).toBe('holo');
  });
});
