// Central hub leaderboard. Pick a game, then a category (difficulty / mode /
// none), and see the global top 10 for it. Reads the same Supabase tables the
// games write to, with each game's per-browser mirror as a fallback.
(function () {
  const SB = window.POKEWORKS_SUPABASE || {};
  const useSupabase =
    !!SB.url && !!SB.anonKey && !/YOUR_/.test(SB.url) && !/YOUR_/.test(SB.anonKey);
  function sbHeaders() {
    return { apikey: SB.anonKey, Authorization: "Bearer " + SB.anonKey };
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtTime(ms) {
    const t = Math.max(0, ms);
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const d = Math.floor((t % 1000) / 100);
    return `${m}:${String(s).padStart(2, "0")}.${d}`;
  }
  // Generic best-per-name dedupe using a comparator (a better than b?).
  function dedupe(list, better) {
    const sorted = list.slice().sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
    const seen = new Set();
    const out = [];
    for (const e of sorted) {
      const k = String(e.name).trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  }

  async function sbGet(path) {
    const res = await fetch(SB.url + "/rest/v1/" + path, { headers: sbHeaders() });
    if (!res.ok) throw new Error("Supabase " + res.status);
    return res.json();
  }
  function local(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }

  // Each board: how to fetch (global + local) and how to format a row's stat.
  const byScore = (a, b) => (a.score || 0) > (b.score || 0);
  const byRun = (a, b) => (a.perfect !== b.perfect ? a.perfect > b.perfect : a.ms < b.ms);
  const byAudit = (a, b) => (a.pct !== b.pct ? a.pct > b.pct : (a.pts || 0) > (b.pts || 0));

  const BOARDS = {
    "bowl-easy": {
      async fetch() { return this._score("bowl_scores", "difficulty=eq.easy", () => (local("pokeworks-bowl-leaderboard", {}).easy || [])); },
    },
    "bowl-medium": {
      async fetch() { return this._score("bowl_scores", "difficulty=eq.medium", () => (local("pokeworks-bowl-leaderboard", {}).medium || [])); },
    },
    "bowl-impossible": {
      async fetch() { return this._score("bowl_scores", "difficulty=eq.impossible", () => (local("pokeworks-bowl-leaderboard", {}).impossible || [])); },
    },
    "ou-baby": {
      async fetch() { return this._score("orderup_scores", "mode=eq.baby", () => (local("pokeworks-orderup-lb", {}).baby || [])); },
    },
    "ou-normal": {
      async fetch() { return this._score("orderup_scores", "mode=eq.normal", () => (local("pokeworks-orderup-lb", {}).normal || [])); },
    },
    "ou-hard": {
      async fetch() { return this._score("orderup_scores", "mode=eq.hard", () => (local("pokeworks-orderup-lb", {}).hard || [])); },
    },
    "sw-speedrun": {
      stat: (e) => `${e.perfect}/9 · ${fmtTime(e.ms)}`,
      async fetch() {
        let rows;
        if (useSupabase) {
          try { rows = await sbGet("sigworks_speedruns?select=name,perfect,ms&order=perfect.desc,ms.asc&limit=500"); }
          catch { rows = local("sigworks_speedrun_lb", []); }
        } else rows = local("sigworks_speedrun_lb", []);
        return dedupe(rows, byRun);
      },
    },
  };
  // Shared score-board fetcher (Bowl Builder + Order Up).
  const scoreFetch = async function (table, filter, localGetter) {
    let rows;
    if (useSupabase) {
      try { rows = await sbGet(`${table}?select=name,score&${filter}&order=score.desc&limit=500`); }
      catch { rows = localGetter(); }
    } else rows = localGetter();
    return dedupe(rows, byScore);
  };
  for (const k of Object.keys(BOARDS)) {
    if (!BOARDS[k].stat) BOARDS[k].stat = (e) => e.score;
    BOARDS[k]._score = scoreFetch;
  }

  // Today's Daily Challenge board, served through the same plumbing.
  if (window.Daily) {
    const c = Daily.challenge();
    BOARDS["daily-today"] = {
      stat: (e) => e.score,
      fetch: () => Daily.board(c.date, c.game.id),
    };
  }

  // Game → its category buttons (value = board key).
  const GAMES = [
    { id: "daily", label: "🗓 Today", color: "#ffd15a", cats: [
      { label: window.Daily ? Daily.challenge().game.label : "Today", key: "daily-today" },
    ] },
    { id: "bowl", label: "Bowl Builder", color: "#ee435b", cats: [
      { label: "Easy", key: "bowl-easy" },
      { label: "Medium", key: "bowl-medium" },
      { label: "Impossible", key: "bowl-impossible" },
    ] },
    { id: "sw", label: "Signature Works", color: "#22b2b4", cats: [
      { label: "Speedrun", key: "sw-speedrun" },
    ] },
    { id: "ou", label: "Order Up", color: "#fd9f27", cats: [
      { label: "Baby", key: "ou-baby" },
      { label: "Normal", key: "ou-normal" },
      { label: "Hard", key: "ou-hard" },
    ] },
  ];

  // One fetch per board per page load — the board view and the player card
  // both read from here.
  const cache = {};
  function fetchBoard(key) {
    if (!cache[key]) {
      cache[key] = BOARDS[key].fetch().catch(function (e) {
        delete cache[key]; // let a later view retry
        throw e;
      });
    }
    return cache[key];
  }

  let gamesEl, catsEl, listEl, curGame, curKey, reqId = 0;

  function selectGame(g) {
    curGame = g;
    for (const b of gamesEl.children) b.classList.toggle("active", b.dataset.id === g.id);
    catsEl.innerHTML = "";
    g.cats.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hlb-cat" + (i === 0 ? " active" : "");
      btn.textContent = c.label;
      btn.dataset.key = c.key;
      btn.style.setProperty("--g", g.color);
      btn.addEventListener("click", () => selectCat(c.key));
      catsEl.appendChild(btn);
    });
    // hide the row of category buttons when there's only one
    catsEl.classList.toggle("single", g.cats.length <= 1);
    selectCat(g.cats[0].key);
  }

  async function selectCat(key) {
    curKey = key;
    for (const b of catsEl.children) b.classList.toggle("active", b.dataset.key === key);
    const my = ++reqId;
    listEl.innerHTML = '<li class="lb-empty">Loading…</li>';
    let list = [];
    try { list = (await fetchBoard(key)).slice(0, 10); } catch { list = []; }
    if (my !== reqId) return; // superseded
    listEl.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "lb-empty";
      li.textContent = "No scores yet. Be the first!";
      listEl.appendChild(li);
      return;
    }
    const statFn = BOARDS[key].stat;
    list.forEach((e, i) => {
      const li = document.createElement("li");
      li.className = "lb-row";
      li.innerHTML =
        `<span class="lb-rank">${i + 1}</span>` +
        `<span class="lb-name">${escapeHtml(e.name)}</span>` +
        `<span class="lb-score">${statFn(e)}</span>`;
      listEl.appendChild(li);
    });
  }

  function init(rootGames, rootCats, rootList) {
    gamesEl = rootGames;
    catsEl = rootCats;
    listEl = rootList;
    gamesEl.innerHTML = "";
    for (const g of GAMES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hlb-game";
      btn.textContent = g.label;
      btn.dataset.id = g.id;
      btn.style.setProperty("--g", g.color);
      btn.addEventListener("click", () => selectGame(g));
      gamesEl.appendChild(btn);
    }
    selectGame(GAMES[0]);
  }

  window.HubLeaderboard = { init, GAMES, fetchBoard, fmtTime };
})();
