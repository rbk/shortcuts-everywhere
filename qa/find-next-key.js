(() => {
  const KS = window.__keyboardShortcuts;
  if (!KS) return JSON.stringify({err: "no API"});
  if (!KS.enabled) KS.toggle();
  const pool = KS.getKeys() || KS.defaultKeys || "1234567890qwertyuiopasdfghjklzxcvbnm";
  // Rebuild the extension's interactive list to map keys -> elements.
  const sel = ['a[href]','button','input','textarea','select','[role="button"]','[role="link"]','[role="checkbox"]','[role="radio"]','[role="tab"]','[tabindex]','[onclick]'].join(',');
  const seen = new Set(); const els = [];
  document.querySelectorAll(sel).forEach((el) => {
    if (seen.has(el)) return; seen.add(el);
    if (el.disabled) return;
    const cs = getComputedStyle(el);
    if (cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0) return;
    const r = el.getBoundingClientRect();
    if (r.width===0 && r.height===0) return;
    els.push(el);
  });
  // The "Next" button: enabled _y7h actionable.
  const nextIdx = els.findIndex((el) => /_y7h/.test(el.className) && /actionable/.test(el.className) && !/disabled/.test(el.className));
  const key = pool[nextIdx % pool.length];
  const before = document.querySelector('.selected') ? document.querySelector('.selected').textContent.trim().slice(0,40) : null;
  return JSON.stringify({enabled: KS.enabled, poolLen: pool.length, total: els.length, nextIdx, nextKey: key, before}, null, 1);
})();