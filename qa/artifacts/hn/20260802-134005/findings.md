# QA run — Hacker News

- URL: https://news.ycombinator.com/news
- Run: 20260802-134005
- Extension: loaded unpacked via `agent-browser --args --load-extension`
- Method: enabled via `window.__keyboardShortcuts.toggle()` (eval, main world)

## Artifacts
- `after.png` — viewport screenshot, shortcuts enabled
- `after-annot.png` — annotated screenshot (labeled for vision models)
- `dom.json` — structured probe of all interactive elements + badges

## Deterministic results (from dom.json)
- interactiveCount: 228
- badgeCount: 36
- poolLength: 36 (default pool: 1234567890qwertyuiopasdfghjklzxcvbnm)
- unkeyed elements (no badge): **192 of 228**  ← issue #1 confirmed

## Issue mapping
- **#1 key exhaustion — CONFIRMED.** 228 interactive elements, only the first
  36 get a key; the remaining 192 (hide links, comment links, story links,
  domain links, nav, etc.) are silently skipped. This is exactly the cap
  described in issue #1. Sample unkeyed: #36 "hide", #37 "5 comments",
  #39 "Twenty Years of RISC OS Open", #40 "riscosopen.org".
- **#2 invisible elements keyed — not triggered on this page.** 0 elements
  are hidden-but-keyed (HN has no display:none/visibility:hidden/opacity:0
  interactive elements among the keyed set).
- **#3 fixed/sticky badge drift — not triggered on this page.** 0 keyed
  elements are position:fixed/sticky (HN is static-positioned).

## Notes
- Vision analysis of `after-annot.png` could not be performed in this session
  (current model lacks image input). Re-run with a vision-capable model to
  cross-check placement/overlap visually. The deterministic data is sufficient
  to act on #1 here.
- HN is a clean repro for #1 only. Use the other seed URLs for #2/#3:
  - https://www.musictheory.net/lessons/10 → #3 (fixed/canvas), #2
  - https://ykumar.me/blog/eclip-autoresearch/ → #3 (fixed header)
