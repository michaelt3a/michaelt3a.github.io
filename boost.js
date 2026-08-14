// Double-points windows, driven by the 'boost' row in arcade_config so a
// boost weekend can be switched on from the Supabase table editor without a
// deploy. The row is cached locally and refreshed at most every half hour;
// points.js multiplies earns through PokeBoost while a window is active.
//
// Dates are inclusive and interpreted in the player's local time, so "the
// weekend" means their weekend.
(function () {
  const KEY = "pokeworks-config";
  const REFRESH_MS = 30 * 60 * 1000;
  const SB = window.POKEWORKS_SUPABASE || {};
  const ok = !!SB.url && !!SB.anonKey && !/YOUR_/.test(SB.url) && !/YOUR_/.test(SB.anonKey);

  function cache() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function store(c) {
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* ignore */ }
  }

  const readyCbs = [];
  let ready = false;
  function refresh() {
    const c = cache();
    if (!ok || (c.t && Date.now() - c.t < REFRESH_MS)) { fireReady(); return; }
    fetch(SB.url + "/rest/v1/arcade_config?select=value&key=eq.boost", {
      headers: { apikey: SB.anonKey, Authorization: "Bearer " + SB.anonKey },
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        store({ t: Date.now(), boost: rows[0] ? rows[0].value : null });
        fireReady();
      })
      .catch(fireReady);
  }
  function fireReady() {
    ready = true;
    while (readyCbs.length) { try { readyCbs.shift()(); } catch (e) { /* ignore */ } }
  }

  function boost() {
    const b = cache().boost;
    if (!b || !b.from || !b.to) return null;
    const now = Date.now();
    const from = Date.parse(b.from + "T00:00:00");
    const to = Date.parse(b.to + "T23:59:59");
    if (isNaN(from) || isNaN(to) || now < from || now > to) return null;
    return { mult: Math.max(1, Number(b.mult) || 2), label: String(b.label || "Bonus points!") };
  }

  window.PokeBoost = {
    active: function () { return !!boost(); },
    mult: function () { const b = boost(); return b ? b.mult : 1; },
    label: function () { const b = boost(); return b ? b.label : ""; },
    // Runs cb once the cached config is as fresh as it's going to get
    // (immediately, if that already happened).
    onReady: function (cb) {
      if (ready) { try { cb(); } catch (e) { /* ignore */ } }
      else readyCbs.push(cb);
    },
  };
  refresh();
})();
