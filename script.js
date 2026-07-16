// --- Pokeworks stacking minigame ---------------------------------------
// Slide an ingredient left/right, drop it, and try to line it up with the
// piece below. Any overhang gets trimmed, so the stack narrows over time.
// Miss the stack completely and it's game over. Difficulty sets the speed.

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

// Internal (fixed) canvas resolution — drawing happens in this coordinate space.
const W = canvas.width; // 800
const H = canvas.height; // 600

const BLOCK_H = 34; // height of each ingredient slab
const STACK_TOP_Y = 300; // screen y of the top placed block; stack grows downward off-screen
const BASE_WIDTH = 220; // width of the starting slab

// Ingredient-ish colors, cycled as the tower grows.
const COLORS = [
  "#fd9f27", // salmon
  "#4caf72", // avocado
  "#f5d64e", // mango
  "#e2574c", // ahi tuna
  "#6cc0d6", // sauce
  "#c98a5e", // tempura
];

// Slide speed (px/sec) per difficulty, plus how much it ramps up per block.
const DIFFICULTY = {
  easy: { speed: 190, ramp: 4 },
  medium: { speed: 320, ramp: 8 },
  impossible: { speed: 620, ramp: 16 },
};

const HIGH_SCORE_KEY = "pokeworks-high-score";

const state = {
  running: false,
  score: 0,
  highScore: 0,
  difficulty: null,
  placed: [], // stack of { x, width, color }, index 0 = bottom
  active: null, // the moving block: { x, width, color, dir }
  lastTime: 0,
  rafId: 0,
};

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

// Save the score as the new best if it beats the stored one. Returns true if beaten.
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
  const top = state.placed[state.placed.length - 1];
  state.active = {
    x: 0,
    width: top.width,
    color: colorFor(state.placed.length),
    dir: 1,
  };
}

function startGame(difficulty) {
  state.running = true;
  state.difficulty = difficulty;
  setScore(0);

  // Seed the stack with a centered base slab, then a moving block above it.
  state.placed = [
    { x: (W - BASE_WIDTH) / 2, width: BASE_WIDTH, color: colorFor(0) },
  ];
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
    ? `New best — ${state.score} stacked!`
    : `You stacked ${state.score} ingredient${state.score === 1 ? "" : "s"}. Play again?`;
  startBtn.textContent = "Play Again";

  overlay.classList.remove("hidden");
  showStartScreen();
}

// Drop the active block, trimming it to its overlap with the block below.
function dropActive() {
  if (!state.running || !state.active) return;

  const below = state.placed[state.placed.length - 1];
  const active = state.active;

  const overlapLeft = Math.max(active.x, below.x);
  const overlapRight = Math.min(active.x + active.width, below.x + below.width);
  const overlap = overlapRight - overlapLeft;

  if (overlap <= 0) {
    endGame();
    return;
  }

  state.placed.push({ x: overlapLeft, width: overlap, color: active.color });
  setScore(state.placed.length - 1);
  spawnActive();
}

// --- Loop & rendering ---------------------------------------------------

function update(dt) {
  const active = state.active;
  if (!active) return;

  const cfg = DIFFICULTY[state.difficulty] || DIFFICULTY.medium;
  const speed = cfg.speed + cfg.ramp * state.score;

  active.x += active.dir * speed * dt;

  // Bounce off the play-area edges.
  if (active.x <= 0) {
    active.x = 0;
    active.dir = 1;
  } else if (active.x + active.width >= W) {
    active.x = W - active.width;
    active.dir = -1;
  }
}

function drawBlock(x, topY, width, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, topY, width, BLOCK_H, 6);
  ctx.fill();

  // A darker bottom lip for a little depth.
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.beginPath();
  ctx.roundRect(x, topY + BLOCK_H - 6, width, 6, 6);
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, W, H);

  // Placed blocks: top block sits at STACK_TOP_Y, others cascade downward.
  const topIndex = state.placed.length - 1;
  for (let i = 0; i < state.placed.length; i++) {
    const depth = topIndex - i;
    const b = state.placed[i];
    drawBlock(b.x, STACK_TOP_Y + depth * BLOCK_H, b.width, b.color);
  }

  // Active (moving) block hovers one row above the top of the stack.
  if (state.active) {
    drawBlock(
      state.active.x,
      STACK_TOP_Y - BLOCK_H,
      state.active.width,
      state.active.color
    );
  }
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
  // Reset the start screen back to its initial copy before choosing difficulty.
  screenStartTitle.textContent = "Minigame";
  screenStartSubtitle.textContent =
    "Stack the ingredients — click or press Space to drop.";
  startBtn.textContent = "Start";
  showDifficulty();
});

difficultyBtns.forEach((btn) => {
  btn.addEventListener("click", () => startGame(btn.dataset.difficulty));
});

// Drop on click within the play area, or with the Space bar.
canvas.addEventListener("pointerdown", dropActive);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    dropActive();
  }
});

// Show any previously saved best on load.
loadHighScore();
