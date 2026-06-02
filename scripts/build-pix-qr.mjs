// Renders the static Pix BR Code (copia-e-cola) into public/pix-qr.svg so the
// popup can show a scannable QR with zero runtime dependency. The payload lives
// in src/modules/shared/pix.json (single source of truth — the popup copies the
// same string). Runs before `vite build` via the `prebuild` hook in package.json.
//
// The QR is a static, no-amount Pix: the donor's bank app opens with the
// recipient pre-filled and chooses any amount. Nothing here hits the network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const payloadFile = path.join(root, 'src', 'modules', 'shared', 'pix.json');
const outFile = path.join(root, 'public', 'pix-qr.svg');

const { payload } = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
if (!payload || typeof payload !== 'string') {
  console.error('[build-pix-qr] No "payload" string in', path.relative(root, payloadFile));
  process.exit(1);
}

// Black modules on white with a small quiet zone — maximum scan reliability.
// 'M' error correction is plenty for a static donation QR.
const svg = await QRCode.toString(payload, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 1,
  color: { dark: '#000000', light: '#ffffff' },
});

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, svg);
console.log(`[build-pix-qr] ${path.relative(root, outFile)}  ${svg.length} bytes`);
