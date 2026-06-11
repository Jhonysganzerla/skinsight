import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

// NOTE: `npm run build` post-processes dist/manifest.json via
// scripts/fix-manifest.mjs (strips `use_dynamic_url` — crxjs beta hardcodes
// it on auto-generated WAR entries and Chrome's dynamic GUID origin broke
// every content-script loader). Don't ship a dist/ built by `vite build`
// alone without running that script.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'es2022',
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      // crxjs auto-discovers entry points from the manifest (popup, options,
      // content scripts, SW). The welcome page is NOT a manifest surface — it's
      // opened by the SW via chrome.tabs.create on first install — so we add it
      // as an explicit HTML input here so Vite bundles it.
      input: {
        welcome: 'src/welcome/welcome.html',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5174 },
  },
});
