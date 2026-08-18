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
  const GOOD = ["🐟", "🍣", "🥑", "🍤", "🥒", "🥭"];
  const BOMB = "🧨";
  const GRAVITY = 1000;

  const wantsDaily = !!(window.Daily && Daily.isRun());
  const isDaily = wantsDaily && Daily.isTodaysGame("ps") && !Daily.result();
  let rng = Math.random;

  let best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { /* ignore */ }
  bestEl.textContent = String(best);

  if (wantsDaily) {
    startTitle.textContent = "🗓 Daily Challenge";
    if (!Daily.isTodaysGame("ps")) {
      startSub.textContent =
        "Today's challenge is " + Daily.challenge().game.label + ". Head back to the hub for it.";
      startBtn.classList.add("hidden");
      startBtn.style.display = "none";
    } else if (Daily.result()) {
      startSub.textContent =
        "You've already played today: " + Daily.result().score + " slices. Back tomorrow for a new catch.";
      startBtn.classList.add("hidden");
      startBtn.style.display = "none";
    } else {
      startSub.textContent = "Everyone slices this exact catch today. One attempt, so make it count.";
    }
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
    waveIn: 0.9,
    lastTime: 0,
    flash: 0,
    shake: 0,
  };

  function setScore(n) {
    state.score = n;
    scoreEl.textContent = String(n);
  }

  function waveEvery() { return Math.max(1.6 - state.elapsed * 0.012, 0.85); }
  function bombChance() { return Math.min(0.12 + state.elapsed * 0.002, 0.22); }

  function tossOne() {
    // Fixed draw order per item (x, lift, drift, bomb?, which) so daily
    // waves stay identical for everyone.
    const x = 100 + rng() * (W - 200);
    const vy = -(820 + rng() * 180);
    const vx = (W / 2 - x) * (0.35 + rng() * 0.3);
    const bomb = rng() < bombChance();
    const glyph = bomb ? BOMB : GOOD[Math.floor(rng() * GOOD.length)];
    state.items.push({
      x: x,
      y: H + 30,
      vx: vx,
      vy: vy,
      rot: 0,
      vrot: (x < W / 2 ? 1 : -1) * (1.2 + Math.abs(vx) / 120),
      glyph: glyph,
      bomb: bomb,
    });
  }

  function wave() {
    // Both extra-item rolls are always drawn, even when unused, to keep the
    // seeded stream in lockstep.
    const roll2 = rng();
    const roll3 = rng();
    let count = 1;
    if (roll2 < Math.min(0.25 + state.elapsed * 0.01, 0.7)) count++;
    if (state.elapsed > 20 && roll3 < 0.3) count++;
    for (let i = 0; i < count; i++) tossOne();
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
    state.waveIn = 0.7;
    state.lastTime = 0;
    state.flash = 0;
    state.shake = 0;
    rng = isDaily ? Daily.stream("ps:wave") : Math.random;
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
      "You sliced " + state.score + " piece" + (state.score === 1 ? "" : "s") + ".";
    pointsLine.hidden = true;
    lbEntry.classList.add("hidden");
    lbDone.classList.add("hidden");

    if (isDaily) {
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
        if (window.PokePoints) PokePoints.add(pts, "Poke Slice: new best " + best);
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

  startBtn.addEventListener("click", runCountdown);
  playAgainBtn.addEventListener("click", runCountdown);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) { state.paused = true; state.lastTime = 0; }
    else state.paused = false;
  });

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
    state.shake = 0.5;
    state.flash = 0.4;
  }

  function sliceAlong(a, b) {
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      if (segDist(it, a, b) > HIT_R) continue;
      state.items.splice(i, 1);
      if (it.bomb) {
        state.lives--;
        explode(it.x, it.y);
        if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* ignore */ } }
        state.floaters.push({ text: "💥", x: it.x, y: it.y - 20, life: 0.8 });
        if (state.lives <= 0) { endGame(); return; }
      } else {
        state.strokeSlices++;
        setScore(state.score + 1);
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
      }
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!state.running || state.paused) return;
    e.preventDefault();
    state.slicing = true;
    state.strokeSlices = 0;
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
    state.waveIn -= dt;
    if (state.waveIn <= 0) {
      wave();
      state.waveIn = waveEvery();
    }

    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      it.vy += GRAVITY * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.vrot * dt;
      if (it.y > H + 60 && it.vy > 0) {
        state.items.splice(i, 1);
        if (!it.bomb) {
          // Fresh fish on the floor: that's a heart.
          state.lives--;
          state.flash = 0.35;
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
      ctx.strokeStyle = "rgba(255,255,255," + (a * 0.55).toFixed(3) + ")";
      ctx.lineWidth = 1 + a * 4;
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
      ctx.rotate(it.rot);
      ctx.font = ITEM_SIZE + "px system-ui, sans-serif";
      ctx.fillText(it.glyph, 0, 0);
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
        ctx.strokeStyle = "rgba(255,255,255," + (0.35 + (i / state.trail.length) * 0.6) + ")";
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
      ctx.font = "700 24px system-ui, sans-serif";
      ctx.fillStyle = "#ffd15a";
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
