# QA run — ykumar.me (issue #3 reframed: occlusion)

- URL: https://ykumar.me/blog/eclip-autoresearch/
- Run: 20260802-162313
- Mode: headless (agent-browser without --headed)

## Reframe
The original #3 (fixed/sticky badge drift) was never reproduced on any seed
URL. The real issue the user reported — "shortcuts are displayed on the page,
but the element is not visible" — is **occlusion**: an element that's on-screen
but covered by something on top (fixed header, modal, content over a TOC). Our
visibility filter (display/visibility/opacity/zero-size) passes these, and
badges render at max z-index *above* the coverer, so a badge floats over the
covering content while the element is hidden behind it.

## Repro (headless, before fix)
- 18 live badges; **8 occluded** (element not in elementsFromPoint stack at its
  center): a `×` button behind `div.top-nav`, and 7 TOC links (`#core-idea`,
  `#dataset`, …) fully covered by the article content.
- Occlusion is **scroll-dependent**: 7 always-occluded at both scroll 0 and
  1200; a few change with scroll.

## Fix (content.js — positionBadges)
- A badge is hidden (display:none) if its element is occluded at the element's
  center: `document.elementsFromPoint(cx, cy)` returns a stack where the
  element is absent (fully covered) or has a non-descendant above it.
- Re-evaluated on scroll/resize via an rAF-throttled `schedulePositionBadges`
  wrapper (the scroll/resize listeners now point at it) so badges reappear when
  the element becomes visible and hide when occluded.
- Keys stay **assigned** (stable); only the badge display is suppressed. So
  e.g. the TOC anchor-link shortcuts still jump to their section — they just no
  longer show a badge while the link is covered. Our overlay/badges use
  pointer-events:none so they don't self-occlude.

## Verification (headless)
- scroll 0:   18 live (8 occluded) → **9 live, 0 occluded**
- scroll 1200: → **2 live, 0 occluded**
- No live badge sits on an occluded element; occlusion re-evaluates on scroll.

## Notes
- gemma4 vision was unavailable this run (model unresponsive >200s, 0 bytes);
  the deterministic elementsFromPoint check is conclusive here.
- Partially-covered (a non-descendant above the element in the stack) is also
  treated as occluded — conservative; could be refined if it over-hides.
