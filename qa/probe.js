// qa/probe.js — run via `agent-browser eval "$(cat qa/probe.js)"` after enabling
// shortcuts. Runs in the page main world. Maps each badge to its target element
// BY POSITION (badges sit at the element's top-left + 2px), so detection of
// "badge on a hidden element" (#2) and "badge drift on fixed/sticky" (#3) is
// correct regardless of how the extension filters its element list.
(function () {
  const sel = [
    "a[href]", "button", "input", "textarea", "select",
    '[role="button"]', '[role="link"]', '[role="checkbox"]',
    '[role="radio"]', '[role="tab"]', "[tabindex]", "[onclick]"
  ].join(",");

  // Universe of interactive elements — NOT filtered by visibility, so we can
  // detect badges that land on hidden ones.
  const all = [];
  const seen = new Set();
  document.querySelectorAll(sel).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (el.disabled) return;
    const r0 = el.getBoundingClientRect();
    if (r0.width === 0 && r0.height === 0) return;
    all.push(el);
  });

  const badges = Array.from(document.querySelectorAll("#__ks_overlay .__ks_badge"));
  // Skip badges the extension intentionally hid (offscreen elements) — their
  // rect is 0,0 and would produce false "unmatched"/"misaligned" results.
  const liveBadges = badges.filter((b) => b.style.display !== "none");

  function rect(r) {
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }

  // Map each badge to the interactive element whose top-left corner the badge
  // sits on (extension places badges at max(0, r.left+2), max(0, r.top+2)).
  function findTarget(bx, by) {
    let best = null, bestD = Infinity;
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const tx = Math.max(0, r.left + 2), ty = Math.max(0, r.top + 2);
      const d = Math.abs(tx - bx) + Math.abs(ty - by);
      if (d < bestD) { bestD = d; best = el; }
    }
    return bestD <= 6 ? best : null; // tolerance 6px
  }

  const byEl = new Map(); // el -> { key, badgeRect }
  liveBadges.forEach((b) => {
    const br = b.getBoundingClientRect();
    const bx = Math.round(br.x), by = Math.round(br.y);
    const el = findTarget(bx, by);
    if (el) byEl.set(el, { key: b.textContent, badgeRect: { x: bx, y: by } });
  });

  const items = all.map((el, i) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const b = byEl.get(el) || null;
    const hidden =
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      parseFloat(cs.opacity) === 0 ||
      (r.width === 0 && r.height === 0);
    const offscreen = r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth;
    return {
      idx: i,
      key: b ? b.key : null,
      hasKey: !!b,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      role: el.getAttribute("role") || null,
      text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 40),
      rect: rect(r),
      position: cs.position,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      hidden,
      offscreen,
      badgeRect: b ? b.badgeRect : null,
      badgeAligned: b ? (Math.abs(b.badgeRect.x - Math.max(0, r.left + 2)) <= 1 && Math.abs(b.badgeRect.y - Math.max(0, r.top + 2)) <= 1) : null
    };
  });

  const keyed = items.filter((i) => i.hasKey);
  const api = window.__keyboardShortcuts || {};
  let effPool = api.defaultKeys || "1234567890qwertyuiopasdfghjklzxcvbnm";
  try { const c = api.getKeys && api.getKeys(); if (c) effPool = c; } catch (_) {}

  return JSON.stringify({
    url: location.href,
    interactiveCount: all.length,
    badgeCount: badges.length,
    liveBadgeCount: liveBadges.length,
    poolLength: effPool.length,
    pool: effPool,
    unmatchedBadges: liveBadges.length - keyed.length,
    items
  }, null, 2);
})()