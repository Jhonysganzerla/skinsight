// Guide pack #2 — Steam Community per-weapon pattern guide series + skin.land
// enrichments, captured 2026-06-10. Same model as import-guides-2026-06.mjs:
// hand-extracted seeds kept inline as the provenance record; idempotent.
//
// CURATION RULE (maintainer, 2026-06-10): keep only the TOP tiers (T1/T2 and
// small named specials); tier-3+ filler tails are deliberately dropped.
//
//   node scripts/import-guides-2026-06b.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bankPath = path.join(root, 'public', 'rare_patterns.json');
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));

const STEAM = (id) => `steamcommunity.com/sharedfiles/filedetails/?id=${id} (2026-06-10)`;
const V = (label, seeds) => ({ label, seeds });

const SKINS = [
  // ── Steam per-weapon series (index guide 3601330547) — T1/T2 only ────
  {
    weapon: 'Negev',
    finish: 'Terrain',
    family: 'art-position',
    source: STEAM(3598531656),
    variants: { t1: V('Horizontal T1', [763]), t2: V('Horizontal T2', [326]) },
  },
  {
    weapon: 'M4A4',
    finish: 'Converter',
    family: 'art-position',
    source: STEAM(3598725256),
    variants: { t1: V('Top Pattern T1', [597]), t2: V('Top Pattern T2', [944, 108, 704]) },
  },
  {
    weapon: 'Galil AR',
    finish: 'Cold Fusion',
    family: 'color-gem',
    source: STEAM(3599427126),
    variants: { t1: V('Gem T1', [711, 777, 766]), t2: V('Gem T2', [25, 769, 608]) },
  },
  {
    weapon: 'Five-SeveN',
    finish: 'Forest Night',
    family: 'art-position',
    source: STEAM(3599435872),
    variants: {
      t1: V('Look T1', [965, 435, 939, 559, 542]),
      t2: V('Look T2', [250, 572, 320, 799, 903]),
    },
  },
  {
    weapon: 'MAC-10',
    finish: 'Oceanic',
    family: 'color-gem',
    source: STEAM(3601296847),
    variants: { t1: V('Gem T1', [279]), t2: V('Gem T2', [715]) },
  },
  {
    weapon: 'P250',
    finish: 'Ripple',
    family: 'color-gem',
    source: STEAM(3601603834),
    variants: { t1: V('Gem T1', [541]), t2: V('Gem T2', [275]) },
  },
  {
    weapon: 'Sawed-Off',
    finish: 'Runoff',
    family: 'color-gem',
    source: STEAM(3602144976),
    variants: { t1: V('Blue Gem T1', [297]), t2: V('Blue Gem T2', [651]) },
  },
  {
    weapon: 'P2000',
    finish: 'Oceanic',
    family: 'color-gem',
    source: STEAM(3602198533),
    variants: {
      t1: V('Gem T1', [864, 857, 343]),
      t2: V('Gem T2', [834]),
      heart: V('Heart', [875, 2]),
    },
  },
  {
    weapon: 'Nova',
    finish: 'Rain Station',
    family: 'art-position',
    source: STEAM(3602220976),
    variants: {
      t1: V('Look T1', [558, 970, 487, 194, 588, 911, 273, 201, 931]),
      t2: V('Look T2', [703, 560, 716, 973, 320, 417, 488, 280]),
    },
  },
  {
    weapon: 'PP-Bizon',
    finish: 'Cobalt Halftone',
    family: 'color-gem',
    source: STEAM(3602304841),
    variants: { t1: V('Cyan Gem T1', [470]), t2: V('Cyan Gem T2', [62, 582]) },
  },
  // ── skin.land enrichments (replace the thin cs2pattern entries) ──────
  {
    weapon: 'AWP',
    finish: 'PAW',
    family: 'art-position',
    source: 'skin.land/blog/best-rare-awp-paw-patterns-in-cs2 (2026-06-10)',
    variants: {
      golden_cat: V('Golden Cat', [19, 35, 41, 350, 17, 531, 581, 675, 744, 644]),
      double_cat: V('Double Cat', [480, 970, 899, 107]),
      cat_back: V('Cat In The Back', [813, 58, 851, 783, 860, 109, 799, 444]),
      stoner_420: V('Stoner Cat 420', [420, 788, 306, 187]),
      gas_mask: V('Gas Mask', [29, 97, 62, 80, 120, 176, 185, 32, 75, 294, 458, 992, 916]),
      golden_grenade: V(
        'Golden Grenade',
        [
          429, 926, 954, 3, 4, 26, 38, 53, 73, 63, 78, 103, 122, 156, 158, 163, 182, 186, 216, 232,
          234,
        ],
      ),
    },
  },
  {
    weapon: 'Five-SeveN',
    finish: 'Kami',
    family: 'art-position',
    source:
      'github.com/Helyux/cs2pattern + skin.land/blog/best-five-seven-kami-patterns (2026-06-10)',
    variants: {
      pussy: V('Pussy', [590, 909]),
      top: V('Top Pattern', [662]),
    },
  },
];

let added = 0;
let replaced = 0;
for (const g of SKINS) {
  const name = `${g.weapon} | ${g.finish}`;
  const seen = new Set();
  const variants = {};
  for (const [k, v] of Object.entries(g.variants)) {
    const seeds = [];
    for (const s of v.seeds) {
      if (seen.has(s)) continue;
      seen.add(s);
      seeds.push(s);
    }
    if (seeds.length) variants[k] = { label: v.label, seeds: seeds.sort((a, b) => a - b) };
  }
  const entry = {
    weapon: g.weapon,
    finish: g.finish,
    name,
    family: g.family,
    method: 'seed-list',
    variants,
    source: g.source,
  };
  const idx = bank.skins.findIndex((s) => s.name === name);
  if (idx >= 0) {
    bank.skins[idx] = entry;
    replaced++;
  } else {
    bank.skins.push(entry);
    added++;
  }
  console.log(`${name}: ${seen.size} seeds`);
}

bank.generated_at = new Date().toISOString();
fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n');
console.log(`---\nadded ${added}, replaced ${replaced} → ${bank.skins.length} skins total`);
