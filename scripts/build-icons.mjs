// Rasterizes the icon SVGs → icon-{16,32,48,128}.png so the manifest and popup
// can reference real PNG bytes. Runs before `vite build` via the `prebuild`
// hook in package.json.
//
// v0.7 T2: per-size source. The small sizes (16/32) use a simplified glyph
// (icon-small.svg — "S" + central gold diamond only) so the favicon stays
// legible; 48/128 use the full master (icon.svg — "S" + all three diamonds).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const iconsDir = path.join(root, 'public', 'icons');
const fullSrc = path.join(iconsDir, 'icon.svg');
const smallSrc = path.join(iconsDir, 'icon-small.svg');

// size → source SVG (falls back to the full master if the small one is absent).
const SOURCES = [
  [16, smallSrc],
  [32, smallSrc],
  [48, fullSrc],
  [128, fullSrc],
];

if (!fs.existsSync(fullSrc)) {
  console.error('[build-icons] Source SVG not found:', fullSrc);
  process.exit(1);
}

await Promise.all(
  SOURCES.map(async ([size, preferred]) => {
    const src = fs.existsSync(preferred) ? preferred : fullSrc;
    const out = path.join(iconsDir, `icon-${size}.png`);
    await sharp(fs.readFileSync(src))
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    const bytes = fs.statSync(out).size;
    console.log(
      `[build-icons] ${path.relative(root, out)}  ${bytes} bytes  (${path.basename(src)})`,
    );
  }),
);
