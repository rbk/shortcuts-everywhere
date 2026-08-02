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
- `Shift` + `/` (produces `?`) opens/closes a settings sidebar (Escape or the `×` button closes it).
  The sidebar lets you toggle shortcuts on/off and set the per-site custom key order; it runs in the
  isolated world (`content.js`) and reads/writes the shared `localStorage` directly.
- The toggle state is persisted in `localStorage` (key `__ks_enabled`) and restored on load,
  so shortcuts remain on after a page refresh.
- When ON: a red dot shows bottom-right; interactive elements
  (`a[href]`, `button`, `input`, `textarea`, `select`, `[role=...]`, `[tabindex]`,
  `[onclick]`) get assigned single-char keys (`0-9`, `a-z`) in DOM order, with a
  small badge showing the key on each element. Default order is the number row
  `1`–`0` followed by the QWERTY letters (`qwertyuiop` → `asdfghjkl` → `zxcvbnm`).
  When there are more than 36 interactive elements, a second tier uses
  `Shift`+`key` (badge `⇧<key>`) for elements 37–72, so shortcuts continue past
  the first 36. Matching uses the physical key code (`e.code`) + Shift state so the
  digit row works whether the key comes from a real keyboard or CDP. (Cap: 72;
  a scalable sequence scheme for denser pages is a planned follow-up.)
  Non-visible elements are skipped: `display:none`, `visibility:hidden`, and
  `opacity:0` (in addition to zero-size rects), so badges only land on visible
  elements.
- Per-origin configuration: each site can have its own custom key order stored in
  `localStorage` (key `__ks_keys::<origin>`), set via the page-callable `window.__keyboardShortcuts`
  console API (`setKeys` / `getKeys` / `clearKeys` / `refresh` / `toggle`). This API is
  defined in `main.js`, injected with `"world": "MAIN"` so it runs in the page's main
  world and is callable from DevTools; it writes `localStorage` directly and signals the
  isolated `content.js` via shared-window `CustomEvent`s to re-render / toggle. When no
  custom order is set, the default is used.
- Pressing an assigned key (with no modifier) clicks or focuses the element.
- A `MutationObserver` rescans dynamic DOM changes (debounced 200ms); badges
  reposition on scroll/resize. The observer watches `childList` plus
  visibility-affecting attributes (`style`/`class`/`hidden`/`aria-hidden`) so
  hiding an element via a class toggle triggers a rescan (otherwise badges go
  stale on now-hidden elements). `positionBadges` also hides a badge when its
  element is **occluded** at its center (a different element is on top — e.g. a
  fixed header, modal, or content covering a TOC), via `elementsFromPoint`; this
  is re-evaluated on scroll/resize (rAF-throttled) so badges reappear when the
  element is visible. Keys stay assigned; only the badge display is suppressed.

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
  restore the default. Press `Shift` + `/` to confirm the settings sidebar opens
  and its Save/Reset controls update the badge keys live.

## QA / repro with agent-browser

To reproduce the known issues (#1 key exhaustion, #2 invisible elements keyed,
#3 fixed/sticky badge drift) and to verify fixes, drive the extension with
[`agent-browser`](https://github.com/specrove/agent-browser) — no custom skill
needed. It launches Chrome with the unpacked extension via `--args`, and you
control the extension through its own `window.__keyboardShortcuts` API via
`eval` (deterministic) plus screenshots for visual checks.

### One-time setup

```bash
npm i -g agent-browser && agent-browser install   # or: brew/cargo install
KS=$(pwd)                                           # absolute path to this repo (has manifest.json)
```

### Launch Chrome with the extension loaded

```bash
agent-browser \
  --args "--load-extension=$KS,--disable-extensions-except=$KS" \
  open <url>
```

Use headless mode (no `--headed`) per the global convention; `--headed` is only
useful when a human wants to watch the session live.

After any `content.js` / `main.js` / `manifest.json` change: `agent-browser close`,
then relaunch — the extension reloads fresh from disk (no `chrome://extensions`
reload needed).

### Drive the extension (deterministic, via its own API)

```bash
agent-browser eval "window.__keyboardShortcuts.toggle()"        # enable / disable
agent-browser eval "window.__keyboardShortcuts.setKeys('abc...')" # custom order
agent-browser eval "window.__keyboardShortcuts.clearKeys()"       # back to default
```
`eval` runs in the page main world, where `window.__keyboardShortcuts` is defined.
Avoids the 400ms double-`/` timing entirely.

### Capture artifacts

```bash
agent-browser screenshot after.png                  # viewport shot
agent-browser screenshot --annotate after-annot.png  # labeled, good for vision
agent-browser eval "$(cat qa/probe.js)" > dom.json   # structured DOM report
```

`qa/probe.js` returns JSON: per interactive element — `key`/`hasKey`, `rect`,
computed `position` (fixed/sticky/...), `display`/`visibility`/`opacity`/
`offsetParent`/`hidden`/`offscreen`, and the badge rect if assigned.

### Analyze

- `read` the screenshot (displays it to the agent) and look for misplaced /
  overlapping / stray badges, badges on invisible elements, or elements with
  no badge.
- `ctx_execute` over `dom.json` to confirm counts deterministically.

### Deterministic checks (map to the issues)

- **#1 key exhaustion:** `interactiveCount > poolLength` and any `hasKey === false`.
- **#2 invisible elements keyed:** any item with `hidden === true` but `hasKey === true`.
- **#3 fixed/sticky drift:** for `position === "fixed" | "sticky"` items with a
  badge, `badgeRect.{x,y}` should equal the element's `rect.{x,y}` top-left; also
  re-run the probe after `agent-browser eval "window.scrollBy(0,300)"` and flag
  drift. Note: the real-world "badge shown, element not visible" case is
  **occlusion**, not fixed/sticky drift — detect it by hit-testing each live
  badge's element center with `document.elementsFromPoint(cx, cy)`; if the
  element is absent from the stack or a non-descendant is above it, the badge
  is on an occluded element.

### Seed URLs (suspected issues)

- `https://news.ycombinator.com/news` — #1 (>36 links), #2
- `https://www.musictheory.net/lessons/10` — #3 (fixed/canvas), #2
- `https://ykumar.me/blog/eclip-autoresearch/` — #3 (fixed header)

### Recording a video (QA demos)

`agent-browser record start <path.webm> [url]` / `record stop` records a WebM.
**Gotcha:** `record start` spins up a **fresh browser context that does NOT load
the unpacked extension** (`--load-extension` only applies at browser launch, not
to a new context), so `window.__keyboardShortcuts` is undefined in the recorded
context and the extension's keydown handler / badges never run. `--args` cannot be
passed to `record start`.

Workaround: inject the **actual** `content.js` + `main.js` source into the
recorded page via base64 `eval`. The two files share `window` / `localStorage` and
communicate via the same `__ks-cmd-*` `CustomEvent`s as when loaded normally,
so the recorded behavior is the real extension code (same keydown matching,
badges, flash, and `clickEl` activation). Then drive it with `press` / the
`__keyboardShortcuts` API exactly as in a normal session.

```bash
# 1. Launch the browser with the extension (so the process runs) and clear
#    persisted enabled state so the video shows the toggle.
agent-browser --args "--load-extension=$KS,--disable-extensions-except=$KS" open <url>
agent-browser eval "try{localStorage.removeItem('__ks_enabled')}catch(e){}"

# 2. Start recording (fresh context, NO extension).
agent-browser record start ./qa/demo.webm

# 3. Inject the real source into the recorded page.
B64M=$(base64 -i main.js | tr -d '\n')
B64C=$(base64 -i content.js | tr -d '\n')
agent-browser eval "eval(atob('$B64M'))"   # defines window.__keyboardShortcuts
agent-browser eval "eval(atob('$B64C'))"   # keydown handler + badges + flash

# 4. Drive it (deterministic, via its own API + press).
agent-browser wait 1200                              # show page, no shortcuts
agent-browser eval "window.__keyboardShortcuts.toggle()"  # badges + red dot
agent-browser wait 1500
for i in 1 2 3 4; do agent-browser press l; agent-browser wait 1500; done

# 5. Stop and save.
agent-browser record stop
```

- Verify the take with `ffprobe -v error -show_entries format=duration
  -of default=noprint_wrappers=1 qa/demo.webm` (codec/size/duration).
- Headless recording works (Chrome screencast), no `--headed` needed.
- This injection trick is ONLY for recording; for deterministic checks and
  screenshots use the normally-loaded extension as in the sections above.

### Caveats

- Full-page screenshots misrender `position:fixed` badges (they pin to the
  viewport). Use viewport screenshots at scroll offsets instead
  (`agent-browser scroll down 800 && agent-browser screenshot ...`).
- Iframes: the extension is `all_frames: false` by default, so only the top
  frame gets badges. Report the gap; revisit during issue work.
- `agent-browser close` to tear the session down.