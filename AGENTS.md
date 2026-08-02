# AGENTS.md — keyboard-shortcuts

A lightweight Manifest V3 Chrome extension that adds single-key shortcuts to
interactive elements on every page. Press `?` twice to toggle.

## Structure

- `manifest.json` — MV3 manifest; content scripts injected on `<all_urls>`. `content.js`
  runs in the isolated world (all logic); `main.js` runs in the MAIN world (page-callable
  config API).
- `content.js` — isolated-world logic (badge rendering, key handling, enable/disable).
- `main.js` — MAIN-world `window.__keyboardShortcuts` API; shares `localStorage` and
  signals `content.js` via shared-window `CustomEvent`s.

No build step, no dependencies, no icons. Load it as an unpacked extension in
`chrome://extensions` (Developer mode).

## How it works

- `/` pressed twice within 400ms (the unshifted `?` key) toggles shortcuts ON/OFF (ignored while
  focused in a text field).
- The toggle state is persisted in `localStorage` (key `__ks_enabled`) and restored on load,
  so shortcuts remain on after a page refresh.
- When ON: a red dot shows bottom-right; interactive elements
  (`a[href]`, `button`, `input`, `textarea`, `select`, `[role=...]`, `[tabindex]`,
  `[onclick]`) get assigned single-char keys (`0-9`, `a-z`) in DOM order, with a
  small badge showing the key on each element. Default order is the number row
  `1`–`0` followed by the QWERTY letters (`qwertyuiop` → `asdfghjkl` → `zxcvbnm`).
- Per-origin configuration: each site can have its own custom key order stored in
  `localStorage` (key `__ks_keys::<origin>`), set via the page-callable `window.__keyboardShortcuts`
  console API (`setKeys` / `getKeys` / `clearKeys` / `refresh` / `toggle`). This API is
  defined in `main.js`, injected with `"world": "MAIN"` so it runs in the page's main
  world and is callable from DevTools; it writes `localStorage` directly and signals the
  isolated `content.js` via shared-window `CustomEvent`s to re-render / toggle. When no
  custom order is set, the default is used.
- Pressing an assigned key (with no modifier) clicks or focuses the element.
- A `MutationObserver` rescans dynamic DOM changes (debounced 200ms); badges
  reposition on scroll/resize.

## Conventions

- Single self-contained `content.js` IIFE; no external libraries.
- All UI elements use `position: fixed` + `pointer-events: none` so they never
  block page interaction.
- Keep it dependency-free and minimal; prefer surgical edits.

## Verification

- `node --check content.js` parses cleanly.
- `node -e "JSON.parse(...)"` validates the manifest JSON.
- Manual E2E: load unpacked, open any page, press `/` twice, confirm red dot +
  badges appear, press a shown key to activate its element, press `/` twice to
  toggle off. Reload the page while enabled and confirm shortcuts reappear. Open
  the console and call `__keyboardShortcuts.setKeys("abc")` to confirm a custom
  order persists and is honored on reload; `__keyboardShortcuts.clearKeys()` to
  restore the default.