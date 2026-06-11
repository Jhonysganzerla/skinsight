/**
 * Post-build manifest fix (v0.9.x): strip `use_dynamic_url` from every
 * web_accessible_resources entry of dist/manifest.json.
 *
 * Why: two sources set the flag —
 *   1. our manifest.config.ts used to opt in for anti-fingerprinting, and
 *   2. crxjs 2.0.0-beta.25 HARDCODES `use_dynamic_url: true` on the WAR
 *      entries it auto-generates for content-script chunks.
 * With the flag on, Chrome serves the chunks under a transient GUID origin
 * (chrome-extension://<guid>/…) that invalidates mid-session — every
 * content-script loader dies with "Failed to fetch dynamically imported
 * module" + "GET chrome-extension://invalid/". Observed live on Chrome
 * during the v0.9.x smoke test; known flaky Chrome behavior.
 *
 * Runs as part of `npm run build` (and therefore `npm run pack`). Remove
 * once we migrate to a crxjs release that makes the flag configurable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'dist/manifest.json');

const manifest = JSON.parse(readFileSync(path, 'utf-8'));
let stripped = 0;
for (const entry of manifest.web_accessible_resources ?? []) {
  if ('use_dynamic_url' in entry) {
    delete entry.use_dynamic_url;
    stripped += 1;
  }
}
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `[fix-manifest] use_dynamic_url stripped from ${stripped} web_accessible_resources entr${stripped === 1 ? 'y' : 'ies'}.`,
);
