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
  let rng = Math.random; // swapped for the seeded stream on daily runs

  let best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { /* ignore */ }
  bestEl.textContent = String(best);

  if (wantsDaily) {
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
    elapsed: 0,
    items: [],
    bowlX: W / 2,
    targetX: W / 2,
    spawnIn: 0,
    lastTime: 0,
    flash: 0,
    floaters: [],
  };

  function setScore(n) {
    state.score = n;
    scoreEl.textContent = String(n);
  }

  function fallSpeed() { return Math.min(150 + state.elapsed * 4.5, 330); }
  function spawnEvery() { return Math.max(0.9 - state.elapsed * 0.008, 0.4); }
  function badChance() { return Math.min(0.16 + state.elapsed * 0.002, 0.3); }

  function spawn() {
    // Stray hearts heal in normal runs. Daily runs skip them entirely (and
    // draw nothing extra from the stream) so the seeded rain stays identical
    // for every player.
    if (!isDaily && state.lives < 3 && Math.random() < 0.08) {
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
    setScore(0);
    state.lives = 3;
    state.combo = 0;
    state.elapsed = 0;
    state.items = [];
    state.bowlX = state.targetX = W / 2;
    state.spawnIn = 0.5;
    state.lastTime = 0;
    state.flash = 0;
    state.floaters = [];
    rng = isDaily ? Daily.stream("td:spawn") : Math.random;
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
    const tick = setInterval(() => {
      n--;
      if (n > 0) { countNum.textContent = String(n); return; }
      clearInterval(tick);
      counting = false;
      screenCount.classList.add("hidden");
      startGame();
    }, 750);
  }

  function loadLbName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; }
  }

  function endGame() {
    state.running = false;
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

  startBtn.addEventListener("click", runCountdown);
  playAgainBtn.addEventListener("click", runCountdown);

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
    state.bowlX += (state.targetX - state.bowlX) * Math.min(1, dt * 34);
    state.bowlX = Math.max(70, Math.min(W - 70, state.bowlX));

    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      it.y += it.vy * dt;
      if (it.y >= BOWL_Y - 14 && it.y <= BOWL_Y + 26 && Math.abs(it.x - state.bowlX) <= BOWL_HALF) {
        state.items.splice(i, 1);
        if (it.heart) {
          state.lives = Math.min(3, state.lives + 1);
          state.floaters.push({ text: "+❤️", x: state.bowlX, y: BOWL_Y - 46, life: 0.9 });
        } else if (it.bad) {
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
        // A missed heart is a shame, not a punishment.
        if (!it.bad && !it.heart) {
          state.combo = 0;
          state.lives--;
          state.flash = 0.35;
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
