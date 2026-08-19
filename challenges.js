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
  const CUSTOMER = { bowl: true, ou: true, td: true, iq: true, ps: true };
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
      { id: "bb-perfect3", tier: "starter", metric: "perfects", mode: "max", goal: 3, pts: 20, label: "Land 3 perfect drops in one run" },
      // mid — a decent run gets there
      { id: "bb-score18", tier: "mid", metric: "score", mode: "max", goal: 18, pts: 40, label: "Stack 18 blocks in one run" },
      { id: "bb-score22", tier: "mid", metric: "score", mode: "max", goal: 22, pts: 40, label: "Stack 22 blocks in one run" },
      { id: "bb-combo5", tier: "mid", metric: "combo", mode: "max", goal: 5, pts: 40, label: "Land 5 perfect drops in a row" },
      { id: "bb-power3", tier: "mid", metric: "powerups", mode: "max", goal: 3, pts: 40, label: "Grab 3 power-ups in one run" },
      { id: "bb-perfect8", tier: "mid", metric: "perfects", mode: "max", goal: 8, pts: 40, label: "Land 8 perfect drops in one run" },
      { id: "bb-runs6", tier: "mid", metric: "runs", mode: "sum", goal: 6, pts: 40, label: "Finish 6 Bowl Builder runs" },
      { id: "bb-time12", tier: "mid", metric: "seconds", mode: "sum", goal: 720, pts: 40, label: "Play Bowl Builder for 12 minutes" },
      { id: "bb-score26", tier: "mid", metric: "score", mode: "max", goal: 26, pts: 40, label: "Stack 26 blocks in one run" },
      { id: "bb-perfect10", tier: "mid", metric: "perfects", mode: "max", goal: 10, pts: 40, label: "Land 10 perfect drops in one run" },
      { id: "bb-power4", tier: "mid", metric: "powerups", mode: "max", goal: 4, pts: 40, label: "Grab 4 power-ups in one run" },
      // hard — a genuinely good run
      { id: "bb-score30", tier: "hard", metric: "score", mode: "max", goal: 30, pts: 75, label: "Stack 30 blocks in one run" },
      { id: "bb-score35", tier: "hard", metric: "score", mode: "max", goal: 35, pts: 90, label: "Stack 35 blocks in one run" },
      { id: "bb-combo8", tier: "hard", metric: "combo", mode: "max", goal: 8, pts: 75, label: "Land 8 perfect drops in a row" },
      { id: "bb-combo10", tier: "hard", metric: "combo", mode: "max", goal: 10, pts: 90, label: "Land 10 perfect drops in a row" },
      { id: "bb-perfect12", tier: "hard", metric: "perfects", mode: "max", goal: 12, pts: 75, label: "Land 12 perfect drops in one run" },
      { id: "bb-power5", tier: "hard", metric: "powerups", mode: "max", goal: 5, pts: 90, label: "Grab 5 power-ups in one run" },
      { id: "bb-score40", tier: "hard", metric: "score", mode: "max", goal: 40, pts: 90, label: "Stack 40 blocks in one run" },
      { id: "bb-runs10", tier: "hard", metric: "runs", mode: "sum", goal: 10, pts: 75, label: "Finish 10 Bowl Builder runs" },
      { id: "bb-time20", tier: "hard", metric: "seconds", mode: "sum", goal: 1200, pts: 75, label: "Play Bowl Builder for 20 minutes" },
    ],
    ou: [
      // starters — momentum, not skill
      { id: "ou-time5", tier: "starter", metric: "seconds", mode: "sum", goal: 300, pts: 20, label: "Work the counter for 5 minutes" },
      { id: "ou-shifts2", tier: "starter", metric: "runs", mode: "sum", goal: 2, pts: 20, label: "Complete 2 shifts" },
      { id: "ou-serve6", tier: "starter", metric: "served", mode: "max", goal: 6, pts: 20, label: "Serve 6 customers in one shift" },
      { id: "ou-money50", tier: "starter", metric: "money", mode: "max", goal: 50, pts: 20, label: "Bank $50 in one shift" },
      // mid — a decent shift gets there
      { id: "ou-serve10", tier: "mid", metric: "served", mode: "max", goal: 10, pts: 40, label: "Serve 10 customers in one shift" },
      { id: "ou-serve12", tier: "mid", metric: "served", mode: "max", goal: 12, pts: 40, label: "Serve 12 customers in one shift" },
      { id: "ou-money150", tier: "mid", metric: "money", mode: "max", goal: 150, pts: 40, label: "Bank $150 in one shift" },
      { id: "ou-perfect5", tier: "mid", metric: "perfects", mode: "max", goal: 5, pts: 40, label: "Serve 5 perfect bowls in one shift" },
      { id: "ou-combo4", tier: "mid", metric: "combo", mode: "max", goal: 4, pts: 40, label: "Reach a x4 combo in one shift" },
      { id: "ou-shifts4", tier: "mid", metric: "runs", mode: "sum", goal: 4, pts: 40, label: "Complete 4 shifts" },
      { id: "ou-time12", tier: "mid", metric: "seconds", mode: "sum", goal: 720, pts: 40, label: "Work the counter for 12 minutes" },
      { id: "ou-money200", tier: "mid", metric: "money", mode: "max", goal: 200, pts: 40, label: "Bank $200 in one shift" },
      { id: "ou-perfect6", tier: "mid", metric: "perfects", mode: "max", goal: 6, pts: 40, label: "Serve 6 perfect bowls in one shift" },
      { id: "ou-serve14", tier: "mid", metric: "served", mode: "max", goal: 14, pts: 40, label: "Serve 14 customers in one shift" },
      // hard — a genuinely good shift
      { id: "ou-combo6", tier: "hard", metric: "combo", mode: "max", goal: 6, pts: 75, label: "Reach a x6 combo in one shift" },
      { id: "ou-money300", tier: "hard", metric: "money", mode: "max", goal: 300, pts: 75, label: "Bank $300 in one shift" },
      { id: "ou-money400", tier: "hard", metric: "money", mode: "max", goal: 400, pts: 90, label: "Bank $400 in one shift" },
      { id: "ou-serve16", tier: "hard", metric: "served", mode: "max", goal: 16, pts: 75, label: "Serve 16 customers in one shift" },
      { id: "ou-serve20", tier: "hard", metric: "served", mode: "max", goal: 20, pts: 90, label: "Serve 20 customers in one shift" },
      { id: "ou-perfect8", tier: "hard", metric: "perfects", mode: "max", goal: 8, pts: 90, label: "Serve 8 perfect bowls in one shift" },
      { id: "ou-combo8", tier: "hard", metric: "combo", mode: "max", goal: 8, pts: 90, label: "Reach a x8 combo in one shift" },
      { id: "ou-shifts6", tier: "hard", metric: "runs", mode: "sum", goal: 6, pts: 75, label: "Complete 6 shifts" },
      { id: "ou-perfect10", tier: "hard", metric: "perfects", mode: "max", goal: 10, pts: 90, label: "Serve 10 perfect bowls in one shift" },
    ],
    td: [
      // starters — momentum, not skill
      { id: "td-runs3", tier: "starter", metric: "runs", mode: "sum", goal: 3, pts: 20, label: "Finish 3 Topping Drop runs" },
      { id: "td-score10", tier: "starter", metric: "score", mode: "max", goal: 10, pts: 20, label: "Catch 10 toppings in one run" },
      { id: "td-time5", tier: "starter", metric: "seconds", mode: "sum", goal: 300, pts: 20, label: "Catch toppings for 5 minutes" },
      { id: "td-combo5", tier: "starter", metric: "combo", mode: "max", goal: 5, pts: 20, label: "Catch 5 in a row without a drop" },
      // mid — a decent run gets there
      { id: "td-score25", tier: "mid", metric: "score", mode: "max", goal: 25, pts: 40, label: "Catch 25 toppings in one run" },
      { id: "td-score35", tier: "mid", metric: "score", mode: "max", goal: 35, pts: 40, label: "Catch 35 toppings in one run" },
      { id: "td-combo10", tier: "mid", metric: "combo", mode: "max", goal: 10, pts: 40, label: "Catch 10 in a row without a drop" },
      { id: "td-runs6", tier: "mid", metric: "runs", mode: "sum", goal: 6, pts: 40, label: "Finish 6 Topping Drop runs" },
      { id: "td-score45", tier: "mid", metric: "score", mode: "max", goal: 45, pts: 40, label: "Catch 45 toppings in one run" },
      { id: "td-combo14", tier: "mid", metric: "combo", mode: "max", goal: 14, pts: 40, label: "Catch 14 in a row without a drop" },
      { id: "td-time10", tier: "mid", metric: "seconds", mode: "sum", goal: 600, pts: 40, label: "Catch toppings for 10 minutes" },
      // hard — a genuinely good run
      { id: "td-score50", tier: "hard", metric: "score", mode: "max", goal: 50, pts: 75, label: "Catch 50 toppings in one run" },
      { id: "td-score65", tier: "hard", metric: "score", mode: "max", goal: 65, pts: 90, label: "Catch 65 toppings in one run" },
      { id: "td-combo18", tier: "hard", metric: "combo", mode: "max", goal: 18, pts: 75, label: "Catch 18 in a row without a drop" },
      { id: "td-combo25", tier: "hard", metric: "combo", mode: "max", goal: 25, pts: 90, label: "Catch 25 in a row without a drop" },
      { id: "td-score80", tier: "hard", metric: "score", mode: "max", goal: 80, pts: 90, label: "Catch 80 toppings in one run" },
      { id: "td-runs8", tier: "hard", metric: "runs", mode: "sum", goal: 8, pts: 75, label: "Finish 8 Topping Drop runs" },
    ],
    iq: [
      // starters
      { id: "iq-runs2", tier: "starter", metric: "runs", mode: "sum", goal: 2, pts: 20, label: "Finish 2 trivia rounds" },
      { id: "iq-correct5", tier: "starter", metric: "correct", mode: "max", goal: 5, pts: 20, label: "Get 5 questions right in one round" },
      { id: "iq-streak3", tier: "starter", metric: "streak", mode: "max", goal: 3, pts: 20, label: "Get 3 right in a row" },
      // mid
      { id: "iq-correct7", tier: "mid", metric: "correct", mode: "max", goal: 7, pts: 40, label: "Get 7 questions right in one round" },
      { id: "iq-correct8", tier: "mid", metric: "correct", mode: "max", goal: 8, pts: 40, label: "Get 8 questions right in one round" },
      { id: "iq-streak6", tier: "mid", metric: "streak", mode: "max", goal: 6, pts: 40, label: "Get 6 right in a row" },
      { id: "iq-score1000", tier: "mid", metric: "score", mode: "max", goal: 1000, pts: 40, label: "Score 1,000 in one round" },
      { id: "iq-runs4", tier: "mid", metric: "runs", mode: "sum", goal: 4, pts: 40, label: "Finish 4 trivia rounds" },
      // hard
      { id: "iq-perfect", tier: "hard", metric: "correct", mode: "max", goal: 10, pts: 90, label: "Get all 10 right in one round" },
      { id: "iq-streak10", tier: "hard", metric: "streak", mode: "max", goal: 10, pts: 90, label: "Get 10 right in a row" },
      { id: "iq-score1300", tier: "hard", metric: "score", mode: "max", goal: 1300, pts: 75, label: "Score 1,300 in one round" },
      { id: "iq-runs7", tier: "hard", metric: "runs", mode: "sum", goal: 7, pts: 75, label: "Finish 7 trivia rounds" },
    ],
    ps: [
      // starters
      { id: "ps-runs3", tier: "starter", metric: "runs", mode: "sum", goal: 3, pts: 20, label: "Finish 3 Poke Slice runs" },
      { id: "ps-score10", tier: "starter", metric: "score", mode: "max", goal: 10, pts: 20, label: "Slice 10 pieces in one run" },
      { id: "ps-time5", tier: "starter", metric: "seconds", mode: "sum", goal: 300, pts: 20, label: "Slice for 5 minutes" },
      { id: "ps-combo2", tier: "starter", metric: "combo", mode: "max", goal: 2, pts: 20, label: "Slice 2 in a single stroke" },
      // mid
      { id: "ps-score25", tier: "mid", metric: "score", mode: "max", goal: 25, pts: 40, label: "Slice 25 pieces in one run" },
      { id: "ps-score35", tier: "mid", metric: "score", mode: "max", goal: 35, pts: 40, label: "Slice 35 pieces in one run" },
      { id: "ps-combo3", tier: "mid", metric: "combo", mode: "max", goal: 3, pts: 40, label: "Slice 3 in a single stroke" },
      { id: "ps-runs6", tier: "mid", metric: "runs", mode: "sum", goal: 6, pts: 40, label: "Finish 6 Poke Slice runs" },
      { id: "ps-score45", tier: "mid", metric: "score", mode: "max", goal: 45, pts: 40, label: "Slice 45 pieces in one run" },
      { id: "ps-combo4", tier: "mid", metric: "combo", mode: "max", goal: 4, pts: 40, label: "Slice 4 in a single stroke" },
      { id: "ps-time10", tier: "mid", metric: "seconds", mode: "sum", goal: 600, pts: 40, label: "Slice for 10 minutes" },
      // hard
      { id: "ps-score55", tier: "hard", metric: "score", mode: "max", goal: 55, pts: 75, label: "Slice 55 pieces in one run" },
      { id: "ps-score70", tier: "hard", metric: "score", mode: "max", goal: 70, pts: 90, label: "Slice 70 pieces in one run" },
      { id: "ps-combo5", tier: "hard", metric: "combo", mode: "max", goal: 5, pts: 75, label: "Slice 5 in a single stroke" },
      { id: "ps-combo6", tier: "hard", metric: "combo", mode: "max", goal: 6, pts: 90, label: "Slice 6 in a single stroke" },
      { id: "ps-score85", tier: "hard", metric: "score", mode: "max", goal: 85, pts: 90, label: "Slice 85 pieces in one run" },
      { id: "ps-runs8", tier: "hard", metric: "runs", mode: "sum", goal: 8, pts: 75, label: "Finish 8 Poke Slice runs" },
    ],
  };
  const GAME_LABEL = {
    bowl: "Bowl Builder", ou: "Order Up",
    td: "Topping Drop", iq: "Poke IQ", ps: "Poke Slice",
  };

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
        swaps: {},
        rerollUsed: false,
        claims: prune(s.claims || {}),
        streak: s.streak || { last: null, count: 0 },
      };
      save(s);
    }
    if (!s.streak) s.streak = { last: null, count: 0 };
    if (!s.swaps) s.swaps = {};
    return s;
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  // Daily claims older than a few days can't be claimed again anyway. Season
  // claims stick around for the current and previous month so a settled
  // payout can't repeat.
  function prune(claims) {
    const keep = {};
    const cutoff = [Daily.today(), Daily.yesterday()];
    const months = [0, -1].map((off) => {
      const d = new Date();
      const m = new Date(d.getFullYear(), d.getMonth() + off, 1);
      return "season-" + m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0");
    });
    for (const k of Object.keys(claims)) {
      if (cutoff.some((d) => k.endsWith(d)) || months.some((m) => k.startsWith(m))) {
        keep[k] = claims[k];
      }
    }
    return keep;
  }

  // --- Today's set (seeded, same for everyone) ----------------------------
  // Draws PICKS[tier] from each tier without repeats — a seeded partial
  // Fisher–Yates, so adding pool entries later can't reshuffle other tiers.
  function baseSet(game) {
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
  // The seeded set, with any personal reroll applied on top.
  function todaysSet(game) {
    const s = load();
    return baseSet(game).map((q) => {
      const inId = s.swaps[q.id];
      if (!inId) return q;
      return POOLS[game].find((p) => p.id === inId) || q;
    });
  }

  // One reroll a day: swap a quest you don't want for another of the same
  // tier from that game's pool. Progress on the old quest is left behind.
  function canReroll() {
    return !load().rerollUsed;
  }
  function reroll(game, questId) {
    if (!POOLS[game]) return null;
    const s = load();
    if (s.rerollUsed || s.done[questId]) return null;
    const current = todaysSet(game);
    const cur = current.find((q) => q.id === questId);
    if (!cur) return null;
    const inUse = new Set(current.map((q) => q.id));
    const options = POOLS[game].filter((p) => p.tier === cur.tier && !inUse.has(p.id));
    if (!options.length) return null;
    const pick = options[Math.floor(Math.random() * options.length)];
    // Swaps are keyed by the seeded quest's id, so find which base slot this is.
    const base = baseSet(game).find((q) => (s.swaps[q.id] || q.id) === questId);
    if (!base) return null;
    s.swaps[base.id] = pick.id;
    s.rerollUsed = true;
    save(s);
    return pick;
  }

  // --- Hourly challenge ----------------------------------------------------
  // One small challenge at a time, seeded from the date + hour so everyone
  // sees the same one. Deliberately cheap: 10 pts each, and at most 5 payouts
  // a day so an all-day grinder can't outrun the quest economy.
  const HOURLY_PTS = 10;
  const HOURLY_CAP = 5;
  const HOURLY = {
    bowl: [
      { metric: "score", goal: 8, label: "Stack 8 blocks in one run" },
      { metric: "perfects", goal: 4, label: "Land 4 perfect drops in one run" },
      { metric: "combo", goal: 3, label: "Land 3 perfect drops in a row" },
    ],
    ou: [
      { metric: "served", goal: 5, label: "Serve 5 customers in one shift" },
      { metric: "money", goal: 60, label: "Bank $60 in one shift" },
    ],
    td: [
      { metric: "score", goal: 15, label: "Catch 15 toppings in one run" },
      { metric: "combo", goal: 6, label: "Catch 6 in a row without a drop" },
    ],
    iq: [
      { metric: "correct", goal: 6, label: "Get 6 questions right in one round" },
      { metric: "streak", goal: 4, label: "Get 4 right in a row" },
    ],
    ps: [
      { metric: "score", goal: 15, label: "Slice 15 pieces in one run" },
      { metric: "combo", goal: 3, label: "Slice 3 in a single stroke" },
    ],
  };
  function currentHourly() {
    const hr = new Date().getHours();
    const rng = Daily.stream("hourly:" + hr);
    const games = Object.keys(HOURLY);
    const game = games[Math.floor(rng() * games.length)];
    const q = HOURLY[game][Math.floor(rng() * HOURLY[game].length)];
    return { id: "h-" + hr, game: game, metric: q.metric, goal: q.goal, label: q.label, pts: HOURLY_PTS };
  }
  // Reset stored progress when the hour (or day, via load()) rolls over.
  function ensureHourly(s) {
    const h = currentHourly();
    if (!s.hourly || s.hourly.id !== h.id) s.hourly = { id: h.id, progress: 0, done: false };
    return h;
  }
  // For the hub sheet.
  function hourly() {
    const s = load();
    const h = ensureHourly(s);
    save(s);
    return {
      game: h.game,
      gameLabel: GAME_LABEL[h.game],
      label: h.label,
      goal: h.goal,
      pts: h.pts,
      progress: Math.min(h.goal, Number(s.hourly.progress) || 0),
      done: !!s.hourly.done,
      capped: (s.hourlyWins || 0) >= HOURLY_CAP,
      minsLeft: 60 - new Date().getMinutes(),
    };
  }

  // --- Lifetime totals (shown on the profile card) -------------------------
  // Accumulated here because every customer game already reports each run.
  const TOTALS_KEY = "pokeworks-career-totals";
  function bumpTotals(game, metrics) {
    try {
      const t = JSON.parse(localStorage.getItem(TOTALS_KEY)) || {};
      const g = t[game] || (t[game] = {});
      for (const k of ["runs", "score", "served", "money", "seconds", "correct", "missed"]) {
        const v = Number(metrics[k]) || 0;
        if (v > 0) g[k] = (g[k] || 0) + v;
      }
      localStorage.setItem(TOTALS_KEY, JSON.stringify(t));
    } catch (e) { /* ignore */ }
  }

  // --- Earning -------------------------------------------------------------
  function award(pts, why) {
    if (window.PokePoints) PokePoints.add(pts, why);
    toast("🎁 +" + pts + " pts", why);
  }
  // One-off claims (season payouts, bonuses) shared across features; returns
  // false if this key was already claimed.
  function claimOnce(key) {
    const s = load();
    if (s.claims[key]) return false;
    s.claims[key] = true;
    save(s);
    return true;
  }

  // --- Streak insurance (bought in the shop) -------------------------------
  // One shield bridges ONE missed day; bigger gaps still reset the streak.
  const SHIELD_KEY = "pokeworks-streak-shield";
  function shieldCount() {
    try { return parseInt(localStorage.getItem(SHIELD_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function setShields(n) {
    try { localStorage.setItem(SHIELD_KEY, String(n)); } catch (e) { /* ignore */ }
  }
  function addShield() { setShields(shieldCount() + 1); }
  function twoDaysAgo() {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  // Every customer game calls this once per finished run (Word Bowl calls it
  // directly). One play a day keeps the streak alive; every 7th day in a row
  // pays a bonus.
  function markPlay() {
    const s = load();
    const t = Daily.today();
    if (s.streak.last === t) return;
    if (s.streak.last === Daily.yesterday()) {
      s.streak.count += 1;
    } else if (s.streak.last === twoDaysAgo() && shieldCount() > 0) {
      // Exactly one day missed and a shield in the drawer: the streak lives.
      setShields(shieldCount() - 1);
      s.streak.count += 1;
      toast("🛟 Streak saved", "Insurance covered yesterday. Streak: " + s.streak.count + " days.");
    } else {
      s.streak.count = 1;
    }
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
  // A live streak that hasn't been fed today, once the evening rolls in.
  // Returns the streak length at risk, or 0.
  function streakAtRisk() {
    const s = load();
    if (s.streak.last === Daily.today()) return 0;
    if (new Date().getHours() < 17) return 0;
    return playStreak();
  }

  // One line for a game's start screen: the next quest worth chasing.
  function startHint(game) {
    if (!POOLS[game]) return "";
    const s = load();
    const set = todaysSet(game);
    const open = set.filter((q) => !s.done[q.id]);
    if (!open.length) return "Today's " + GAME_LABEL[game] + " quests: all done.";
    // Single-run goals make better targets than slow accumulators.
    const pick = open.find((q) => q.mode === "max") || open[0];
    return "Quest: " + pick.label + " (+" + pick.pts + ")" +
      (set.length - open.length > 0 ? " · " + (set.length - open.length) + " of " + set.length + " done" : "");
  }

  // Called by a customer game at the end of every run with that run's numbers.
  function report(game, metrics) {
    if (!POOLS[game]) return;
    markPlay();
    bumpTotals(game, metrics);
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
    // The hourly challenge rides the same report; single-run (max) goals only.
    const h = ensureHourly(s);
    if (game === h.game && !s.hourly.done && (s.hourlyWins || 0) < HOURLY_CAP) {
      const hv = Number(metrics[h.metric]) || 0;
      s.hourly.progress = Math.max(Number(s.hourly.progress) || 0, hv);
      if (s.hourly.progress >= h.goal) {
        s.hourly.done = true;
        s.hourlyWins = (s.hourlyWins || 0) + 1;
        save(s);
        award(h.pts, "This hour: " + h.label);
      }
    }
    save(s);
    // Sweeping all of one game's quests in a day earns the wall a badge.
    if (window.PokeAch && todaysSet(game).every((q) => s.done[q.id])) {
      PokeAch.unlock("meta-sweep");
    }
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
    el.querySelector(".pk-pts-amt").textContent = amt;
    el.querySelector(".pk-pts-why").textContent = why;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 400);
    }, 5200);
  }

  window.PokeChallenges = {
    report, active, markPlay, playStreak, streakAtRisk, startHint,
    reroll, canReroll, hourly,
    checkDailyAward, checkTopBonus,
    awardPts: award, claimOnce, shieldCount, addShield,
    DAILY_PTS, TOP_PTS, STREAK_PTS, STREAK_DAYS,
  };

  // Catch awards that landed elsewhere (e.g. the daily finished on a game
  // page before this script's page was opened).
  checkDailyAward();
  checkTopBonus();
})();
