# Shortcuts Everywhere

A lightweight Manifest V3 Chrome extension that adds single-key shortcuts to
interactive elements on **every page**. Press `/` twice to turn it on, then
press a shown key to click or focus any link, button, or input. Press `/` twice
again to turn it off.

A small badge on each interactive element shows its key; a red dot in the
bottom-right corner shows when shortcuts are active. The toggle state is
persisted, so shortcuts stay on after a page refresh.

## Demo

Demonstrates on [musictheory.net/lessons/10](https://www.musictheory.net/lessons/10):
enabling shortcuts (badges + red dot appear), then pressing the `l` key to
activate the lesson's **Next** control four times — each press flashes the
matched badge and advances the lesson.

<video src="./assets/demo.webm" controls muted width="640"></video>

(The "Next" control listens for `mousedown`/`mouseup`, so the shortcut
synthesizes a real mouse press rather than a bare `.click()` — see
[How it works](#how-it-works).)

## Quick start (load as an unpacked extension)

1. **Download the code.** Clone this repository:

   ```bash
   git clone https://github.com/rbk/shortcuts-everywhere.git
   ```

2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the cloned folder (the one containing
   `manifest.json`).
5. The "Shortcuts Everywhere" extension appears in your list. It runs on all
   pages automatically — no extra setup.

### Try it out

1. Open any web page (any `http`/`https` page — note that `chrome://` pages and
   the Chrome Web Store are off-limits to extensions).
2. Press `/` twice within ~400ms. A red dot appears bottom-right and small
   badges with letters/numbers appear on interactive elements.
3. Press a badge key (with no modifier) to click or focus that element.
4. Press `/` twice again to turn shortcuts off.
5. Reload the page while enabled — shortcuts reappear automatically.

> Don't worry: the toggle is ignored while you're typing in a text field, so
> typing `/` in a search box won't turn shortcuts on or off.

## Settings sidebar

Press `Shift` + `/` (which types `?`) to open a settings sidebar. The sidebar
lets you:

- Turn shortcuts **ON/OFF** (same as pressing `/` twice).
- Set a **custom key order for the current site**, with **Save** and **Reset**
  buttons. Changes apply live and persist across reloads.

Close the sidebar with `Shift` + `/` again, the `×` button, or `Escape`.

## Per-site key order

By default, keys are assigned in DOM order using this pool (numbers first, then
QWERTY letters):

```
1234567890  qwertyuiop  asdfghjkl  zxcvbnm
```

Each site can have its own custom key order stored in `localStorage` (key
`__ks_keys::<origin>`). Set it from the sidebar, or from the page's DevTools
console via the `window.__keyboardShortcuts` API:

```js
__keyboardShortcuts.setKeys("abc123...")   // persist a custom order for this site
__keyboardShortcuts.getKeys()              // read the custom order ("" = using default)
__keyboardShortcuts.clearKeys()            // remove the custom order, use default
__keyboardShortcuts.refresh()              // re-render badges with the current pool
__keyboardShortcuts.toggle()               // toggle shortcuts on/off
__keyboardShortcuts.defaultKeys            // the default pool
```

When no custom order is set, the default is used. A planned 3-tier hierarchy
(default → domain → path-specific overrides) is specced in
[`key-config-hierarchy-spec-20260802-122300.md`](./key-config-hierarchy-spec-20260802-122300.md).

## How it works

- `/` pressed twice within 400ms toggles shortcuts ON/OFF (ignored while focused
  in a text field). State persists in `localStorage` (`__ks_enabled`).
- `Shift` + `/` opens/closes a settings sidebar.
- When ON, interactive elements (`a[href]`, `button`, `input`, `textarea`,
  `select`, `[role=...]`, `[tabindex]`, `[onclick]`) are assigned single-char
  keys in DOM order, each shown with a small badge.
- Pressing an assigned key (no modifier) clicks or focuses the element. For
  clickable elements the shortcut synthesizes a real mouse press
  (mousedown -> mouseup -> click) at the element's center, so custom UIs
  that listen for mousedown/mouseup (e.g. musictheory.net's lesson nav)
  respond; <a href> navigation still works via the terminating `.click()`.
- A `MutationObserver` rescans dynamic DOM changes (debounced 200ms); badges
  reposition on scroll/resize.

## Structure

- `manifest.json` — MV3 manifest; content scripts injected on `<all_urls>`.
  `content.js` runs in the isolated world (all logic); `main.js` runs in the
  MAIN world (the page-callable `__keyboardShortcuts` config API).
- `content.js` — isolated-world logic: badge rendering, key handling,
  enable/disable, settings sidebar, persistence.
- `main.js` — MAIN-world `window.__keyboardShortcuts` API; shares `localStorage`
  and signals `content.js` via shared-window `CustomEvent`s.

No build step, no dependencies, no external libraries.

## Browser support

Chrome / any Chromium browser supporting Manifest V3 (Chrome 111+ for the
`"world": "MAIN"` content-script feature used by the config API).

## License

MIT.