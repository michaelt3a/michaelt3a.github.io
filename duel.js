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
  // Which game this page is: duels run in Bowl Builder, Topping Drop and
  // Poke Slice. Rematch links carry it so both lobbies preselect the game.
  const PAGE_GAME = /topping-drop/.test(location.pathname) ? "td"
    : /poke-slice/.test(location.pathname) ? "ps"
    : "bowl";
  // Editable until the player hits Ready: the ready screen has a name box,
  // and every heartbeat carries the latest name, so the other side stays
  // current.
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
  let opp = { name: "Opponent", score: 0, done: false, stats: null, ready: false };
  let mine = { score: 0, done: false, stats: null, ready: false };
  let ch = null;
  let sabHandler = null;
  let bothReadyCb = null;
  let bothReadyFired = false;

  function checkBothReady() {
    if (bothReadyFired || !mine.ready || !opp.ready) return;
    bothReadyFired = true;
    if (bothReadyCb) bothReadyCb();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // --- UI ------------------------------------------------------------------
  const css = document.createElement("style");
  css.textContent =
    // The VS scoreboard bar: unmistakably a duel. Accents follow the day's
    // star color (see theme.js), falling back to the original purple.
    ".duel-bar{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:400;display:flex;" +
    "align-items:center;gap:12px;background:rgba(20,10,40,.88);border:1.5px solid var(--star-color,#8f6ef0);border-radius:999px;" +
    "padding:7px 18px;color:#f4ede3;font:700 14px system-ui,sans-serif;box-shadow:0 0 18px var(--star-glow,rgba(143,110,240,.45))}" +
    ".duel-bar b{font-variant-numeric:tabular-nums;font-size:17px}" +
    ".duel-bar .rdot{display:inline-block;width:10px;height:10px;border-radius:50%;" +
    "border:2px solid #667;margin-right:6px;vertical-align:-1px}" +
    ".duel-bar .rdot.on{background:#39a85b;border-color:#39a85b}" +
    ".duel-bar .me b,.duel-bar .them b{color:var(--star-color,#ffd15a)}" +
    ".duel-bar .vs{color:var(--star-color,#8f6ef0);font-size:11px;letter-spacing:.08em}" +
    ".duel-bar .fin{font-size:11px;color:#9aa;font-weight:700}" +
    // End panels (waiting + result).
    ".duel-banner{position:fixed;inset:0;z-index:950;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(10,6,24,.82);font-family:system-ui,sans-serif}" +
    ".duel-panel2{background:var(--panel,#fff);color:var(--text,#1f2b2b);border:2px solid var(--star-color,#8f6ef0);" +
    "border-radius:16px;padding:1.5rem 1.7rem;text-align:center;max-width:360px;width:calc(100vw - 40px);" +
    "box-shadow:0 0 40px var(--star-glow,rgba(143,110,240,.5))}" +
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
    "background:var(--star-color,#8f6ef0);color:#1f2b2b;text-decoration:none}" +
    ".duel-panel2 a.quiet{background:none;color:#6b7a7a;border:1px solid #ccc}" +
    ".duel-wait{font-weight:700;color:var(--star-deep,#8f6ef0);margin:0 0 .3rem}" +
    ".duel-series{margin:0 0 .9rem;font-weight:700;font-size:.9rem;color:#6b7a7a}" +
    ".duel-series.win{color:var(--star-deep,#8f6ef0);font-size:1rem}" +
    "@keyframes duel-pulse{50%{opacity:.5}}.duel-wait i{animation:duel-pulse 1.2s ease-in-out infinite;font-style:normal}";
  document.head.appendChild(css);

  const bar = document.createElement("div");
  bar.className = "duel-bar";
  function paintBar() {
    bar.innerHTML =
      '<span class="me"><i class="rdot' + (mine.ready ? " on" : "") + '"></i>' +
      escapeHtml(myName) + " <b>" + mine.score + "</b>" +
      (mine.done ? ' <span class="fin">FIN</span>' : "") + "</span>" +
      '<span class="vs">VS</span>' +
      '<span class="them"><i class="rdot' + (opp.ready ? " on" : "") + '"></i>' +
      escapeHtml(opp.name) + " <b>" + opp.score + "</b>" +
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
    let rows;
    if (mine.stats && Array.isArray(mine.stats.rows)) {
      // Generic face-off: the game hands over [label, value] pairs and the
      // opponent's are matched up by position.
      const theirs = opp.stats && Array.isArray(opp.stats.rows) ? opp.stats.rows : [];
      rows = mine.stats.rows.map(function (r, i) {
        return [r[0], r[1], theirs[i] ? theirs[i][1] : "?"];
      });
    } else {
      // Bowl Builder's original shape.
      rows = [
        ["Blocks", mine.score, opp.score],
        ["Perfect drops", mine.stats.perfects, opp.stats ? opp.stats.perfects : "?"],
        ["Best combo", mine.stats.combo, opp.stats ? opp.stats.combo : "?"],
        ["Power-ups", mine.stats.powerups, opp.stats ? opp.stats.powerups : "?"],
        ["Sabotages", mine.stats.sabs, opp.stats ? opp.stats.sabs : "?"],
      ];
    }
    return rows.map(function (r) {
      const a = Number(r[1]) || 0;
      const b = Number(r[2]) || 0;
      const aw = a > b ? " class=\"win\"" : "";
      const bw = b > a ? " class=\"win\"" : "";
      return "<tr><td>" + r[0] + "</td><td" + aw + ">" + r[1] + "</td><td" + bw + ">" + r[2] + "</td></tr>";
    }).join("");
  }

  // --- Best-of-3 series ------------------------------------------------------
  // Both devices track the rematch chain locally: when a duel ends, the next
  // room's code is stored with the running tally, so the rematch recognizes
  // the series it belongs to. First to 2 wins takes it; ties count nothing.
  const SERIES_KEY = "pokeworks-duel-series";
  let seriesResult = null; // computed once per page, reused on re-renders

  function seriesAfter(a, b) {
    if (seriesResult) return seriesResult;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SERIES_KEY)); } catch (e) { /* ignore */ }
    if (!s || s.room !== code || s.game !== PAGE_GAME) s = { me: 0, them: 0 };
    if (a > b) s.me++;
    else if (b > a) s.them++;
    const clinched = s.me >= 2 || s.them >= 2;
    try {
      if (clinched) localStorage.removeItem(SERIES_KEY);
      else localStorage.setItem(SERIES_KEY, JSON.stringify({
        room: nextCode(code), game: PAGE_GAME, me: s.me, them: s.them,
      }));
    } catch (e) { /* ignore */ }
    seriesResult = { me: s.me, them: s.them, clinched: clinched };
    return seriesResult;
  }

  const GAME_LABEL = { bowl: "Bowl Builder", td: "Topping Drop", ps: "Poke Slice" }[PAGE_GAME];

  function showResult() {
    const a = mine.score;
    const b = opp.score;
    const title = a > b ? "You win!" : a < b ? escapeHtml(opp.name) + " wins" : "Tie";
    const s = seriesAfter(a, b);
    let seriesLine;
    if (s.clinched) {
      const winnerMe = s.me > s.them;
      seriesLine =
        '<p class="duel-series win">🏆 ' +
        (winnerMe ? "You take" : escapeHtml(opp.name) + " takes") +
        " the series " + Math.max(s.me, s.them) + "-" + Math.min(s.me, s.them) + "</p>";
    } else {
      seriesLine =
        '<p class="duel-series">Series: You ' + s.me + " – " + s.them + " " +
        escapeHtml(opp.name) + " · first to 2</p>";
    }
    if (window.PokeAch) {
      if (a > b) PokeAch.unlock("duel-win");
      if (s.clinched && s.me > s.them) PokeAch.unlock("duel-series");
    }
    const rematchUrl = "duel.html?room=" + nextCode(code) + "&game=" + PAGE_GAME;
    // The lobby's "run it back" chip remembers who you last fought and where.
    try {
      localStorage.setItem("pokeworks-duel-last", JSON.stringify({
        game: PAGE_GAME, opp: opp.name, t: Date.now(),
      }));
    } catch (e) { /* ignore */ }
    panel(
      "<h2>" + title + "</h2>" +
      '<p class="duel-sub">Room ' + code + " · " +
      ({ td: "same drops for both", ps: "same fruit for both" }[PAGE_GAME] || "same blocks for both") +
      "</p>" +
      seriesLine +
      '<div class="duel-score-row">' +
      '<span><b class="' + (a >= b ? "w" : "l") + '">' + a + "</b><br><small>" + escapeHtml(myName) + "</small></span>" +
      '<span class="vs">—</span>' +
      '<span><b class="' + (b >= a ? "w" : "l") + '">' + b + "</b><br><small>" + escapeHtml(opp.name) + "</small></span></div>" +
      '<table class="duel-stats"><tr><th></th><th>' + escapeHtml(myName) + "</th><th>" + escapeHtml(opp.name) + "</th></tr>" +
      statRows() + "</table>" +
      '<a href="' + rematchUrl + '">Rematch</a>' +
      '<a class="quiet" href="#" id="duel-share-result">Share</a>' +
      '<a class="quiet" href="index.html">Done</a>'
    );
    // One-tap bragging: the share line carries a rematch link that lands the
    // recipient in the lobby with this game preselected.
    const shareEl = banner.querySelector("#duel-share-result");
    if (shareEl) {
      shareEl.addEventListener("click", function (e) {
        e.preventDefault();
        const url = location.origin + location.pathname.replace(/[^/]*$/, "") + rematchUrl;
        const text =
          (a > b
            ? "I beat " + opp.name + " " + a + "-" + b + " in " + GAME_LABEL + "."
            : a < b
              ? opp.name + " beat me " + b + "-" + a + " in " + GAME_LABEL + "."
              : opp.name + " and I tied " + a + "-" + b + " in " + GAME_LABEL + ".") +
          " Rematch: " + url;
        if (navigator.share) {
          navigator.share({ text: text }).catch(function () { /* backed out, fine */ });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            shareEl.textContent = "✓ Copied";
          }, function () { /* clipboard unavailable; nothing to break */ });
        }
      });
    }
  }

  function showWaiting() {
    panel(
      '<p class="duel-wait">You finished with <b>' + mine.score + "</b> <i>…</i></p>" +
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
  // The channel rebuilds itself whenever the tab comes back into view or the
  // network returns. State flows over a permanent heartbeat: every beat
  // re-broadcasts our full state (name, ready, score, done), and receiving is
  // idempotent. A lost message just means the next beat carries it, so a
  // backgrounded phone can never eat a ready-up and let one player start
  // alone. Sabotage stays a one-shot event because replaying it would sting.
  let client = null;
  const myId = Math.floor(Math.random() * 1e9);

  function applyOpp(p) {
    if (!p || p.id === myId) return;
    const hadDone = opp.done;
    if (p.name) opp.name = String(p.name).slice(0, 12);
    if (p.ready) opp.ready = true; // sticky: there's no un-readying
    // Not monotonic: a bomb sabotage can knock the score DOWN. Messages are
    // ordered per sender, and the heartbeat re-syncs within a beat anyway.
    if (typeof p.score === "number") opp.score = p.score;
    if (p.done) {
      opp.done = true;
      if (p.stats) opp.stats = p.stats;
    }
    paintBar();
    checkBothReady();
    if (opp.done && !hadDone) maybeSettle();
    else if (mine.done && !opp.done) showWaiting(); // keep their live score fresh
  }

  function announce(target) {
    target.send({
      type: "broadcast",
      event: "sync",
      payload: { id: myId, name: myName, ready: mine.ready, score: mine.score, done: mine.done, stats: mine.done ? mine.stats : null },
    });
    // Older cached clients only speak hello/ready/score/done; feed them too so
    // a mid-rollout duel between mixed versions still works.
    target.send({ type: "broadcast", event: "hello", payload: { id: myId, name: myName } });
    if (mine.ready) target.send({ type: "broadcast", event: "ready", payload: { id: myId } });
    if (mine.done) {
      target.send({ type: "broadcast", event: "done", payload: { score: mine.score, stats: mine.stats } });
    } else if (mine.score > 0) {
      target.send({ type: "broadcast", event: "score", payload: { score: mine.score } });
    }
  }

  function buildChannel() {
    if (ch) {
      try { client.removeChannel(ch); } catch (e) { /* ignore */ }
      ch = null;
    }
    const mineCh = client.channel("duel-" + code + "-game");
    ch = mineCh;
    let beat = 0;
    mineCh.on("broadcast", { event: "sync" }, function (m) {
      applyOpp(m.payload);
    });
    // Legacy events from older cached clients.
    mineCh.on("broadcast", { event: "hello" }, function (m) {
      if (m.payload) applyOpp({ id: m.payload.id, name: m.payload.name });
    });
    mineCh.on("broadcast", { event: "ready" }, function (m) {
      if (m.payload) applyOpp({ id: m.payload.id, ready: true });
    });
    mineCh.on("broadcast", { event: "score" }, function (msg) {
      // No id in the old payload; own broadcasts aren't echoed, so it's theirs.
      applyOpp({ id: -1, score: msg.payload.score });
    });
    mineCh.on("broadcast", { event: "done" }, function (msg) {
      applyOpp({ id: -1, score: msg.payload.score, done: true, stats: msg.payload.stats || null });
    });
    mineCh.on("broadcast", { event: "sab" }, function (msg) {
      if (sabHandler) sabHandler(msg.payload.kind, opp.name);
    });
    mineCh.subscribe(function (status) {
      if (mineCh !== ch) return; // a newer rebuild took over
      if (status === "SUBSCRIBED") {
        if (!bar.parentElement) document.body.appendChild(bar);
        paintBar();
        announce(mineCh); // catch the opponent up right away
        clearInterval(beat);
        beat = setInterval(function () {
          if (mineCh !== ch || (mine.done && opp.done)) { clearInterval(beat); return; }
          announce(mineCh);
        }, 1200);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearInterval(beat);
        setTimeout(function () { if (mineCh === ch) buildChannel(); }, 2000);
      }
    });
  }

  function connect() {
    const s = document.createElement("script");
    s.src = CDN;
    s.onload = function () {
      client = window.supabase.createClient(SB.url, SB.anonKey);
      buildChannel();
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden && client) buildChannel();
      });
      window.addEventListener("online", function () {
        if (client) buildChannel();
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
    setName: function (n) {
      myName = (n || "").trim().slice(0, 12) || "You";
      paintBar();
      if (ch) announce(ch); // the opponent's VS bar updates as you type
    },
    setReady: function () {
      mine.ready = true;
      if (ch) announce(ch); // full state right away; the heartbeat is the net
      paintBar();
      checkBothReady();
    },
    onBothReady: function (cb) {
      bothReadyCb = cb;
      checkBothReady(); // in case both were already ready before wiring
    },
    oppReady: function () { return opp.ready; },
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
