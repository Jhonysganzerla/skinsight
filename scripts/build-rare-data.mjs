// Reads the source rare_stickers.json (full report) and emits a slim
// [name, min_price][] array into public/rare_stickers.json so it can be
// fetched at runtime by content scripts via chrome.runtime.getURL().
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Candidates for the source file. Prefer one inside the repo, fall back to
// the sibling legacy project that ships the latest data.
const candidates = [
  path.join(root, 'data', 'rare_stickers.json'),
  path.resolve(root, '..', 'sticker-raro-pirateswap-skinsmonkey', 'rare_stickers.json'),
];

const src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error('[build-rare-data] Could not find a source rare_stickers.json. Looked in:');
  for (const p of candidates) console.error('  ' + p);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const list = Array.isArray(raw?.rare_stickers) ? raw.rare_stickers : [];

const slim = list
  .filter((s) => s && typeof s.name === 'string' && typeof s.min_price === 'number')
  .map((s) => [s.name, s.min_price]);

const outDir = path.join(root, 'public');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'rare_stickers.json');
fs.writeFileSync(outPath, JSON.stringify(slim));

console.log(
  '[build-rare-data] wrote',
  slim.length,
  'rare stickers ->',
  path.relative(root, outPath),
  '(' + Math.round(fs.statSync(outPath).size / 1024) + ' KB)',
);
