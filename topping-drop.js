// Topping Drop — a catcher. Ingredients rain from the top of the box; slide
// the bowl to catch the good ones. Losing a heart happens two ways: catching
// a fork or rogue chili, or letting good food hit the floor. Three hearts a
// run, and stray hearts fall to heal you (normal runs only).
//
// Daily mode (?daily=1): the rain is seeded from the date so everyone gets
// the same run, hearts don't fall, it's one attempt, and the score posts to
// the day's board instead of paying personal-best points.
(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width; // 800
  const H = canvas.height; // 600

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

  const BEST_KEY = "pokeworks-topping-best";
  const NAME_KEY = "pokeworks-lb-name";
  const GOOD = ["🍣", "🥑", "🥒", "🍤", "🌽", "🥭", "🧅"];
  const BAD = ["🍴", "🌶️"];
  const MAX_LIVES = 5; // 3 red hearts, plus up to 2 gold bonus hearts
  // OS-level "reduce motion" turns off the camera shake.
  const REDUCED_MOTION =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Each topping splashes its own colors when it lands in the bowl.
  const JUICE = {
    "🍣": ["#ff9e80", "#fff1e8", "#ee6f57"],
    "🥑": ["#7fce6e", "#4a9e58", "#e8f5c8"],
    "🥒": ["#8fd672", "#5cb85c", "#e0f5d0"],
    "🍤": ["#ffb08a", "#ff8a5c", "#fff1e8"],
    "🌽": ["#ffe066", "#ffd15a", "#fff7cc"],
    "🥭": ["#ffc04d", "#ff9e27", "#ffe9b0"],
    "🧅": ["#e8d5f0", "#c8a5e0", "#ffffff"],
  };
  const GOLD_JUICE = ["#ffd15a", "#fff1c9", "#ffb52e"];
  const HEART_JUICE = ["#ff8da1", "#ffd9e0", "#ffffff"];
  const BOWL_HALF = 68;
  const BOWL_Y = 540;

  // Daily plumbing: this page load is a live daily run only if the link says
  // so, it's actually Topping Drop's day, and today's attempt isn't spent.
  const wantsDaily = !!(window.Daily && Daily.isRun());
  const isDaily = wantsDaily && Daily.isTodaysGame("td") && !Daily.result();
  // The day's seeded twist, daily runs only: one parameter changes, same for everyone.
  const DAILY_TWIST = isDaily && Daily.twist ? Daily.twist() : null;
  const STAR_CHANCE = DAILY_TWIST && DAILY_TWIST.id === "stars" ? 0.1 : 0.04;
  const FEVER_EVERY = DAILY_TWIST && DAILY_TWIST.id === "fever" ? 7 : 10;
  const SPAWN_MULT = DAILY_TWIST && DAILY_TWIST.id === "downpour" ? 0.8 : 1;
  // Duel plumbing (?duel=CODE): the room code seeds the rain so both players
  // fight the same drops; duel.js owns the realtime side.
  const isDuel = !wantsDaily && !!(window.PokeDuel && PokeDuel.active);
  let rng = Math.random; // swapped for a seeded stream on daily and duel runs

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
      "Same rain for both of you; most catches wins. Every 10 catches loads a sabotage. " +
      "Hit Ready; the countdown starts when you both have.";
    startBtn.textContent = "✓ Ready";
  } else if (wantsDaily) {
    startTitle.textContent = "🗓 Daily Challenge";
    if (!Daily.isTodaysGame("td")) {
      startSub.textContent =
        "Today's challenge is " + Daily.challenge().game.label + ". Head back to the hub for it.";
      startBtn.classList.add("hidden");
      startBtn.style.display = "none";
    } else if (Daily.result()) {
      startSub.textContent =
        "You've already played today: " + Daily.result().score + " catches. Come back tomorrow.";
      startBtn.classList.add("hidden");
      startBtn.style.display = "none";
    } else {
      startSub.textContent = "Everyone gets the same drops today. You get one attempt." +
        (DAILY_TWIST ? " Today's twist: " + DAILY_TWIST.label + ". " + DAILY_TWIST.desc : "");
    }
  }

  const state = {
    running: false,
    paused: false,
    score: 0,
    lives: 3,
    combo: 0,
    bestCombo: 0,
    elapsed: 0,
    items: [],
    bowlX: W / 2,
    targetX: W / 2,
    spawnIn: 0,
    lastTime: 0,
    flash: 0,
    floaters: [],
    sparks: [], // splash droplets from catches
    shake: 0, // seconds of camera shake left (bad catches, drops)
    squash: 0, // the bowl's catch squash, decaying
    feverUntil: 0, // every 10-catch streak: 5s of golden rain worth double
    wideUntil: 0, // caught a ⭐: double-width bowl until this time
    // duel bits
    duelCharges: 0,
    duelNextChargeAt: 10,
    duelSabsSent: 0,
    forkDebt: 0, // incoming "forks" sabotage queues junk into the rain
    sabSpeedUntil: 0, // incoming "speed" sabotage: faster falls until this time
  };

  function say(text) {
    state.floaters.push({ text: text, x: W / 2, y: 110, life: 1.2 });
  }

  function setScore(n) {
    state.score = n;
    scoreEl.textContent = String(n);
    if (isDuel && state.running) {
      PokeDuel.sendScore(n);
      if (n >= state.duelNextChargeAt) {
        state.duelNextChargeAt += 10;
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
      PokeDuel.sendSab(Math.random() < 0.5 ? "speed" : "forks");
      say("🧨 Sabotage sent!");
      updateSabBtn();
    });
    PokeDuel.onSab((kind, who) => {
      if (!state.running || state.paused) return;
      if (kind === "speed") {
        state.sabSpeedUntil = state.elapsed + 6;
        say("⚡ " + who + " sped up the rain!");
      } else {
        state.forkDebt += 3;
        say("🍴 " + who + " threw forks!");
      }
      sfx("thunk");
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* ignore */ } }
    });
  }

  function fallSpeed() { return Math.min(150 + state.elapsed * 4.5, 330); }
  function spawnEvery() { return Math.max(0.9 - state.elapsed * 0.008, 0.4) * SPAWN_MULT; }
  function badChance() { return Math.min(0.16 + state.elapsed * 0.002, 0.3); }

  function spawn() {
    // A "forks" sabotage jumps the queue with junk. These draw from
    // Math.random, not the seeded stream: sabotage is what makes duel runs
    // diverge, and that's the point.
    if (isDuel && state.forkDebt > 0) {
      state.forkDebt--;
      state.items.push({
        x: 60 + Math.random() * (W - 120),
        y: -30,
        vy: fallSpeed() * (0.9 + Math.random() * 0.2),
        spin: (Math.random() - 0.5) * 2.4,
        glyph: "🍴",
        bad: true,
      });
      return;
    }
    // Stray hearts heal in normal runs. Daily and duel runs skip them (and
    // draw nothing extra from the stream) so the seeded rain stays identical
    // for every player.
    if (!isDaily && !isDuel && state.lives < 3 && Math.random() < 0.08) {
      state.items.push({
        x: 60 + Math.random() * (W - 120),
        y: -30,
        vy: fallSpeed() * 0.75,
        spin: (Math.random() - 0.5) * 1.6,
        glyph: "❤️",
        bad: false,
        heart: true,
      });
      return;
    }
    // At full health, a rare gold heart can push you PAST full — up to 5.
    // Same rules as heals: normal runs only, nothing drawn from the stream.
    if (!isDaily && !isDuel && state.lives >= 3 && state.lives < MAX_LIVES && Math.random() < 0.025) {
      state.items.push({
        x: 60 + Math.random() * (W - 120),
        y: -30,
        vy: fallSpeed() * 0.8,
        spin: (Math.random() - 0.5) * 1.6,
        glyph: "💛",
        bad: false,
        bonus: true,
      });
      return;
    }
    // Fixed draw order (x, speed, spin, bad?, which, star?) keeps daily and
    // duel runs in sync.
    const x = 60 + rng() * (W - 120);
    const vy = fallSpeed() * (0.85 + rng() * 0.3);
    const spin = (rng() - 0.5) * 2.4;
    const bad = rng() < badChance();
    const glyphRoll = rng();
    const starRoll = rng();
    // A rare star doubles the bowl's width for 8 seconds.
    const star = !bad && state.elapsed > 8 && starRoll < STAR_CHANCE;
    const list = bad ? BAD : GOOD;
    state.items.push({
      x: x,
      y: -30,
      vy: star ? vy * 0.8 : vy,
      spin: spin,
      glyph: star ? "⭐" : list[Math.floor(glyphRoll * list.length)],
      bad: bad,
      star: star,
    });
  }

  function startGame() {
    state.running = true;
    state.paused = false;
    state.lives = 3;
    state.combo = 0;
    state.bestCombo = 0;
    state.elapsed = 0;
    state.items = [];
    state.bowlX = state.targetX = W / 2;
    state.spawnIn = 0.5;
    state.lastTime = 0;
    state.flash = 0;
    state.floaters = [];
    state.sparks = [];
    state.shake = 0;
    state.squash = 0;
    state.feverUntil = 0;
    state.wideUntil = 0;
    state.duelCharges = 0;
    state.duelNextChargeAt = 10;
    state.duelSabsSent = 0;
    state.forkDebt = 0;
    state.sabSpeedUntil = 0;
    updateSabBtn();
    setScore(0);
    state.manualPause = false;
    screenPaused.classList.add("hidden");
    pauseBtn.style.display = "";
    pauseBtn.textContent = "⏸";
    rng = isDaily ? Daily.stream("td:spawn") : isDuel ? PokeDuel.stream("td:spawn") : Math.random;
    overlay.classList.add("hidden");
    if (window.PokeStreak) PokeStreak.mark();
    if (window.PokeTrack) PokeTrack.hit(isDaily ? "daily" : "play", "topping");
  }

  // 3-2-1 so your hand is on the bowl before the rain starts.
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

  // One plain share line after posting a daily score.
  function addDailyShare() {
    if (document.getElementById("daily-share-btn")) return;
    const b = document.createElement("button");
    b.id = "daily-share-btn";
    b.type = "button";
    b.className = "btn btn-secondary";
    b.textContent = "Share score";
    b.addEventListener("click", () => {
      const text = "Pokeworks Daily · Topping Drop · " + state.score + " catches · " +
        location.origin + location.pathname.replace(/[^/]*$/, "");
      if (navigator.share) {
        navigator.share({ text: text }).catch(() => { /* backed out, fine */ });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => { b.textContent = "✓ Copied"; });
      }
    });
    lbDone.after(b);
  }

  function endGame() {
    state.running = false;
    state.manualPause = false;
    screenPaused.classList.add("hidden");
    pauseBtn.style.display = "none";
    sfx("over");
    // Keep the lifetime best streak around for the achievement wall.
    try {
      const k = "pokeworks-topping-combo-best";
      if (state.bestCombo > (parseInt(localStorage.getItem(k), 10) || 0)) {
        localStorage.setItem(k, String(state.bestCombo));
      }
    } catch (e) { /* ignore */ }
    // Feed the run into today's shop challenges (points for the Rewards Shop).
    if (window.PokeChallenges) {
      PokeChallenges.report("td", {
        score: state.score,
        combo: state.bestCombo,
        seconds: state.elapsed,
        runs: 1,
      });
    }
    // A duel skips the normal game-over screen: duel.js paints the waiting
    // panel, then the stats face-off once both runs end.
    if (isDuel) {
      PokeDuel.finish(state.score, {
        rows: [
          ["Catches", state.score],
          ["Best streak", state.bestCombo],
          ["Sabotages", state.duelSabsSent],
        ],
      });
      return;
    }
    overSub.textContent =
      "You caught " + state.score + " topping" + (state.score === 1 ? "" : "s") + "." +
      (state.score < best && best - state.score <= 5
        ? " " + (best - state.score) + " short of your best (" + best + ")."
        : "");
    pointsLine.hidden = true;
    lbEntry.classList.add("hidden");
    lbDone.classList.add("hidden");

    if (isDaily) {
      // One attempt: post to the day's board; the +50 pts land via the hub.
      Daily.complete(state.score);
      playAgainBtn.hidden = true;
      lbName.value = loadLbName();
      lbEntry.classList.remove("hidden");
    } else {
      playAgainBtn.hidden = false;
      let pts = 0;
      const prevBest = best;
      if (state.score > best) {
        pts = Math.min(20, state.score - best);
        best = state.score;
        try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
        bestEl.textContent = String(best);
        if (prevBest > 0) overSub.textContent += " Your old best was " + prevBest + ".";
        if (window.PokePoints) PokePoints.add(pts, "Topping Drop: new best " + best);
      }
      if (pts > 0) {
        pointsLine.hidden = false;
        pointsLine.textContent = "🏆 New best! +" + pts + " points";
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
  lbSave.addEventListener("click", submitDaily);
  lbName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitDaily(); }
  });

  // --- Input: the bowl tracks the pointer -----------------------------------
  function trackPointer(e) {
    if (!state.running) return;
    const rect = canvas.getBoundingClientRect();
    state.targetX = (e.clientX - rect.left) * (W / rect.width);
  }
  window.addEventListener("pointermove", trackPointer);
  window.addEventListener("pointerdown", trackPointer);

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

  // The next quest worth chasing, on the start screen (normal runs only).
  {
    const qh = document.getElementById("quest-hint");
    if (qh && !isDaily && !isDuel && window.PokeChallenges && PokeChallenges.startHint) {
      qh.textContent = PokeChallenges.startHint("td");
    }
  }

  // Arrow keys steer the bowl too; the pointer keeps working exactly as before.
  let keyDir = 0;
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { keyDir = -1; e.preventDefault(); }
    else if (e.key === "ArrowRight") { keyDir = 1; e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => {
    if ((e.key === "ArrowLeft" && keyDir === -1) || (e.key === "ArrowRight" && keyDir === 1)) keyDir = 0;
  });

  // A burst of droplets where something lands in the bowl.
  function spawnSparks(x, y, colors, n) {
    for (let k = 0; k < n; k++) {
      const ang = -Math.PI * (0.15 + Math.random() * 0.7); // fan upward
      const sp = 80 + Math.random() * 160;
      state.sparks.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0.35 + Math.random() * 0.3,
      });
    }
  }

  // --- Update / render -------------------------------------------------------
  function update(dt) {
    state.elapsed += dt;
    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      spawn();
      state.spawnIn = spawnEvery();
    }
    if (keyDir) {
      state.targetX = Math.max(70, Math.min(W - 70, state.targetX + keyDir * 560 * dt));
    }
    state.bowlX += (state.targetX - state.bowlX) * Math.min(1, dt * 34);
    state.bowlX = Math.max(70, Math.min(W - 70, state.bowlX));

    const speedMult = state.sabSpeedUntil > state.elapsed ? 1.45 : 1;
    const half = state.wideUntil > state.elapsed ? BOWL_HALF * 1.8 : BOWL_HALF;
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      it.y += it.vy * dt * speedMult;
      if (it.y >= BOWL_Y - 14 && it.y <= BOWL_Y + 26 && Math.abs(it.x - state.bowlX) <= half) {
        state.items.splice(i, 1);
        state.squash = Math.max(state.squash, 0.16); // the bowl takes the catch
        if (it.star) {
          state.wideUntil = state.elapsed + 8;
          state.floaters.push({ text: "⭐ WIDE BOWL!", x: state.bowlX, y: BOWL_Y - 60, life: 1.1 });
          spawnSparks(it.x, BOWL_Y - 4, GOLD_JUICE, 14);
          sfx("chime");
        } else if (it.heart) {
          // Heals top you up to 3; they never touch gold bonus hearts.
          if (state.lives < 3) state.lives++;
          state.floaters.push({ text: "+❤️", x: state.bowlX, y: BOWL_Y - 46, life: 0.9 });
          spawnSparks(it.x, BOWL_Y - 4, HEART_JUICE, 10);
          sfx("chime");
        } else if (it.bonus) {
          if (state.lives < MAX_LIVES) state.lives++;
          state.floaters.push({ text: "+💛", x: state.bowlX, y: BOWL_Y - 46, life: 0.9, color: "#ffd15a" });
          spawnSparks(it.x, BOWL_Y - 4, GOLD_JUICE, 12);
          sfx("chime");
        } else if (it.bad) {
          state.lives--;
          state.combo = 0;
          state.flash = 0.35;
          if (!REDUCED_MOTION) state.shake = 0.22;
          spawnSparks(it.x, BOWL_Y - 4, ["#ee435b", "#8a2f28", "#3a4348"], 10);
          sfx("thunk");
          if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
          if (state.lives <= 0) { endGame(); return; }
        } else {
          state.combo++;
          if (state.combo > state.bestCombo) state.bestCombo = state.combo;
          if (state.combo >= 20 && window.PokeAch) PokeAch.unlock("td-combo20");
          // Every 10th straight catch lights the fever: 5 seconds of double.
          if (state.combo % FEVER_EVERY === 0) {
            state.feverUntil = state.elapsed + 5;
            state.floaters.push({ text: "🔥 FEVER x2!", x: state.bowlX, y: BOWL_Y - 60, life: 1.1 });
            spawnSparks(state.bowlX, BOWL_Y - 4, GOLD_JUICE, 16);
            sfx("chime");
          }
          sfx("pop");
          const fever = state.feverUntil > state.elapsed;
          spawnSparks(it.x, BOWL_Y - 4, fever ? GOLD_JUICE : JUICE[it.glyph] || GOLD_JUICE, 7);
          state.floaters.push({
            text: fever ? "+2" : "+1",
            x: it.x, y: BOWL_Y - 30, life: 0.5,
            size: 16, color: fever ? "#ffd15a" : "#ffffff",
          });
          setScore(state.score + (fever ? 2 : 1));
        }
        continue;
      }
      if (it.y > H + 40) {
        state.items.splice(i, 1);
        // A missed heart, gold heart, or star is a shame, not a punishment.
        if (!it.bad && !it.heart && !it.star && !it.bonus) {
          state.combo = 0;
          state.lives--;
          state.flash = 0.35;
          if (!REDUCED_MOTION) state.shake = 0.18;
          state.floaters.push({ text: "✗", x: it.x, y: H - 60, life: 0.7, size: 26, color: "#ee435b" });
          sfx("thunk");
          if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
          if (state.lives <= 0) { endGame(); return; }
        }
      }
    }
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
    if (state.squash > 0) state.squash = Math.max(0, state.squash - dt * 1.4);
    for (let i = state.sparks.length - 1; i >= 0; i--) {
      const s = state.sparks[i];
      s.vy += 700 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) state.sparks.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i--) {
      const f = state.floaters[i];
      f.y -= 40 * dt;
      f.life -= dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
  }

  function drawBowl() {
    const x = state.bowlX;
    const half = (state.wideUntil > state.elapsed ? BOWL_HALF * 1.8 : BOWL_HALF) + 6;
    const skin = window.PokeSkins ? PokeSkins.active() : null;
    ctx.save();
    // A catch squashes the bowl for a beat: wider, flatter, then back.
    if (state.squash > 0) {
      ctx.translate(x, BOWL_Y + 10);
      ctx.scale(1 + state.squash * 0.45, 1 - state.squash * 0.55);
      ctx.translate(-x, -(BOWL_Y + 10));
    }
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, BOWL_Y + 34, half + 4, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin ? skin.body : "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, BOWL_Y + 6, half, 30, 0, 0, Math.PI, false);
    ctx.fill();
    ctx.fillStyle = skin ? skin.inner : "#e8eef0";
    ctx.beginPath();
    ctx.ellipse(x, BOWL_Y + 6, half, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (skin && skin.rim) {
      ctx.strokeStyle = skin.rim;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(x, BOWL_Y + 6, half, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // Bad catches and drops rattle the box for a beat.
    if (state.shake > 0) {
      const m = 20 * state.shake;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const it of state.items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(Math.sin(it.y / 60) * 0.18 * it.spin);
      ctx.font = "34px system-ui, sans-serif";
      ctx.fillText(it.glyph, 0, 0);
      ctx.restore();
    }

    drawBowl();

    for (const s of state.sparks) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.life * 2.2);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.font = "26px system-ui, sans-serif";
    ctx.textAlign = "left";
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < state.lives ? 1 : 0.18;
      ctx.fillText("❤️", 16 + i * 34, 30);
    }
    // Bonus hearts past full show gold, tacked onto the row.
    ctx.globalAlpha = 1;
    for (let i = 3; i < state.lives; i++) {
      ctx.fillText("💛", 16 + i * 34, 30);
    }

    ctx.textAlign = "center";
    for (const f of state.floaters) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = "700 " + (f.size || 24) + "px system-ui, sans-serif";
      ctx.fillStyle = f.color || "#ffd15a";
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    if (state.combo >= 5) {
      ctx.font = "700 20px system-ui, sans-serif";
      ctx.fillStyle = "#ffd15a";
      ctx.textAlign = "center";
      ctx.fillText("x" + state.combo + " streak", state.bowlX, BOWL_Y - 34);
    }
    // Fever progress pips: how many straight catches until the x2 window.
    if (state.combo >= 2 && state.feverUntil <= state.elapsed) {
      const prog = state.combo % FEVER_EVERY;
      const gap = 11;
      const x0 = state.bowlX - ((FEVER_EVERY - 1) * gap) / 2;
      for (let i = 0; i < FEVER_EVERY; i++) {
        ctx.beginPath();
        ctx.arc(x0 + i * gap, BOWL_Y - 55, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = i < prog ? "#ffd15a" : "rgba(0,0,0,0.15)";
        ctx.fill();
      }
    }

    // Fever: a pulsing gold frame and a banner while the x2 window is open.
    if (state.feverUntil > state.elapsed) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(state.elapsed * 9) * 0.3;
      ctx.lineWidth = 10;
      ctx.strokeStyle = "#ffd15a";
      ctx.strokeRect(0, 0, W, H);
      ctx.font = "800 26px system-ui, sans-serif";
      ctx.fillStyle = "#ffd15a";
      ctx.textAlign = "center";
      ctx.fillText("🔥 FEVER x2", W / 2, 64);
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

  // Presentation Mode hooks: one-tap versions of states that normally take
  // a streak to reach. Inert unless demo.js turned the mode on.
  if (window.PokeDemo && PokeDemo.active) {
    PokeDemo.register("td", {
      fever: () => { if (state.running) state.feverUntil = state.elapsed + 6; },
      star: () => {
        if (state.running) state.items.push({ x: 200 + Math.random() * 400, y: -30, vy: 300, spin: 0.5, glyph: "⭐", bad: false, star: true });
      },
      heart: () => {
        if (state.running) state.items.push({ x: 200 + Math.random() * 400, y: -30, vy: 260, spin: 0.5, glyph: "❤️", bad: false, heart: true });
      },
      goldHeart: () => {
        if (state.running) state.items.push({ x: 200 + Math.random() * 400, y: -30, vy: 260, spin: 0.5, glyph: "💛", bad: false, bonus: true });
      },
      streak: () => { if (state.running) state.combo = 8; },
    });
  }
})();
