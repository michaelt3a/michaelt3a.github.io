// Duel mode for Bowl Builder (bowl-builder.html?duel=CODE&dn=NAME).
//
// Both players got here from the lobby with the same room code, which seeds
// identical ingredient and power-up streams, so the duel is pure skill (plus
// sabotage). This file owns the realtime side: the live VS scoreboard while
// playing, sabotage delivery both ways, the waiting screen when you finish
// first, and the stats face-off once both runs end. script.js asks PokeDuel
// for seeded streams and reports scores, sabotages, and the final stats.
(function () {
  const SB = window.POKEWORKS_SUPABASE || {};
  const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
  const CODE_ALPHA = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

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

  // Both losers of a rematch click the same button, so both must land in the
  // same next room: rotate every code character one step.
  function nextCode(c) {
    return c.split("").map(function (ch) {
      return CODE_ALPHA[(CODE_ALPHA.indexOf(ch) + 1) % CODE_ALPHA.length];
    }).join("");
  }

  // --- State ---------------------------------------------------------------
  let opp = { name: "Opponent", score: 0, done: false, stats: null };
  let mine = { score: 0, done: false, stats: null };
  let ch = null;
  let sabHandler = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // --- UI ------------------------------------------------------------------
  const css = document.createElement("style");
  css.textContent =
    // The VS scoreboard bar: unmistakably a duel.
    ".duel-bar{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:400;display:flex;" +
    "align-items:center;gap:12px;background:rgba(20,10,40,.88);border:1.5px solid #8f6ef0;border-radius:999px;" +
    "padding:7px 18px;color:#f4ede3;font:700 14px system-ui,sans-serif;box-shadow:0 0 18px rgba(143,110,240,.45)}" +
    ".duel-bar b{font-variant-numeric:tabular-nums;font-size:17px}" +
    ".duel-bar .me b{color:#ffd15a}.duel-bar .them b{color:#b9a5ff}" +
    ".duel-bar .vs{color:#8f6ef0;font-size:11px;letter-spacing:.08em}" +
    ".duel-bar .fin{font-size:11px;color:#9aa;font-weight:700}" +
    // End panels (waiting + result).
    ".duel-banner{position:fixed;inset:0;z-index:950;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(10,6,24,.82);font-family:system-ui,sans-serif}" +
    ".duel-panel2{background:var(--panel,#fff);color:var(--text,#1f2b2b);border:2px solid #8f6ef0;" +
    "border-radius:16px;padding:1.5rem 1.7rem;text-align:center;max-width:360px;width:calc(100vw - 40px);" +
    "box-shadow:0 0 40px rgba(143,110,240,.5)}" +
    ".duel-panel2 h2{margin:0 0 .2rem;font-size:1.7rem}" +
    ".duel-panel2 .duel-sub{margin:0 0 1rem;color:#6b7a7a;font-size:.9rem}" +
    ".duel-score-row{display:flex;justify-content:center;align-items:baseline;gap:14px;margin-bottom:1rem}" +
    ".duel-score-row b{font-size:2.2rem;font-variant-numeric:tabular-nums}" +
    ".duel-score-row .w{color:#39a85b}.duel-score-row .l{color:#ee435b}" +
    ".duel-score-row small{color:#6b7a7a;font-weight:700;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".duel-stats{width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:1.1rem}" +
    ".duel-stats th{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#6b7a7a;padding:.25rem .4rem}" +
    ".duel-stats td{padding:.28rem .4rem;border-top:1px solid #eee;font-variant-numeric:tabular-nums}" +
    ".duel-stats td:first-child{text-align:left;color:#6b7a7a}" +
    ".duel-stats td.win{font-weight:800;color:#39a85b}" +
    ".duel-panel2 a{display:inline-block;margin:0 .3rem;font-weight:700;padding:.5rem 1.2rem;border-radius:999px;" +
    "background:#8f6ef0;color:#fff;text-decoration:none}" +
    ".duel-panel2 a.quiet{background:none;color:#6b7a7a;border:1px solid #ccc}" +
    ".duel-wait{font-weight:700;color:#8f6ef0;margin:0 0 .3rem}" +
    "@keyframes duel-pulse{50%{opacity:.5}}.duel-wait i{animation:duel-pulse 1.2s ease-in-out infinite;font-style:normal}";
  document.head.appendChild(css);

  const bar = document.createElement("div");
  bar.className = "duel-bar";
  function paintBar() {
    bar.innerHTML =
      '<span class="me">' + escapeHtml(myName) + " <b>" + mine.score + "</b>" +
      (mine.done ? ' <span class="fin">FIN</span>' : "") + "</span>" +
      '<span class="vs">VS</span>' +
      '<span class="them">' + escapeHtml(opp.name) + " <b>" + opp.score + "</b>" +
      (opp.done ? ' <span class="fin">FIN</span>' : "") + "</span>";
  }

  let banner = null;
  function panel(html) {
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "duel-banner";
      document.body.appendChild(banner);
    }
    banner.innerHTML = '<div class="duel-panel2">' + html + "</div>";
  }

  function statRows() {
    const rows = [
      ["Blocks", mine.score, opp.score],
      ["Perfect drops", mine.stats.perfects, opp.stats ? opp.stats.perfects : "?"],
      ["Best combo", mine.stats.combo, opp.stats ? opp.stats.combo : "?"],
      ["Power-ups", mine.stats.powerups, opp.stats ? opp.stats.powerups : "?"],
      ["Sabotages", mine.stats.sabs, opp.stats ? opp.stats.sabs : "?"],
    ];
    return rows.map(function (r) {
      const a = Number(r[1]) || 0;
      const b = Number(r[2]) || 0;
      const aw = a > b ? " class=\"win\"" : "";
      const bw = b > a ? " class=\"win\"" : "";
      return "<tr><td>" + r[0] + "</td><td" + aw + ">" + r[1] + "</td><td" + bw + ">" + r[2] + "</td></tr>";
    }).join("");
  }

  function showResult() {
    const a = mine.score;
    const b = opp.score;
    const title = a > b ? "You win!" : a < b ? escapeHtml(opp.name) + " wins" : "Dead tie";
    panel(
      "<h2>" + title + "</h2>" +
      '<p class="duel-sub">Room ' + code + " · same blocks, no excuses</p>" +
      '<div class="duel-score-row">' +
      '<span><b class="' + (a >= b ? "w" : "l") + '">' + a + "</b><br><small>" + escapeHtml(myName) + "</small></span>" +
      '<span class="vs">—</span>' +
      '<span><b class="' + (b >= a ? "w" : "l") + '">' + b + "</b><br><small>" + escapeHtml(opp.name) + "</small></span></div>" +
      '<table class="duel-stats"><tr><th></th><th>' + escapeHtml(myName) + "</th><th>" + escapeHtml(opp.name) + "</th></tr>" +
      statRows() + "</table>" +
      '<a href="duel.html?room=' + nextCode(code) + '">Rematch</a>' +
      '<a class="quiet" href="index.html">Done</a>'
    );
  }

  function showWaiting() {
    panel(
      '<p class="duel-wait">Your run is in: <b>' + mine.score + "</b> blocks <i>…</i></p>" +
      '<p class="duel-sub">Waiting for ' + escapeHtml(opp.name) + " to finish. Current score: " + opp.score + "</p>"
    );
  }

  function maybeSettle() {
    if (!mine.done) return;
    if (opp.done) showResult();
    else showWaiting();
    paintBar();
  }

  // --- Wire-up -------------------------------------------------------------
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
        paintBar();
      });
      ch.on("broadcast", { event: "score" }, function (msg) {
        opp.score = msg.payload.score;
        paintBar();
        if (mine.done && !opp.done) showWaiting();
      });
      ch.on("broadcast", { event: "sab" }, function (msg) {
        if (sabHandler) sabHandler(msg.payload.kind, opp.name);
      });
      ch.on("broadcast", { event: "done" }, function (msg) {
        opp.done = true;
        opp.score = msg.payload.score;
        opp.stats = msg.payload.stats || null;
        paintBar();
        maybeSettle();
      });
      ch.subscribe(function (status) {
        if (status === "SUBSCRIBED") {
          document.body.appendChild(bar);
          paintBar();
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
    oppName: function () { return opp.name; },
    sendScore: function (score) {
      mine.score = score;
      paintBar();
      send("score", { score: score });
    },
    sendSab: function (kind) { send("sab", { kind: kind }); },
    onSab: function (fn) { sabHandler = fn; },
    finish: function (score, stats) {
      mine.done = true;
      mine.score = score;
      mine.stats = stats;
      send("done", { score: score, stats: stats });
      maybeSettle();
    },
  };

  if (active) connect();
})();
