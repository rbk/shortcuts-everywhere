(() => {
  const candidates = Array.from(document.querySelectorAll('[role="button"]')).filter((el) => {
    const cls = el.className.toString();
    return /_y7h/.test(cls) && /actionable/.test(cls) && !/disabled/.test(cls);
  });
  const el = candidates[candidates.length - 1];
  function state() {
    const sel = document.querySelector('.selected');
    return sel ? sel.textContent.trim().slice(0,40) : null;
  }
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  const results = {};
  const before = state();

  function tryEvents(label, events) {
    // reset to first step first? No — just check if selected changes.
    const s0 = state();
    events.forEach((ev) => el.dispatchEvent(ev));
    const s1 = state();
    results[label] = { changed: s0 !== s1, before: s0, after: s1 };
  }

  // pointer events
  tryEvents("pointerdown+up", [
    new PointerEvent("pointerdown", {bubbles:true, cancelable:true, clientX:cx, clientY:cy, button:0}),
    new PointerEvent("pointerup", {bubbles:true, cancelable:true, clientX:cx, clientY:cy, button:0}),
  ]);
  // mouse events
  tryEvents("mousedown+up", [
    new MouseEvent("mousedown", {bubbles:true, cancelable:true, clientX:cx, clientY:cy, button:0}),
    new MouseEvent("mouseup", {bubbles:true, cancelable:true, clientX:cx, clientY:cy, button:0}),
    new MouseEvent("click", {bubbles:true, cancelable:true, clientX:cx, clientY:cy, button:0}),
  ]);

  return JSON.stringify({ before, results }, null, 1);
})();