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

  // The starfield picks a new color each day, same for everyone: orange,
  // pink, purple, yellow, blue, then around again. The pattern is the same
  // sparkle tile as bg-pattern.svg, rebuilt inline with the day's color;
  // theme.css falls back to the teal file if this never runs.
  (function () {
    var COLORS = ["#fd9f27", "#ff6fa5", "#8f6ef0", "#ffd15a", "#4aa8ff"];
    var day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    var color = COLORS[day % COLORS.length];
    var SPARK = 'M0,-6 L1.1,-1.1 L6,0 L1.1,1.1 L0,6 L-1.1,1.1 L-6,0 L-1.1,-1.1 Z';
    var sparks = [[34, 40, 1.35], [150, 30, 0.9], [101, 72, 0.65], [60, 108, 1.15], [168, 96, 0.75], [28, 150, 0.85], [122, 138, 1.4], [174, 166, 0.6], [84, 180, 0.95]];
    var dots = [[94, 26, 1.5], [136, 96, 1.3], [46, 72, 1.2], [160, 132, 1.4], [70, 150, 1.1], [186, 56, 1.3], [112, 186, 1.2]];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><g fill="' + color + '" opacity="0.55">';
    for (var i = 0; i < sparks.length; i++) {
      svg += '<path d="' + SPARK + '" transform="translate(' + sparks[i][0] + ',' + sparks[i][1] + ') scale(' + sparks[i][2] + ')"/>';
    }
    for (var j = 0; j < dots.length; j++) {
      svg += '<circle cx="' + dots[j][0] + '" cy="' + dots[j][1] + '" r="' + dots[j][2] + '"/>';
    }
    svg += "</g></svg>";
    root.style.setProperty("--star-pattern", 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")');
  })();

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
    // A page can offer a #theme-slot (the hub puts one in the profile sheet);
    // without one the switch lands in the top-right corner tray as ever.
    var slot = document.getElementById("theme-slot");
    (slot || corner()).appendChild(btn);
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
