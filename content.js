(function () {
  "use strict";

  // Keys assigned to interactive elements, in DOM order.
  const KEY_POOL = "abcdefghijklmnopqrstuvwxyz0123456789";
  // Two "?" presses within this window toggles the feature.
  const DOUBLE_PRESS_MS = 400;
  // High z-index so badges/dot sit above page content.
  const Z = "2147483647";

  let enabled = false;
  let lastQuestionTime = 0;
  let assignments = []; // [{ key, el }]
  let overlay = null;   // fixed container holding badges
  let dot = null;       // bottom-right status dot
  let observer = null;  // MutationObserver for dynamic DOM
  let rescanTimer = null;

  // --- helpers ---------------------------------------------------------------

  function isTextField(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT") {
      const t = (el.type || "").toLowerCase();
      return [
        "text", "search", "email", "url", "tel", "password",
        "number", "date", "datetime-local", "month", "week", "time"
      ].includes(t);
    }
    return tag === "TEXTAREA" || el.isContentEditable;
  }

  const TEXT_INPUT_TYPES = new Set([
    "text", "search", "email", "url", "tel", "password",
    "number", "date", "datetime-local", "month", "week", "time"
  ]);

  function getInteractiveElements() {
    const sel = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="tab"]',
      "[tabindex]",
      "[onclick]"
    ].join(",");

    const out = [];
    const seen = new Set();
    document.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.disabled) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      out.push(el);
    });
    return out;
  }

  function activate(el) {
    const tag = el.tagName;
    if (tag === "INPUT" && TEXT_INPUT_TYPES.has((el.type || "").toLowerCase())) {
      el.focus();
    } else if (tag === "TEXTAREA" || tag === "SELECT") {
      el.focus();
    } else {
      el.click();
    }
  }

  // --- overlay + badges ------------------------------------------------------

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "__ks_overlay";
    Object.assign(overlay.style, {
      position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
      pointerEvents: "none", zIndex: Z
    });
    document.body.appendChild(overlay);
  }

  function buildDot() {
    dot = document.createElement("div");
    Object.assign(dot.style, {
      position: "fixed", bottom: "16px", right: "16px",
      width: "14px", height: "14px", borderRadius: "50%",
      background: "red", boxShadow: "0 0 6px rgba(0,0,0,0.5)",
      zIndex: Z, pointerEvents: "none"
    });
    document.body.appendChild(dot);
  }

  function clearBadges() {
    if (overlay) overlay.remove();
    overlay = null;
  }

  function renderBadges() {
    if (overlay) overlay.remove();
    buildOverlay();
    assignments = [];

    const els = getInteractiveElements();
    const n = Math.min(els.length, KEY_POOL.length);
    for (let i = 0; i < n; i++) {
      const key = KEY_POOL[i];
      assignments.push({ key, el: els[i] });

      const badge = document.createElement("div");
      badge.className = "__ks_badge";
      Object.assign(badge.style, {
        position: "fixed",
        background: "rgba(40,40,40,0.85)",
        color: "#fff",
        fontSize: "11px",
        fontFamily: "monospace",
        fontWeight: "bold",
        padding: "1px 4px",
        borderRadius: "3px",
        border: "1px solid rgba(255,255,255,0.4)",
        pointerEvents: "none",
        lineHeight: "1",
        zIndex: Z
      });
      badge.textContent = key;
      overlay.appendChild(badge);
    }
    positionBadges();
  }

  function positionBadges() {
    if (!overlay) return;
    const badges = overlay.querySelectorAll(".__ks_badge");
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    assignments.forEach(({ el }, i) => {
      const badge = badges[i];
      if (!badge) return;
      const r = el.getBoundingClientRect();
      const visible = r.left < vw && r.right > 0 && r.top < vh && r.bottom > 0;
      if (visible) {
        badge.style.left = Math.max(0, r.left + 2) + "px";
        badge.style.top = Math.max(0, r.top + 2) + "px";
        badge.style.display = "block";
      } else {
        badge.style.display = "none";
      }
    });
  }

  // --- enable / disable ------------------------------------------------------

  function enable() {
    enabled = true;
    buildDot();
    renderBadges();
    observer = new MutationObserver(debouncedRescan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", positionBadges, true);
    window.addEventListener("resize", positionBadges);
  }

  function disable() {
    enabled = false;
    clearBadges();
    if (dot) { dot.remove(); dot = null; }
    if (observer) { observer.disconnect(); observer = null; }
    window.removeEventListener("scroll", positionBadges, true);
    window.removeEventListener("resize", positionBadges);
    clearTimeout(rescanTimer);
    assignments = [];
  }

  function toggle() {
    if (enabled) disable(); else enable();
  }

  function debouncedRescan() {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => { if (enabled) renderBadges(); }, 200);
  }

  // --- key handling ----------------------------------------------------------

  document.addEventListener("keydown", function (e) {
    // Never interfere while the user is typing in a text field.
    if (isTextField(document.activeElement)) return;

    if (e.key === "?") {
      const now = Date.now();
      if (now - lastQuestionTime < DOUBLE_PRESS_MS) {
        lastQuestionTime = 0;
        toggle();
        e.preventDefault();
        return;
      }
      lastQuestionTime = now;
      return;
    }

    if (!enabled) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const k = (e.key || "").toLowerCase();
    if (k.length !== 1) return;

    const match = assignments.find((a) => a.key === k);
    if (match) {
      e.preventDefault();
      activate(match.el);
    }
  }, true);
})();