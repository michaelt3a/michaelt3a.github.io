// Daily challenges for the CUSTOMER games (Bowl Builder + Order Up) — the way
// points for the Rewards Shop are earned. Three challenges per game roll each
// day from the pools below, seeded from the date so everyone sees the same
// set: one easy starter, one mid, one hard.
//
// Extra points come from the Daily Challenge itself (customer-game days only)
// and from topping yesterday's daily board. Training games never pay points —
// codes are for loyal customers, so the totals stay small on purpose.
//
// Games report a summary at the end of every run via
// PokeChallenges.report(game, metrics); nothing here hooks into gameplay.
(function () {
  const KEY = "pokeworks-quests";
  const DAILY_PTS = 50;   // finishing a customer-game Daily Challenge
  const TOP_PTS = 150;    // being #1 on yesterday's daily board
  const STREAK_PTS = 200; // every 7th day in a row with a customer game played
  const STREAK_DAYS = 7;
  const CUSTOMER = { bowl: true, ou: true };
  // How many challenges each game rolls per day, by tier.
  const PICKS = { starter: 1, mid: 2, hard: 2 };

  // mode "max": best single run must reach the goal. mode "sum": accumulates
  // across runs today (playtime, run counts).
  //
  // A full sweep of one game's five is ~250 pts, so a strong day across both
  // games (plus the daily) covers the cheapest code — bigger codes are still
  // a loyalty grind, which is the point.
  const POOLS = {
    bowl: [
      // starters — momentum, not skill
      { id: "bb-time5", tier: "starter", metric: "seconds", mode: "sum", goal: 300, pts: 20, label: "Play Bowl Builder for 5 minutes" },
      { id: "bb-runs3", tier: "starter", metric: "runs", mode: "sum", goal: 3, pts: 20, label: "Finish 3 Bowl Builder runs" },
      { id: "bb-score10", tier: "starter", metric: "score", mode: "max", goal: 10, pts: 20, label: "Stack 10 blocks in one run" },
      // mid — a decent run gets there
      { id: "bb-score18", tier: "mid", metric: "score", mode: "max", goal: 18, pts: 40, label: "Stack 18 blocks in one run" },
      { id: "bb-score22", tier: "mid", metric: "score", mode: "max", goal: 22, pts: 40, label: "Stack 22 blocks in one run" },
      { id: "bb-combo5", tier: "mid", metric: "combo", mode: "max", goal: 5, pts: 40, label: "Land 5 perfect drops in a row" },
      { id: "bb-power3", tier: "mid", metric: "powerups", mode: "max", goal: 3, pts: 40, label: "Grab 3 power-ups in one run" },
      { id: "bb-perfect8", tier: "mid", metric: "perfects", mode: "max", goal: 8, pts: 40, label: "Land 8 perfect drops in one run" },
      { id: "bb-runs6", tier: "mid", metric: "runs", mode: "sum", goal: 6, pts: 40, label: "Finish 6 Bowl Builder runs" },
      { id: "bb-time12", tier: "mid", metric: "seconds", mode: "sum", goal: 720, pts: 40, label: "Play Bowl Builder for 12 minutes" },
      // hard — a genuinely good run
      { id: "bb-score30", tier: "hard", metric: "score", mode: "max", goal: 30, pts: 75, label: "Stack 30 blocks in one run" },
      { id: "bb-score35", tier: "hard", metric: "score", mode: "max", goal: 35, pts: 90, label: "Stack 35 blocks in one run" },
      { id: "bb-combo8", tier: "hard", metric: "combo", mode: "max", goal: 8, pts: 75, label: "Land 8 perfect drops in a row" },
      { id: "bb-combo10", tier: "hard", metric: "combo", mode: "max", goal: 10, pts: 90, label: "Land 10 perfect drops in a row" },
      { id: "bb-perfect12", tier: "hard", metric: "perfects", mode: "max", goal: 12, pts: 75, label: "Land 12 perfect drops in one run" },
      { id: "bb-power5", tier: "hard", metric: "powerups", mode: "max", goal: 5, pts: 90, label: "Grab 5 power-ups in one run" },
    ],
    ou: [
      // starters — momentum, not skill
      { id: "ou-time5", tier: "starter", metric: "seconds", mode: "sum", goal: 300, pts: 20, label: "Work the counter for 5 minutes" },
      { id: "ou-shifts2", tier: "starter", metric: "runs", mode: "sum", goal: 2, pts: 20, label: "Complete 2 shifts" },
      { id: "ou-serve6", tier: "starter", metric: "served", mode: "max", goal: 6, pts: 20, label: "Serve 6 customers in one shift" },
      // mid — a decent shift gets there
      { id: "ou-serve10", tier: "mid", metric: "served", mode: "max", goal: 10, pts: 40, label: "Serve 10 customers in one shift" },
      { id: "ou-serve12", tier: "mid", metric: "served", mode: "max", goal: 12, pts: 40, label: "Serve 12 customers in one shift" },
      { id: "ou-money150", tier: "mid", metric: "money", mode: "max", goal: 150, pts: 40, label: "Bank $150 in one shift" },
      { id: "ou-perfect5", tier: "mid", metric: "perfects", mode: "max", goal: 5, pts: 40, label: "Serve 5 perfect bowls in one shift" },
      { id: "ou-combo4", tier: "mid", metric: "combo", mode: "max", goal: 4, pts: 40, label: "Reach a x4 combo in one shift" },
      { id: "ou-shifts4", tier: "mid", metric: "runs", mode: "sum", goal: 4, pts: 40, label: "Complete 4 shifts" },
      { id: "ou-time12", tier: "mid", metric: "seconds", mode: "sum", goal: 720, pts: 40, label: "Work the counter for 12 minutes" },
      // hard — a genuinely good shift
      { id: "ou-combo6", tier: "hard", metric: "combo", mode: "max", goal: 6, pts: 75, label: "Reach a x6 combo in one shift" },
      { id: "ou-money300", tier: "hard", metric: "money", mode: "max", goal: 300, pts: 75, label: "Bank $300 in one shift" },
      { id: "ou-money400", tier: "hard", metric: "money", mode: "max", goal: 400, pts: 90, label: "Bank $400 in one shift" },
      { id: "ou-serve16", tier: "hard", metric: "served", mode: "max", goal: 16, pts: 75, label: "Serve 16 customers in one shift" },
      { id: "ou-serve20", tier: "hard", metric: "served", mode: "max", goal: 20, pts: 90, label: "Serve 20 customers in one shift" },
      { id: "ou-perfect8", tier: "hard", metric: "perfects", mode: "max", goal: 8, pts: 90, label: "Serve 8 perfect bowls in one shift" },
    ],
  };
  const GAME_LABEL = { bowl: "Bowl Builder", ou: "Order Up" };

  // --- Per-day state -------------------------------------------------------
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* fall through */ }
    if (!s || typeof s !== "object") s = {};
    if (s.date !== Daily.today()) {
      // New day: fresh progress. Claims survive (pruned) so yesterday's top
      // bonus can't double-pay and today's daily award stays once-only. The
      // play streak lives across days by definition.
      s = {
        date: Daily.today(),
        progress: {},
        done: {},
        claims: prune(s.claims || {}),
        streak: s.streak || { last: null, count: 0 },
      };
      save(s);
    }
    if (!s.streak) s.streak = { last: null, count: 0 };
    return s;
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  // Claims older than a few days can't be claimed again anyway.
  function prune(claims) {
    const keep = {};
    const cutoff = [Daily.today(), Daily.yesterday()];
    for (const k of Object.keys(claims)) {
      if (cutoff.some((d) => k.endsWith(d))) keep[k] = claims[k];
    }
    return keep;
  }

  // --- Today's set (seeded, same for everyone) ----------------------------
  // Draws PICKS[tier] from each tier without repeats — a seeded partial
  // Fisher–Yates, so adding pool entries later can't reshuffle other tiers.
  function todaysSet(game) {
    const rng = Daily.stream("quests:" + game);
    const set = [];
    for (const tier of ["starter", "mid", "hard"]) {
      const options = POOLS[game].filter((q) => q.tier === tier);
      const want = Math.min(PICKS[tier], options.length);
      for (let i = 0; i < want; i++) {
        const j = i + Math.floor(rng() * (options.length - i));
        [options[i], options[j]] = [options[j], options[i]];
        set.push(options[i]);
      }
    }
    return set;
  }

  // --- Earning -------------------------------------------------------------
  function award(pts, why) {
    if (window.PokePoints) PokePoints.add(pts, why);
    toast("+" + pts + " pts", why);
  }

  // Every customer game calls this once per finished run (Word Bowl calls it
  // directly). One play a day keeps the streak alive; every 7th day in a row
  // pays a bonus.
  function markPlay() {
    const s = load();
    const t = Daily.today();
    if (s.streak.last === t) return;
    s.streak.count = s.streak.last === Daily.yesterday() ? s.streak.count + 1 : 1;
    s.streak.last = t;
    save(s);
    if (s.streak.count > 0 && s.streak.count % STREAK_DAYS === 0) {
      award(STREAK_PTS, s.streak.count + " days in a row");
    }
  }
  // Current streak, for the hub sheet and player card. Stale once a day is
  // missed, same rule as the arcade streak.
  function playStreak() {
    const s = load();
    if (!s.streak.last) return 0;
    return s.streak.last === Daily.today() || s.streak.last === Daily.yesterday()
      ? s.streak.count : 0;
  }

  // Called by a customer game at the end of every run with that run's numbers.
  function report(game, metrics) {
    if (!POOLS[game]) return;
    markPlay();
    const s = load();
    for (const q of todaysSet(game)) {
      if (s.done[q.id]) continue;
      const v = Number(metrics[q.metric]) || 0;
      const prev = Number(s.progress[q.id]) || 0;
      const next = q.mode === "sum" ? prev + v : Math.max(prev, v);
      s.progress[q.id] = next;
      if (next >= q.goal) {
        s.done[q.id] = Date.now();
        save(s);
        award(q.pts, q.label);
      }
    }
    save(s);
    checkDailyAward();
  }

  // Finishing the Daily Challenge pays out — customer-game days only.
  function checkDailyAward() {
    if (!window.Daily) return;
    const r = Daily.result();
    if (!r || !CUSTOMER[r.game]) return;
    const s = load();
    const key = "daily-" + r.date;
    if (s.claims[key]) return;
    s.claims[key] = true;
    save(s);
    award(DAILY_PTS, "Daily Challenge complete");
  }

  // #1 on yesterday's daily board (customer-game days) pays a bonus once the
  // day rolls over. Matched by the saved leaderboard name.
  async function checkTopBonus() {
    if (!window.Daily || !Daily.gameFor) return;
    const yd = Daily.yesterday();
    const game = Daily.gameFor(yd);
    if (!CUSTOMER[game.id]) return;
    let name = "";
    try { name = (localStorage.getItem("pokeworks-lb-name") || "").trim().toLowerCase(); } catch (e) { /* ignore */ }
    if (!name) return;
    const s = load();
    const key = "top-" + yd;
    if (s.claims[key]) return;
    let list = [];
    try { list = await Daily.board(yd, game.id); } catch (e) { return; }
    if (!list.length) return;
    if (String(list[0].name).trim().toLowerCase() !== name) return;
    // Re-load in case something else claimed while the board was fetching.
    const s2 = load();
    if (s2.claims[key]) return;
    s2.claims[key] = true;
    save(s2);
    award(TOP_PTS, "Topped yesterday's daily board");
  }

  // --- For the hub sheet ---------------------------------------------------
  function active() {
    const s = load();
    return Object.keys(POOLS).map((game) => ({
      game: game,
      label: GAME_LABEL[game],
      quests: todaysSet(game).map((q) => ({
        id: q.id,
        label: q.label,
        pts: q.pts,
        goal: q.goal,
        metric: q.metric,
        progress: Math.min(q.goal, Number(s.progress[q.id]) || 0),
        done: !!s.done[q.id],
      })),
    }));
  }

  // --- Toast (bottom-left; achievements own the top-left) ------------------
  let cssDone = false;
  function ensureCss() {
    if (cssDone) return;
    cssDone = true;
    const st = document.createElement("style");
    st.textContent =
      ".pk-pts-toasts{position:fixed;bottom:14px;left:14px;z-index:400;display:flex;flex-direction:column-reverse;gap:10px;width:min(300px,86vw);pointer-events:none}" +
      ".pk-pts-toast{display:flex;align-items:center;gap:10px;background:var(--surface,#161d1d);color:var(--on-dark,#f4ede3);border-radius:12px;border:1.5px solid #39a85b;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,.45);transform:translateX(-120%);transition:transform .35s ease,opacity .3s ease}" +
      ".pk-pts-toast.show{transform:none}" +
      ".pk-pts-toast.hide{opacity:0;transform:translateX(-40%)}" +
      ".pk-pts-amt{font-size:1.05rem;font-weight:800;color:#7ddba0;white-space:nowrap}" +
      ".pk-pts-why{font-size:.8rem;color:var(--on-dark-muted,#b6c4c4);line-height:1.3}";
    document.head.appendChild(st);
  }
  function toast(amt, why) {
    ensureCss();
    let box = document.getElementById("pk-pts-toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "pk-pts-toasts";
      box.className = "pk-pts-toasts";
      document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.className = "pk-pts-toast";
    el.innerHTML = '<span class="pk-pts-amt"></span><span class="pk-pts-why"></span>';
    el.querySelector(".pk-pts-amt").textContent = "🎁 " + amt;
    el.querySelector(".pk-pts-why").textContent = why;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 400);
    }, 5200);
  }

  window.PokeChallenges = {
    report, active, markPlay, playStreak,
    checkDailyAward, checkTopBonus,
    DAILY_PTS, TOP_PTS, STREAK_PTS, STREAK_DAYS,
  };

  // Catch awards that landed elsewhere (e.g. the daily finished on a game
  // page before this script's page was opened).
  checkDailyAward();
  checkTopBonus();
})();
