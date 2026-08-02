(() => {
  // Find the enabled bottom nav "next" button: _y7h actionable, not disabled.
  const candidates = Array.from(document.querySelectorAll('[role="button"]')).filter((el) => {
    const cls = el.className.toString();
    return /_y7h/.test(cls) && /actionable/.test(cls) && !/disabled/.test(cls);
  });
  function state() {
    const sel = document.querySelector('.selected');
    return { selected: sel ? sel.textContent.trim().slice(0,50) : null };
  }
  const before = state();
  const el = candidates[candidates.length - 1];
  if (!el) return JSON.stringify({err:"no candidate", before});
  const r = el.getBoundingClientRect();
  const info = { cls: el.className.toString(), rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}, before };

  // Test 1: el.click() (what the extension does)
  el.click();
  const afterClick = state();
  info.afterElClick = afterClick;

  return JSON.stringify(info, null, 1);
})();