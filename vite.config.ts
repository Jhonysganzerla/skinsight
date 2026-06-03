import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

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
