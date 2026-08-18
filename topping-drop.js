// Topping Drop — a catcher. Ingredients rain from the top of the box; slide
// the bowl to catch the good ones. Losing a heart happens two ways: catching
// a fork or rogue chili, or letting good food hit the floor. Three hearts a
// run. Points are stingy on purpose: only a new personal best earns any,
// one point per block of improvement, capped per run.
(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width; // 800
  const H = canvas.height; // 600

  const overlay = document.getElementById("overlay");
  const screenStart = document.getElementById("screen-start");
  const screenOver = document.getElementById("screen-gameover");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("high-score");
  const overSub = document.getElementById("gameover-subtitle");
  const pointsLine = document.getElementById("points-line");

  const BEST_KEY = "pokeworks-topping-best";
  const GOOD = ["🍣", "🥑", "🥒", "🍤", "🌽", "🥭", "🧅"];
  const BAD = ["🍴", "🌶️"];
  const BOWL_HALF = 68; // catch window either side of the bowl's center
  const BOWL_Y = 540; // rim height in world pixels

  let best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { /* ignore */ }
  bestEl.textContent = String(best);

  const state = {
    running: false,
    paused: false,
    score: 0,
    lives: 3,
    combo: 0,
    elapsed: 0,
    items: [], // {x, y, vy, spin, glyph, bad}
    bowlX: W / 2,
    targetX: W / 2,
    spawnIn: 0,
    lastTime: 0,
    flash: 0, // red edge flash after catching something bad
  };

  function setScore(n) {
    state.score = n;
    scoreEl.textContent = String(n);
  }

  // Difficulty ramp: everything keys off seconds played.
  function fallSpeed() { return Math.min(150 + state.elapsed * 4.5, 330); }
  function spawnEvery() { return Math.max(0.9 - state.elapsed * 0.008, 0.4); }
  function badChance() { return Math.min(0.16 + state.elapsed * 0.002, 0.3); }

  function spawn() {
    const bad = Math.random() < badChance();
    const list = bad ? BAD : GOOD;
    state.items.push({
      x: 60 + Math.random() * (W - 120),
      y: -30,
      vy: fallSpeed() * (0.85 + Math.random() * 0.3),
      spin: (Math.random() - 0.5) * 2.4,
      glyph: list[Math.floor(Math.random() * list.length)],
      bad: bad,
    });
  }

  function startGame() {
    state.running = true;
    state.paused = false;
    setScore(0);
    state.lives = 3;
    state.combo = 0;
    state.elapsed = 0;
    state.items = [];
    state.bowlX = state.targetX = W / 2;
    state.spawnIn = 0.5;
    state.lastTime = 0;
    state.flash = 0;
    overlay.classList.add("hidden");
    if (window.PokeStreak) PokeStreak.mark();
    if (window.PokeTrack) PokeTrack.hit("play", "topping");
  }

  function endGame() {
    state.running = false;
    overSub.textContent =
      "You caught " + state.score + " topping" + (state.score === 1 ? "" : "s") + ".";
    // Points only for pushing your personal best, capped so runs can't farm.
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
    } else {
      pointsLine.hidden = true;
    }
    screenStart.classList.add("hidden");
    screenOver.classList.remove("hidden");
    overlay.classList.remove("hidden");
  }

  // --- Input: the bowl chases the pointer -----------------------------------
  function pointToWorldX(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) * (W / rect.width);
  }
  canvas.addEventListener("pointermove", (e) => {
    if (state.running) state.targetX = pointToWorldX(e);
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (state.running) state.targetX = pointToWorldX(e);
  });

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("play-again-btn").addEventListener("click", () => {
    screenOver.classList.add("hidden");
    startGame();
  });

  // A backgrounded tab freezes rather than losing you the run.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) { state.paused = true; state.lastTime = 0; }
    else state.paused = false;
  });

  // --- Update / render -------------------------------------------------------
  function update(dt) {
    state.elapsed += dt;
    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      spawn();
      state.spawnIn = spawnEvery();
    }
    // The bowl eases toward the finger so it feels weighty, not twitchy.
    state.bowlX += (state.targetX - state.bowlX) * Math.min(1, dt * 14);
    state.bowlX = Math.max(70, Math.min(W - 70, state.bowlX));

    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      it.y += it.vy * dt;
      if (it.y >= BOWL_Y - 14 && it.y <= BOWL_Y + 26 && Math.abs(it.x - state.bowlX) <= BOWL_HALF) {
        state.items.splice(i, 1);
        if (it.bad) {
          state.lives--;
          state.combo = 0;
          state.flash = 0.35;
          if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
          if (state.lives <= 0) { endGame(); return; }
        } else {
          state.combo++;
          setScore(state.score + 1);
        }
        continue;
      }
      if (it.y > H + 40) {
        state.items.splice(i, 1);
        if (!it.bad) {
          // Dropped food costs a heart, same as catching junk.
          state.combo = 0;
          state.lives--;
          state.flash = 0.35;
          if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
          if (state.lives <= 0) { endGame(); return; }
        }
      }
    }
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
  }

  function drawBowl() {
    const x = state.bowlX;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, BOWL_Y + 34, 74, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, BOWL_Y + 6, BOWL_HALF + 6, 30, 0, 0, Math.PI, false);
    ctx.fill();
    ctx.fillStyle = "#e8eef0";
    ctx.beginPath();
    ctx.ellipse(x, BOWL_Y + 6, BOWL_HALF + 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // falling items
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

    // lives, top-left
    ctx.font = "26px system-ui, sans-serif";
    ctx.textAlign = "left";
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < state.lives ? 1 : 0.18;
      ctx.fillText("❤️", 16 + i * 34, 30);
    }
    ctx.globalAlpha = 1;

    // combo tag once it's worth bragging about
    if (state.combo >= 5) {
      ctx.font = "700 20px system-ui, sans-serif";
      ctx.fillStyle = "#ffd15a";
      ctx.textAlign = "center";
      ctx.fillText("x" + state.combo + " streak", state.bowlX, BOWL_Y - 34);
    }

    // red edge flash after a bad catch
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
    if (state.running && !state.paused) {
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
