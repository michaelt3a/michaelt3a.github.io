// Daily play streak. Each game calls PokeStreak.mark() when a run starts; the
// count goes up once per calendar day and resets if a day is skipped. Dates are
// local, so "today" means the player's today.
(function () {
  const KEY = "pokeworks-streak";

  function dayString(d) {
    return (
      d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }
  function today() { return dayString(new Date()); }
  function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dayString(d);
  }

  function load() {
    let s = null;
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      if (parsed && typeof parsed.count === "number") s = parsed;
    } catch (e) { /* fall through */ }
    if (!s) s = { last: null, count: 0, best: 0 };
    // Day-by-day history feeds the profile's streak calendar. It starts
    // whenever this version first runs; older days are simply unknown.
    if (!Array.isArray(s.days)) s.days = s.last ? [s.last] : [];
    return s;
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  // The stored count is stale once a day has been missed — this is what the
  // player card should show.
  function current(s) {
    if (!s.last) return 0;
    return s.last === today() || s.last === yesterday() ? s.count : 0;
  }

  function get() {
    const s = load();
    return { count: current(s), best: s.best || 0, last: s.last };
  }

  function mark() {
    const s = load();
    const t = today();
    if (s.last === t) return get(); // already counted today
    s.count = s.last === yesterday() ? (s.count || 0) + 1 : 1;
    s.last = t;
    if (s.count > (s.best || 0)) s.best = s.count;
    if (!s.days.includes(t)) {
      s.days.push(t);
      if (s.days.length > 200) s.days = s.days.slice(-200);
    }
    save(s);
    if (s.count >= 7 && window.PokeAch) PokeAch.unlock("meta-streak7");
    return get();
  }

  // Every day (YYYY-MM-DD) with at least one game played, oldest first.
  function days() { return load().days.slice(); }

  window.PokeStreak = { mark, get, days };
})();
