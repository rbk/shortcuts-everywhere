// Main-world API for per-origin key configuration.
// Runs in the page's MAIN world (see manifest "world": "MAIN") so it is callable
// from the DevTools console. It shares localStorage with the page, and signals the
// isolated content script via shared-window CustomEvents to re-render / toggle.

(function () {
  "use strict";

  const DEFAULT_KEY_POOL = "1234567890qwertyuiopasdfghjklzxcvbnm";
  const STORAGE_KEY = "__ks_enabled";
  const KEYS_PREFIX = "__ks_keys::";
  // Command event types dispatched to the isolated content script.
  const CMD_SET = "__ks-cmd-setKeys";
  const CMD_CLEAR = "__ks-cmd-clearKeys";
  const CMD_REFRESH = "__ks-cmd-refresh";
  const CMD_TOGGLE = "__ks-cmd-toggle";

  function keysKey() {
    return KEYS_PREFIX + location.origin;
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

  function fire(type) {
    window.dispatchEvent(new CustomEvent(type));
  }

  function getKeys() {
    try {
      return normalizePool(localStorage.getItem(keysKey()));
    } catch (_) {
      return "";
    }
  }

  Object.defineProperty(window, "__keyboardShortcuts", {
    value: {
      // Persist a custom key order for this site and re-render badges.
      setKeys(raw) {
        const pool = normalizePool(raw);
        try {
          if (pool) localStorage.setItem(keysKey(), pool);
          else localStorage.removeItem(keysKey());
        } catch (_) {
          // localStorage unavailable; config won't persist.
        }
        fire(CMD_SET);
        return pool;
      },
      // Read the custom order for this site ("" = using default).
      getKeys() {
        return getKeys();
      },
      // Remove the custom order and fall back to the default.
      clearKeys() {
        try {
          localStorage.removeItem(keysKey());
        } catch (_) {
          // localStorage unavailable.
        }
        fire(CMD_CLEAR);
      },
      // Force re-render of badges with the current pool.
      refresh() {
        fire(CMD_REFRESH);
      },
      // Toggle shortcuts on/off (persisted by the content script).
      toggle() {
        fire(CMD_TOGGLE);
      },
      get enabled() {
        try {
          return localStorage.getItem(STORAGE_KEY) === "1";
        } catch (_) {
          return false;
        }
      },
      get defaultKeys() {
        return DEFAULT_KEY_POOL;
      }
    },
    writable: false,
    configurable: true,
    enumerable: false
  });
})();
