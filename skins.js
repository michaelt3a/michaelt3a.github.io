// Skins — cosmetics bought with points in the Rewards Shop. Three slots:
// bowls (Bowl Builder + Topping Drop), blades (the Poke Slice trail), and
// belts (the Bowl Rush conveyor). Purely local, like the rest of the wallet.
(function () {
  const KEY = "pokeworks-skins";

  const SKINS = [
    // Bowls: body/inner color the Topping Drop bowl; bb colors Bowl Builder's
    // ceramic; rim is the accent lip on both (null = no accent).
    { id: "classic", slot: "bowl", icon: "🥣", title: "Classic", desc: "The standard bowl.", cost: 0, body: "#ffffff", inner: "#e8eef0", bb: "#e9dcc6", rim: null },
    { id: "goldrim", slot: "bowl", icon: "🏆", title: "Gold Rim", desc: "White bowl with a gold rim.", cost: 800, body: "#ffffff", inner: "#e8eef0", bb: "#e9dcc6", rim: "#ffd15a" },
    { id: "matte", slot: "bowl", icon: "🖤", title: "Matte Black", desc: "Black bowl.", cost: 1500, body: "#2e3338", inner: "#4a525a", bb: "#2e3338", rim: null },
    { id: "sakura", slot: "bowl", icon: "🌸", title: "Sakura", desc: "Pink bowl.", cost: 1500, body: "#ffd9e2", inner: "#f2b6c5", bb: "#f7c9d4", rim: null },
    { id: "seafoam", slot: "bowl", icon: "🌊", title: "Seafoam", desc: "Teal bowl with a darker rim.", cost: 2500, body: "#cdf1e9", inner: "#9fdccf", bb: "#bfe8df", rim: "#22b2b4" },

    // Blades: the slice trail color in Poke Slice ("r,g,b").
    { id: "blade-white", slot: "blade", icon: "⚪", title: "White Blade", desc: "The standard slice trail.", cost: 0, trail: "255,255,255" },
    { id: "blade-gold", slot: "blade", icon: "✨", title: "Gold Blade", desc: "Gold slice trail.", cost: 800, trail: "255,209,90" },
    { id: "blade-teal", slot: "blade", icon: "💠", title: "Teal Blade", desc: "Teal slice trail.", cost: 800, trail: "80,214,216" },
    { id: "blade-pink", slot: "blade", icon: "💗", title: "Pink Blade", desc: "Pink slice trail.", cost: 800, trail: "255,111,165" },

    // Belts: the conveyor color in Bowl Rush.
    { id: "belt-white", slot: "belt", icon: "⬜", title: "White Belt", desc: "The standard conveyor.", cost: 0, belt: "#ffffff" },
    { id: "belt-gold", slot: "belt", icon: "🟨", title: "Gold Belt", desc: "Gold conveyor.", cost: 1000, belt: "#ffe9a8" },
    { id: "belt-teal", slot: "belt", icon: "🟦", title: "Teal Belt", desc: "Teal conveyor.", cost: 1000, belt: "#c9ecec" },
  ];

  const DEFAULTS = { bowl: "classic", blade: "blade-white", belt: "belt-white" };

  let cached = null;
  function load() {
    if (cached) return cached;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* fall through */ }
    if (!s || !Array.isArray(s.owned)) s = { owned: [], active: {} };
    // Older saves stored one active bowl id as a string.
    if (typeof s.active === "string") s.active = { bowl: s.active };
    if (!s.active || typeof s.active !== "object") s.active = {};
    for (const slot of Object.keys(DEFAULTS)) {
      if (!s.owned.includes(DEFAULTS[slot])) s.owned.push(DEFAULTS[slot]);
      if (!s.active[slot]) s.active[slot] = DEFAULTS[slot];
    }
    cached = s;
    return s;
  }
  function save(s) {
    cached = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  function byId(id) {
    return SKINS.find((k) => k.id === id);
  }

  window.PokeSkins = {
    SKINS: SKINS,
    owned: function (id) { return load().owned.includes(id); },
    // The equipped skin for a slot; no argument means the bowl, which is what
    // the older callers expect.
    active: function (slot) {
      slot = slot || "bowl";
      const s = load();
      return byId(s.active[slot]) || byId(DEFAULTS[slot]);
    },
    own: function (id) {
      const sk = byId(id);
      if (!sk) return;
      const s = load();
      if (!s.owned.includes(id)) s.owned.push(id);
      s.active[sk.slot] = id; // buying equips it right away
      save(s);
    },
    equip: function (id) {
      const sk = byId(id);
      const s = load();
      if (!sk || !s.owned.includes(id)) return false;
      s.active[sk.slot] = id;
      save(s);
      return true;
    },
  };
})();
