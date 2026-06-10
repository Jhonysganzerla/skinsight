# Skinsight Privacy Policy

Last updated: 2026-06-10

Skinsight does not collect, store or transmit personal data. There is no
telemetry, no analytics and no account.

## Data the extension reads

The extension reads publicly available marketplace data from the following
websites, only while you visit them and only to render its own overlay:

- skinsmonkey.com
- csfloat.com
- pirateswap.com
- cs.money
- steamcommunity.com (only when you explicitly request a Steam price lookup)

All of this data is processed locally in your browser. Nothing you do is sent
to any external server controlled by us or by third parties.

## Data the extension downloads

The extension periodically **downloads** (never uploads) two public data
files from this project's own GitHub repository
(`raw.githubusercontent.com/Jhonysganzerla/skinsight`):

- `rare_stickers.json` — the rare-sticker reference list;
- `rare_patterns.json` — the rare paint-seed (pattern) bank.

Both files also ship bundled inside the extension as offline fallbacks. The
download is a plain anonymous HTTPS GET (at most once per 24 hours, or when
you press the refresh button); no identifier, cookie or usage data is sent
with it.

## Data stored on your device

Your preferences (active mode, locale, fee parameters, overlay position) and
the cached data files above are saved with Chrome's `chrome.storage.local`
API, which keeps them on your device only. Uninstalling the extension removes
them.

## Questions

Open an issue at `https://github.com/Jhonysganzerla/skinsight`.
