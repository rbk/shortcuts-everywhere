(function () {
  "use strict";

  // Default key order assigned to interactive elements (numbers row, then QWERTY letters).
  const DEFAULT_KEY_POOL = "1234567890qwertyuiopasdfghjklzxcvbnm";
  // Two "/" presses (the unshifted "?" key) within this window toggles the feature.
  const DOUBLE_PRESS_MS = 400;
  // High z-index so badges/dot sit above page content.
  const Z = "2147483647";
  // localStorage key for persisting the toggle state across reloads.
  const STORAGE_KEY = "__ks_enabled";
  // localStorage key prefix for per-origin custom key pools: "__ks_keys::<origin>".
  const KEYS_STORAGE_PREFIX = "__ks_keys::";
  // Map each pool char (a-z, 0-9) to its physical KeyboardEvent.code, so key
  // matching works whether the key comes from a real keyboard (Shift+1 -> key
  // "!") or via CDP (Shift+1 -> key "1"). Matching on e.code + Shift state is
  // layout-stable and source-stable. Assumes a US QWERTY physical layout.
  const CHAR_TO_CODE = (function () {
    const m = {};
    for (const c of "1234567890") m[c] = "Digit" + c;
    for (const c of "abcdefghijklmnopqrstuvwxyz") m[c] = "Key" + c.toUpperCase();
    return m;
  })();

  let enabled = false;
  let lastQuestionTime = 0;
  let assignments = []; // [{ key, el }]
  let overlay = null;   // fixed container holding badges
  let dot = null;       // bottom-right status dot
  let observer = null;  // MutationObserver for dynamic DOM
  let rescanTimer = null;
  let sidebar = null;     // settings sidebar element

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
      // Skip non-visible elements. Zero-size rects catch ancestor display:none and
      // zero-size elements; explicit computed-style checks catch visibility:hidden
      // (which still occupies space) and opacity:0.
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return;
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

    const pool = resolveKeyPool();
    const els = getInteractiveElements();
    assignments = [];
    // Assign keys in tiers: tier 0 = no modifier (single key), tier 1 = Shift+key.
    // Cycles the pool per tier so keys "continue" past pool.length. Capped at 2
    // tiers (72 keys) since only Shift is a safe, conflict-free modifier.
    for (let i = 0; i < els.length; i++) {
      const tier = Math.floor(i / pool.length);
      if (tier > 1) break; // beyond tier 1: no key (cap reached)
      const key = pool[i % pool.length];
      const shift = tier === 1;
      assignments.push({ key, shift, el: els[i] });

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
      badge.textContent = shift ? ("\u21e7" + key) : key;
      overlay.appendChild(badge);
    }
    positionBadges();
  }

  let posRaf = null;
  // Throttled wrapper for scroll/resize so the occlusion hit-testing in
  // positionBadges doesn't run every frame.
  function schedulePositionBadges() {
    if (posRaf) return;
    posRaf = requestAnimationFrame(() => { posRaf = null; positionBadges(); });
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
      const onScreen = r.left < vw && r.right > 0 && r.top < vh && r.bottom > 0;
      if (!onScreen) { badge.style.display = "none"; return; }
      // Occlusion check: if a different (non-descendant) element is on top at
      // the element's center (fixed header, modal, content covering a TOC), the
      // element isn't actually visible to the user — hide its badge. Our
      // overlay/badges have pointer-events:none so they don't self-occlude.
      // Re-evaluated on scroll/resize so badges reappear when the element is.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx >= 0 && cx < vw && cy >= 0 && cy < vh) {
        const stack = document.elementsFromPoint(cx, cy);
        const idx = stack.indexOf(el);
        let occluded = idx === -1;
        if (!occluded) {
          for (let j = 0; j < idx; j++) {
            if (!el.contains(stack[j])) { occluded = true; break; }
          }
        }
        if (occluded) { badge.style.display = "none"; return; }
      }
      badge.style.left = Math.max(0, r.left + 2) + "px";
      badge.style.top = Math.max(0, r.top + 2) + "px";
      badge.style.display = "block";
    });
  }

  // --- enable / disable ------------------------------------------------------

  function enable() {
    enabled = true;
    saveState(true);
    buildDot();
    renderBadges();
    observer = new MutationObserver(debouncedRescan);
    // Watch childList (added/removed nodes) AND visibility-affecting attributes
    // so toggling a class/style that hides an element triggers a rescan (otherwise
    // badges go stale on now-hidden elements). attributeFilter keeps it bounded.
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"]
    });
    window.addEventListener("scroll", schedulePositionBadges, true);
    window.addEventListener("resize", schedulePositionBadges);
  }

  function disable() {
    enabled = false;
    saveState(false);
    clearBadges();
    if (dot) { dot.remove(); dot = null; }
    if (observer) { observer.disconnect(); observer = null; }
    window.removeEventListener("scroll", schedulePositionBadges, true);
    window.removeEventListener("resize", schedulePositionBadges);
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

  // --- persistence -----------------------------------------------------------

  function saveState(on) {
    try {
      if (on) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // localStorage may be unavailable (e.g. private mode / restricted origin);
      // state simply won't persist across reloads.
    }
  }

  function loadState() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  // --- per-origin key configuration -----------------------------------------

  // Each origin (site) can have its own custom key pool stored in localStorage,
  // overriding the default order. Configure via the page console API defined in
  // main.js (MAIN world):
  //   __keyboardShortcuts.setKeys("abc...") / getKeys() / clearKeys()
  function keysStorageKey() {
    return KEYS_STORAGE_PREFIX + location.origin;
  }

  // Normalize a candidate pool: lowercase a-z + 0-9, de-duplicate, preserve order.
  function normalizePool(raw) {
    if (typeof raw !== "string") return "";
    const seen = new Set();
    let out = "";
    for (const ch of raw.toLowerCase()) {
      if (!/[a-z0-9]/.test(ch) || seen.has(ch)) continue;
      seen.add(ch);
      out += ch;
    }
    return out;
  }

  function getConfiguredPool() {
    try {
      return normalizePool(localStorage.getItem(keysStorageKey()));
    } catch (_) {
      return "";
    }
  }

  function setConfiguredPool(raw) {
    const pool = normalizePool(raw);
    try {
      if (pool) localStorage.setItem(keysStorageKey(), pool);
      else localStorage.removeItem(keysStorageKey());
    } catch (_) {
      // localStorage unavailable; config won't persist.
    }
    return pool;
  }

  function clearConfiguredPool() {
    try {
      localStorage.removeItem(keysStorageKey());
    } catch (_) {
      // localStorage unavailable.
    }
  }

  // Returns the effective pool for this origin: custom config if set, else default.
  function resolveKeyPool() {
    return getConfiguredPool() || DEFAULT_KEY_POOL;
  }

  // --- settings sidebar -----------------------------------------------------

  // Simple settings panel (fixed right). Open/close with Shift+/ ("?").
  let sidebarRefs = null; // { toggleBtn, input, status }

  function sidebarBtnStyle() {
    return {
      background: "#2a2a2a", color: "#e8e8e8", border: "1px solid #444",
      borderRadius: "4px", padding: "6px 8px", cursor: "pointer",
      fontFamily: "inherit", fontSize: "13px"
    };
  }

  function buildSidebar() {
    sidebar = document.createElement("div");
    sidebar.id = "__ks_sidebar";
    Object.assign(sidebar.style, {
      position: "fixed", top: "0", right: "0", width: "320px", height: "100%",
      boxSizing: "border-box", padding: "16px", overflowY: "auto",
      background: "#1e1e1e", color: "#e8e8e8", fontFamily: "system-ui, sans-serif",
      fontSize: "13px", lineHeight: "1.5", boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
      zIndex: Z, pointerEvents: "auto"
    });

    // Header
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: "16px"
    });
    const title = document.createElement("b");
    title.textContent = "Keyboard Shortcuts";
    const close = document.createElement("button");
    close.textContent = "×";
    close.title = "Close (Shift+/ or Esc)";
    Object.assign(close.style, sidebarBtnStyle());
    close.onclick = closeSidebar;
    header.appendChild(title);
    header.appendChild(close);
    sidebar.appendChild(header);

    // Enabled toggle
    const toggleBtn = document.createElement("button");
    Object.assign(toggleBtn.style, {
      ...sidebarBtnStyle(), display: "block", width: "100%", marginBottom: "16px"
    });
    toggleBtn.onclick = () => { toggle(); refreshSidebarState(); };
    sidebar.appendChild(toggleBtn);

    // Custom key order for this site
    const label = document.createElement("div");
    label.textContent = "Custom key order for this site";
    Object.assign(label.style, { marginBottom: "6px" });
    sidebar.appendChild(label);

    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    input.value = getConfiguredPool() || DEFAULT_KEY_POOL;
    Object.assign(input.style, {
      width: "100%", boxSizing: "border-box", background: "#2a2a2a", color: "#e8e8e8",
      border: "1px solid #444", borderRadius: "4px", padding: "6px 8px",
      fontFamily: "monospace", fontSize: "13px", marginBottom: "8px"
    });
    sidebar.appendChild(input);

    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, { display: "flex", gap: "8px", marginBottom: "8px" });

    const save = document.createElement("button");
    save.textContent = "Save";
    Object.assign(save.style, { ...sidebarBtnStyle(), flex: "1" });
    save.onclick = () => {
      const pool = setConfiguredPool(input.value);
      input.value = pool || DEFAULT_KEY_POOL;
      if (enabled) renderBadges();
      flashStatus(pool ? "Saved key order" : "Invalid — reset to default");
    };

    const reset = document.createElement("button");
    reset.textContent = "Reset";
    Object.assign(reset.style, { ...sidebarBtnStyle(), flex: "1" });
    reset.onclick = () => {
      clearConfiguredPool();
      input.value = DEFAULT_KEY_POOL;
      if (enabled) renderBadges();
      flashStatus("Reset to default");
    };

    btnRow.appendChild(save);
    btnRow.appendChild(reset);
    sidebar.appendChild(btnRow);

    const status = document.createElement("div");
    Object.assign(status.style, { minHeight: "18px", color: "#8a8", marginBottom: "16px" });
    sidebar.appendChild(status);

    // Footer hint
    const hint = document.createElement("div");
    hint.innerHTML =
      "Toggle shortcuts: press <code>/</code> twice<br>" +
      "Open/close settings: press <code>Shift + /</code><br>" +
      "Beyond 36 elements: <code>Shift + key</code> (badge <code>⇧</code>)";
    Object.assign(hint.style, { color: "#888", fontSize: "12px" });
    hint.querySelectorAll("code").forEach((c) => {
      Object.assign(c.style, { background: "#2a2a2a", padding: "0 3px", borderRadius: "3px" });
    });
    sidebar.appendChild(hint);

    document.body.appendChild(sidebar);
    sidebarRefs = { toggleBtn, input, status };
    refreshSidebarState();
  }

  function flashStatus(msg) {
    if (!sidebarRefs) return;
    sidebarRefs.status.textContent = msg;
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(() => {
      if (sidebarRefs) sidebarRefs.status.textContent = "";
    }, 2000);
  }

  function refreshSidebarState() {
    if (!sidebarRefs) return;
    sidebarRefs.toggleBtn.textContent = enabled ? "Shortcuts: ON" : "Shortcuts: OFF";
    sidebarRefs.toggleBtn.style.background = enabled ? "#1b4332" : "#3a1d1d";
  }

  function closeSidebar() {
    if (sidebar) { sidebar.remove(); sidebar = null; sidebarRefs = null; }
  }

  function toggleSidebar() {
    if (sidebar) closeSidebar();
    else if (document.body) buildSidebar();
  }

  // --- key handling ----------------------------------------------------------

  document.addEventListener("keydown", function (e) {
    // Escape closes the settings sidebar (works even while focused in its input).
    if (sidebar && e.key === "Escape") {
      e.preventDefault();
      closeSidebar();
      return;
    }

    // Never interfere while the user is typing in a text field.
    if (isTextField(document.activeElement)) return;

    // Shift + / (produces "?") opens/closes the settings sidebar.
    if (e.key === "?") {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    if (e.key === "/") {
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

    // Shift is meaningful: tier 0 = no Shift, tier 1 = Shift+key. Match by the
    // physical key code (e.code) + Shift state, not by e.key, so the digit row
    // works regardless of whether Shift+1 yields "!" (real keyboard) or "1" (CDP).
    const wantShift = !!e.shiftKey;
    const code = e.code;
    const match = assignments.find((a) => a.shift === wantShift && CHAR_TO_CODE[a.key] === code);
    if (match) {
      e.preventDefault();
      activate(match.el);
    }
  }, true);

  // --- cross-world command bridge (MAIN world -> isolated world) ------------
  // The page-callable API lives in main.js (injected with "world": "MAIN"). It
  // shares localStorage with the page and signals us here via shared-window
  // CustomEvents so we can re-render badges / toggle from the DevTools console.
  window.addEventListener("__ks-cmd-setKeys", () => { if (enabled) renderBadges(); });
  window.addEventListener("__ks-cmd-clearKeys", () => { if (enabled) renderBadges(); });
  window.addEventListener("__ks-cmd-refresh", () => { if (enabled) renderBadges(); });
  window.addEventListener("__ks-cmd-toggle", toggle);

  // --- init ------------------------------------------------------------------

  // Restore the persisted toggle state so shortcuts survive a page reload.
  if (loadState() && document.body) enable();
})();