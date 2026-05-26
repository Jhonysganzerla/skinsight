import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Skinsight',
  version: pkg.version,
  description: pkg.description,
  // Icons added in v0.6 (Polish phase). Chrome shows default puzzle icon meanwhile.
  action: {
    default_title: 'Skinsight',
    default_popup: 'src/popup/popup.html',
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
  ],
});
