# Key Config Hierarchy — Spec

Status: **proposed** (not yet implemented)
Date: 2026-08-02

## Goal

Support a 3-tier key-order configuration so each site can be tuned at the
domain level, with optional path-specific overrides:

1. **Default** (built-in constant)
2. **Domain** (per-origin)
3. **Path** (per path, overriding domain)

Highest-precedence wins: **path → domain → default**.

## Tiers

| Tier | Storage key | Meaning |
|---|---|---|
| Default | — (constant `DEFAULT_KEY_POOL`) | `1234567890qwertyuiopasdfghjklzxcvbnm` |
| Domain | `__ks_keys::https://example.com` | applies to every path on the site |
| Path | `__ks_keys::https://example.com/docs/intro` | overrides domain for this path (and, with prefix matching, its descendants) |

## Recommended resolution: prefix walk-up

For a page at `https://example.com/docs/intro`, walk from the most specific
configured ancestor down to the domain, then default:

```
resolveKeyPool():
  path = location.pathname                  // "/docs/intro"
  segs = path.split("/").filter(Boolean)     // ["docs","intro"]
  for i from segs.length down to 1:
    key = origin + "/" + segs.slice(0,i).join("/")
    if read(key) -> return it
  if read(origin) -> return it               // domain (also covers root "/")
  return DEFAULT_KEY_POOL
```

- A single config saved at `/docs` covers `/docs/intro`, `/docs/anything` —
  configure once per section, not per leaf.
- Root path (`/`) folds into the domain tier (no separate `origin + "/"` key),
  so "site-wide" and "homepage" are the same thing.

Alternative: **exact-path-only** (simpler, but you'd re-save on every leaf page).
Recommendation: prefix walk-up.

## Scoping unit

`origin + pathname` only — **exclude query string and hash**. `?ref=...` and
`#section` should not fork a config. Edge cases: `about:blank`-style origins
have no real path → domain tier only; skip the path walk gracefully.

## Sidebar UI (one input, choose scope on save)

```
Keyboard Shortcuts                    ×
[ Shortcuts: ON ]

Effective order: qwertyuiop...   (from: path /docs)
__________________________________________________
Custom key order
[ qwertyuiop...              ]   <- input
[ Save for this path ]  [ Save for domain ]
[ Reset path ]          [ Reset domain ]
```

- The input prefills with the **effective** pool; a line above shows which
  tier it came from.
- Save/Reset are split per scope, so you explicitly choose where it lands.
  No ambiguity, no hidden overwrites.

## Console API

Add a `scope` param (default `"domain"`):

```js
__keyboardShortcuts.setKeys("abc", "path")   // "path" | "domain"; default "domain"
__keyboardShortcuts.getKeys("path")          // configured value at that scope ("" = none)
__keyboardShortcuts.clearKeys("path")
__keyboardShortcuts.resolve()                // { pool, source: "path"|"domain"|"default", key }
```

`main.js` writes `localStorage` (the path key is just
`origin + location.pathname`) and signals `content.js` to re-render, same
shared-window `CustomEvent` bridge as today.

## Implementation surface (in `content.js` / `main.js`)

- `resolveKeyPool()` → new walk-up logic above (replaces current
  `getConfiguredPool() || DEFAULT_KEY_POOL`).
- New helpers:
  - `domainKey()` → `KEYS_STORAGE_PREFIX + location.origin`
  - `pathKey()` → `KEYS_STORAGE_PREFIX + location.origin + location.pathname`
  - `readPool(key)`, `writePool(key, raw)`, `clearPool(key)`
  - `effectiveSource()` → returns `{ pool, source, key }`
- Sidebar:
  - effective-order line + source label
  - Save/Reset split into per-path and per-domain buttons
- `main.js` API: `scope` param on `setKeys`/`getKeys`/`clearKeys`, plus
  `resolve()`; dispatches same `__ks-cmd-*` events.

## Open decisions (to confirm before implementing)

1. **Path matching:** prefix walk-up (recommended) vs exact-path-only?
2. **Toggle state:** keep per-origin only (recommended — one on/off per site),
   or also hierarchical (path can override on/off)?
3. **Console API default scope:** `"domain"` (recommended — least surprising)
   vs `"path"`?
4. **Trailing slash:** normalize `/docs/` → `/docs` so they share a config
   (recommended)?

## Verification (once implemented)

- `node --check content.js && node --check main.js` parse cleanly.
- E2E: save a domain order → all paths use it; save a path order for `/docs`
  → `/docs/x` and `/docs/y` use the path order while `/other` uses domain;
  reset path → falls back to domain; reset domain → falls back to default;
  query/hash variants resolve to the same config; reload honors all three
  tiers; sidebar source label updates correctly.