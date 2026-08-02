# AGENTS.md — keyboard-shortcuts

A lightweight Manifest V3 Chrome extension that adds single-key shortcuts to
interactive elements on every page. Press `?` twice to toggle.

## Structure

- `manifest.json` — MV3 manifest; content script injected on `<all_urls>`.
- `content.js` — all logic (badge rendering, key handling, enable/disable).

No build step, no dependencies, no icons. Load it as an unpacked extension in
`chrome://extensions` (Developer mode).

## How it works

- `?` pressed twice within 400ms toggles shortcuts ON/OFF (ignored while
  focused in a text field).
- When ON: a red dot shows bottom-right; interactive elements
  (`a[href]`, `button`, `input`, `textarea`, `select`, `[role=...]`, `[tabindex]`,
  `[onclick]`) get assigned single-char keys from `a-z0-9` in DOM order, with a
  small badge showing the key on each element.
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
- Manual E2E: load unpacked, open any page, press `?` twice, confirm red dot +
  badges appear, press a shown key to activate its element, press `?` twice to
  toggle off.