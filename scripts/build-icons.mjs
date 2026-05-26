// Rasterizes public/icons/icon.svg → icon-{16,32,48,128}.png in the same
// folder so the manifest and the popup can reference real PNG bytes.
// Runs before `vite build` via the `prebuild` hook in package.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public', 'icons', 'icon.svg');
const outDir = path.join(root, 'public', 'icons');

const SIZES = [16, 32, 48, 128];

if (!fs.existsSync(src)) {
  console.error('[build-icons] Source SVG not found:', src);
  process.exit(1);
}

const svg = fs.readFileSync(src);
await Promise.all(
  SIZES.map(async (size) => {
    const out = path.join(outDir, `icon-${size}.png`);
    await sharp(svg).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(out);
    const bytes = fs.statSync(out).size;
    console.log(`[build-icons] ${path.relative(root, out)}  ${bytes} bytes`);
  }),
);
