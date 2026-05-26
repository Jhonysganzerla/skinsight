import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Skinsight',
  version: pkg.version,
  description: pkg.description,
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'Skinsight',
    default_popup: 'src/popup/popup.html',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
    },
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['storage', 'tabs'],
  host_permissions: [
    'https://skinsmonkey.com/*',
    'https://*.skinsmonkey.com/*',
    'https://csfloat.com/*',
    'https://*.csfloat.com/*',
    'https://*.pirateswap.com/*',
    'https://pirateswap.com/*',
    'https://cs.money/*',
    'https://*.cs.money/*',
    'https://steamcommunity.com/market/*',
    'https://api.skinport.com/*',
  ],
  content_scripts: [
    {
      matches: ['https://skinsmonkey.com/*', 'https://*.skinsmonkey.com/*'],
      js: ['src/content/skinsmonkey.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://csfloat.com/*', 'https://*.csfloat.com/*'],
      js: ['src/content/csfloat.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://*.pirateswap.com/*', 'https://pirateswap.com/*'],
      js: ['src/content/pirateswap.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://cs.money/*', 'https://*.cs.money/*'],
      js: ['src/content/csmoney.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['rare_stickers.json'],
      matches: [
        'https://skinsmonkey.com/*',
        'https://*.skinsmonkey.com/*',
        'https://csfloat.com/*',
        'https://*.csfloat.com/*',
        'https://*.pirateswap.com/*',
        'https://pirateswap.com/*',
        'https://cs.money/*',
        'https://*.cs.money/*',
      ],
    },
    {
      // Vite/Rollup splits shared imports (csf-url, messaging, storage, …) into
      // chunk files under dist/assets/. Content scripts dynamically import them
      // at runtime, which means Chrome must classify those chunks as
      // web-accessible from the same host set the content scripts run on.
      // crxjs 2.0.0-beta.25 normally auto-populates this list, but our narrow
      // override for rare_stickers.json above replaced its auto-entry — we have
      // to declare the chunks ourselves.
      resources: ['assets/*.js', 'assets/*.css'],
      matches: [
        'https://skinsmonkey.com/*',
        'https://*.skinsmonkey.com/*',
        'https://csfloat.com/*',
        'https://*.csfloat.com/*',
        'https://*.pirateswap.com/*',
        'https://pirateswap.com/*',
        'https://cs.money/*',
        'https://*.cs.money/*',
      ],
    },
  ],
});
