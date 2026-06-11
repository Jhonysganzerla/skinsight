# ⌖ Skinsight

> **See what others miss.**

[![CI](https://github.com/Jhonysganzerla/skinsight/actions/workflows/ci.yml/badge.svg)](https://github.com/Jhonysganzerla/skinsight/actions/workflows/ci.yml)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-purple)](./LICENSE)

Skinsight is a browser extension for **CS2 skin traders**. It is an active
_opportunity scanner_ — it sweeps marketplace listings, cross-checks real
prices and ranks what it finds — not a passive page decorator. Its primary
job is catching items whose **stickers, charms or paint patterns are worth
more than the listing price**.

## Features

|     | Feature                       | What it does                                                                                                                                                                                                                                         |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔎  | **Rare stickers** _(primary)_ | Scans SkinsMonkey, PirateSwap and CS.Money for items whose applied stickers/charms outvalue the listing, with a per-sticker price breakdown and estimated overpay bonus (always labelled "est.").                                                    |
| 💎  | **Rare patterns**             | A Stickers ⇄ Patterns sub-toggle flags rare paint seeds on weapon skins — case-hardened blue gems, fades (% computed via the Valve seed algorithm), AWP PAW motifs, Galil Blacklight and more — with tier seal, seed number and a verification link. |
| 📈  | **Arbitrage**                 | Scans SkinsMonkey listings, cross-checks live CSFloat prices in a shared rate-limited queue, and ranks results by expected profit.                                                                                                                   |
| 🌐  | **Bilingual UI**              | English + Português (BR), selectable in the options page.                                                                                                                                                                                            |
| 🔄  | **Live data**                 | The rare-sticker list and pattern bank refresh from this repository (24 h TTL), so seed fixes reach users without waiting for a store release.                                                                                                       |

Everything renders in a draggable in-page overlay with reactive filters,
chunked/virtualized rendering for large result sets, and a popup with a
"Today's hits" feed.

## Install

### From source (Chrome / Edge / Brave)

```bash
git clone https://github.com/Jhonysganzerla/skinsight.git
cd skinsight
npm install
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**
2. Click **Load unpacked** and select the `dist/` folder
3. Visit a supported site — the overlay mounts automatically

**Firefox:** same flow via `about:debugging#/runtime/this-firefox` → _Load Temporary Add-on_.

### Supported sites

| Site                      | Mode                             |
| ------------------------- | -------------------------------- |
| skinsmonkey.com           | Rare (default) + Arbitrage       |
| pirateswap.com            | Rare                             |
| cs.money                  | Rare + rare-DB regenerator       |
| csfloat.com               | Arbitrage price oracle           |
| steamcommunity.com/market | Per-item Steam price (on-demand) |

## Tech stack

- **Manifest V3** — service worker as message hub, minimal permissions
  (`storage` only, exact host list — no `<all_urls>`, no clipboard access)
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **Vite** + [`@crxjs/vite-plugin`](https://github.com/crxjs/chrome-extension-tools) — HMR during development
- **Vitest** — 235+ unit tests, including line-by-line parity tests for the
  arbitrage scoring algorithm
- **ESLint + Prettier + GitHub Actions** — lint, typecheck, format, test and
  build gates on every push

No frameworks, no backend, no accounts. All state lives in
`chrome.storage.local`.

```text
src/
├── background/       service worker — message router, rate-limit buckets, GC
├── content/          per-site content scripts (overlay mount + scan loop)
├── modules/
│   ├── arbitrage/    SkinsMonkey scanner, CSFloat analyzer, scoring
│   ├── rare/         sticker finder, pattern bank, shared scan controller
│   ├── oracles/      Steam Market price (on-demand, throttled, cached)
│   └── shared/       overlay shell, UI kit, i18n, storage, throttling
├── popup/            toolbar popup — mode toggles, today's hits, donate
├── options/          language selector
└── welcome/          first-install onboarding tab
```

More detail in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and
[`docs/API-NOTES.md`](./docs/API-NOTES.md).

## Development

```bash
npm run dev          # vite dev server with HMR
npm run build        # production build → dist/
npm run pack         # build + zip → skinsight-<version>.zip
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write
npm test             # vitest
```

Contributions are welcome — see [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md).
The release smoke checklist lives in [`docs/SMOKE.md`](./docs/SMOKE.md) and the
roadmap in [`PLAN.md`](./PLAN.md).

## Privacy

**No data collected. No telemetry. No remote backend.**

Skinsight talks only to the marketplaces you are already browsing, the Steam
Market price endpoint, and this repository (to refresh the public rare-data
files). Full policy in [`PRIVACY.md`](./PRIVACY.md).

## Disclaimer

Skinsight reads marketplace data through the same private endpoints the sites'
own pages use, under your existing session. Those endpoints are undocumented
and may change or be rate-limited at any time, and automated access may be
against a marketplace's Terms of Service — **use at your own risk**. Skinsight
is not affiliated with Valve, Steam or any marketplace; price estimates are
informational and not financial advice.

## License

Source-available under **PolyForm Noncommercial 1.0.0** — the code is public
for transparency and contributions, but commercial use requires a separate
license from the maintainer. See [`LICENSE`](./LICENSE).

## Support the project

If Skinsight saves you money, consider buying the maintainer a coffee:

- **Ko-fi:** <https://ko-fi.com/sganzerla>
- **Pix (BR):** open the popup → **Mostrar QR Pix** to scan, or **Copiar Pix**
  for the full "copia e cola" (BR Code)
