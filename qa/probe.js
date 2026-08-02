// qa/probe.js — run via `agent-browser eval "$(cat qa/probe.js)"` after enabling
// shortcuts. Runs in the page main world. Returns JSON describing every
// interactive element the extension would key, plus its badge (if any), so the
// agent can verify badge placement and detect the known issues:
//   #1 key exhaustion, #2 invisible elements keyed, #3 fixed/sticky drift.
(function () {
  const sel = [
    "a[href]", "button", "input", "textarea", "select",
    '[role="button"]', '[role="link"]', '[role="checkbox"]',
    '[role="radio"]', '[role="tab"]', "[tabindex]", "[onclick]"
  ].join(",");

  const els = [];
  const seen = new Set();
  document.querySelectorAll(sel).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (el.disabled) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    els.push(el);
  });

  const badges = Array.from(document.querySelectorAll("#__ks_overlay .__ks_badge"));
  const api = window.__keyboardShortcuts || {};
  let effPool = api.defaultKeys || "1234567890qwertyuiopasdfghjklzxcvbnm";
  try { const c = api.getKeys && api.getKeys(); if (c) effPool = c; } catch (_) {}

  function rect(r) {
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }

  const items = els.map((el, i) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const badge = badges[i];
    const br = badge ? badge.getBoundingClientRect() : null;
    const hidden =
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      parseFloat(cs.opacity) === 0 ||
      (r.width === 0 && r.height === 0);
    const offscreen = r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth;
    return {
      idx: i,
      key: badge ? badge.textContent : null,
      hasKey: !!badge,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      role: el.getAttribute("role") || null,
      text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 40),
      rect: rect(r),
      position: cs.position,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      offsetParent: !!el.offsetParent,
      hidden,
      offscreen,
      badgeRect: br ? { x: Math.round(br.x), y: Math.round(br.y) } : null
    };
  });

  return JSON.stringify({
    url: location.href,
    interactiveCount: els.length,
    badgeCount: badges.length,
    poolLength: effPool.length,
    pool: effPool,
    items
  }, null, 2);
})()