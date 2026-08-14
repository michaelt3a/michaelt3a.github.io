// Duel mode for Bowl Builder (bowl-builder.html?duel=CODE&dn=NAME).
//
// Both players got here from the lobby with the same room code, which seeds
// identical ingredient and power-up streams, so the duel is pure skill. This
// file owns the realtime side: live opponent score chip while playing, and a
// win/lose banner once both runs end. script.js asks PokeDuel for the seeded
// streams and reports score changes and the final score.
(function () {
  const SB = window.POKEWORKS_SUPABASE || {};
  const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

  const params = new URLSearchParams(location.search);
  const code = (params.get("duel") || "").toUpperCase();
  const active = /^[A-Z2-9]{4}$/.test(code);
  let myName = (params.get("dn") || "").slice(0, 12) || "You";

  // Seeded streams, same recipe as daily.js but keyed on the room code.
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function stream(name) {
    return mulberry32(xmur3(code + ":" + name)());
  }

  // --- Opponent state ------------------------------------------------------
  let opp = { name: "Opponent", score: 0, done: false, finalScore: null };
  let mine = { done: false, finalScore: null };
  let ch = null;

  // --- UI: a small chip while playing, a banner at the end -----------------
  const css = document.createElement("style");
  css.textContent =
    ".duel-chip{position:fixed;top:64px;right:14px;z-index:400;background:var(--chip,rgba(255,255,255,.08));" +
    "border:1px solid var(--chip-line,rgba(255,255,255,.18));border-radius:999px;padding:6px 14px;" +
    "color:var(--on-dark,#f4ede3);font:700 13px system-ui,sans-serif}" +
    ".duel-chip b{color:#ffd15a;font-variant-numeric:tabular-nums}" +
    ".duel-banner{position:fixed;inset:0;z-index:950;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(4,8,8,.78)}" +
    ".duel-banner>div{background:var(--panel,#fff);color:var(--text,#1f2b2b);border-radius:16px;" +
    "padding:1.6rem 2rem;text-align:center;font-family:system-ui,sans-serif;max-width:320px}" +
    ".duel-banner h2{margin:0 0 .4rem;font-size:1.6rem}" +
    ".duel-banner p{margin:0 0 1rem;color:#6b7a7a}" +
    ".duel-banner a,.duel-banner button{display:inline-block;margin:0 .3rem;font:inherit;font-weight:700;" +
    "padding:.5rem 1.2rem;border-radius:999px;border:none;background:#ee435b;color:#fff;text-decoration:none;cursor:pointer}";
  document.head.appendChild(css);

  const chip = document.createElement("div");
  chip.className = "duel-chip";
  chip.hidden = true;
  function paintChip() {
    chip.innerHTML = opp.done
      ? escapeHtml(opp.name) + " finished: <b>" + opp.finalScore + "</b>"
      : escapeHtml(opp.name) + ": <b>" + opp.score + "</b>";
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function maybeShowResult() {
    if (!mine.done || !opp.done) return;
    const a = mine.finalScore;
    const b = opp.finalScore;
    const title = a > b ? "You win! 🏆" : a < b ? escapeHtml(opp.name) + " wins" : "It's a tie";
    const wrap = document.createElement("div");
    wrap.className = "duel-banner";
    wrap.innerHTML =
      "<div><h2>" + title + "</h2>" +
      "<p>" + escapeHtml(myName) + " " + a + " · " + escapeHtml(opp.name) + " " + b + "</p>" +
      '<a href="duel.html">Rematch</a><a href="index.html">Done</a></div>';
    document.body.appendChild(wrap);
  }

  // --- Wire-up -------------------------------------------------------------
  // No presence on this project's realtime; names travel by hello broadcasts.
  function connect() {
    const s = document.createElement("script");
    s.src = CDN;
    s.onload = function () {
      const client = window.supabase.createClient(SB.url, SB.anonKey);
      const myId = Math.floor(Math.random() * 1e9);
      let met = false;
      let pinger = 0;
      ch = client.channel("duel-" + code + "-game");
      ch.on("broadcast", { event: "hello" }, function (m) {
        if (!m.payload || m.payload.id === myId) return;
        if (m.payload.name) opp.name = m.payload.name;
        if (!met) {
          met = true;
          clearInterval(pinger);
          ch.send({ type: "broadcast", event: "hello", payload: { id: myId, name: myName } });
        }
        paintChip();
      });
      ch.on("broadcast", { event: "score" }, function (msg) {
        opp.score = msg.payload.score;
        paintChip();
      });
      ch.on("broadcast", { event: "done" }, function (msg) {
        opp.done = true;
        opp.finalScore = msg.payload.score;
        paintChip();
        maybeShowResult();
      });
      ch.subscribe(function (status) {
        if (status === "SUBSCRIBED") {
          document.body.appendChild(chip);
          chip.hidden = false;
          paintChip();
          pinger = setInterval(function () {
            if (met) { clearInterval(pinger); return; }
            ch.send({ type: "broadcast", event: "hello", payload: { id: myId, name: myName } });
          }, 900);
        }
      });
    };
    document.head.appendChild(s);
  }

  function send(event, payload) {
    if (ch) ch.send({ type: "broadcast", event: event, payload: payload });
  }

  window.PokeDuel = {
    active: active,
    name: myName,
    stream: stream,
    sendScore: function (score) { send("score", { score: score }); },
    finish: function (score) {
      mine.done = true;
      mine.finalScore = score;
      send("done", { score: score });
      maybeShowResult();
    },
  };

  if (active) connect();
})();
