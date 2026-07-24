// Daily Challenge: one seeded run per day that's identical for everyone.
//
// The day's date seeds a deterministic generator, so the ingredient order (or
// the customer queue) is the same for every player. Randomness is split into
// independent named streams so that, say, when you happen to earn a power-up
// can't shift which ingredient block 12 is — the nth block and the nth power-up
// are fixed regardless of how well you played.
//
// Purely cosmetic randomness (confetti, particles, shirt colours) deliberately
// keeps using Math.random; it can't change an outcome.
(function () {
  const KEY = "pokeworks-daily";
  const STREAK_KEY = "pokeworks-daily-streak";

  // Each game runs on a fixed setting on its challenge day, otherwise "the same
  // run" wouldn't mean anything.
  const GAMES = [
    { id: "bowl", label: "Bowl Builder", file: "bowl-builder.html", color: "#ee435b", unit: "blocks", setting: "medium" },
    { id: "ou", label: "Order Up", file: "order-up.html", color: "#fd9f27", unit: "pts", setting: "normal" },
  ];

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

  // --- seeded randomness -----------------------------------------------------
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
  // An independent generator per stream name, seeded from the date.
  function stream(name) {
    return mulberry32(xmur3(today() + ":" + name)());
  }

  // Which game is today's. Rotates by the day number so it's stable worldwide
  // for a given date.
  function gameFor(date) {
    const days = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
    return GAMES[((days % GAMES.length) + GAMES.length) % GAMES.length];
  }
  function challenge() {
    const d = today();
    return { date: d, game: gameFor(d) };
  }

  // --- per-day attempt state -------------------------------------------------
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  // One attempt a day: once a run ends it's locked until tomorrow.
  function isDone() {
    const s = load();
    return !!(s && s.date === today() && s.done);
  }
  function result() {
    const s = load();
    return s && s.date === today() && s.done ? s : null;
  }
  function complete(score) {
    save({ date: today(), game: challenge().game.id, score: score, done: true });
    bumpStreak();
    return result();
  }

  // --- streak of consecutive days completed ---------------------------------
  function loadStreak() {
    try {
      const s = JSON.parse(localStorage.getItem(STREAK_KEY));
      if (s && typeof s.count === "number") return s;
    } catch (e) { /* fall through */ }
    return { last: null, count: 0, best: 0 };
  }
  function bumpStreak() {
    const s = loadStreak();
    const t = today();
    if (s.last === t) return;
    s.count = s.last === yesterday() ? (s.count || 0) + 1 : 1;
    s.last = t;
    if (s.count > (s.best || 0)) s.best = s.count;
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  function streak() {
    const s = loadStreak();
    const live = s.last === today() || s.last === yesterday();
    return { count: live ? s.count : 0, best: s.best || 0, last: s.last };
  }

  // --- the board -------------------------------------------------------------
  const SB = window.POKEWORKS_SUPABASE || {};
  const useSupabase =
    !!SB.url && !!SB.anonKey && !/YOUR_/.test(SB.url) && !/YOUR_/.test(SB.anonKey);
  function headers(extra) {
    return Object.assign({ apikey: SB.anonKey, Authorization: "Bearer " + SB.anonKey }, extra || {});
  }
  const LOCAL_BOARD = "pokeworks-daily-lb";

  function localBoard() {
    try { return JSON.parse(localStorage.getItem(LOCAL_BOARD)) || {}; } catch (e) { return {}; }
  }
  function addLocal(date, game, name, score) {
    const b = localBoard();
    const k = date + ":" + game;
    const list = b[k] || (b[k] = []);
    const lower = name.trim().toLowerCase();
    const ex = list.find((e) => String(e.name).trim().toLowerCase() === lower);
    if (ex) { if (score > ex.score) ex.score = score; }
    else list.push({ name: name, score: score });
    b[k] = list.sort((x, y) => y.score - x.score).slice(0, 50);
    try { localStorage.setItem(LOCAL_BOARD, JSON.stringify(b)); } catch (e) { /* ignore */ }
  }

  async function submit(name, score) {
    const c = challenge();
    addLocal(c.date, c.game.id, name, score); // mirror for the offline case
    if (!useSupabase) return;
    const res = await fetch(SB.url + "/rest/v1/daily_scores", {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({ day: c.date, game: c.game.id, name: name, score: score }),
    });
    if (!res.ok) throw new Error("Supabase insert " + res.status);
  }

  // Today's board, best-per-player, highest first.
  async function board(date, gameId) {
    const c = challenge();
    const d = date || c.date;
    const g = gameId || c.game.id;
    let rows = [];
    if (useSupabase) {
      try {
        const res = await fetch(
          SB.url + "/rest/v1/daily_scores?select=name,score&day=eq." + d +
            "&game=eq." + g + "&order=score.desc&limit=500",
          { headers: headers() }
        );
        if (!res.ok) throw new Error("Supabase " + res.status);
        rows = await res.json();
      } catch (e) {
        rows = localBoard()[d + ":" + g] || [];
      }
    } else {
      rows = localBoard()[d + ":" + g] || [];
    }
    const seen = new Set();
    const out = [];
    for (const e of rows.slice().sort((a, b) => (b.score || 0) - (a.score || 0))) {
      const k = String(e.name).trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  }

  // Is this page load a daily run? (bowl-builder.html?daily=1)
  function isRun() {
    try { return new URLSearchParams(location.search).get("daily") === "1"; }
    catch (e) { return false; }
  }
  // Guard against a stale bookmark: ?daily=1 on a game that isn't today's would
  // otherwise post its score to the wrong game's board.
  function isTodaysGame(id) {
    return challenge().game.id === id;
  }

  window.Daily = {
    GAMES, challenge, stream, isRun, isTodaysGame,
    isDone, result, complete, streak,
    submit, board, today, yesterday,
  };
})();
