// Pokeworks Points — the arcade's reward currency, spent in the Rewards Shop.
//
// Points come ONLY from the customer games (Bowl Builder and Order Up):
// daily-refreshing challenges, finishing a customer-game Daily Challenge, and
// topping yesterday's daily board. Training games build skills, not points —
// codes are for loyal customers, so the taps stay deliberately small.
//
// Everything lives per-browser in localStorage. window.PokePoints is the only
// API; challenges.js and the shop are the only writers.
(function () {
  const KEY = "pokeworks-points";

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s.balance === "number") return s;
    } catch (e) { /* fall through */ }
    return { balance: 0, earned: 0, history: [], redeemed: [] };
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  const listeners = [];
  function notify() {
    const s = load();
    for (const fn of listeners) { try { fn(s); } catch (e) { /* one bad listener shouldn't stop the rest */ } }
  }

  // Earn `amt` points. `why` is a short human label kept in the history.
  function add(amt, why) {
    amt = Math.max(0, Math.round(amt));
    if (!amt) return;
    const s = load();
    s.balance += amt;
    s.earned += amt;
    s.history.unshift({ t: Date.now(), amt: amt, why: String(why || "") });
    s.history = s.history.slice(0, 100);
    save(s);
    notify();
  }

  // Spend from the balance; returns false if it can't be afforded.
  function spend(amt, why) {
    amt = Math.max(0, Math.round(amt));
    const s = load();
    if (s.balance < amt) return false;
    s.balance -= amt;
    s.history.unshift({ t: Date.now(), amt: -amt, why: String(why || "") });
    s.history = s.history.slice(0, 100);
    save(s);
    notify();
    return true;
  }

  // Record a redeemed shop item (the shop calls spend() first).
  function recordRedeem(item) {
    const s = load();
    s.redeemed.unshift({ id: item.id, title: item.title, code: item.code, t: Date.now() });
    save(s);
    notify();
  }

  function balance() { return load().balance; }
  function data() { return load(); }
  function onChange(fn) { listeners.push(fn); }

  window.PokePoints = { add, spend, recordRedeem, balance, data, onChange };
})();
