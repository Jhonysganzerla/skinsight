// Zip the dist/ folder into skinsight-<version>.zip using PowerShell on
// Windows (no native dependency required).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dist = path.join(root, 'dist');
const out = path.join(root, `skinsight-${pkg.version}.zip`);

if (!fs.existsSync(dist)) {
  console.error('[pack-zip] dist/ not found — run `npm run build` first.');
  process.exit(1);
}
if (fs.existsSync(out)) fs.unlinkSync(out);

const isWin = process.platform === 'win32';
const cmd = isWin
  ? `powershell -NoProfile -Command "Compress-Archive -Path '${dist}\\*' -DestinationPath '${out}' -Force"`
  : `cd "${dist}" && zip -r "${out}" . -x ".*"`;

execSync(cmd, { stdio: 'inherit' });
const sizeKb = Math.round(fs.statSync(out).size / 1024);
console.log(`[pack-zip] wrote ${path.basename(out)} (${sizeKb} KB)`);
