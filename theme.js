// Light/dark theme for the whole arcade. Loaded in <head> on every page so the
// theme lands before first paint (no flash), then drops a simple slide switch
// into the top-right corner once the body exists: red side is light mode,
// green side is dark, and the knob sits on whichever is active.
(function () {
  var KEY = "pokeworks-theme";
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember(t) {
    try { localStorage.setItem(KEY, t); } catch (e) { /* ignore */ }
  }
  // Saved choice wins; otherwise follow the OS, defaulting to the original dark look.
  function initial() {
    var s = stored();
    if (s === "light" || s === "dark") return s;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function apply(t) {
    root.setAttribute("data-theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "light" ? "#f3efe6" : "#0a1010");
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-label", "Switch to " + (t === "light" ? "dark" : "light") + " mode");
      btn.setAttribute("aria-checked", String(t === "dark"));
    }
  }

  apply(initial()); // before paint

  function corner() {
    var c = document.getElementById("pk-corner");
    if (!c) {
      c = document.createElement("div");
      c.id = "pk-corner";
      c.className = "pk-corner";
      document.body.appendChild(c);
    }
    return c;
  }

  function mount() {
    if (document.getElementById("theme-toggle")) return;
    var btn = document.createElement("button");
    btn.id = "theme-toggle";
    btn.className = "theme-switch";
    btn.type = "button";
    btn.setAttribute("role", "switch");
    btn.innerHTML = '<span class="ts-knob"></span>';
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      remember(next);
      apply(next);
    });
    corner().appendChild(btn);
    apply(root.getAttribute("data-theme")); // label the freshly-made button
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  // Follow the OS if the player has never picked a side themselves.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onChange = function (e) { if (!stored()) apply(e.matches ? "light" : "dark"); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
