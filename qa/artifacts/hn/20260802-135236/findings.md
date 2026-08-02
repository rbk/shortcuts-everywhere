# QA run — Hacker News (post-fix verification)

- URL: https://news.ycombinator.com/news
- Run: 20260802-135236
- Fix under test: Shift-prefixed second tier for issue #1 (key exhaustion).
  Elements 1-36 = single key (tier 0); 37-72 = Shift+key (tier 1, badge "⇧<key>").
- Matching uses `e.code` + Shift state (not `e.key`) so the digit row works
  whether the key comes from a real keyboard (Shift+1 → key "!") or CDP (Shift+1
  → key "1"). Assumes US QWERTY physical layout.

## Artifacts
- `after.png` / `after-annot.png` — viewport screenshots, shortcuts enabled
- `dom.json` — structured probe (228 interactive elements)

## Results
- interactiveCount: 228
- badges: 72 (was 36 before the fix) — 36 plain + 36 "⇧"
- unkeyed (cap 72): 156 — full coverage needs a sequence scheme (follow-up)

## Activation E2E (capture-phase click recorder, preventDefault)
| Press      | Expected           | Recorded hit        | ✓ |
|------------|--------------------|---------------------|---|
| 1          | idx 0 (logo link)  | news.ycombinator.com | ✓ |
| Shift+1    | idx 36 "hide"      | "hide"               | ✓ |
| Shift+a    | idx 56 "1 hour ago"| "1 hour ago"         | ✓ |

All three tiers/keys activate the correct element. The digit row works via
code-based matching (the original `e.key` approach failed for Shift+digits).

## Issue mapping
- **#1 key exhaustion — FIXED (incremental).** Coverage extended 36 → 72 via a
  Shift+key second tier. Remaining 156 unkeyed on HN require a scalable
  sequence scheme (deferred; see issue #1 open questions).
- **#2 / #3 — not triggered on HN** (no hidden-keyed, no fixed/sticky).

## Key event note
`agent-browser press "Shift+1"` sends `{key:"1", code:"Digit1", shift:true}`
(CDP), whereas a physical keyboard sends `{key:"!", code:"Digit1", shift:true}`.
Matching on `e.code` + Shift handles both. This is why the earlier `e.key`-
based attempt failed in automation and would also have been unreliable for
real Shift+digit presses.
