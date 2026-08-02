(() => {
  const KS = window.__keyboardShortcuts;
  const pool = KS.getKeys() || "1234567890qwertyuiopasdfghjklzxcvbnm";
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
  // The "previous" nav button is the other enabled _y7h actionable (if any) — list all non-disabled _y7h.
  const nav = els.map((el,i) => {
    const cls = el.className.toString();
    if (/_y7h/.test(cls)) return { idx:i, key: pool[i%pool.length], disabled: /disabled/.test(cls), rect:{x:Math.round(el.getBoundingClientRect().x),y:Math.round(el.getBoundingClientRect().y)} };
    return null;
  }).filter(Boolean);
  return JSON.stringify({nav}, null, 1);
})();