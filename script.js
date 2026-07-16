// --- Pokeworks bowl-stacking minigame ----------------------------------
// Fill a see-through bowl with ingredients: they land from the bowl floor
// upward while the camera is zoomed in on the bowl. Any overhang that lands
// outside the rim is trimmed and tumbles away. Once the ingredients fill past
// the rim, the camera zooms out and you keep stacking above the bowl.
// Miss the surface below completely and it's game over.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start-btn");
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("high-score");
const screenStart = document.getElementById("screen-start");
const screenDifficulty = document.getElementById("screen-difficulty");
const screenStartTitle = screenStart.querySelector(".overlay-title");
const screenStartSubtitle = screenStart.querySelector(".overlay-subtitle");
const difficultyBtns = document.querySelectorAll(".difficulty-btn");

// Internal (fixed) canvas resolution — world coordinates use this space.
const W = canvas.width; // 800
const H = canvas.height; // 600

const BLOCK_H = 34; // height of each ingredient slab
const CAPACITY = 4; // ingredients needed to fill the bowl up to its rim
const ZOOM_IN = 1.6; // zoom while filling the bowl
const LANE_HALF = W / ZOOM_IN / 2; // horizontal slide range that stays on screen when zoomed
const LAND_DUR = 0.18; // seconds of the landing squash animation
const GRAVITY = 1400; // world px/sec^2 for particles & falling shards
const PERFECT_TOLERANCE = 4; // overlap within this many px of full width counts as "perfect"

// The bowl, in world coordinates. It's a clear container: the rim is the
// opening, the floor is where the first ingredient rests.
const BOWL = {
  cx: W / 2, // 400
  rimY: 330, // world y of the rim's center line (the opening)
  rimRx: 185, // half the opening width (wide, for bowl proportions)
  rimRy: 30, // rim ellipse vertical radius (perspective)
};
const FLOOR_Y = BOWL.rimY + CAPACITY * BLOCK_H; // interior floor — bottom of ingredient 0
const BOWL_BOTTOM_Y = FLOOR_Y + 40; // rounded base, below the floor
const BOWL_CENTER_Y = (BOWL.rimY + FLOOR_Y) / 2;
const BOWL_OPEN_X = BOWL.cx - BOWL.rimRx;
const BOWL_OPEN_WIDTH = BOWL.rimRx * 2;
const LANE_MIN = BOWL.cx - LANE_HALF;
const LANE_MAX = BOWL.cx + LANE_HALF;

// Ingredient-ish colors, cycled as the bowl fills up.
const COLORS = [
  "#fd9f27", // salmon
  "#4caf72", // avocado
  "#f5d64e", // mango
  "#e2574c", // ahi tuna
  "#6cc0d6", // sauce
  "#c98a5e", // tempura
];

// Slide speed (px/sec) per difficulty, how much it ramps up per block, and an
// optional smaller starting block (defaults to the full bowl opening).
const DIFFICULTY = {
  easy: { speed: 190, ramp: 4 },
  medium: { speed: 320, ramp: 8 },
  impossible: { speed: 260, ramp: 8, startWidth: 180 },
};

const HIGH_SCORE_KEY = "pokeworks-high-score";

const state = {
  running: false,
  score: 0,
  highScore: 0,
  difficulty: null,
  placed: [], // ingredients in the bowl: { x, width, color, landAnim }, index 0 = floor
  active: null, // the moving ingredient: { x, width, color, dir }
  particles: [], // splash bits (world space)
  shards: [], // trimmed overhang tumbling away (world space)
  cam: { scale: ZOOM_IN, focusWorldY: BOWL_CENTER_Y, focusScreenY: H * 0.5 },
  lastTime: 0,
  rafId: 0,
};

// --- Audio (Web Audio API, synthesized — no asset files) ----------------

let audioCtx = null;

function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {
    audioCtx = null; // audio just won't play
  }
}

// A short enveloped tone, optionally gliding from freq to freqEnd.
function tone({ freq, freqEnd = null, type = "sine", dur = 0.12, gain = 0.25, delay = 0 }) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function playLand() {
  const base = 230 + state.score * 6; // pitch rises a touch as the bowl grows
  tone({ freq: base, freqEnd: base * 0.5, type: "sine", dur: 0.14, gain: 0.28 });
  tone({ freq: base * 2, freqEnd: base * 1.6, type: "triangle", dur: 0.05, gain: 0.08 });
}

function playPerfect() {
  tone({ freq: 880, type: "sine", dur: 0.12, gain: 0.22 });
  tone({ freq: 1320, type: "sine", dur: 0.16, gain: 0.18, delay: 0.09 });
}

function playGameOver() {
  tone({ freq: 380, freqEnd: 120, type: "triangle", dur: 0.5, gain: 0.26 });
  tone({ freq: 300, freqEnd: 90, type: "sine", dur: 0.6, gain: 0.2, delay: 0.05 });
}

// --- Score / helpers ----------------------------------------------------

function setScore(value) {
  state.score = value;
  scoreEl.textContent = String(value);
}

function loadHighScore() {
  let stored = 0;
  try {
    stored = parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10) || 0;
  } catch (e) {
    stored = 0; // localStorage may be unavailable (e.g. file:// restrictions)
  }
  state.highScore = stored;
  highScoreEl.textContent = String(stored);
}

function updateHighScore() {
  if (state.score <= state.highScore) return false;
  state.highScore = state.score;
  highScoreEl.textContent = String(state.score);
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(state.score));
  } catch (e) {
    /* ignore persistence failures */
  }
  return true;
}

function colorFor(index) {
  return COLORS[index % COLORS.length];
}

// The surface the next ingredient must land on: the bowl floor for the first
// one, otherwise the top ingredient already in the bowl.
function surfaceBelow() {
  if (state.placed.length === 0) {
    return { x: BOWL_OPEN_X, width: BOWL_OPEN_WIDTH };
  }
  return state.placed[state.placed.length - 1];
}

// World-space top edge of the ingredient (or active block) at a given index.
// Index 0 rests on the floor; higher indices stack upward toward the rim.
function worldTopForIndex(index) {
  return FLOOR_Y - (index + 1) * BLOCK_H;
}

// --- Effects ------------------------------------------------------------

function spawnLandParticles(xLeft, xRight, y, color) {
  for (let i = 0; i < 9; i++) {
    state.particles.push({
      x: xLeft + Math.random() * (xRight - xLeft),
      y: y,
      vx: (Math.random() - 0.5) * 260,
      vy: -60 - Math.random() * 180,
      size: 2 + Math.random() * 3,
      color,
      life: 0.45 + Math.random() * 0.3,
      maxLife: 0.75,
    });
  }
}

// A trimmed-off overhang piece that tumbles off the bowl. dir: -1 left, +1 right.
function spawnShard(x, topY, width, color, dir) {
  state.shards.push({
    x,
    y: topY,
    width,
    color,
    vx: dir * (70 + Math.random() * 90),
    vy: -30 - Math.random() * 40,
    rot: 0,
    vrot: dir * (2 + Math.random() * 3),
    life: 1.1,
    maxLife: 1.1,
  });
}

function updateEffects(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.shards.length - 1; i >= 0; i--) {
    const s = state.shards[i];
    s.vy += GRAVITY * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.rot += s.vrot * dt;
    s.life -= dt;
    if (s.life <= 0 || s.y > BOWL_BOTTOM_Y + 400) state.shards.splice(i, 1);
  }
  for (const b of state.placed) {
    if (b.landAnim > 0) b.landAnim = Math.max(0, b.landAnim - dt / LAND_DUR);
  }
}

// --- Camera -------------------------------------------------------------

// Eased dolly between two framings: zoomed in on the bowl while it fills,
// zoomed out following the tower's top once it overflows the rim.
function updateCamera(dt) {
  const filled = state.placed.length >= CAPACITY;
  const activeTopWorldY = worldTopForIndex(state.placed.length);

  const targetScale = filled ? 1.0 : ZOOM_IN;
  const targetFocusWorldY = filled ? activeTopWorldY : BOWL_CENTER_Y;
  const targetFocusScreenY = filled ? 150 : H * 0.5;

  const k = 1 - Math.pow(0.0025, dt); // frame-rate independent easing
  const cam = state.cam;
  cam.scale += (targetScale - cam.scale) * k;
  cam.focusWorldY += (targetFocusWorldY - cam.focusWorldY) * k;
  cam.focusScreenY += (targetFocusScreenY - cam.focusScreenY) * k;
}

function applyCamera() {
  const s = state.cam.scale;
  const tx = W / 2 - s * BOWL.cx;
  const ty = state.cam.focusScreenY - s * state.cam.focusWorldY;
  ctx.setTransform(s, 0, 0, s, tx, ty);
}

// --- Screen / flow helpers ---------------------------------------------

function showDifficulty() {
  screenStart.classList.add("hidden");
  screenDifficulty.classList.remove("hidden");
}

function showStartScreen() {
  screenDifficulty.classList.add("hidden");
  screenStart.classList.remove("hidden");
}

// --- Game lifecycle -----------------------------------------------------

function spawnActive() {
  const below = surfaceBelow();
  let width = below.width;
  // The first ingredient can start smaller than the bowl opening (e.g. Impossible).
  if (state.placed.length === 0) {
    const cfg = DIFFICULTY[state.difficulty] || DIFFICULTY.medium;
    if (cfg.startWidth) width = Math.min(width, cfg.startWidth);
  }
  state.active = {
    x: LANE_MIN,
    width,
    color: colorFor(state.placed.length),
    dir: 1,
  };
}

function startGame(difficulty) {
  ensureAudio();
  state.running = true;
  state.difficulty = difficulty;
  setScore(0);

  state.placed = [];
  state.particles = [];
  state.shards = [];
  state.cam = { scale: ZOOM_IN, focusWorldY: BOWL_CENTER_Y, focusScreenY: H * 0.5 };
  spawnActive();

  overlay.classList.add("hidden");
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur(); // so Space doesn't re-click a hidden button
  }
  state.lastTime = 0;
  state.rafId = requestAnimationFrame(loop);
}

function endGame() {
  state.running = false;
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  const isNewBest = updateHighScore();

  screenStartTitle.textContent = "Game Over";
  screenStartSubtitle.textContent = isNewBest
    ? `New best — ${state.score} in the bowl!`
    : `You added ${state.score} ingredient${state.score === 1 ? "" : "s"}. Play again?`;
  startBtn.textContent = "Play Again";

  overlay.classList.remove("hidden");
  showStartScreen();
}

// Drop the active ingredient, trimming it to its overlap with the surface below.
function dropActive() {
  if (!state.running || !state.active) return;

  const below = surfaceBelow();
  const active = state.active;

  const overlapLeft = Math.max(active.x, below.x);
  const overlapRight = Math.min(active.x + active.width, below.x + below.width);
  const overlap = overlapRight - overlapLeft;

  if (overlap <= 0) {
    playGameOver();
    endGame(); // missed the bowl / the stack entirely
    return;
  }

  const activeTopWorld = worldTopForIndex(state.placed.length);

  // Trimmed overhang tumbles away on whichever side(s) overhung.
  if (active.x < overlapLeft) {
    spawnShard(active.x, activeTopWorld, overlapLeft - active.x, active.color, -1);
  }
  const activeRight = active.x + active.width;
  if (activeRight > overlapRight) {
    spawnShard(overlapRight, activeTopWorld, activeRight - overlapRight, active.color, 1);
  }

  const perfect = overlap >= below.width - PERFECT_TOLERANCE;

  state.placed.push({ x: overlapLeft, width: overlap, color: active.color, landAnim: 1 });
  setScore(state.placed.length);

  // Splash particles along the landing seam (bottom edge of the placed block).
  const seamY = worldTopForIndex(state.placed.length - 1) + BLOCK_H;
  spawnLandParticles(overlapLeft, overlapLeft + overlap, seamY, active.color);

  if (perfect) playPerfect();
  else playLand();

  spawnActive();
}

// --- Loop & rendering ---------------------------------------------------

function update(dt) {
  updateEffects(dt);
  updateCamera(dt);

  const active = state.active;
  if (!active) return;

  const cfg = DIFFICULTY[state.difficulty] || DIFFICULTY.medium;
  const speed = cfg.speed + cfg.ramp * state.score;

  active.x += active.dir * speed * dt;

  // Bounce within the lane over the bowl.
  if (active.x <= LANE_MIN) {
    active.x = LANE_MIN;
    active.dir = 1;
  } else if (active.x + active.width >= LANE_MAX) {
    active.x = LANE_MAX - active.width;
    active.dir = -1;
  }
}

// easeOutBack — overshoots slightly past 1 for a springy settle.
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Draw an ingredient slab, optionally squashed (anchored at its bottom / center).
function drawBlock(x, topY, width, color, scaleX = 1, scaleY = 1) {
  const w = width * scaleX;
  const h = BLOCK_H * scaleY;
  const dx = x + (width - w) / 2;
  const dy = topY + BLOCK_H - h; // keep the bottom edge fixed
  const r = Math.min(6, h / 2);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(dx, dy, w, h, r);
  ctx.fill();

  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.beginPath();
  ctx.roundRect(dx, dy + h - Math.min(6, h), w, Math.min(6, h), r);
  ctx.fill();
}

function drawIngredients() {
  for (let i = 0; i < state.placed.length; i++) {
    const b = state.placed[i];
    let sx = 1;
    let sy = 1;
    if (b.landAnim > 0) {
      const p = 1 - b.landAnim;
      sy = 0.6 + 0.4 * easeOutBack(p);
      sx = 1 + (1 - sy) * 0.6;
    }
    drawBlock(b.x, worldTopForIndex(i), b.width, b.color, sx, sy);
  }

  if (state.active) {
    drawBlock(
      state.active.x,
      worldTopForIndex(state.placed.length),
      state.active.width,
      state.active.color
    );
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// 0 while zoomed in (see-through), 1 once zoomed out (opaque). Tied to the zoom.
function bowlOpacity() {
  return Math.max(0, Math.min(1, (ZOOM_IN - state.cam.scale) / (ZOOM_IN - 1)));
}

// The bowl silhouette: wide rim, near-straight walls, a wide rounded base, and
// the front rim arc — proper bowl proportions rather than a tall cup.
function bowlBodyPath() {
  const { cx, rimRx, rimRy, rimY } = BOWL;
  const cornerR = 60;
  const bottomY = BOWL_BOTTOM_Y;
  ctx.beginPath();
  ctx.moveTo(cx - rimRx, rimY);
  ctx.lineTo(cx - rimRx, bottomY - cornerR);
  ctx.quadraticCurveTo(cx - rimRx, bottomY, cx - rimRx + cornerR, bottomY);
  ctx.lineTo(cx + rimRx - cornerR, bottomY);
  ctx.quadraticCurveTo(cx + rimRx, bottomY, cx + rimRx, bottomY - cornerR);
  ctx.lineTo(cx + rimRx, rimY);
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, 0, Math.PI, false); // front rim lip
  ctx.closePath();
}

// A ceramic band (the rim lip) between the opening and its outer edge, over the
// angular range [startA, endA] of the rim ellipse.
function rimBand(startA, endA, alpha) {
  const { cx, rimY, rimRx, rimRy } = BOWL;
  ctx.beginPath();
  ctx.ellipse(cx, rimY, rimRx + 12, rimRy + 3, 0, startA, endA, false);
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, endA, startA, true);
  ctx.closePath();
  ctx.fillStyle = `rgba(233, 220, 198, ${alpha})`;
  ctx.fill();
}

// The opening-edge stroke over the angular range [startA, endA].
function rimEdge(startA, endA, t) {
  const { cx, rimY, rimRx, rimRy } = BOWL;
  ctx.beginPath();
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, startA, endA, false);
  ctx.strokeStyle = `rgba(90, 65, 35, ${0.35 + 0.3 * t})`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// The parts of the bowl BEHIND the ingredients: the ground shadow and the far
// (back) half of the rim, so a block above the rim occludes the far edge.
function drawBowlBack(t) {
  const { cx, rimRx } = BOWL;
  const bottomY = BOWL_BOTTOM_Y;
  const lipAlpha = Math.max(lerp(0.1, 1, t), 0.6);

  ctx.fillStyle = "rgba(0, 0, 0, 0.22)"; // ground shadow
  ctx.beginPath();
  ctx.ellipse(cx, bottomY + 14, rimRx * 0.8, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  rimBand(Math.PI, Math.PI * 2, lipAlpha); // far lip (top of the ellipse)
  rimEdge(Math.PI, Math.PI * 2, t);
}

// The parts of the bowl IN FRONT OF the ingredients: the body (see-through when
// zoomed in, opaque zoomed out) and the near (front) half of the rim.
function drawBowlFront(t) {
  const { cx, rimRx, rimRy, rimY } = BOWL;
  const bottomY = BOWL_BOTTOM_Y;
  const bodyAlpha = lerp(0.1, 1, t);

  // Ceramic body.
  bowlBodyPath();
  ctx.fillStyle = `rgba(233, 220, 198, ${bodyAlpha})`;
  ctx.fill();

  // Interior depth shading, fading in as the bowl becomes opaque.
  if (t > 0.02) {
    ctx.save();
    bowlBodyPath();
    ctx.clip();
    const grad = ctx.createLinearGradient(0, rimY, 0, bottomY);
    grad.addColorStop(0, "rgba(70, 45, 20, 0)");
    grad.addColorStop(1, `rgba(70, 45, 20, ${0.35 * t})`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - rimRx - 10, rimY, (rimRx + 10) * 2, bottomY - rimY);
    ctx.restore();
  }

  // Body outline.
  bowlBodyPath();
  ctx.strokeStyle = `rgba(120, 90, 50, ${0.28 + 0.32 * t})`;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Glassy highlight streak, only while see-through.
  const glassA = (1 - t) * 0.12;
  if (glassA > 0.01) {
    ctx.beginPath();
    ctx.ellipse(cx - rimRx * 0.5, (rimY + bottomY) / 2, 10, (bottomY - rimY) * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${glassA})`;
    ctx.fill();
  }

  rimBand(0, Math.PI, Math.max(bodyAlpha, 0.6)); // near lip (front of the ellipse)
  rimEdge(0, Math.PI, t);
}

function drawShards() {
  for (const s of state.shards) {
    const alpha = Math.min(1, s.life / 0.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x + s.width / 2, s.y + BLOCK_H / 2);
    ctx.rotate(s.rot);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.roundRect(-s.width / 2, -BLOCK_H / 2, s.width, BLOCK_H, 6);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  applyCamera();
  const t = bowlOpacity(); // 0 see-through (zoomed in) → 1 opaque (zoomed out)
  drawBowlBack(t); // far rim, behind the ingredients
  drawIngredients();
  drawBowlFront(t); // body + near rim, in front of the ingredients
  drawShards();
  drawParticles();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function loop(timestamp) {
  if (!state.running) return;

  if (!state.lastTime) state.lastTime = timestamp;
  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.05); // clamp big gaps
  state.lastTime = timestamp;

  update(dt);
  render();

  state.rafId = requestAnimationFrame(loop);
}

// --- Input --------------------------------------------------------------

startBtn.addEventListener("click", () => {
  screenStartTitle.textContent = "Minigame";
  screenStartSubtitle.textContent = "Stack the ingredients to score.";
  startBtn.textContent = "Start";
  showDifficulty();
});

difficultyBtns.forEach((btn) => {
  btn.addEventListener("click", () => startGame(btn.dataset.difficulty));
});

canvas.addEventListener("pointerdown", dropActive);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    dropActive();
  }
});

loadHighScore();
