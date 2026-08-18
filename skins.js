// Bowl skins — cosmetic bowls bought with points in the Rewards Shop. The
// equipped skin recolors the bowl in Bowl Builder and Topping Drop. Purely
// local (localStorage), like the rest of the wallet.
(function () {
  const KEY = "pokeworks-skins";

  // body/inner color the Topping Drop bowl; bb colors Bowl Builder's ceramic;
  // rim is the accent lip on both (null = no accent).
  const SKINS = [
    { id: "classic", icon: "🥣", title: "Classic", desc: "The house bowl.", cost: 0, body: "#ffffff", inner: "#e8eef0", bb: "#e9dcc6", rim: null },
    { id: "goldrim", icon: "🏆", title: "Gold Rim", desc: "A little shine on the lip.", cost: 800, body: "#ffffff", inner: "#e8eef0", bb: "#e9dcc6", rim: "#ffd15a" },
    { id: "matte", icon: "🖤", title: "Matte Black", desc: "For serious stackers.", cost: 1500, body: "#2e3338", inner: "#4a525a", bb: "#2e3338", rim: null },
    { id: "sakura", icon: "🌸", title: "Sakura", desc: "Soft pink, big spring energy.", cost: 1500, body: "#ffd9e2", inner: "#f2b6c5", bb: "#f7c9d4", rim: null },
    { id: "seafoam", icon: "🌊", title: "Seafoam", desc: "Beach day, every day.", cost: 2500, body: "#cdf1e9", inner: "#9fdccf", bb: "#bfe8df", rim: "#22b2b4" },
  ];

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.owned)) return s;
    } catch (e) { /* fall through */ }
    return { owned: ["classic"], active: "classic" };
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  function byId(id) {
    return SKINS.find((k) => k.id === id) || SKINS[0];
  }

  window.PokeSkins = {
    SKINS: SKINS,
    owned: function (id) { return load().owned.includes(id); },
    active: function () { return byId(load().active); },
    own: function (id) {
      const s = load();
      if (!s.owned.includes(id)) s.owned.push(id);
      s.active = id; // buying equips it right away
      save(s);
    },
    equip: function (id) {
      const s = load();
      if (!s.owned.includes(id)) return false;
      s.active = id;
      save(s);
      return true;
    },
  };
})();
