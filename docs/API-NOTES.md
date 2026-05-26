# API notes

Caveats and gotchas for every external endpoint Skinsight touches. Update
when something breaks or a site changes its contract.

## SkinsMonkey — `/api/inventory`

```
GET https://skinsmonkey.com/api/inventory?limit=120&offset=0&appId=730&sort=relevance&q=…&exterior=…
```

- **CSRF:** the call requires the `x-csrf-token` header. Token comes from the
  user's session cookie. `scanner.getCsrf()` covers four fallbacks (cookie,
  `<meta>`, Nuxt globals, inline script regex).
- **Credentials:** `include` — uses the user's existing session.
- **Pagination:** stops on first incomplete page (`assets.length < limit`).
  Hard cap 80 pages.
- **Failure modes:** 402 means session expired or token stale; surface as
  "session expired, refresh the page". 5xx and timeouts retry up to 3x.

## CSFloat — `/api/v1/listings`

- Same-origin only from a CSFloat tab; the analyzer content script makes
  the calls.
- Sort_by: `lowest_price` (not `price + order`, that 404s on their service
  worker).
- 429 → exponential backoff `2500 * (1 + retries)` ms, max 3 retries.
- Two-pass strategy: first by `paint_seed`; if empty, second pass without
  seed using `predicted_price`. The estimated flag drives the "⚠️Est" badge.

## PirateSwap — `/inventory/v2/ExchangerInventory`

```
GET https://web.pirateswap.com/inventory/v2/ExchangerInventory?orderBy=price&sortOrder=ASC&page=1&results=40&isSouvenir=false&itemWithSticker=true
```

- **Public**, no auth.
- **`credentials: 'omit'`** — do NOT send cookies (briefing §7).
- Cap iteration at 2000 pages.

## CS.Money — `/5.0/load_bots_inventory/730`

- Public, no auth.
- `hasRareStickers=true&order=asc&sort=price`.
- Watch for `data.message` containing "limite" → rate-limited.

## Steam — `priceoverview` (v0.4)

```
GET https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=<URL_ENCODED>
```

- **Auth:** none.
- **CORS:** only `steamcommunity.com` can call this from page context. From
  extension code, **fetch from the service worker** (host_permissions allow
  it).
- **Rate limit:** ~20 req/min/IP, hard. 429 → cool-down up to 5 min.
- **Strategy:** queue in SW (max 15/min), exponential backoff in 429, cache
  per `market_hash_name` for 1h in `chrome.storage.local`.
- **Never** call from a scan loop. Only via explicit user click.

## Skinport — `/v1/items` (v0.5)

```
GET https://api.skinport.com/v1/items?app_id=730&currency=USD
Headers: Accept-Encoding: br
```

- **Header `Accept-Encoding: br`** is mandatory — brotli only. Without it
  Skinport returns an error.
- **Cache:** 5 min server-side. Calling more frequently is grounds for ban.
  We cache 5 min in `chrome.storage.local` and never refetch sooner.
- **CORS:** allowed for extension via `host_permissions`.
- **Strategy:** download once at SW startup; refresh lazily on cache
  expiry and when the user kicks off a scan.

## Skinport disclaimer

If Skinport bans the extension's IP range we have no fallback price oracle
beyond Steam. Keep cache strict.

## Stickers/charms image hosts

- SkinsMonkey: `cloudflare.steamstatic.com` and SM's own CDN.
- PirateSwap: builds image via `community.cloudflare.steamstatic.com/economy/image/<icon>/256fx256f`.
- No host_permissions needed — `<img src>` doesn't require them.
