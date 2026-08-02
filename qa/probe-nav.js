(() => {
  const pool = window.__keyboardShortcuts.getKeys() || "1234567890qwertyuiopasdfghjklzxcvbnm";
  const sel = ['a[href]','button','input','textarea','select','[role="button"]','[role="link"]','[role="checkbox"]','[role="radio"]','[role="tab"]','[tabindex]','[onclick]'].join(',');
  const seen = new Set();
  const els = [];
  document.querySelectorAll(sel).forEach((el) => {
    if (seen.has(el)) return; seen.add(el);
    if (el.disabled) return;
    const cs = getComputedStyle(el);
    if (cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0) return;
    const r = el.getBoundingClientRect();
    if (r.width===0 && r.height===0) return;
    els.push(el);
  });
  const fixedNav = els.filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (cs.position==='fixed'||cs.position==='sticky') && r.bottom > 0 && r.top < window.innerHeight;
  }).map((el) => {
    const idx = els.indexOf(el);
    const tier = Math.floor(idx / pool.length);
    const key = pool[idx % pool.length];
    const r = el.getBoundingClientRect();
    return { idx, key: tier===0 ? key : ('Shift+'+key), rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}, cls: el.className.toString().slice(0,60), tag: el.tagName };
  });
  return JSON.stringify({total: els.length, poolLen: pool.length, fixedNav}, null, 1);
})();