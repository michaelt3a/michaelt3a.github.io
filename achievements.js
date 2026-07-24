// Pokeworks arcade achievements — shared across every game page and the hub.
// Games call PokeAch.unlock(id); unlocks persist in localStorage, pop a toast
// in-game, and light up on the hub's achievement wall.
(function () {
  const KEY = "pokeworks-achievements";

  // Colors used for the per-game tag dot on the wall.
  const GAME_COLOR = {
    "Bowl Builder": "#ee435b",
    "Signature Works": "#22b2b4",
    "Order Up": "#fd9f27",
    "Secret Shopper": "#7c5cff",
    "Arcade": "#ffd15a",
  };

  const DEFS = [
    // Bowl Builder
    { id: "bb-first", game: "Bowl Builder", icon: "🥣", title: "First Scoop", quip: "Every bowl begins somewhere." },
    { id: "bb-25", game: "Bowl Builder", icon: "🏗️", title: "High Roller", quip: "25 high. The air is getting thin." },
    { id: "bb-50", game: "Bowl Builder", icon: "🌃", title: "Skyscraper Chef", quip: "50 blocks. OSHA would like a word." },
    { id: "bb-combo10", game: "Bowl Builder", icon: "🎯", title: "Perfect Ten", quip: "Ten perfects straight. Surgical." },
    { id: "bb-shield", game: "Bowl Builder", icon: "🛡️", title: "Saved by the Bowl", quip: "That was entirely too close." },
    { id: "bb-power5", game: "Bowl Builder", icon: "🍚", title: "Collector", quip: "Five power-ups in one run. Greedy." },
    // Signature Works
    { id: "sw-first", game: "Signature Works", icon: "📖", title: "Memorized One", quip: "One down, eight to go." },
    { id: "sw-nohints", game: "Signature Works", icon: "🙈", title: "No Peeking", quip: "Who needs hints anyway?" },
    { id: "sw-speedrun", game: "Signature Works", icon: "⏱️", title: "Full Menu", quip: "All nine bowls. Respect." },
    { id: "sw-perfectrun", game: "Signature Works", icon: "🧠", title: "Photographic Memory", quip: "The menu fears you now." },
    // Order Up
    { id: "ou-first", game: "Order Up", icon: "🔔", title: "Open for Business", quip: "The first customer is the scariest." },
    { id: "ou-10", game: "Order Up", icon: "🌊", title: "Rush Survivor", quip: "Ten bowls in one shift. The line never stood a chance." },
    { id: "ou-hard", game: "Order Up", icon: "🤫", title: "From Memory", quip: "Five bowls, zero tickets. Show-off." },
    // Secret Shopper
    { id: "ss-first", game: "Secret Shopper", icon: "🕵️", title: "Clocked In", quip: "You survived the audit. Barely." },
    { id: "ss-pass", game: "Secret Shopper", icon: "📋", title: "Passing Grade", quip: "Corporate nods approvingly." },
    { id: "ss-noleave", game: "Secret Shopper", icon: "🚪", title: "Zero Doors Slammed", quip: "Everyone left happy. Through the door, normally." },
    { id: "ss-perfect", game: "Secret Shopper", icon: "🏅", title: "Flawless Audit", quip: "Framed and hung in the break room." },
    // Arcade-wide
    { id: "meta-all", game: "Arcade", icon: "🕹️", title: "Arcade Regular", quip: "You've tried everything on the menu." },
  ];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
  }
  function isUnlocked(id) {
    return !!load()[id];
  }

  // --- Unlock toast (styles injected so every page gets them for free) -----
  let cssDone = false;
  function ensureCss() {
    if (cssDone) return;
    cssDone = true;
    const st = document.createElement("style");
    st.textContent =
      ".pk-ach-toasts{position:fixed;top:14px;right:14px;z-index:400;display:flex;flex-direction:column;gap:10px;width:min(300px,86vw);pointer-events:none}" +
      ".pk-ach-toast{display:flex;align-items:center;gap:10px;background:#161d1d;color:#f4ede3;border-radius:12px;border:1.5px solid #ffd15a;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,.45);transform:translateX(120%);transition:transform .35s ease,opacity .3s ease}" +
      ".pk-ach-toast.show{transform:none}" +
      ".pk-ach-toast.hide{opacity:0;transform:translateX(40%)}" +
      ".pk-ach-ico{font-size:1.5rem;line-height:1}" +
      ".pk-ach-txt{min-width:0}" +
      ".pk-ach-txt em{display:block;font-style:normal;font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#ffd15a}" +
      ".pk-ach-txt strong{display:block;font-size:.92rem}" +
      ".pk-ach-txt small{display:block;font-size:.74rem;color:#b6c4c4;line-height:1.3}";
    document.head.appendChild(st);
  }
  function container() {
    let el = document.getElementById("pk-ach-toasts");
    if (!el) {
      el = document.createElement("div");
      el.id = "pk-ach-toasts";
      el.className = "pk-ach-toasts";
      document.body.appendChild(el);
    }
    return el;
  }
  function toast(def) {
    ensureCss();
    const el = document.createElement("div");
    el.className = "pk-ach-toast";
    el.innerHTML =
      `<span class="pk-ach-ico">${def.icon}</span>` +
      `<span class="pk-ach-txt"><em>Achievement unlocked</em>` +
      `<strong>${def.title}</strong><small>${def.quip}</small></span>`;
    container().appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 400);
    }, 5200);
  }

  function unlock(id) {
    const def = DEFS.find((d) => d.id === id);
    if (!def) return false;
    const map = load();
    if (map[id]) return false; // already earned
    map[id] = Date.now();
    save(map);
    toast(def);
    // Played every game? That's an achievement of its own.
    if (id !== "meta-all") {
      const m = load();
      const swDone = m["sw-first"] || m["sw-speedrun"];
      if (m["bb-first"] && m["ou-first"] && m["ss-first"] && swDone) unlock("meta-all");
    }
    return true;
  }

  // --- Hub wall -------------------------------------------------------------
  function renderWall(gridEl, countEl) {
    const map = load();
    if (countEl) {
      const n = DEFS.filter((d) => map[d.id]).length;
      countEl.textContent = `${n} / ${DEFS.length}`;
    }
    gridEl.innerHTML = "";
    for (const d of DEFS) {
      const got = !!map[d.id];
      const item = document.createElement("div");
      item.className = "ach-item" + (got ? " unlocked" : " locked");
      item.innerHTML =
        `<span class="ach-ico">${got ? d.icon : "🔒"}</span>` +
        `<span class="ach-txt"><strong>${d.title}</strong><small>${d.quip}</small>` +
        `<i class="ach-game" style="--g:${GAME_COLOR[d.game]}">${d.game}</i></span>`;
      gridEl.appendChild(item);
    }
  }

  window.PokeAch = { DEFS, unlock, isUnlocked, renderWall };
})();
