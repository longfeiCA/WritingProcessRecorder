(function initTheme(global) {
  "use strict";

  var STORAGE_KEY = "wpr:theme";
  var WINDOW_NAME_KEY = "theme";
  var toggleBtn = document.getElementById("themeToggle");
  var themeLabel = document.getElementById("themeLabel");
  var root = document.documentElement;
  var currentTheme = "light";
  var mediaQuery = global.matchMedia ? global.matchMedia("(prefers-color-scheme: dark)") : null;
  var hasStoredPreference = false;

  function isValidTheme(value) {
    return value === "light" || value === "dark";
  }

  function getStoredTheme() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      if (isValidTheme(value)) {
        hasStoredPreference = true;
        return value;
      }
    } catch (err) {
      return "";
    }
    return "";
  }

  function getThemeFromQuery() {
    var params = new URLSearchParams(global.location.search);
    var value = params.get("theme");
    return isValidTheme(value) ? value : "";
  }

  function getThemeFromWindowName() {
    if (!global.name) {
      return "";
    }

    try {
      var parsed = JSON.parse(global.name);
      if (parsed && isValidTheme(parsed[WINDOW_NAME_KEY])) {
        return parsed[WINDOW_NAME_KEY];
      }
    } catch (err) {
      return "";
    }

    return "";
  }

  function getSystemTheme() {
    if (mediaQuery && mediaQuery.matches) {
      return "dark";
    }
    return "light";
  }

  function persistTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
    }

    try {
      var payload = {};
      if (global.name) {
        try {
          var parsed = JSON.parse(global.name);
          if (parsed && typeof parsed === "object") {
            payload = parsed;
          }
        } catch (err) {
          payload = {};
        }
      }
      payload[WINDOW_NAME_KEY] = theme;
      global.name = JSON.stringify(payload);
    } catch (err) {
    }
  }

  function applyTheme(theme, shouldPersist) {
    if (!isValidTheme(theme)) {
      return;
    }

    currentTheme = theme;
    root.setAttribute("data-theme", theme);

    if (themeLabel) {
      themeLabel.textContent = theme === "dark" ? "Dark" : "Light";
    }

    if (toggleBtn) {
      var isDark = theme === "dark";
      toggleBtn.setAttribute("aria-pressed", String(isDark));
      toggleBtn.title = isDark ? "Switch to light theme" : "Switch to dark theme";
    }

    if (shouldPersist) {
      hasStoredPreference = true;
      persistTheme(theme);
    }
  }

  function toggleTheme() {
    var nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme, true);
  }

  function onStorageChange(event) {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    if (isValidTheme(event.newValue)) {
      hasStoredPreference = true;
      applyTheme(event.newValue, false);
      return;
    }

    hasStoredPreference = false;
    applyTheme(getSystemTheme(), false);
  }

  function onSystemThemeChange() {
    if (hasStoredPreference) {
      return;
    }
    applyTheme(getSystemTheme(), false);
  }

  function setup() {
    var queryTheme = getThemeFromQuery();
    var storedTheme = getStoredTheme();
    var windowNameTheme = getThemeFromWindowName();
    var initialTheme = queryTheme || storedTheme || windowNameTheme || getSystemTheme();

    if (queryTheme) {
      hasStoredPreference = true;
      persistTheme(queryTheme);
    }

    applyTheme(initialTheme, false);

    if (toggleBtn) {
      toggleBtn.addEventListener("click", toggleTheme);
    }

    global.addEventListener("storage", onStorageChange);

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", onSystemThemeChange);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(onSystemThemeChange);
      }
    }

    global.WPRTheme = {
      getCurrentTheme: function getCurrentTheme() {
        return currentTheme;
      }
    };
  }

  setup();
})(window);
