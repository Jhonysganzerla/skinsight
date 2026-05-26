# Architecture

> This file fills in as features land. v0.1 is foundation; v0.2 introduces
> the SkinsMonkey ↔ CSFloat data flow that is the most complex piece.

## Layout

```
src/
├── background/service-worker.ts     # MV3 SW — message router, cross-tab orchestration
├── content/                         # one entry per site (matches in manifest.config.ts)
│   ├── skinsmonkey.ts               # v0.2 Arbitrage + v0.3 Rare
│   ├── csfloat.ts                   # v0.2 Arbitrage (oracle)
│   ├── pirateswap.ts                # v0.3 Rare
│   └── csmoney.ts                   # v0.3 Rare + DB regenerator
├── popup/                           # toolbar icon UI
└── modules/
    ├── shared/                      # OverlayShell, storage, messaging, fmt, tokens
    ├── arbitrage/                   # scanner, analyzer, score, csf-url, types
    └── rare/                        # finder (SM/PS), csmoney, rare-data, types
```

## Modules dorment vs active per phase

| Module                        | First wired in         |
| ----------------------------- | ---------------------- |
| `modules/shared/*`            | v0.1 (popup + overlay) |
| `modules/arbitrage/*`         | v0.2                   |
| `modules/rare/*`              | v0.3                   |
| `modules/oracles/steam.ts`    | v0.4                   |
| `modules/oracles/skinport.ts` | v0.5                   |

## Data flow — Arbitrage (v0.2 design, not yet wired)

```
SkinsMonkey tab                Background SW              CSFloat tab
───────────────                ─────────────              ───────────
content/skinsmonkey.ts
  scanner.scanAll()
  scanner.applyFilter()
  scanner.buildExportPayload()
  send({type:'arbitrage:export', payload})
        ────────────────────►
                              setPendingArbitrage()
                              findOrOpenCsfloatTab()
                                          ────────────────►
                                                          content/csfloat.ts
                                                            on load:
                                                              getPendingArbitrage()
                                                              show banner if <30min
                                                              click "Analyze" →
                                                                analyzer.runAnalysis(items)
                                                                renderTable(rows)
```

`chrome.storage.local` is the hand-off (replaces the legacy clipboard).

## Why service worker matters

- CORS: certain APIs (Steam priceoverview) cannot be called from arbitrary
  origins. The SW has the `host_permissions` and can fetch cross-origin.
- Tab orchestration: opening/focusing the CSFloat tab must happen from a SW
  message handler in response to user action.
- Single source for "today's hits" (popup reads, content scripts write).

## CSS isolation

Overlay class names use `sh-` prefix and the root container declares
`all: initial` to reset inherited styles from host pages.
