# Plan: Puppeteer-based Visual QA Skill for Shortcuts Everywhere

> **SUPERSEDED (2026-08-02):** We're using the existing `agent-browser` CLI
> instead of a custom Puppeteer skill — it can launch Chrome with the unpacked
> extension via `--args "--load-extension=..."` and drive it through the
> extension's own `window.__keyboardShortcuts` API via `eval`. See the
> **"QA / repro with agent-browser"** section in `AGENTS.md` and `qa/probe.js`.
> The seed-URL mapping and probe/check design below are still relevant and were
> folded into that section; this file is kept for history.

Status: **superseded** (use agent-browser per `AGENTS.md`)
Date: 2026-08-02
Related issues: #1 (key exhaustion), #2 (invisible elements), #3 (fixed-positioning)
Seed URLs (known-broken):
- https://ykumar.me/blog/eclip-autoresearch/
- https://news.ycombinator.com/news
- https://www.musictheory.net/lessons/10

## Why

The three known issues (#1, #2, #3) are visual/positional and only show up on
real pages. Fixing them blind — without reproducing on the actual broken sites
— leads to guessing and regressions. We need a repeatable way to: load the
unpacked extension, drive it on a target page, capture what it actually does,
and analyze whether badges are correct. This is meta-tooling: a skill that the
agent runs to QA the extension.

## Goal

An agent skill that:

1. Launches a Puppeteer-controlled Chrome with the **unpacked** Shortcuts
   Everywhere extension loaded.
2. Navigates to a list of URLs (the seed pages, plus any URL passed in).
3. Drives the extension: presses `/` twice to enable, `Shift`+`/` for the
   settings sidebar, and a shortcut key to activate an element.
4. Captures artifacts: **before/after screenshots** (viewport + full-page),
   and a **DOM report** (every interactive element + its assigned key + badge
   rect + computed visibility + position style).
5. Analyzes the artifacts two ways:
   - **Deterministic DOM checks** for the three known issues (see below).
   - **Vision analysis**: feed screenshots back to the agent (the agent's `read`
     tool displays images to the agent), which inspects them for "looks funny"
     problems the DOM can't express (overlap, clipped badges, wrong anchor,
     stray badges).
6. Emits a per-URL report mapping findings to known issues, with new tasks /
   GitHub issues as needed.

## Architecture (recommended)

Two layers — capture (code) and analysis (the agent itself). The skill is
mostly the capture layer; the agent does analysis using its own vision, so the
skill does **not** need a separate LLM/vision API key.

```
qa-skill/
  SKILL.md            # activation + workflow for the agent
  package.json        # puppeteer (dev-only)
  scripts/
    qa.mjs            # Puppeteer runner (CLI): --url <u> [--out <dir>] [--shot]
  lib/
    inject.js         # copied-into-page DOM probe (extracts element + badge data)
    checks.js         # deterministic checks against the three known issues
  artifacts/
    <slug>/<ts>/      # before.png, after.png, full.png, dom.json, report.json
  README.md
```

`qa.mjs` is the only entry point the agent calls; it writes artifacts to
`artifacts/<slug>/<ts>/` and prints a short summary. The agent then `read`s the
screenshots and `ctx_execute`s over `dom.json`/`report.json` to analyze.

## Capture layer — implementation plan

### Launching Chrome with the extension

Puppeteer + unpacked MV3 extension. Key flags:

```js
const extPath = path.resolve(__dirname, "..", ".."); // dir with manifest.json
const browser = await puppeteer.launch({
  headless: "new",                 // extensions load only in new headless / headed
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
  defaultViewport: { width: 1280, height: 900 },
});
```

Caveats to bake in:
- Old `headless: true` does **not** load extensions — must use `headless: "new"`
  (or headed). Pin a recent puppeteer version.
- After launch, wait for the extension to be ready: poll
  `chrome.management` isn't available to the page; instead just navigate and
  wait for the content script's known side effects (e.g. a badge overlay
  `#__ks_overlay` after enabling).
- Content scripts inject on navigation automatically (matches `<all_urls>`); no
  manual injection needed.

### Driving the extension on a page

```js
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await settle(page);                       // wait for late JS / mutations

// Enable shortcuts: press "/" twice within 400ms (DOUBLE_PRESS_MS).
await page.keyboard.press("/");
await sleep(150);
await page.keyboard.press("/");            // → toggle on

// Confirm the overlay + dot exist (deterministic).
await page.waitForSelector("#__ks_overlay", { timeout: 5000 });
await page.screenshot({ path: out("after.png") });
```

- Settings sidebar: `Shift`+`/` via
  `page.keyboard.down("Shift"); page.keyboard.press("/"); page.keyboard.up("Shift")`.
- Activate an element: `page.keyboard.press(<key>)`; assert focus/click side
  effect.
- Full-page screenshot caveat: `position:fixed` badges render at viewport
  position in `fullPage` screenshots, which is misleading. Use a
  **scroll-and-stitch** capture (screenshot each viewport section at scroll
  offsets) OR capture viewport-only shots at top + a few scroll positions. Flag
  this in the report.

### DOM probe (run inside the page)

Inject a function (via `page.evaluate`) that, **after** shortcuts are enabled,
walks the same selector the extension uses and returns per-element data:

```js
{
  tag, id, role, text(40),            // identity
  rect: {x,y,w,h},                    // getBoundingClientRect (viewport)
  position,                           // getComputedStyle().position (fixed/sticky/...)
  visible: { display, visibility, opacity, offsetParentNotNull, rectArea },
  offscreen: bool,                    // rect outside viewport
  badge: { key, rect } | null,        // from the overlay's .__ks_badge mapped to this el
  hasKey: bool,                       // did the pool reach this element? (issue #1)
}
```

This is the source of truth for the deterministic checks and lets the agent
reason precisely without scraping pixels.

### Deterministic checks (map to issues)

- **#1 key exhaustion:** `interactiveCount > 36` AND any `hasKey === false` →
  report which elements are unkeyed (count, sample).
- **#2 invisible elements keyed:** any element with
  `display==="none" || visibility==="hidden" || opacity==="0" || rectArea===0`
  but `hasKey === true` → list them (this is the bug).
- **#3 fixed/sticky badge mismatch:** for each `position==="fixed"|"sticky"`
  element with a badge, compare `badge.rect` to `el.rect`; flag if the badge
  isn't at the element's top-left corner or drifts after a programmatic scroll
  (re-measure after `window.scrollBy(0, 300)`).

Each check writes a structured result to `report.json` and a human summary to
stdout.

### Settle / timing helper

```js
async function settle(page) {
  // wait for network + a quiet mutation window (the extension uses a 200ms
  // debounce; give it headroom).
  await sleep(800);
}
```

Some seed pages (HN, the musictheory lesson) are dynamic/iframe-heavy; add
`waitUntil` tuning and a per-URL timeout override.

## Analysis layer (the agent)

After `qa.mjs` finishes, the agent:

1. `read`s `after.png` / scroll screenshots to visually inspect badge
   placement.
2. `ctx_execute`s over `dom.json` / `report.json` to confirm the deterministic
   findings (counts, samples) without burning context on raw bytes.
3. Decides: file a new issue, update an existing one, or patch the extension.

This keeps the skill dependency-free of any AI SDK and uses the agent's own
vision — the same one that would read a screenshot the user pastes.

## Mapping seed URLs to suspected issues

- `https://news.ycombinator.com/news` — many links (>36) → exercises **#1** key
  exhaustion; also dense list, good for **#2** (hidden nav/hidden vote buttons).
- `https://www.musictheory.net/lessons/10` — app-like, likely `position:fixed`
  controls / interactive SVG/Canvas → exercises **#3** and **#2** (canvas
  overlays, non-standard interactive elements).
- `https://ykumar.me/blog/eclip-autoresearch/` — blog with a fixed header/nav →
  exercises **#3** (fixed header badges) and general layout.

Running the skill across all three should produce concrete repros for each
open question in the three issues.

## CLI shape

```bash
node scripts/qa.mjs --url https://news.ycombinator.com/news
node scripts/qa.mjs --url https://ykumar.me/blog/eclip-autoresearch/ --out artifacts/custom
node scripts/qa.mjs --urls seed-urls.txt        # batch
node scripts/qa.mjs --url <u> --no-enable        # capture baseline (badges off)
```

Output: prints the `artifacts/<slug>/<ts>/` dir and a one-line pass/fail per
check.

## Skill activation (`SKILL.md`, sketch)

- **When to use:** after editing `content.js` / `manifest.json`, or when a bug
  report references a specific URL; before closing issues #1/#2/#3.
- **Workflow:** (1) `npm install` in `qa-skill/`, (2) run `qa.mjs` per URL,
  (3) `read` the screenshots, (4) `ctx_execute` over `report.json`, (5) act.
- **Triggers:** "qa the extension", "repro on <url>", "check badges on …".

## Open questions

1. **Headless mode:** `headless: "new"` loads extensions on recent Chrome; if the
   bundled Chromium is too old, fall back to headed (`headless: false`) with
   `xvfb` on CI. Recommendation: use `headless: "new"` and pin puppeteer ≥ 21.
2. **Vision vs. deterministic only:** confirm we want **both** (deterministic
   for the 3 known issues, vision for "looks funny"). Recommendation: yes.
3. **Full-page screenshots with fixed badges:** scroll-and-stitch vs.
   viewport-at-offsets. Recommendation: viewport-at-offsets (simpler, accurate
   for fixed elements).
4. **Skill location:** inside this repo (`qa-skill/`, travels with the code) vs.
   a global pi skill (`~/.pi/agent/skills/`). Recommendation: inside the repo;
   the agent activates it via its `SKILL.md`.
5. **Dependency policy:** the extension itself stays dependency-free; Puppeteer
   is dev-only under `qa-skill/node_modules` (already gitignored). Confirm OK.
6. **Iframe pages:** the extension sets `all_frames: false` (default), so
   badges only appear in the top frame. Some seed content may be in iframes —
   decide whether to enable `all_frames` as part of the fix work or just report
   the gap. Recommendation: report for now; revisit in issue work.
7. **Repro first:** before building the skill, do we want a one-off manual
   Puppeteer script to confirm the approach captures the bugs, then harden into
   a skill? Recommendation: yes — spike first, skill second.

## Phasing

- **Phase 0 (spike):** a single `spike.mjs` that loads the extension, enables on
  one seed URL, and dumps a screenshot + `dom.json`. Confirm it reproduces ≥1
  known issue. ~half a day.
- **Phase 1 (skill):** generalize into `qa-skill/` with the CLI, deterministic
  checks, and the agent workflow. ~1–2 days.
- **Phase 2 (integration):** run across the seed URLs, file concrete repros /
  patch issues #1/#2/#3.

## Verification (when built)

- `node --check scripts/qa.mjs` parses.
- `qa.mjs --url <seed>` exits 0 and writes `after.png` + `dom.json` + `report.json`.
- Each seed URL produces at least one repro tagged to a known issue (or a
  documented "no repro" result).
- The agent can `read` the screenshots and confirm the findings.