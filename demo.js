// Presentation Mode — a safe showcase sandbox for the whole arcade.
//
// While it's on (per-tab, via sessionStorage):
//  - Every site localStorage key is shadowed in memory: reads come from a
//    copy seeded with a rich demo profile, writes never touch real data.
//  - Supabase is mocked: writes are swallowed, reads return canned boards,
//    and the realtime duel client is replaced with a scripted opponent
//    ("KAI") so duels can be demonstrated solo.
//  - A small controls panel appears with one-tap triggers for the states
//    that normally need progression (power-ups, fever, frenzy, and so on).
//
// Turning it off reloads the page and every patch disappears; production
// behavior and data are untouched. Loaded FIRST in <head> on every page so
// the patches land before any other script reads storage.
(function () {
  const FLAG = "pokeworks-demo";
  let on = false;
  try { on = sessionStorage.getItem(FLAG) === "1"; } catch (e) { /* no session storage, no demo */ }

  function enter() {
    try { sessionStorage.setItem(FLAG, "1"); } catch (e) { return; }
    location.reload();
  }
  function exit() {
    try { sessionStorage.removeItem(FLAG); } catch (e) { /* ignore */ }
    location.reload();
  }

  const registry = {}; // game pages register demo hooks here
  window.PokeDemo = {
    active: on,
    enter: enter,
    exit: exit,
    register: function (id, api) { registry[id] = api; },
  };

  // The profile-sheet toggle exists on the hub in both modes.
  document.addEventListener("DOMContentLoaded", function () {
    const t = document.getElementById("demo-toggle");
    if (t) {
      t.textContent = on ? "On" : "Off";
      t.addEventListener("click", function () { (on ? exit : enter)(); });
    }
  });

  if (!on) return; // normal site: nothing below runs

  // ------------------------------------------------------------------ shadow
  // All site data lives under these prefixes. Reads/writes on localStorage
  // for these keys are redirected to an in-memory copy for this tab only.
  const PREFIXES = ["pokeworks-", "sigworks-", "sigworks_", "season-"];
  function ours(k) {
    return typeof k === "string" && PREFIXES.some(function (p) { return k.indexOf(p) === 0; });
  }

  const shadow = new Map();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (ours(k)) shadow.set(k, localStorage.getItem(k));
  }

  // The showcase profile: rich enough that every screen has something to show.
  function day(offset) {
    const d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function seed(k, v) { shadow.set(k, JSON.stringify(v)); }
  const NAME = "KAI";
  shadow.set("pokeworks-lb-name", NAME);
  shadow.set("pokeworks-bowl-lb-name", NAME);
  shadow.set("pokeworks-toured", "1"); // no first-visit tour mid-presentation
  seed("pokeworks-points", {
    balance: 5000,
    earned: 8200,
    history: [
      { t: Date.now() - 3600e3, amt: 50, why: "Daily Challenge complete" },
      { t: Date.now() - 5400e3, amt: 40, why: "Stack 22 blocks in one run" },
      { t: Date.now() - 7200e3, amt: -800, why: "Bowl skin: Gold Rim" },
      { t: Date.now() - 86400e3, amt: 90, why: "Slice 6 in a single stroke" },
      { t: Date.now() - 90000e3, amt: 20, why: "Poke IQ: new best 1180" },
      { t: Date.now() - 172800e3, amt: 200, why: "7 days in a row" },
    ],
    redeemed: [{ id: "drink", title: "Free drink", code: "POKE-FILLER-DRINK", t: Date.now() - 86400e3 }],
  });
  seed("pokeworks-daily-streak", { last: day(-1), count: 6, best: 11 });
  seed("pokeworks-achievements", {
    "bb-first": 1, "bb-25": 1, "bb-combo10": 1, "bb-golden": 1,
    "ou-10": 1, "ou-upgrade": 1, "wb-first": 1, "td-combo20": 1,
    "ps-stroke5": 1, "sw-first": 1, "duel-win": 1, "iq-perfect": 1,
    "meta-streak7": 1,
  });
  seed("pokeworks-career-totals", {
    bowl: { runs: 58, score: 1240, seconds: 6200 },
    td: { runs: 34, score: 890, seconds: 3400 },
    iq: { runs: 22, score: 19800, correct: 181, missed: 39, seconds: 2900 },
    ps: { runs: 41, score: 1105, seconds: 3800 },
    ou: { runs: 12, money: 2400, served: 130, seconds: 5200 },
  });
  seed("pokeworks-wordbowl", {
    career: { solved: 23, streak: 4, lastWin: day(-1), dist: { "2": 2, "3": 8, "4": 7, "5": 4, "6": 2, "X": 2 } },
    day: { date: day(0), guesses: [], done: false, won: false, pts: 0, hard: false },
    arch: (function () {
      const a = {};
      a[day(-1)] = "solved"; a[day(-2)] = "solved"; a[day(-4)] = "lost"; a[day(-6)] = "solved";
      return a;
    })(),
  });
  seed("pokeworks-duel-h2h", {
    michelle: { name: "MICHELLE", w: 6, l: 3, t: 0, streak: 2, best: 4, games: { bowl: { w: 4, l: 2, t: 0 }, ps: { w: 2, l: 1, t: 0 } }, last: Date.now() - 86400e3 },
    noa: { name: "NOA", w: 2, l: 2, t: 1, streak: 0, best: 2, games: { td: { w: 2, l: 2, t: 1 } }, last: Date.now() - 172800e3 },
  });
  seed("pokeworks-duel-last", { game: "bowl", opp: "MICHELLE", t: Date.now() - 86400e3 });
  seed("pokeworks-skins", { owned: ["classic", "blade-white", "goldrim", "blade-gold"], active: { bowl: "goldrim", blade: "blade-gold" } });
  shadow.set("pokeworks-streak-shield", "1");
  // Bests low on purpose: any decent demo run lands a "new best" moment.
  shadow.set("pokeworks-high-score", "14");
  shadow.set("pokeworks-topping-best", "11");
  shadow.set("pokeworks-slice-best", "16");
  shadow.set("pokeworks-iq-best", "620");
  shadow.delete("pokeworks-daily"); // today's daily: fresh and playable
  shadow.delete("pokeworks-quests"); // fresh quest sheet, fresh hourly

  // Route localStorage (and only localStorage) through the shadow.
  const SP = Storage.prototype;
  const realGet = SP.getItem, realSet = SP.setItem, realRemove = SP.removeItem;
  SP.getItem = function (k) {
    if (this === window.localStorage && ours(k)) return shadow.has(k) ? shadow.get(k) : null;
    return realGet.call(this, k);
  };
  SP.setItem = function (k, v) {
    if (this === window.localStorage && ours(k)) { shadow.set(k, String(v)); return; }
    return realSet.call(this, k, v);
  };
  SP.removeItem = function (k) {
    if (this === window.localStorage && ours(k)) { shadow.delete(k); return; }
    return realRemove.call(this, k);
  };

  // ---------------------------------------------------------------- supabase
  // Writes are swallowed; reads return canned boards with the demo player on
  // them. Everything looks live, nothing leaves the tab.
  const CANNED = {
    daily_scores: [
      { name: "NOA", score: 41 }, { name: NAME, score: 38 }, { name: "MICHELLE", score: 33 },
      { name: "SAM", score: 29 }, { name: "ELI", score: 24 }, { name: "TESS", score: 19 },
    ],
    bowl_scores: [
      { name: "NOA", score: 44 }, { name: NAME, score: 41 }, { name: "MICHELLE", score: 36 },
      { name: "SAM", score: 30 }, { name: "GUS", score: 27 }, { name: "TESS", score: 22 },
    ],
    orderup_scores: [
      { name: "MICHELLE", score: 512 }, { name: NAME, score: 486 }, { name: "NOA", score: 430 },
      { name: "ELI", score: 322 }, { name: "SAM", score: 240 },
    ],
    sigworks_speedruns: [
      { name: NAME, perfect: 8, ms: 214000 }, { name: "NOA", perfect: 7, ms: 198000 },
      { name: "MICHELLE", perfect: 6, ms: 232000 }, { name: "SAM", perfect: 4, ms: 261000 },
    ],
    event_counts: [],
  };
  const realFetch = window.fetch;
  window.fetch = function (input, opts) {
    const u = String(input && input.url ? input.url : input);
    if (u.indexOf("supabase.co") !== -1) {
      const method = ((opts && opts.method) || "GET").toUpperCase();
      if (method !== "GET") {
        return Promise.resolve(new Response("[]", { status: 201, headers: { "Content-Type": "application/json" } }));
      }
      let rows = [];
      for (const table of Object.keys(CANNED)) {
        if (u.indexOf("/rest/v1/" + table) !== -1) { rows = CANNED[table]; break; }
      }
      return Promise.resolve(new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return realFetch.apply(this, arguments);
  };

  // ------------------------------------------------------------- fake duels
  // A scripted opponent named KAI: joins the lobby a beat after you open a
  // room, readies up, keeps a live score at ~3/4 of yours, throws one
  // sabotage, and finishes just behind you. window.supabase is pinned so the
  // real CDN client can't replace the fake.
  function makeFakeSupabase() {
    function makeChannel(name) {
      const handlers = {};
      const bot = { hello: false, ready: false, score: 0, done: false, myScore: 0, myDone: false, sabSent: false, timer: 0 };
      const ch = {
        on: function (type, filter, cb) {
          (handlers[filter.event] = handlers[filter.event] || []).push(cb);
          return ch;
        },
        subscribe: function (cb) {
          setTimeout(function () { cb && cb("SUBSCRIBED"); }, 250);
          bot.timer = setInterval(tick, 1100);
          return ch;
        },
        send: function (msg) {
          const ev = msg && msg.event;
          const p = (msg && msg.payload) || {};
          if (ev === "hello" && !bot.hello) {
            bot.hello = true;
            setTimeout(function () { emit("hello", { id: 4242, name: "KAI", game: p.game }); }, 2200);
          }
          if (ev === "sync") {
            bot.myScore = p.score || 0;
            bot.myDone = !!p.done;
            if (p.ready && !bot.ready) {
              setTimeout(function () { bot.ready = true; }, 1600);
            }
          }
          return Promise.resolve("ok");
        },
        unsubscribe: function () { clearInterval(bot.timer); },
      };
      function emit(event, payload) {
        (handlers[event] || []).forEach(function (cb) { cb({ payload: payload }); });
      }
      function tick() {
        // Trail the presenter's score so they win, barely.
        const target = Math.floor(bot.myScore * 0.75);
        if (bot.score < target) bot.score += Math.max(1, Math.floor((target - bot.score) / 2));
        if (bot.myDone && !bot.done) {
          bot.done = true;
          bot.score = Math.max(0, Math.floor(bot.myScore * 0.8) - 1);
        }
        emit("sync", { id: 4242, name: "KAI", ready: bot.ready, score: bot.score, done: bot.done, stats: null });
        // One sabotage mid-game keeps the mechanic on display.
        if (bot.ready && bot.myScore >= 6 && !bot.sabSent && !bot.myDone) {
          bot.sabSent = true;
          emit("sab", { kind: "speed" });
          setTimeout(function () { emit("sab", { kind: "frenzy" }); }, 4000);
        }
      }
      return ch;
    }
    return {
      createClient: function () {
        return { channel: makeChannel, removeChannel: function (ch) { if (ch && ch.unsubscribe) ch.unsubscribe(); } };
      },
    };
  }
  const fakeSupabase = makeFakeSupabase();
  try {
    Object.defineProperty(window, "supabase", {
      get: function () { return fakeSupabase; },
      set: function () { /* the CDN client loads and is ignored */ },
      configurable: true,
    });
  } catch (e) { window.supabase = fakeSupabase; }

  // ------------------------------------------------------------------- panel
  // The banner and the controls. Styling rides the site's own variables.
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function buildUI() {
    const css = document.createElement("style");
    css.textContent =
      ".pk-demo-banner{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:600;" +
      "background:#8f6ef0;color:#fff;font:700 0.62rem system-ui,sans-serif;letter-spacing:0.12em;" +
      "padding:3px 12px;border-radius:999px;pointer-events:none}" +
      ".pk-demo-panel{position:fixed;right:12px;bottom:64px;z-index:600;display:flex;flex-direction:column;" +
      "align-items:flex-end;gap:6px;font-family:system-ui,sans-serif}" +
      ".pk-demo-list{display:none;flex-direction:column;gap:5px;background:rgba(12,16,18,0.95);" +
      "border:1px solid #8f6ef0;border-radius:12px;padding:10px;max-height:60vh;overflow:auto}" +
      ".pk-demo-panel.open .pk-demo-list{display:flex}" +
      ".pk-demo-btn{border:1px solid rgba(255,255,255,0.25);background:none;color:#f4ede3;border-radius:8px;" +
      "padding:6px 10px;font:600 0.78rem system-ui,sans-serif;cursor:pointer;text-align:left;white-space:nowrap}" +
      ".pk-demo-btn:hover{border-color:#8f6ef0}" +
      ".pk-demo-btn.exit{color:#ffb0bc}" +
      ".pk-demo-head{color:#b9a5f5;font:700 0.62rem system-ui,sans-serif;letter-spacing:0.1em;margin:4px 0 0}" +
      ".pk-demo-fab{width:44px;height:44px;border-radius:50%;border:1px solid #8f6ef0;background:rgba(12,16,18,0.95);" +
      "font-size:1.25rem;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.4)}";
    document.head.appendChild(css);

    document.body.appendChild(el("div", "pk-demo-banner", "PRESENTATION MODE"));

    const panel = el("div", "pk-demo-panel");
    const list = el("div", "pk-demo-list");
    const fab = el("button", "pk-demo-fab", "🎬");
    fab.type = "button";
    fab.addEventListener("click", function () { panel.classList.toggle("open"); });

    function btn(label, fn, cls) {
      const b = el("button", "pk-demo-btn" + (cls ? " " + cls : ""), label);
      b.type = "button";
      b.addEventListener("click", fn);
      list.appendChild(b);
      return b;
    }
    function head(text) { list.appendChild(el("div", "pk-demo-head", text)); }

    const page = location.pathname.split("/").pop() || "index.html";

    // ---- page-specific controls
    if (page === "bowl-builder.html") {
      head("BOWL BUILDER");
      const drop = function (type) {
        return function () {
          if (typeof spawnPowerup !== "undefined" && typeof state !== "undefined" && state.running) spawnPowerup(type);
        };
      };
      btn("Drop magnet", drop("magnet"));
      btn("Drop shield", drop("shield"));
      btn("Drop sticky rice", drop("saver"));
      btn("Drop expander", drop("expand"));
      btn("Drop golden scallop", drop("golden"));
      btn("Drop bomb", function () {
        if (typeof state === "undefined" || !state.running) return;
        state.powerups.push({ x: 200 + Math.random() * 400, y: -42, vy: 178, age: 0, type: "bomb" });
      });
      btn("Combo x7", function () {
        if (typeof state === "undefined" || !state.running) return;
        state.combo = 7;
        if (typeof updateCombo !== "undefined") updateCombo();
      });
    }
    if (registry.td) {
      head("TOPPING DROP");
      btn("Start fever", registry.td.fever);
      btn("Drop a star", registry.td.star);
      btn("Drop a heart", registry.td.heart);
      btn("Streak of 8", registry.td.streak);
    }
    if (registry.ps) {
      head("POKE SLICE");
      btn("Toss golden fish", registry.ps.golden);
      btn("Start frenzy", registry.ps.frenzy);
      btn("Send the boss", registry.ps.boss);
    }
    if (registry.wb) {
      head("WORD BOWL");
      btn("Solve today's word", registry.wb.win);
    }
    if (registry.iq) {
      head("POKE IQ");
      btn("Skip to results", registry.iq.finish);
    }
    if (page === "index.html" || page === "") {
      head("HUB");
      btn("Complete today's daily", function () {
        if (window.Daily && !Daily.result()) {
          Daily.complete(38);
          location.reload();
        }
      });
      btn("Reset today's daily", function () {
        localStorage.removeItem("pokeworks-daily");
        location.reload();
      });
    }

    // ---- everywhere
    head("ANYWHERE");
    btn("Achievement unlock", function () {
      if (!window.PokeAch) return;
      const done = JSON.parse(localStorage.getItem("pokeworks-achievements") || "{}");
      const next = (PokeAch.DEFS || []).find(function (d) { return !done[d.id]; });
      if (next) PokeAch.unlock(next.id);
    });
    btn("Points toast", function () {
      if (window.PokeChallenges) PokeChallenges.awardPts(40, "Stack 22 blocks in one run");
      else if (window.PokePoints) PokePoints.add(40, "Stack 22 blocks in one run");
    });
    btn("Exit Presentation Mode", exit, "exit");

    panel.appendChild(list);
    panel.appendChild(fab);
    document.body.appendChild(panel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildUI);
  } else {
    buildUI();
  }
})();
