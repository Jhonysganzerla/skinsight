# Contributing to Skinsight

## Setup

```bash
npm install
npm run dev          # vite dev server with HMR (load `dist/` as unpacked)
npm run build        # production build → dist/
npm run pack         # build + zip → skinsight-<version>.zip
```

## Required before opening a PR

```bash
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
```

All five must pass. CI runs the same matrix.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/). Prefixes:

- `feat:` — new functionality the user sees
- `fix:` — bug fix
- `chore:` — tooling, deps, no behavior change
- `refactor:` — internal restructure, no behavior change
- `test:` — adds or fixes tests only
- `docs:` — README/docs/comments

Keep subject under 72 chars. Body explains _why_ when not obvious.

## When you touch a content script

If you change the data flow between content scripts and the service worker,
update `docs/ARCHITECTURE.md`.

## When you touch the score algorithm

Don't, until v1.0. Reference: briefing-claude-code.md §9 DON'T #1. The legacy
test cases (`tests/modules/arbitrage.score.test.ts`) must keep passing
verbatim.

## Filing a bug

Use the issue template. Include browser version, OS, site URL where you saw
the bug, and a screenshot or DevTools console snippet if applicable.
