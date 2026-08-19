// Poke Slice — swipe to slice. Ingredients get tossed up through the box in
// arcs; drag a slice trail through them before they fall. Letting food drop
// uncut costs a heart, and so does slicing a stick of dynamite. Three hearts
// a run, speed ramps forever, and 3+ slices in one stroke pays a combo.
//
// Daily mode (?daily=1): waves are seeded from the date so everyone slices
// the same toss order; one attempt, score posts to the day's board, and
// personal-best points sit the day out.
(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width; // 800
  const H = canvas.height; // 600
  canvas.style.touchAction = "none"; // the whole box is a slicing surface

  const overlay = document.getElementById("overlay");
  const screenStart = document.getElementById("screen-start");
  const screenCount = document.getElementById("screen-count");
  const screenOver = document.getElementById("screen-gameover");
  const startTitle = document.getElementById("start-title");
  const startSub = document.getElementById("start-subtitle");
  const startBtn = document.getElementById("start-btn");
  const countNum = document.getElementById("count-num");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("high-score");
  const overSub = document.getElementById("gameover-subtitle");
  const pointsLine = document.getElementById("points-line");
  const playAgainBtn = document.getElementById("play-again-btn");
  const lbEntry = document.getElementById("lb-entry");
  const lbName = document.getElementById("lb-name");
  const lbSave = document.getElementById("lb-save-btn");
  const lbDone = document.getElementById("lb-done");

  const BEST_KEY = "pokeworks-slice-best";
  const NAME_KEY = "pokeworks-lb-name";
  // OS-level "reduce motion" turns off the camera shake.
  const REDUCED_MOTION =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GOOD = ["🐟", "🍣", "🥑", "🍤", "🥒", "🥭"];
  const BOMB = "🧨";
  const GRAVITY = 1000;

  // The equipped blade skin colors the trail; cached per run.
  let trailRGB = "255,255,255";

  const wantsDaily = !!(window.Daily && Daily.isRun());
  const isDaily = wantsDaily && Daily.isTodaysGame("ps") && !Daily.result();
  // Practice: yesterday's seed and twist, no attempt, no points, no board.
  const isPractice = !wantsDaily && !!(window.Daily && Daily.isPractice &&
    Daily.isPractice() && Daily.gameFor(Daily.yesterday()).id === "ps");
  // The day's seeded twist (or yesterday's, when practicing).
  const DAILY_TWIST =
    isDaily && Daily.twist ? Daily.twist() :
    isPractice ? Daily.twist(Daily.yesterday()) : null;
  const GOLD_CHANCE = DAILY_TWIST && DAILY_TWIST.id === "gold" ? 0.12 : 0.05;
  const WILD_EVERY = DAILY_TWIST && DAILY_TWIST.id === "frenzy" ? 25 : 40;
  const EXTRA_TOSS = DAILY_TWIST && DAILY_TWIST.id === "bigtoss";
  // Duel plumbing (?duel=CODE): the room code seeds the waves so both players
  // slice the same toss order; duel.js owns the realtime side.
  const isDuel = !wantsDaily && !!(window.PokeDuel && PokeDuel.active);
  let rng = Math.random;

  function sfx(name) {
    if (window.ArcadeSfx && ArcadeSfx[name]) { try { ArcadeSfx[name](); } catch (e) { /* ignore */ } }
  }

  let best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { /* ignore */ }
  bestEl.textContent = String(best);

  if (isDuel) {
    document.body.classList.add("duel-mode"); // the box glows in the day's color
    startTitle.textContent = "Duel";
    startSub.textContent =
      "Same toss order for both of you; most slices wins. Every 12 slices loads a sabotage. " +
      "Hit Ready; the countdown starts when you both have.";
    startBtn.textContent = "✓ Ready";
  } else if (wantsDaily) {
    startTitle.textContent = "🗓 Daily Challenge";
    if (!Daily.isTodaysGame("ps")) {
      startSub.textContent =
        "Today's challenge is " + Daily.challenge().game.label + ". Head back to the hub for it.";
      startBtn.classList.add("hidden");
      startBtn.style.display = "none";
    } else if (Daily.result()) {
      startSub.textContent =
        "You've already played today: " + Daily.result().score + " slices. Come back tomorrow.";
      startBtn.classList.add("hidden");
      startBtn.style.display = "none";
    } else {
      startSub.textContent = "Everyone gets the same toss order today. You get one attempt." +
        (DAILY_TWIST ? " Today's twist: " + DAILY_TWIST.label + ". " + DAILY_TWIST.desc : "");
    }
  } else if (isPractice) {
    startTitle.textContent = "📚 Yesterday's Daily";
    startSub.textContent = "Yesterday's run, for practice. No points." +
      (DAILY_TWIST ? " Twist: " + DAILY_TWIST.label + ". " + DAILY_TWIST.desc : "");
  }

  const ITEM_SIZE = 52; // glyph font size; hit radius scales with it
  const HIT_R = 44;

  const state = {
    running: false,
    paused: false,
    score: 0,
    lives: 3,
    elapsed: 0,
    items: [], // {x,y,vx,vy,rot,vrot,glyph,bomb}
    pieces: [], // sliced halves tumbling away (clipped along the cut)
    floaters: [],
    trail: [], // the live blade under the finger
    cuts: [], // finished blade segments that linger and fade, fruit-ninja style
    booms: [], // expanding shockwave rings from dynamite
    sparks: [], // explosion debris
    slicing: false,
    strokeSlices: 0,
    bestStroke: 0,
    strokeId: 0, // increments per stroke; the boss takes one hit per stroke
    waveIn: 0.9,
    waves: {}, // live clean-wave tallies, keyed by wave id
    wildAt: 40, // next natural frenzy wave (fixed times, fair on seeded runs)
    wildUntil: 0,
    bossAt: 30, // next soy bottle boss
    lastTime: 0,
    flash: 0,
    shake: 0,
    // duel bits
    duelCharges: 0,
    duelNextChargeAt: 12,
    duelSabsSent: 0,
    bombDebt: 0, // incoming "bombs" sabotage forces dynamite into the waves
    frenzyUntil: 0, // incoming "frenzy" sabotage: double-speed waves until this time
  };

  function say(text) {
    state.floaters.push({ text: text, x: W / 2, y: 90, life: 1.2 });
  }

  function setScore(n) {
    state.score = n;
    scoreEl.textContent = String(n);
    if (isDuel && state.running) {
      PokeDuel.sendScore(n);
      if (n >= state.duelNextChargeAt) {
        state.duelNextChargeAt += 12;
        if (state.duelCharges < 2) {
          state.duelCharges++;
          say("🧨 Sabotage loaded!");
          sfx("chime");
        }
        updateSabBtn();
      }
    }
  }

  // --- Duel chrome: the sabotage button below the box ------------------------
  let sabBtn = null;
  function updateSabBtn() {
    if (!sabBtn) return;
    sabBtn.textContent = "🧨 Sabotage ×" + state.duelCharges;
    sabBtn.disabled = state.duelCharges <= 0;
  }
  if (isDuel) {
    const controls = document.querySelector(".controls");
    sabBtn = document.createElement("button");
    sabBtn.className = "control-btn duel-sab";
    sabBtn.type = "button";
    controls.appendChild(sabBtn);
    updateSabBtn();
    sabBtn.addEventListener("click", () => {
      if (!state.running || state.paused || state.manualPause || state.duelCharges <= 0) return;
      state.duelCharges--;
      state.duelSabsSent++;
      PokeDuel.sendSab(Math.random() < 0.5 ? "bombs" : "frenzy");
      say("🧨 Sabotage sent!");
      updateSabBtn();
    });
    PokeDuel.onSab((kind, who) => {
      if (!state.running || state.paused) return;
      if (kind === "bombs") {
        state.bombDebt += 2;
        say("🧨 " + who + " tossed dynamite!");
      } else {
        state.frenzyUntil = state.elapsed + 6;
        say("⏩ " + who + " hit frenzy!");
      }
      sfx("thunk");
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* ignore */ } }
    });
  }

  function waveEvery() {
    if (state.wildUntil > state.elapsed) return 0.32; // natural frenzy: it pours
    const base = Math.max(1.6 - state.elapsed * 0.012, 0.85);
    return state.frenzyUntil > state.elapsed ? base / 2 : base;
  }
  function bombChance() { return Math.min(0.12 + state.elapsed * 0.002, 0.22); }

  let waveSeq = 0; // ids the waves so full clears can pay the clean bonus

  function tossOne(noBombs, waveId) {
    // Exactly six rolls per toss, always, so seeded runs stay in lockstep no
    // matter what the rolls decide (frenzy just ignores the bomb roll).
    const x = 100 + rng() * (W - 200);
    const vy = -(820 + rng() * 180);
    const vx = (W / 2 - x) * (0.35 + rng() * 0.3);
    const bombRoll = rng();
    const goldRoll = rng();
    const glyphRoll = rng();
    const bomb = !noBombs && bombRoll < bombChance();
    const golden = !bomb && goldRoll < GOLD_CHANCE;
    const glyph = bomb ? BOMB : golden ? "🐟" : GOOD[Math.floor(glyphRoll * GOOD.length)];
    const it = {
      x: x,
      y: H + 30,
      vx: vx * (golden ? 1.2 : 1),
      vy: golden ? vy * 1.18 : vy, // goldens fly harder and fall faster
      rot: 0,
      vrot: (x < W / 2 ? 1 : -1) * (1.2 + Math.abs(vx) / 120),
      glyph: glyph,
      bomb: bomb,
      golden: golden,
      wave: waveId || 0,
    };
    state.items.push(it);
    return it;
  }

  // The soy bottle boss: floats slow, takes a hit from three SEPARATE
  // strokes, pays +8 when it finally shatters. Missing it costs nothing.
  function tossBoss() {
    const x = 200 + Math.random() * (W - 400);
    state.items.push({
      x: x,
      y: H + 40,
      vx: (W / 2 - x) * 0.2,
      vy: -880,
      rot: 0,
      vrot: 0.5,
      glyph: "🍶",
      boss: true,
      hp: 3,
      slowFall: true, // reduced gravity so three strokes are possible
      lastStrokeId: -1,
    });
  }

  // A "bombs" sabotage rides outside the seeded stream: sabotage is what
  // makes duel runs diverge, and that's the point.
  function tossSabBomb() {
    const x = 100 + Math.random() * (W - 200);
    state.items.push({
      x: x,
      y: H + 30,
      vx: (W / 2 - x) * (0.35 + Math.random() * 0.3),
      vy: -(820 + Math.random() * 180),
      rot: 0,
      vrot: (x < W / 2 ? 1 : -1) * 1.6,
      glyph: BOMB,
      bomb: true,
    });
  }

  function wave() {
    // Both extra-item rolls are always drawn, even when unused, to keep the
    // seeded stream in lockstep.
    const wild = state.wildUntil > state.elapsed;
    const roll2 = rng();
    const roll3 = rng();
    let count = 1;
    if (roll2 < Math.min(0.25 + state.elapsed * 0.01, 0.7)) count++;
    if (state.elapsed > 20 && roll3 < 0.3) count++;
    if (EXTRA_TOSS && count < 3) count++; // big-toss twist: one more per wave
    // Slice a whole multi-item wave (no bombs in it) and it pays a small bonus.
    waveSeq++;
    let goods = 0;
    let hadBomb = false;
    for (let i = 0; i < count; i++) {
      const it = tossOne(wild, waveSeq); // frenzy waves carry no bombs
      if (it.bomb) hadBomb = true; else goods++;
    }
    if (!hadBomb && goods >= 2) state.waves[waveSeq] = { left: goods };
    while (state.bombDebt > 0) {
      state.bombDebt--;
      tossSabBomb();
    }
  }

  function startGame() {
    state.running = true;
    state.paused = false;
    setScore(0);
    state.lives = 3;
    state.elapsed = 0;
    state.items = [];
    state.pieces = [];
    state.floaters = [];
    state.trail = [];
    state.cuts = [];
    state.booms = [];
    state.sparks = [];
    state.slicing = false;
    state.strokeSlices = 0;
    state.bestStroke = 0;
    state.strokeId = 0;
    state.wildAt = WILD_EVERY;
    state.wildUntil = 0;
    state.waves = {};
    state.bossAt = 30;
    state.waveIn = 0.7;
    state.lastTime = 0;
    state.flash = 0;
    state.shake = 0;
    state.duelCharges = 0;
    state.duelNextChargeAt = 12;
    state.duelSabsSent = 0;
    state.bombDebt = 0;
    state.frenzyUntil = 0;
    updateSabBtn();
    state.manualPause = false;
    screenPaused.classList.add("hidden");
    pauseBtn.style.display = "";
    pauseBtn.textContent = "⏸";
    trailRGB = window.PokeSkins ? PokeSkins.active("blade").trail : "255,255,255";
    rng = isDaily || isPractice ? Daily.stream("ps:wave") : isDuel ? PokeDuel.stream("ps:wave") : Math.random;
    overlay.classList.add("hidden");
    if (window.PokeStreak) PokeStreak.mark();
    if (window.PokeTrack) PokeTrack.hit(isDaily ? "daily" : "play", "slice");
  }

  // 3-2-1 so your slicing hand is over the box before the first toss.
  let counting = false;
  function runCountdown() {
    if (counting || state.running) return;
    counting = true;
    screenStart.classList.add("hidden");
    screenOver.classList.add("hidden");
    screenCount.classList.remove("hidden");
    overlay.classList.remove("hidden");
    let n = 3;
    countNum.textContent = "3";
    sfx("tick");
    const tick = setInterval(() => {
      n--;
      if (n > 0) { countNum.textContent = String(n); sfx("tick"); return; }
      clearInterval(tick);
      counting = false;
      screenCount.classList.add("hidden");
      sfx("go");
      startGame();
    }, 750);
  }

  function loadLbName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; }
  }

  function endGame() {
    state.running = false;
    state.manualPause = false;
    screenPaused.classList.add("hidden");
    pauseBtn.style.display = "none";
    sfx("over");
    // Keep the lifetime best stroke around for the achievement wall.
    try {
      const k = "pokeworks-slice-stroke-best";
      if (state.bestStroke > (parseInt(localStorage.getItem(k), 10) || 0)) {
        localStorage.setItem(k, String(state.bestStroke));
      }
    } catch (e) { /* ignore */ }
    // Feed the run into today's shop challenges (points for the Rewards Shop).
    if (window.PokeChallenges && !isPractice) {
      PokeChallenges.report("ps", {
        score: state.score,
        combo: state.bestStroke,
        seconds: state.elapsed,
        runs: 1,
      });
    }
    // A duel skips the normal game-over screen: duel.js paints the waiting
    // panel, then the stats face-off once both runs end.
    if (isDuel) {
      PokeDuel.finish(state.score, {
        rows: [
          ["Slices", state.score],
          ["Best stroke", state.bestStroke],
          ["Sabotages", state.duelSabsSent],
        ],
      });
      return;
    }
    overSub.textContent =
      "You sliced " + state.score + " piece" + (state.score === 1 ? "" : "s") + "." +
      (state.score < best && best - state.score <= 5
        ? " " + (best - state.score) + " short of your best (" + best + ")."
        : "");
    pointsLine.hidden = true;
    lbEntry.classList.add("hidden");
    lbDone.classList.add("hidden");

    if (isDaily) {
      Daily.complete(state.score);
      sfx("jingle");
      playAgainBtn.hidden = true;
      lbName.value = loadLbName();
      lbEntry.classList.remove("hidden");
    } else {
      playAgainBtn.hidden = false;
      let pts = 0;
      const prevBest = best;
      if (state.score > best && !isPractice) {
        pts = Math.min(20, state.score - best);
        best = state.score;
        try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
        bestEl.textContent = String(best);
        if (prevBest > 0) overSub.textContent += " Your old best was " + prevBest + ".";
        if (window.PokePoints) PokePoints.add(pts, "Poke Slice: new best " + best);
      }
      if (pts > 0) {
        pointsLine.hidden = false;
        pointsLine.textContent = "🏆 New best! +" + pts + " points";
        sfx("best");
      }
    }
    screenStart.classList.add("hidden");
    screenOver.classList.remove("hidden");
    overlay.classList.remove("hidden");
  }

  async function submitDaily() {
    let name = (lbName.value || "").trim().slice(0, 12);
    if (!name) { lbName.focus(); return; }
    if (window.PokeFilter && !PokeFilter.ok(name)) {
      lbName.value = "";
      lbName.placeholder = "Pick another name";
      return;
    }
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* ignore */ }
    lbSave.disabled = true;
    try { await Daily.submit(name, state.score); } catch (e) { /* local mirror already saved */ }
    lbSave.disabled = false;
    lbEntry.classList.add("hidden");
    lbDone.classList.remove("hidden");
    addDailyShare();
  }
  // One plain share line after posting a daily score.
  function addDailyShare() {
    if (document.getElementById("daily-share-btn")) return;
    const b = document.createElement("button");
    b.id = "daily-share-btn";
    b.type = "button";
    b.className = "btn btn-secondary";
    b.textContent = "Share score";
    b.addEventListener("click", () => {
      const url = location.origin + location.pathname.replace(/[^/]*$/, "");
      if (window.PokeShareCard) {
        PokeShareCard.share({
          game: "Poke Slice",
          score: state.score + " slices",
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          url: url,
        }).then((r) => { if (r === "copied") b.textContent = "✓ Copied"; });
        return;
      }
      const text = "Pokeworks Daily · Poke Slice · " + state.score + " slices · " + url;
      if (navigator.share) {
        navigator.share({ text: text }).catch(() => { /* backed out, fine */ });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => { b.textContent = "✓ Copied"; });
      }
    });
    lbDone.after(b);
  }
  lbSave.addEventListener("click", submitDaily);
  lbName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitDaily(); }
  });

  // The next quest worth chasing, on the start screen (normal runs only).
  {
    const qh = document.getElementById("quest-hint");
    if (qh && !isDaily && !isDuel && window.PokeChallenges && PokeChallenges.startHint) {
      qh.textContent = PokeChallenges.startHint("ps");
    }
  }

  // In a duel the Start button is the Ready button: the countdown fires on
  // both screens once both players have pressed it.
  startBtn.addEventListener("click", () => {
    if (!isDuel) { runCountdown(); return; }
    if (startBtn.disabled) return;
    startBtn.disabled = true;
    startBtn.textContent = "Waiting for " + ((PokeDuel.oppName && PokeDuel.oppName()) || "opponent") + " to ready up…";
    PokeDuel.setReady();
  });
  if (isDuel) {
    PokeDuel.onBothReady(() => {
      startBtn.style.display = "none";
      runCountdown();
    });
  }
  playAgainBtn.addEventListener("click", runCountdown);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) { state.paused = true; state.lastTime = 0; }
    else state.paused = false;
  });

  // Manual pause: the corner ⏸ freezes the run; Resume picks it back up.
  const pauseBtn = document.getElementById("pause-btn");
  const screenPaused = document.getElementById("screen-paused");
  function setPause(on) {
    if (!state.running) return;
    state.manualPause = on;
    state.lastTime = 0;
    screenPaused.classList.toggle("hidden", !on);
    overlay.classList.toggle("hidden", !on);
    pauseBtn.textContent = on ? "▶" : "⏸";
  }
  pauseBtn.addEventListener("click", () => setPause(!state.manualPause));
  document.getElementById("resume-btn").addEventListener("click", () => setPause(false));

  // --- Slicing ---------------------------------------------------------------
  function toWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
      t: performance.now(),
    };
  }

  // Distance from point p to the segment a-b.
  function segDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function explode(x, y) {
    state.booms.push({ x: x, y: y, life: 0.55, maxLife: 0.55 });
    for (let i = 0; i < 22; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 180 + Math.random() * 320;
      state.sparks.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 120,
        size: 2.5 + Math.random() * 4,
        color: ["#ffd15a", "#fd9f27", "#ee435b", "#fff1c9"][Math.floor(Math.random() * 4)],
        life: 0.5 + Math.random() * 0.4,
      });
    }
    if (!REDUCED_MOTION) state.shake = 0.5;
    state.flash = 0.4;
  }

  // Each ingredient splashes its own colors when cut.
  const JUICE = {
    "🐟": ["#ff8da1", "#ff6f8a", "#ffd9e0"],
    "🍣": ["#ff9e80", "#ee6f57", "#fff1e8"],
    "🥑": ["#7fce6e", "#4a9e58", "#e8f5c8"],
    "🍤": ["#ffb08a", "#ff8a5c", "#fff1e8"],
    "🥒": ["#8fd672", "#5cb85c", "#e0f5d0"],
    "🥭": ["#ffc04d", "#ff9e27", "#ffe9b0"],
  };
  const GOLD_JUICE = ["#ffd15a", "#fff1c9", "#ffb52e"];

  // A burst of droplets from the cut point, riding the existing spark physics.
  function spawnJuice(x, y, colors, n) {
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 90 + Math.random() * 180;
      state.sparks.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 70,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0.35 + Math.random() * 0.3,
      });
    }
  }

  function sliceAlong(a, b) {
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      if (segDist(it, a, b) > (it.boss ? HIT_R + 16 : HIT_R)) continue;
      // The boss doesn't pop; it cracks, one hit per distinct stroke.
      if (it.boss) {
        if (it.lastStrokeId === state.strokeId) continue;
        it.lastStrokeId = state.strokeId;
        it.hp--;
        if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* ignore */ } }
        if (it.hp > 0) {
          sfx("thunk");
          state.floaters.push({ text: "🍶 " + it.hp + " more", x: it.x, y: it.y - 44, life: 0.7 });
        } else {
          state.items.splice(i, 1);
          setScore(state.score + 8);
          sfx("boom");
          if (!REDUCED_MOTION) state.shake = 0.3;
          state.floaters.push({ text: "🍶 SHATTERED! +8", x: it.x, y: it.y - 30, life: 1.1 });
          for (let k = 0; k < 14; k++) {
            const ang = Math.random() * Math.PI * 2;
            const sp = 140 + Math.random() * 240;
            state.sparks.push({
              x: it.x, y: it.y,
              vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 100,
              size: 2 + Math.random() * 3.5,
              color: ["#d8e6ee", "#9fb8c8", "#ffffff"][Math.floor(Math.random() * 3)],
              life: 0.4 + Math.random() * 0.35,
            });
          }
        }
        continue;
      }
      state.items.splice(i, 1);
      if (it.bomb) {
        state.lives--;
        explode(it.x, it.y);
        sfx("boom");
        if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* ignore */ } }
        state.floaters.push({ text: "💥", x: it.x, y: it.y - 20, life: 0.8 });
        if (state.lives <= 0) { endGame(); return; }
      } else {
        state.strokeSlices++;
        if (state.strokeSlices > state.bestStroke) state.bestStroke = state.strokeSlices;
        if (state.strokeSlices >= 5 && window.PokeAch) PokeAch.unlock("ps-stroke5");
        sfx("swish");
        // The hit itself: juice in the ingredient's colors, a hot streak
        // along the blade, a nudge of screen shake, and a tap of haptics.
        spawnJuice(it.x, it.y, it.golden ? GOLD_JUICE : JUICE[it.glyph] || GOLD_JUICE, it.golden ? 16 : 9);
        if (!REDUCED_MOTION) state.shake = Math.max(state.shake, it.golden ? 0.16 : 0.09);
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* ignore */ } }
        if (it.golden) {
          setScore(state.score + 5);
          sfx("chime");
          state.floaters.push({ text: "✨ +5", x: it.x, y: it.y - 30, life: 0.9 });
        } else {
          setScore(state.score + 1);
          state.floaters.push({ text: "+1", x: it.x, y: it.y - 26, life: 0.5, size: 16, color: "#ffffff" });
        }
        // Whole wave sliced, nothing hit the floor: a small clean bonus.
        const w = it.wave && state.waves[it.wave];
        if (w) {
          w.left--;
          if (w.left <= 0) {
            delete state.waves[it.wave];
            setScore(state.score + 2);
            state.floaters.push({ text: "Clean! +2", x: it.x, y: it.y - 54, life: 0.9, size: 20, color: "#7ddba0" });
            sfx("chime");
          }
        }
        // Two REAL halves: each piece is the glyph clipped along the cut
        // line, drifting apart perpendicular to the blade.
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const px = Math.cos(ang + Math.PI / 2);
        const py = Math.sin(ang + Math.PI / 2);
        for (const side of [-1, 1]) {
          state.pieces.push({
            glyph: it.glyph,
            x: it.x + px * side * 3,
            y: it.y + py * side * 3,
            vx: it.vx * 0.5 + px * side * 150,
            vy: it.vy * 0.2 + py * side * 150 - 40,
            rot: it.rot,
            vrot: side * 3.2,
            cutAng: ang - it.rot, // the cut, glued to the glyph's own frame
            side: side,
            life: 1.0,
          });
        }
        // A white-hot streak right where the blade went through.
        const cx = Math.cos(ang) * 30;
        const cy = Math.sin(ang) * 30;
        state.cuts.push({
          ax: it.x - cx, ay: it.y - cy, bx: it.x + cx, by: it.y + cy,
          life: 0.22, maxLife: 0.22, hot: true,
        });
      }
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!state.running || state.paused || state.manualPause) return;
    e.preventDefault();
    state.slicing = true;
    state.strokeSlices = 0;
    state.strokeId++;
    state.trail = [toWorld(e)];
  });
  window.addEventListener("pointermove", (e) => {
    if (!state.running || state.paused || !state.slicing) return;
    const p = toWorld(e);
    const prev = state.trail[state.trail.length - 1];
    state.trail.push(p);
    if (state.trail.length > 14) state.trail.shift();
    if (prev) {
      // Every segment also lingers as a fading cut mark, fruit-ninja style.
      state.cuts.push({ ax: prev.x, ay: prev.y, bx: p.x, by: p.y, life: 1.1, maxLife: 1.1 });
      if (state.cuts.length > 80) state.cuts.shift();
      sliceAlong(prev, p);
    }
  });
  function strokeEnd() {
    if (!state.slicing) return;
    state.slicing = false;
    // 3+ in one stroke pays the whole stroke again as a combo bonus.
    if (state.running && state.strokeSlices >= 3) {
      sfx("chime");
      setScore(state.score + state.strokeSlices);
      const last = state.trail[state.trail.length - 1];
      state.floaters.push({
        text: "Combo x" + state.strokeSlices + "! +" + state.strokeSlices,
        x: last ? last.x : W / 2,
        y: last ? last.y : H / 2,
        life: 1.1,
      });
    }
    state.strokeSlices = 0;
    state.trail = [];
  }
  window.addEventListener("pointerup", strokeEnd);
  window.addEventListener("pointercancel", strokeEnd);

  // --- Update / render -------------------------------------------------------
  function update(dt) {
    state.elapsed += dt;
    // Natural frenzy every 40 seconds: four seconds of bomb-free downpour.
    if (state.elapsed >= state.wildAt) {
      state.wildAt += WILD_EVERY;
      state.wildUntil = state.elapsed + 4;
      say("🌊 FRENZY! Slice everything!");
      sfx("chime");
    }
    // The soy bottle boss drops by every 30 seconds.
    if (state.elapsed >= state.bossAt) {
      state.bossAt += 30;
      tossBoss();
    }
    state.waveIn -= dt;
    if (state.waveIn <= 0) {
      wave();
      state.waveIn = waveEvery();
    }

    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      it.vy += GRAVITY * (it.slowFall ? 0.45 : 1) * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.vrot * dt;
      if (it.y > H + 60 && it.vy > 0) {
        state.items.splice(i, 1);
        // A drop spoils its wave's clean bonus.
        if (it.wave && state.waves[it.wave]) delete state.waves[it.wave];
        // Letting the boss bottle get away costs nothing; it's a bonus.
        if (!it.bomb && !it.boss) {
          // Fresh fish on the floor: that's a heart.
          state.lives--;
          state.flash = 0.35;
          sfx("thunk");
          if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
          if (state.lives <= 0) { endGame(); return; }
        }
      }
    }

    for (let i = state.pieces.length - 1; i >= 0; i--) {
      const p = state.pieces[i];
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.life -= dt;
      if (p.life <= 0) state.pieces.splice(i, 1);
    }

    for (let i = state.floaters.length - 1; i >= 0; i--) {
      const f = state.floaters[i];
      f.y -= 42 * dt;
      f.life -= dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }

    for (let i = state.cuts.length - 1; i >= 0; i--) {
      const c = state.cuts[i];
      c.life -= dt;
      if (c.life <= 0) state.cuts.splice(i, 1);
    }

    for (let i = state.booms.length - 1; i >= 0; i--) {
      const bm = state.booms[i];
      bm.life -= dt;
      if (bm.life <= 0) state.booms.splice(i, 1);
    }

    for (let i = state.sparks.length - 1; i >= 0; i--) {
      const s = state.sparks[i];
      s.vy += GRAVITY * 0.7 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) state.sparks.splice(i, 1);
    }

    // The live blade under the finger goes stale fast; the cut marks above
    // are what linger.
    const now = performance.now();
    while (state.trail.length && now - state.trail[0].t > 140) state.trail.shift();

    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // Dynamite rattles the whole box for a beat.
    if (state.shake > 0) {
      const m = 22 * state.shake;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Fading cut marks left behind by the blade.
    ctx.lineCap = "round";
    for (const c of state.cuts) {
      const a = c.life / c.maxLife;
      // Hit streaks flash white and die fast; normal marks fade in the blade color.
      ctx.strokeStyle = c.hot
        ? "rgba(255,255,255," + (a * 0.95).toFixed(3) + ")"
        : "rgba(" + trailRGB + "," + (a * 0.55).toFixed(3) + ")";
      ctx.lineWidth = c.hot ? 2 + a * 7 : 1 + a * 4;
      ctx.beginPath();
      ctx.moveTo(c.ax, c.ay);
      ctx.lineTo(c.bx, c.by);
      ctx.stroke();
    }

    // Sliced halves: the glyph clipped along its cut line, so each piece
    // really is half the thing that got cut.
    for (const p of state.pieces) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.rotate(p.cutAng);
      ctx.beginPath();
      ctx.rect(-ITEM_SIZE * 1.4, p.side < 0 ? -ITEM_SIZE * 1.4 : 0, ITEM_SIZE * 2.8, ITEM_SIZE * 1.4);
      ctx.clip();
      ctx.rotate(-p.cutAng);
      ctx.font = ITEM_SIZE + "px system-ui, sans-serif";
      ctx.fillText(p.glyph, 0, 0);
      ctx.restore();
    }

    for (const it of state.items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      // Goldens glow; the boss glows faintly too so it reads as special.
      if (it.golden || it.boss) {
        const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, it.boss ? 58 : 44);
        glow.addColorStop(0, it.golden ? "rgba(255,209,90,0.55)" : "rgba(216,230,238,0.4)");
        glow.addColorStop(1, "rgba(255,209,90,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, it.boss ? 58 : 44, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.rotate(it.rot);
      ctx.font = (it.boss ? 62 : ITEM_SIZE) + "px system-ui, sans-serif";
      ctx.fillText(it.glyph, 0, 0);
      ctx.restore();
      // The boss wears its remaining hits as pips.
      if (it.boss) {
        for (let p = 0; p < 3; p++) {
          ctx.save();
          ctx.globalAlpha = p < it.hp ? 0.95 : 0.2;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(it.x - 14 + p * 14, it.y - 46, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Frenzy banner while the downpour is on.
    if (state.wildUntil > state.elapsed) {
      ctx.save();
      ctx.globalAlpha = 0.75 + Math.sin(state.elapsed * 10) * 0.25;
      ctx.font = "800 30px system-ui, sans-serif";
      ctx.fillStyle = "#ffd15a";
      ctx.textAlign = "center";
      ctx.fillText("🌊 FRENZY", W / 2, 64);
      ctx.restore();
    }

    // Explosion shockwaves and debris.
    for (const bm of state.booms) {
      const t = 1 - bm.life / bm.maxLife;
      const r = 20 + t * 150;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.lineWidth = 10 * (1 - t) + 2;
      ctx.strokeStyle = "#ffd15a";
      ctx.beginPath();
      ctx.arc(bm.x, bm.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#ee435b";
      ctx.lineWidth = 5 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(bm.x, bm.y, r * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      if (t < 0.3) {
        ctx.globalAlpha = (0.3 - t) * 2.2;
        ctx.fillStyle = "#fff1c9";
        ctx.beginPath();
        ctx.arc(bm.x, bm.y, 34, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const s of state.sparks) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.life * 2.2);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // The live blade under the finger.
    if (state.trail.length > 1) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < state.trail.length; i++) {
        const a = state.trail[i - 1];
        const b = state.trail[i];
        const w = (i / state.trail.length) * 10 + 1.5;
        ctx.strokeStyle = "rgba(" + trailRGB + "," + (0.35 + (i / state.trail.length) * 0.6) + ")";
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.font = "26px system-ui, sans-serif";
    ctx.textAlign = "left";
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < state.lives ? 1 : 0.18;
      ctx.fillText("❤️", 16 + i * 34, 30);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    for (const f of state.floaters) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = "700 " + (f.size || 24) + "px system-ui, sans-serif";
      ctx.fillStyle = f.color || "#ffd15a";
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    if (state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = state.flash * 1.6;
      ctx.lineWidth = 18;
      ctx.strokeStyle = "#ee435b";
      ctx.strokeRect(0, 0, W, H);
      ctx.restore();
    }
    ctx.restore(); // shake transform
  }

  function frame(t) {
    if (state.running && !state.paused && !state.manualPause) {
      if (!state.lastTime) state.lastTime = t;
      const dt = Math.min((t - state.lastTime) / 1000, 0.05);
      state.lastTime = t;
      update(dt);
      render();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Presentation Mode hooks. Inert unless demo.js turned the mode on.
  if (window.PokeDemo && PokeDemo.active) {
    PokeDemo.register("ps", {
      golden: () => {
        if (state.running) {
          state.items.push({ x: 250 + Math.random() * 300, y: H + 30, vx: 0, vy: -940, rot: 0, vrot: 1.2, glyph: "🐟", bomb: false, golden: true, wave: 0 });
        }
      },
      frenzy: () => {
        if (state.running) {
          state.wildUntil = state.elapsed + 5;
          say("🌊 FRENZY! Slice everything!");
        }
      },
      boss: () => { if (state.running) tossBoss(); },
    });
  }
})();
