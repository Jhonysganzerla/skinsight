# Skinsight

> See what others miss.

Skinsight is a CS2 **rare sticker scanner** that catches items where the
stickers are worth more than the listing price. It also does cross-site
price **arbitrage** as a secondary feature.

- **Rare stickers** (primary) — finds items on SkinsMonkey, PirateSwap, and CS.Money whose stickers or charms are worth more than the listing.
- **Arbitrage** (secondary) — scans SkinsMonkey listings and cross-checks real CSFloat prices to rank by profit.
- **Possível lucro** — Rare cards on SkinsMonkey/PirateSwap show an estimated CS.Money sticker-overpay bonus (always labelled "(est.)").
- **Rare patterns** — a Rare sub-toggle (Stickers ⇄ Patterns) that flags rare paint seeds on weapon skins: case-hardened blue gems, fades (% computed), and the Galil Blacklight, with a seal/tier + seed + verification link (knives/gloves excluded; no $ value — pattern overpay is fuzzy).

The UI is bilingual (English + Português-BR) with a language selector in the
options page, and a one-time welcome tab on first install.

Manifest V3, TypeScript strict, Vite + `@crxjs/vite-plugin`.

## Status

In active development. See [`PLAN.md`](./PLAN.md) for the current phase and roadmap.
The reference documents live at the repository's parent folder
(`briefing-claude-code.md`, `plano-monetizar-jhony.md`, `mockup-ui-skinsight.html`,
`pesquisa-apis-e-referencias.md`).

## Develop

```bash
npm install
npm run dev          # vite dev server with HMR
npm run build        # production build → dist/
npm run pack         # build + zip → skinsight-<version>.zip
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write
npm test             # vitest
```

## Load unpacked (Chrome / Edge / Brave)

1. `npm run build`
2. `chrome://extensions` → enable Developer mode
3. _Load unpacked_ → select the `dist/` folder

For Firefox: same flow via `about:debugging#/runtime/this-firefox` → _Load Temporary Add-on_.

## Sites covered

| Site                      | Mode(s)                           | Phase wired |
| ------------------------- | --------------------------------- | ----------- |
| skinsmonkey.com           | Rare (default) + Arbitrage        | v0.2 / v0.3 |
| pirateswap.com            | Rare (always-on)                  | v0.3        |
| cs.money                  | Rare (always-on) + DB regenerator | v0.3        |
| csfloat.com               | Arbitrage oracle (always-on)      | v0.2        |
| steamcommunity.com/market | Per-item Steam price (on-demand)  | v0.5        |

> A Skinport oracle was prototyped in v0.6 and **dropped** in v0.6.1 — its
> `/v1/items` endpoint sits behind a Cloudflare challenge that a content script
> can't clear. Per-item Steam Market price covers the same need.

UI text is localized — English + Português (BR) — via a runtime `t()` module;
pick the language in the options page. Visual reference: `mockup-ui-skinsight.html`.

## Privacy

No data collected, no telemetry, no remote backend. Full policy in [`PRIVACY.md`](./PRIVACY.md).

## License

Source-available under the **PolyForm Noncommercial 1.0.0** license — code is
public for transparency and contributions, but commercial use requires a
separate license from the maintainer. See [`LICENSE`](./LICENSE).

## Donate

If this saves you money, consider buying the maintainer a coffee:

- Ko-fi: <https://ko-fi.com/sganzerla>
- Pix: open the popup → **Mostrar QR Pix** to scan, or **Copiar Pix** for the
  full "copia e cola" (BR Code).
