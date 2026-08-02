# QA run — musictheory.net (issue #2 reproduction + fix)

- URL: https://www.musictheory.net/lessons/10
- Run: 20260802-150139
- Fix under test: visibility filtering in `getInteractiveElements` (skip
  `display:none`, `visibility:hidden`, `opacity:0`) plus observing
  visibility-affecting attributes (style/class/hidden/aria-hidden) so the
  MutationObserver rescans when elements are hidden via class toggles.

## Before fix (deterministic probe)
- interactiveCount: 94, badges: 72
- **#2 hidden-but-keyed: 41** — `<div>`s with `visibility: hidden` (non-zero
  rect, so they passed the old zero-size-only check) consumed 41 of 72 keys, so
  badges floated over empty space and visible elements lost out.
- #3 fixed/sticky keyed: 0 (not the issue on this page).

## After fix
- badges: 35 (only genuinely visible elements keyed), live (on-screen) badges: 18
- **#2 hidden-but-keyed: 0**
- **#3 badge misalignment: 0** (1px tolerance)
- unmatched live badges: 0

## Vision analysis (gemma4 via `pi --model ollama-cloud/gemma4:31b`)
- Badges sit on real interactive elements (header icons v/b/n, numbered list
  items 1,2,3,5,6,7,8,9; bottom nav x,z,1).
- Minor (not blocking): badge `4` sits on a 1px-tall separator div (technically
  visible, negligible). Bottom-right badges (x,z,1) sit near the red status dot.

## Probe bugs found and fixed during this run
The probe had three flaws that produced false positives; all fixed in
`qa/probe.js`:
1. It paired `badges[i]` with its own `els[i]`, but the probe's filter
   (zero-size only) differed from the extension's (which excludes hidden) —
   orderings misaligned. Fixed by mapping each badge to its element BY POSITION
   (badge sits at the element's top-left + 2px).
2. It counted intentionally-hidden (offscreen, `display:none`) badges as
   "unmatched". Fixed by skipping badges the extension hid.
3. It flagged sub-pixel (0.5px) differences as misalignment. Fixed with a 1px
   tolerance.

## Verdict
Issue #2 is fixed on this page; #3 is not triggered here (the original suspicion
of fixed-positioning on musictheory was a misdiagnosis — the real bug was
hidden elements keyed). Minor follow-up: consider skipping negligible-area
elements (e.g. < 2px tall) to avoid the badge `4` case.
