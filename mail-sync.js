// Email updates for Rewards Shop points.
//
// Players opt in from the shop with just an email address. From then on this
// keeps a row in the Supabase `points_mail` table up to date with their name,
// balance, and when they last earned. A scheduled function on the Supabase
// side (see server/README.md) reads that table and sends the actual mail:
// a note after a day of earning, and a nudge when points sit unspent.
//
// The anon key can WRITE that table but never read it, so the email list
// can't be pulled out of the browser. Nothing at all is sent unless the
// player opted in.
(function () {
  const KEY = "pokeworks-mail";
  const SB = window.POKEWORKS_SUPABASE || {};
  const canSync =
    !!SB.url && !!SB.anonKey && !/YOUR_/.test(SB.url) && !/YOUR_/.test(SB.anonKey);

  function load() {
    try {
      const m = JSON.parse(localStorage.getItem(KEY));
      if (m && typeof m.email === "string") return m;
    } catch (e) { /* fall through */ }
    return { email: "", on: false };
  }
  function store(m) {
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
  }

  // Push the current state up. `earned` stamps last_earned_at, which is what
  // the mailer keys the "you earned points" note off.
  function sync(earned) {
    const m = load();
    if (!canSync || !m.on || !m.email) return;
    let name = "";
    try { name = (localStorage.getItem("pokeworks-lb-name") || "").trim(); } catch (e) { /* ignore */ }
    const body = {
      email: m.email.trim().toLowerCase(),
      name: name,
      balance: window.PokePoints ? PokePoints.balance() : 0,
      subscribed: true,
    };
    if (earned) body.last_earned_at = new Date().toISOString();
    fetch(SB.url + "/rest/v1/points_mail?on_conflict=email", {
      method: "POST",
      headers: {
        apikey: SB.anonKey,
        Authorization: "Bearer " + SB.anonKey,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
    }).catch(function () { /* offline or table not set up yet; try again next time */ });
  }

  // Sign up / change address / turn off. Turning off flips subscribed on the
  // server too, so the mailer stops even if this browser never comes back.
  function set(email, on) {
    const m = { email: (email || "").trim(), on: !!on && !!(email || "").trim() };
    store(m);
    if (!canSync || !m.email) return;
    if (m.on) {
      sync(false);
    } else {
      fetch(SB.url + "/rest/v1/points_mail?on_conflict=email", {
        method: "POST",
        headers: {
          apikey: SB.anonKey,
          Authorization: "Bearer " + SB.anonKey,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ email: m.email.toLowerCase(), subscribed: false }),
      }).catch(function () { /* ignore */ });
    }
  }

  // Balance changes flow up as they happen; a positive first history entry
  // means this change was an earn.
  if (window.PokePoints) {
    PokePoints.onChange(function (s) {
      sync(!!(s.history[0] && s.history[0].amt > 0));
    });
  }
  sync(false); // keep the row fresh on every visit

  window.PokeMail = { load, set, sync };
})();
