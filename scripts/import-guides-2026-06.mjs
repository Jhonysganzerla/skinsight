// One-off curated import — skin.land pattern guides, captured 2026-06-10.
//
//   node scripts/import-guides-2026-06.mjs   # appends/replaces these 6 skins
//
// Why a script and not the sweep: these guides are hand-written HTML (each with
// its own structure) behind a bot-blocker — not a stable machine-readable
// source. The seed data below was extracted manually from the cited pages and
// is kept INLINE as the provenance record; re-running is idempotent.
//
// Cross-bucket duplicate seeds are intentional in the guides (a seed can score
// in two looks); the bank's invariant forbids them, so import dedupes keeping
// the FIRST bucket (listing order = the guide's own priority).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bankPath = path.join(root, 'public', 'rare_patterns.json');
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));

const V = (label, seeds) => ({ label, seeds });

const GUIDE_SKINS = [
  {
    weapon: 'M4A1-S',
    finish: 'Solitude',
    family: 'art-position',
    source: 'skin.land/blog/the-m4a1s-solitude-pattern-guide (2026-06-10)',
    variants: {
      orange_t1: V(
        'Orange Sun T1',
        [
          15, 56, 84, 138, 151, 170, 191, 195, 219, 236, 265, 278, 322, 339, 340, 529, 565, 634,
          646, 690, 719, 741, 825, 849, 877, 887, 981,
        ],
      ),
      orange_t2: V(
        'Orange Sun T2',
        [
          47, 136, 156, 160, 163, 192, 244, 337, 351, 359, 368, 378, 472, 519, 619, 640, 708, 720,
          759, 833, 839,
        ],
      ),
      golden: V('Golden Mountains', [95, 154, 220, 304, 533]),
      red_t1: V(
        'Red Sun T1',
        [
          73, 214, 248, 269, 276, 281, 312, 340, 462, 506, 513, 531, 549, 568, 569, 579, 726, 729,
          859, 920,
        ],
      ),
      red_t2: V(
        'Red Sun T2',
        [
          8, 50, 63, 65, 143, 144, 193, 211, 212, 246, 318, 342, 374, 376, 389, 393, 457, 488, 578,
          623, 645, 702, 716, 749, 763, 798, 809, 832, 883, 917, 956, 993,
        ],
      ),
      yellow_t1: V('Yellow Sun T1', [158, 284, 321, 525, 797, 895, 951]),
      yellow_t2: V(
        'Yellow Sun T2',
        [
          0, 1, 67, 96, 114, 201, 260, 407, 433, 441, 489, 490, 562, 591, 643, 648, 668, 673, 725,
          876, 878, 888, 964, 999,
        ],
      ),
      white_clouds: V(
        'White Clouds',
        [
          60, 117, 127, 148, 185, 202, 204, 209, 263, 287, 294, 386, 402, 414, 444, 483, 498, 510,
          514, 542, 584, 587, 695, 696, 718, 772, 835, 856, 882, 900, 931, 953, 955, 990,
        ],
      ),
      blue_white_clouds: V(
        'Blue/White Clouds',
        [
          21, 23, 29, 70, 72, 75, 80, 115, 140, 152, 179, 183, 230, 271, 283, 290, 291, 335, 346,
          361, 363, 417, 459, 491, 504, 515, 540, 551, 560, 572, 581, 582, 589, 605, 656, 666, 683,
          685, 692, 693, 727, 738, 875, 783, 879, 799, 813, 842, 881, 903, 911, 914, 936, 937, 939,
          940, 955, 959, 969, 989, 996,
        ],
      ),
    },
  },
  {
    weapon: 'XM1014',
    finish: 'Solitude',
    family: 'art-position',
    source: 'skin.land/blog/the-best-xm1014-solitude-patterns-in-cs2 (2026-06-10)',
    variants: {
      red_sun: V('Red Sun', [95, 871, 154, 220, 863]),
      red_sunrise: V('Red Sunrise', [154, 533]),
      glowing: V('Glowing Mountains', [379, 180, 652, 731, 743]),
      waves: V('Waves', [12, 650, 669]),
      blue_mountains: V('Blue Mountains', [33, 105, 135, 225, 437, 717, 815, 948, 930, 984, 997]),
      green_mountains: V('Green Mountains', [98, 320, 837, 901]),
      white_sunrise: V('White Sunrise', [134, 159]),
    },
  },
  {
    weapon: 'XM1014',
    finish: 'XOXO',
    family: 'art-position',
    source: 'skin.land/blog/best-rare-xm1014-xoxo-pattern-seeds-guide (2026-06-10)',
    variants: {
      skull: V('Skull', [135, 579, 766, 225, 547]),
      skull_mohawk: V('Skull Mohawk', [178, 7, 526, 546, 307, 289]),
      pink_smiley: V('Pink Smiley', [65, 326, 643, 833, 659]),
      black_smiley: V('Black Smiley', [637, 110, 549, 498]),
      burn_it_down: V('Burn It Down', [320, 369, 320, 822, 357, 345]),
      live_your_life: V('Live Your Life', [992, 764, 347, 94, 301, 83, 492, 19]),
      xxx: V('XXX', [394, 31, 511, 814, 684, 532, 702, 713, 791]),
      yeah_right: V('Yeah Right', [775, 652, 919, 235, 328]),
      punk: V('Punk', [330, 708, 926, 352, 697]),
    },
  },
  {
    weapon: 'MAC-10',
    finish: 'Last Dive',
    family: 'art-position',
    source: 'skin.land/blog/full-mac-10-last-dive-pattern-guide (2026-06-10)',
    variants: {
      centered_skull: V('Centered Skull', [386]),
      skull_helmet: V('Skull + Diving Helmet', [407]),
      shell_helmet_skull: V('Shell + Helmet + Skull', [509]),
      underwater_tree: V('Underwater Tree', [748]),
      seahorse: V('Seahorse', [274, 452, 648, 736, 457]),
      serpent: V('Serpent', [992, 301]),
    },
  },
  {
    weapon: 'Galil AR',
    finish: 'Rainbow Spoon',
    family: 'color-gem',
    source: "skin.land/blog/galil-ar-rainbow-spoon-patterns-guide (Lazarino's tiers, 2026-06-10)",
    tiers: [
      {
        tier: 1,
        label: 'Fade Gem T1',
        seeds: [
          0, 1, 3, 25, 44, 58, 106, 113, 116, 142, 148, 168, 175, 185, 201, 202, 204, 225, 245, 251,
          253, 271, 279, 284, 297, 299,
        ],
      },
      {
        tier: 2,
        label: 'Fade Gem T1.5',
        seeds: [
          7, 16, 48, 53, 54, 60, 69, 96, 108, 109, 111, 114, 117, 119, 125, 134, 145, 159, 169, 215,
          222, 228, 233, 234, 237, 250, 259, 260, 263, 266, 267, 273, 275, 280, 288,
        ],
      },
    ],
    variants: {
      gold_pink: V('Gold/Pink Gem', [101, 210, 238, 243, 246, 581, 801, 809, 973]),
    },
  },
  {
    weapon: 'Glock-18',
    finish: 'Coral Bloom',
    family: 'color-gem',
    source: 'skin.land/blog/all-best-glock-18-coral-bloom-patterns (2026-06-10)',
    variants: {
      pink_gem: V('Pink Gem', [194, 559, 619]),
      pink_top: V('Pink Top', [38, 39, 82, 213, 372, 574, 610, 678, 684, 837]),
      pink_handle: V('Pink Handle', [10, 43, 114, 201, 349, 477, 673]),
      few_flowers: V(
        'Few Flowers',
        [9, 29, 86, 201, 210, 244, 300, 386, 445, 527, 533, 604, 676, 678, 801, 818, 931, 954],
      ),
      rare_floral: V(
        'Rare Floral',
        [
          38, 39, 67, 74, 84, 90, 94, 141, 214, 255, 267, 272, 291, 313, 446, 449, 454, 466, 470,
          491, 508, 550, 684, 841,
        ],
      ),
      pink_middle: V('Pink Middle', [136, 142, 162, 504, 528]),
      flower_branch: V('Flower On A Branch', [141, 150, 157, 210, 240, 246, 267, 313, 318, 466]),
      pink_tip: V('Pink Tip', [148, 154, 277, 602, 633, 651, 793, 824, 890, 903, 979]),
    },
  },
];

let added = 0;
let replaced = 0;
for (const g of GUIDE_SKINS) {
  const name = `${g.weapon} | ${g.finish}`;
  // Dedupe within the skin: a seed stays in the FIRST bucket that lists it.
  const seen = new Set();
  const dedupe = (seeds) => {
    const out = [];
    for (const s of seeds) {
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out.sort((a, b) => a - b);
  };
  const tiers = (g.tiers ?? []).map((t) => ({ ...t, seeds: dedupe(t.seeds) }));
  const variants = {};
  for (const [k, v] of Object.entries(g.variants ?? {})) {
    const seeds = dedupe(v.seeds);
    if (seeds.length) variants[k] = { label: v.label, seeds };
  }
  const entry = {
    weapon: g.weapon,
    finish: g.finish,
    name,
    family: g.family,
    method: 'seed-list',
    ...(tiers.length ? { tiers } : {}),
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
  console.log(`${name}: ${seen.size} unique seeds`);
}

bank.generated_at = new Date().toISOString();
fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n');
console.log(`---\nadded ${added}, replaced ${replaced} → ${bank.skins.length} skins total`);
