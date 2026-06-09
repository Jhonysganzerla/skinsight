// Online sweep + validation for public/rare_patterns.json (v0.9).
//
// Run MANUALLY (network — never part of prebuild):
//   node scripts/sweep-patterns.mjs           # dry-run report
//   node scripts/sweep-patterns.mjs --write   # apply to public/rare_patterns.json
//
// What it does, per family:
//   - art-position (Galil Phoenix Blacklight): refetches the bank's own cited
//     source (GODrums/cs-tierlist generated/phoenix_galil.json) and rebuilds the
//     tier lists from it — adds seeds the bank is missing, drops ones the source
//     removed, reports every change.
//   - fade (14 skins): validates against the ground truth — the
//     csgo-fade-percentage-calculator library itself. Confirms the weapon is
//     supported by the right calculator, recomputes the true max-% seed
//     (ranking 1) and corrects `max_pct_seed` when stale; reports how many
//     seeds clear flag_min_pct / query_min_pct so thresholds stay honest.
//   - case-hardened: NO machine-readable open source exists (csgobluegem.com is
//     HTML-only; cs-tierlist carries no weapon CH data) — the curated lists are
//     kept as-is and only sanity-checked (tiers non-empty, seeds 0..1000,
//     no duplicate seed across tiers/variants of the same skin).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  FadeCalculator,
  AmberFadeCalculator,
  AcidFadeCalculator,
} = require('csgo-fade-percentage-calculator');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bankPath = path.join(root, 'public', 'rare_patterns.json');
const WRITE = process.argv.includes('--write');

const GALIL_SRC =
  'https://raw.githubusercontent.com/GODrums/cs-tierlist/main/generated/phoenix_galil.json';

const CALC_BY_FINISH = {
  Fade: FadeCalculator,
  'Amber Fade': AmberFadeCalculator,
  'Acid Fade': AcidFadeCalculator,
};

const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
const report = [];
let changed = false;
let problems = 0;

const log = (line) => report.push(line);

/* ── art-position: rebuild Galil tiers from the cited source ─────────── */
async function sweepGalil() {
  const skin = bank.skins.find((s) => s.name === 'Galil AR | Phoenix Blacklight');
  if (!skin) {
    log('GALIL: skin missing from bank ✗');
    problems++;
    return;
  }
  const res = await fetch(GALIL_SRC);
  if (!res.ok) {
    log(`GALIL: source fetch failed (HTTP ${res.status}) — kept as-is`);
    problems++;
    return;
  }
  const src = await res.json();
  const byTier = new Map();
  for (const [seedStr, info] of Object.entries(src)) {
    const seed = parseInt(seedStr, 10);
    const tier = Number(info?.tier);
    if (!Number.isFinite(seed) || !Number.isFinite(tier)) continue;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(seed);
  }
  const tiers = [...byTier.keys()]
    .sort((a, b) => a - b)
    .map((tier) => ({
      tier,
      label: `Blacklight T${tier}`,
      seeds: byTier.get(tier).sort((a, b) => a - b),
    }));

  const before = new Map(skin.tiers.map((t) => [t.tier, new Set(t.seeds)]));
  for (const t of tiers) {
    const old = before.get(t.tier) ?? new Set();
    const added = t.seeds.filter((s) => !old.has(s));
    const removed = [...old].filter((s) => !t.seeds.includes(s));
    if (added.length || removed.length) {
      log(
        `GALIL T${t.tier}: ${t.seeds.length} seeds (was ${old.size})` +
          (added.length ? ` +[${added.join(',')}]` : '') +
          (removed.length ? ` -[${removed.join(',')}]` : ''),
      );
      changed = true;
    } else {
      log(`GALIL T${t.tier}: ${t.seeds.length} seeds — matches source ✓`);
    }
  }
  skin.tiers = tiers;
  skin.source =
    'github.com/GODrums/cs-tierlist generated/phoenix_galil.json (orig: SeanErren steam guide 2352059734)';
}

/* ── fade: validate against the calculator library (ground truth) ────── */
function sweepFades() {
  for (const skin of bank.skins.filter((s) => s.method === 'fade-calc')) {
    const calc = CALC_BY_FINISH[skin.finish];
    if (!calc) {
      log(`FADE ${skin.name}: no calculator for finish "${skin.finish}" ✗`);
      problems++;
      continue;
    }
    const supported = calc.getSupportedWeapons().map(String);
    if (!supported.includes(skin.weapon)) {
      log(`FADE ${skin.name}: weapon not supported by ${skin.finish} calculator ✗`);
      problems++;
      continue;
    }
    const all = calc.getFadePercentages(skin.weapon); // [{seed,percentage,ranking}]
    // NOTE: `ranking` is NOT unique — reversed weapons carry a ranking-1 entry
    // per fade direction (e.g. Glock: 412@80% AND 763@100%). The true max seed
    // is the one with the highest percentage.
    const top = all.reduce((a, b) => (b.percentage > a.percentage ? b : a));
    const flagMin = skin.thresholds?.flag_min_pct ?? 95;
    const queryMin = skin.thresholds?.query_min_pct ?? 99;
    const nFlag = all.filter((p) => p.percentage >= flagMin).length;
    const nQuery = all.filter((p) => p.percentage >= queryMin).length;
    if (top && skin.max_pct_seed !== top.seed) {
      log(
        `FADE ${skin.name}: max_pct_seed ${skin.max_pct_seed} → ${top.seed} ` +
          `(${top.percentage}%) — corrected from lib`,
      );
      skin.max_pct_seed = top.seed;
      changed = true;
    } else {
      log(
        `FADE ${skin.name}: max seed ${skin.max_pct_seed} ✓ ` +
          `(${nFlag} seeds ≥${flagMin}%, ${nQuery} ≥${queryMin}%)`,
      );
    }
  }
}

/* ── case-hardened: sanity checks only (no open machine-readable source) ─ */
function checkCaseHardened() {
  for (const skin of bank.skins.filter((s) => s.family === 'case-hardened')) {
    const seen = new Map(); // seed → bucket label
    const buckets = [
      ...(skin.tiers ?? []).map((t) => [t.label, t.seeds]),
      ...Object.values(skin.variants ?? {}).map((v) => [v.label, v.seeds]),
    ];
    for (const [label, seeds] of buckets) {
      if (!Array.isArray(seeds) || seeds.length === 0) {
        log(`CH ${skin.name} [${label}]: empty seed list ✗`);
        problems++;
      }
      for (const s of seeds) {
        if (!Number.isInteger(s) || s < 0 || s > 1000) {
          log(`CH ${skin.name} [${label}]: invalid seed ${s} ✗`);
          problems++;
        }
        if (seen.has(s)) {
          log(`CH ${skin.name}: seed ${s} duplicated in "${seen.get(s)}" and "${label}" ✗`);
          problems++;
        }
        seen.set(s, label);
      }
    }
    log(`CH ${skin.name}: ${seen.size} unique seeds across ${buckets.length} buckets ✓`);
  }
}

await sweepGalil();
sweepFades();
checkCaseHardened();

console.log(report.join('\n'));
console.log('---');
if (problems) console.log(`problems: ${problems}`);
if (changed && WRITE) {
  bank.generated_at = new Date().toISOString();
  fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n');
  console.log(`WROTE ${path.relative(root, bankPath)}`);
} else if (changed) {
  console.log('changes detected — re-run with --write to apply');
} else {
  console.log('bank is in sync with sources — nothing to write');
}
// process.exitCode (not process.exit) — hard-exiting while undici's keep-alive
// sockets are mid-teardown trips a libuv assertion on Windows.
process.exitCode = problems ? 1 : 0;
