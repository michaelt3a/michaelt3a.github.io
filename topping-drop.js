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
  const BOWL_HALF = 68;
  const BOWL_Y = 540;

  // Daily plumbing: this page load is a live daily run only if the link says
  // so, it's actually Topping Drop's day, and today's attempt isn't spent.
  const wantsDaily = !!(window.Daily && Daily.isRun());
  const isDaily = wantsDaily && Daily.isTodaysGame("td") && !Daily.result();
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
        "You've already played today: " + Daily.result().score + " catches. Back tomorrow for a new rain.";
      startBtn.classList.add("hidden");
      startBtn.style.display = "none";
    } else {
      startSub.textContent = "Everyone gets this exact rain today. One attempt, so make it count.";
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
    feverUntil: 0, // every 10-catch streak: 5s of golden rain worth double
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
  function spawnEvery() { return Math.max(0.9 - state.elapsed * 0.008, 0.4); }
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
    // Fixed draw order (x, speed, spin, bad?, which) keeps daily runs in sync.
    const x = 60 + rng() * (W - 120);
    const vy = fallSpeed() * (0.85 + rng() * 0.3);
    const spin = (rng() - 0.5) * 2.4;
    const bad = rng() < badChance();
    const list = bad ? BAD : GOOD;
    state.items.push({
      x: x,
      y: -30,
      vy: vy,
      spin: spin,
      glyph: list[Math.floor(rng() * list.length)],
      bad: bad,
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
    state.feverUntil = 0;
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

  function endGame() {
    state.running = false;
    state.manualPause = false;
    screenPaused.classList.add("hidden");
    pauseBtn.style.display = "none";
    sfx("over");
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
      "You caught " + state.score + " topping" + (state.score === 1 ? "" : "s") + ".";
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
      if (state.score > best) {
        pts = Math.min(20, state.score - best);
        best = state.score;
        try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
        bestEl.textContent = String(best);
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
    startBtn.textContent = "Waiting for opponent…";
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

  // --- Update / render -------------------------------------------------------
  function update(dt) {
    state.elapsed += dt;
    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      spawn();
      state.spawnIn = spawnEvery();
    }
    state.bowlX += (state.targetX - state.bowlX) * Math.min(1, dt * 34);
    state.bowlX = Math.max(70, Math.min(W - 70, state.bowlX));

    const speedMult = state.sabSpeedUntil > state.elapsed ? 1.45 : 1;
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      it.y += it.vy * dt * speedMult;
      if (it.y >= BOWL_Y - 14 && it.y <= BOWL_Y + 26 && Math.abs(it.x - state.bowlX) <= BOWL_HALF) {
        state.items.splice(i, 1);
        if (it.heart) {
          state.lives = Math.min(3, state.lives + 1);
          state.floaters.push({ text: "+❤️", x: state.bowlX, y: BOWL_Y - 46, life: 0.9 });
          sfx("chime");
        } else if (it.bad) {
          state.lives--;
          state.combo = 0;
          state.flash = 0.35;
          sfx("thunk");
          if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
          if (state.lives <= 0) { endGame(); return; }
        } else {
          state.combo++;
          if (state.combo > state.bestCombo) state.bestCombo = state.combo;
          if (state.combo >= 20 && window.PokeAch) PokeAch.unlock("td-combo20");
          // Every 10th straight catch lights the fever: 5 seconds of double.
          if (state.combo % 10 === 0) {
            state.feverUntil = state.elapsed + 5;
            state.floaters.push({ text: "🔥 FEVER x2!", x: state.bowlX, y: BOWL_Y - 60, life: 1.1 });
            sfx("chime");
          }
          sfx("pop");
          setScore(state.score + (state.feverUntil > state.elapsed ? 2 : 1));
        }
        continue;
      }
      if (it.y > H + 40) {
        state.items.splice(i, 1);
        // A missed heart is a shame, not a punishment.
        if (!it.bad && !it.heart) {
          state.combo = 0;
          state.lives--;
          state.flash = 0.35;
          sfx("thunk");
          if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
          if (state.lives <= 0) { endGame(); return; }
        }
      }
    }
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
    for (let i = state.floaters.length - 1; i >= 0; i--) {
      const f = state.floaters[i];
      f.y -= 40 * dt;
      f.life -= dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
  }

  function drawBowl() {
    const x = state.bowlX;
    const skin = window.PokeSkins ? PokeSkins.active() : null;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, BOWL_Y + 34, 74, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin ? skin.body : "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, BOWL_Y + 6, BOWL_HALF + 6, 30, 0, 0, Math.PI, false);
    ctx.fill();
    ctx.fillStyle = skin ? skin.inner : "#e8eef0";
    ctx.beginPath();
    ctx.ellipse(x, BOWL_Y + 6, BOWL_HALF + 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (skin && skin.rim) {
      ctx.strokeStyle = skin.rim;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(x, BOWL_Y + 6, BOWL_HALF + 6, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

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
      ctx.font = "700 24px system-ui, sans-serif";
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    if (state.combo >= 5) {
      ctx.font = "700 20px system-ui, sans-serif";
      ctx.fillStyle = "#ffd15a";
      ctx.textAlign = "center";
      ctx.fillText("x" + state.combo + " streak", state.bowlX, BOWL_Y - 34);
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
})();
