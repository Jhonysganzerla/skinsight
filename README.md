# Skinsight

> See what others miss.

Skinsight is a CS2 **rare sticker scanner** that catches items where the
stickers are worth more than the listing price. It also does cross-site
price **arbitrage** as a secondary feature.

- **Rare stickers** (primary) — finds items on SkinsMonkey, PirateSwap, and CS.Money whose stickers or charms are worth more than the listing.
- **Arbitrage** (secondary) — scans SkinsMonkey listings and cross-checks real CSFloat prices to rank by profit.

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
| api.skinport.com          | Skinport oracle                   | v0.6        |

UI text is English. Visual reference: `mockup-ui-skinsight.html`.

## Privacy

No data collected, no telemetry, no remote backend. Full policy in [`PRIVACY.md`](./PRIVACY.md).

## License

Source-available under the **PolyForm Noncommercial 1.0.0** license — code is
public for transparency and contributions, but commercial use requires a
separate license from the maintainer. See [`LICENSE`](./LICENSE).

## Donate

If this saves you money, consider buying the maintainer a coffee:

- Ko-fi: <https://ko-fi.com/sganzerla>
- Pix: `ac344236-c335-4f89-aee2-e671101d4619`
