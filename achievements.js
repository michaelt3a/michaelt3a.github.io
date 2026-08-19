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

  // `how` is the literal requirement — what you have to do to earn it.
  const DEFS = [
    // Bowl Builder
    { id: "bb-first", game: "Bowl Builder", icon: "🥣", title: "First Scoop", how: "Stack 1 block." },
    { id: "bb-25", game: "Bowl Builder", icon: "🏗️", title: "High Roller", how: "Stack 25 blocks in one run." },
    { id: "bb-50", game: "Bowl Builder", icon: "🌃", title: "Skyscraper Chef", how: "Stack 50 blocks in one run." },
    { id: "bb-combo10", game: "Bowl Builder", icon: "🎯", title: "Perfect Ten", how: "Land 10 perfect drops in a row." },
    { id: "bb-shield", game: "Bowl Builder", icon: "🛡️", title: "Saved by the Bowl", how: "Survive a miss with the Shield power-up." },
    { id: "bb-power5", game: "Bowl Builder", icon: "🍚", title: "Collector", how: "Collect 5 power-ups in one run." },
    { id: "bb-golden", game: "Bowl Builder", icon: "🐚", title: "Golden Catch", how: "Catch the golden scallop." },
    // Signature Works
    { id: "sw-first", game: "Signature Works", icon: "📖", title: "Memorized One", how: "Build 1 signature bowl correctly." },
    { id: "sw-nohints", game: "Signature Works", icon: "🙈", title: "No Peeking", how: "Build a signature bowl using 0 hints." },
    { id: "sw-speedrun", game: "Signature Works", icon: "⏱️", title: "Full Menu", how: "Finish a Speedrun of all 9 bowls." },
    { id: "sw-perfectrun", game: "Signature Works", icon: "🧠", title: "Photographic Memory", how: "Finish a Speedrun with all 9 bowls perfect." },
    // Order Up
    { id: "ou-first", game: "Order Up", icon: "🔔", title: "Open for Business", how: "Serve 1 customer." },
    { id: "ou-10", game: "Order Up", icon: "🌊", title: "Rush Survivor", how: "Serve 10 customers in one shift." },
    { id: "ou-hard", game: "Order Up", icon: "🤫", title: "From Memory", how: "Serve 5 customers in Hidden Recipes mode." },
    { id: "ou-upgrade", game: "Order Up", icon: "🛠️", title: "Reinvested", how: "Buy your first restaurant upgrade." },
    { id: "ou-vip", game: "Order Up", icon: "💎", title: "High Roller Service", how: "Serve a VIP customer a perfect bowl." },
    { id: "ou-5star", game: "Order Up", icon: "🌟", title: "Five-Star Kitchen", how: "Reach a 4.8★ rating with 10+ reviews." },
    { id: "ou-critic", game: "Order Up", icon: "🎩", title: "Critic's Choice", how: "Earn a 5-star review from the food critic." },
    { id: "ou-franchise", game: "Order Up", icon: "🏪", title: "Chain Reaction", how: "Open your first franchise." },
    { id: "ou-golden", game: "Order Up", icon: "✨", title: "Golden Service", how: "Serve the golden guest a perfect bowl." },
    // Word Bowl
    { id: "wb-first", game: "Word Bowl", icon: "🥢", title: "Word Up", how: "Solve a Word Bowl." },
    { id: "wb-hard", game: "Word Bowl", icon: "🧠", title: "No Training Wheels", how: "Solve a Word Bowl with hard mode on." },

    { id: "td-combo20", game: "Topping Drop", icon: "🧲", title: "Bowl Magnet", how: "Catch 20 toppings in a row without a drop." },
    { id: "iq-perfect", game: "Poke IQ", icon: "💯", title: "Perfect Round", how: "Get all 10 questions right in one round." },
    { id: "iq-streak10", game: "Poke IQ", icon: "🧠", title: "Menu Master", how: "Get 10 questions right in a row." },
    { id: "ps-stroke5", game: "Poke Slice", icon: "🔪", title: "One Clean Cut", how: "Slice 5 pieces in a single stroke." },
    // Secret Shopper
    { id: "ss-first", game: "Secret Shopper", icon: "🕵️", title: "Clocked In", how: "Finish a shift." },
    { id: "ss-pass", game: "Secret Shopper", icon: "📋", title: "Passing Grade", how: "Finish a shift with a score of 80% or higher." },
    { id: "ss-noleave", game: "Secret Shopper", icon: "🚪", title: "Zero Doors Slammed", how: "Finish a shift without any guest leaving early." },
    { id: "ss-perfect", game: "Secret Shopper", icon: "🏅", title: "Flawless Audit", how: "Finish a shift with a score of 100%." },
    { id: "ss-promoted", game: "Secret Shopper", icon: "🎖️", title: "Moving Up", how: "Pass a promotion exam." },
    { id: "ss-exam100", game: "Secret Shopper", icon: "💯", title: "Aced the Exam", how: "Score 100% on a promotion exam." },
    { id: "ss-manager", game: "Secret Shopper", icon: "🏬", title: "Store Manager", how: "Climb the career ladder to Store Manager." },
    { id: "ss-legend", game: "Secret Shopper", icon: "👑", title: "District Legend", how: "Reach the top of the career ladder." },
    // Arcade-wide
    { id: "meta-all", game: "Arcade", icon: "🕹️", title: "Arcade Regular", how: "Play all 5 games at least once." },
    { id: "meta-streak7", game: "Arcade", icon: "🔥", title: "Seven Straight", how: "Play on 7 days in a row." },
    { id: "duel-win", game: "Arcade", icon: "🥊", title: "Duelist", how: "Win a live duel." },
    { id: "duel-series", game: "Arcade", icon: "🏆", title: "Best of Three", how: "Take a duel series, first to 2 wins." },
    { id: "meta-sweep", game: "Arcade", icon: "🧹", title: "Clean Sweep", how: "Finish all 5 of one game's challenges in a single day." },
    // One badge per hub section: prove yourself in both of its games.
    { id: "meta-customer", game: "Arcade", icon: "😋", title: "Crowd Pleaser", how: "Stack 25 blocks in Bowl Builder and reach a 4.8★ rating in Order Up." },
    { id: "meta-training", game: "Arcade", icon: "🎓", title: "Certified", how: "Finish a Signature Works speedrun and pass a Secret Shopper shift at 80%+." },
    { id: "meta-insured", game: "Arcade", icon: "🛟", title: "Better Safe", how: "Buy streak insurance in the shop." },
    { id: "meta-podium", game: "Arcade", icon: "🏆", title: "On the Podium", how: "Finish a month in a customer game's top 3." },
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
    // Top-LEFT, sliding in from the left — review toasts (Order Up, Secret
    // Shopper) own the top-right corner, so the two stacks never overlap.
    st.textContent =
      ".pk-ach-toasts{position:fixed;top:14px;left:14px;z-index:400;display:flex;flex-direction:column;gap:10px;width:min(300px,86vw);pointer-events:none}" +
      ".pk-ach-toast{display:flex;align-items:center;gap:10px;background:var(--surface,#161d1d);color:var(--on-dark,#f4ede3);border-radius:12px;border:1.5px solid var(--gold,#ffd15a);padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,.45);transform:translateX(-120%);transition:transform .35s ease,opacity .3s ease}" +
      ".pk-ach-toast.show{transform:none}" +
      ".pk-ach-toast.hide{opacity:0;transform:translateX(-40%)}" +
      ".pk-ach-ico{font-size:1.5rem;line-height:1}" +
      ".pk-ach-txt{min-width:0}" +
      ".pk-ach-txt em{display:block;font-style:normal;font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold,#ffd15a)}" +
      ".pk-ach-txt strong{display:block;font-size:.92rem}" +
      ".pk-ach-txt small{display:block;font-size:.74rem;color:var(--on-dark-muted,#b6c4c4);line-height:1.3}";
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
      `<strong>${def.title}</strong><small>${def.how}</small></span>`;
    container().appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 400);
    }, 5200);
  }

  // Cross-game combos re-check after every unlock (each combo unlocks once —
  // unlock() bails early on anything already earned).
  function checkMetas() {
    const m = load();
    const swDone = m["sw-first"] || m["sw-speedrun"];
    if (m["bb-first"] && m["ou-first"] && m["ss-first"] && swDone && m["wb-first"]) unlock("meta-all");
    if (m["bb-25"] && m["ou-5star"]) unlock("meta-customer");
    if (m["sw-speedrun"] && m["ss-pass"]) unlock("meta-training");
  }

  function unlock(id) {
    const def = DEFS.find((d) => d.id === id);
    if (!def) return false;
    const map = load();
    if (map[id]) return false; // already earned
    map[id] = Date.now();
    save(map);
    toast(def);
    if (!id.startsWith("meta-")) checkMetas();
    return true;
  }

  // --- Hub wall -------------------------------------------------------------
  // Progress readouts for locked badges, where a lifetime best already
  // exists in localStorage. [current, goal]; missing entries show nothing.
  function lsNum(k) {
    try { return parseInt(localStorage.getItem(k), 10) || 0; } catch (e) { return 0; }
  }
  const PROGRESS = {
    "bb-25": () => [lsNum("pokeworks-high-score"), 25],
    "bb-50": () => [lsNum("pokeworks-high-score"), 50],
    "td-combo20": () => [lsNum("pokeworks-topping-combo-best"), 20],
    "iq-streak10": () => [lsNum("pokeworks-iq-streak-best"), 10],
    "ps-stroke5": () => [lsNum("pokeworks-slice-stroke-best"), 5],
    "meta-streak7": () => {
      const s = window.PokeStreak ? PokeStreak.get() : { best: 0 };
      return [s.best || 0, 7];
    },
  };

  function renderWall(gridEl, countEl) {
    const map = load();
    if (countEl) {
      const n = DEFS.filter((d) => map[d.id]).length;
      countEl.textContent = `${n} / ${DEFS.length}`;
    }
    gridEl.innerHTML = "";
    for (const d of DEFS) {
      const got = !!map[d.id];
      let prog = "";
      if (!got && PROGRESS[d.id]) {
        const [cur, goal] = PROGRESS[d.id]();
        if (cur > 0) prog = `<em class="ach-prog">${Math.min(cur, goal)}/${goal}</em>`;
      }
      const item = document.createElement("div");
      item.className = "ach-item" + (got ? " unlocked" : " locked");
      item.innerHTML =
        `<span class="ach-ico">${got ? d.icon : "🔒"}</span>` +
        `<span class="ach-txt"><strong>${d.title}</strong><small>${d.how}</small>${prog}` +
        `<i class="ach-game" style="--g:${GAME_COLOR[d.game]}">${d.game}</i></span>`;
      gridEl.appendChild(item);
    }
  }

  // Players who qualified before a combo badge existed get it on the next
  // page load rather than having to unlock something new first.
  checkMetas();

  window.PokeAch = { DEFS, unlock, isUnlocked, renderWall };
})();
