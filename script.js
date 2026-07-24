// --- Pokeworks bowl-stacking minigame ----------------------------------
// Fill a see-through bowl with ingredients: they land from the bowl floor
// upward while the camera is zoomed in on the bowl. Any overhang that lands
// outside the rim is trimmed and tumbles away. Once the ingredients fill past
// the rim, the camera zooms out and you keep stacking above the bowl.
// Miss the surface below completely and it's game over.

const canvas = document.getElementById("game");
let ctx = canvas.getContext("2d"); // reassigned temporarily to render to offscreen canvases

// Run a drawing function against a different 2D context (e.g. an offscreen
// canvas), then restore the main one. Lets the ingredient painters, which use
// the module-level `ctx`, render into prebaked row textures.
function withContext(otherCtx, fn) {
  const prev = ctx;
  ctx = otherCtx;
  try {
    fn();
  } finally {
    ctx = prev;
  }
}
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start-btn");
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("high-score");
const screenStart = document.getElementById("screen-start");
const screenDifficulty = document.getElementById("screen-difficulty");
const screenReward = document.getElementById("screen-reward");
const screenGameover = document.getElementById("screen-gameover");
const screenPaused = document.getElementById("screen-paused");
const screenLeaderboard = document.getElementById("screen-leaderboard");
const rewardBtn = document.getElementById("reward-btn");
const scrollHint = document.getElementById("scroll-hint");
const orderBtn = document.getElementById("order-btn");
const playAgainBtn = document.getElementById("play-again-btn");
const quitBtn = document.getElementById("quit-btn");
const resumeBtn = document.getElementById("resume-btn");
const pauseQuitBtn = document.getElementById("pause-quit-btn");
const gameoverSubtitle = document.getElementById("gameover-subtitle");
const gameoverQuip = document.getElementById("gameover-quip");
const difficultyBtns = document.querySelectorAll(".difficulty-btn");
const comboEl = document.getElementById("combo");
const comboCountEl = document.getElementById("combo-count");
const pauseBtn = document.getElementById("pause-btn");
const muteBtn = document.getElementById("mute-btn");

// Leaderboard elements
const lbStartBtn = document.getElementById("lb-start-btn");
const lbViewBtn = document.getElementById("lb-view-btn");
const lbBackBtn = document.getElementById("lb-back-btn");
const lbEntry = document.getElementById("lb-entry");
const lbEntryMsg = lbEntry ? lbEntry.querySelector(".lb-entry-msg") : null;
const lbNameInput = document.getElementById("lb-name");
const lbSaveBtn = document.getElementById("lb-save-btn");
const lbList = document.getElementById("lb-list");
const lbTabs = document.querySelectorAll(".lb-tab");

const overlayScreens = [screenStart, screenDifficulty, screenReward, screenGameover, screenPaused, screenLeaderboard];

// Show a single overlay panel and hide the rest.
function showScreen(el) {
  for (const s of overlayScreens) s.classList.toggle("hidden", s !== el);
  if (el !== screenReward) scrollHint.classList.add("hidden");
}

// Show the "Scroll to claim" cue only while the reward card overflows the box
// and hasn't been scrolled to the bottom yet.
function updateScrollHint() {
  if (!state.rewardShowing) {
    scrollHint.classList.add("hidden");
    return;
  }
  const overflowing = screenReward.scrollHeight - screenReward.clientHeight > 4;
  const atBottom =
    screenReward.scrollTop >= screenReward.scrollHeight - screenReward.clientHeight - 8;
  scrollHint.classList.toggle("hidden", !overflowing || atBottom);
}

// Briefly ignore overlay-button clicks after a screen appears, so a rapid
// in-flight click (e.g. from spamming drops) can't blow straight through the
// reward or game-over screen.
let screenActionsLockedUntil = 0;
function lockScreenActions(ms = 600) {
  screenActionsLockedUntil = performance.now() + ms;
}
function screenActionsLocked() {
  return performance.now() < screenActionsLockedUntil;
}

const rewardSubtitle = screenReward.querySelector(".overlay-subtitle");
const rewardCode = screenReward.querySelector(".reward-code");

const confettiCanvas = document.getElementById("confetti");
const cctx = confettiCanvas.getContext("2d");
const CW = confettiCanvas.width;
const CH = confettiCanvas.height;

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

// --- Ingredients --------------------------------------------------------
// Each ingredient has a base color (used for the slab, particles and shards)
// and a `detail` painter that draws its texture inside the already-clipped
// slab. Textures are position-seeded so they stay stable frame to frame.

// Deterministic pseudo-random from a 2D position — stable across frames.
function hashRnd(a, b) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// A grid of little rounded cubes — reused by the diced ingredients.
function cubes(x, y, w, h, fill, edge, size) {
  const gap = 2;
  for (let gy = y + 2; gy < y + h - 3; gy += size + gap) {
    for (let gx = x + 2; gx < x + w - 3; gx += size + gap) {
      const jx = (hashRnd(gx, gy) - 0.5) * 1.5;
      const cw = Math.min(size, x + w - 2 - gx);
      const ch = Math.min(size, y + h - 2 - gy);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(gx + jx, gy, cw, ch, 2);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// A wavy horizontal strand — used for salmon striations and seaweed.
function strand(x, y, w, yy, amp, freq, phase, style, lw) {
  ctx.strokeStyle = style;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let gx = x; gx <= x + w; gx += 6) {
    const y2 = yy + Math.sin((gx + phase) * freq) * amp;
    if (gx === x) ctx.moveTo(gx, y2);
    else ctx.lineTo(gx, y2);
  }
  ctx.stroke();
}

// Scattered rice-style grains in three shades — used by the rice bases.
function grains(x, y, w, h, shades) {
  for (let gy = y + 3; gy < y + h - 1; gy += 5) {
    for (let gx = x + 3; gx < x + w - 1; gx += 7) {
      const rx = gx + (hashRnd(gx, gy) - 0.5) * 6;
      const ry = gy + (hashRnd(gx + 9, gy) - 0.5) * 4;
      const s = hashRnd(gx * 1.3, gy * 0.7);
      ctx.fillStyle = s < 0.34 ? shades[0] : s < 0.67 ? shades[1] : shades[2];
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(hashRnd(gx, gy * 2) * Math.PI);
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.4, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

const INGREDIENTS = {
  rice: {
    base: "#f4efe2",
    detail(x, y, w, h) {
      grains(x, y, w, h, ["#ffffff", "#efe7d3", "#e4dabf"]);
    },
  },
  brownRice: {
    base: "#c9a97a",
    detail(x, y, w, h) {
      grains(x, y, w, h, ["#d8bb8e", "#c3a271", "#b08d5c"]);
    },
  },
  salmon: {
    base: "#f98d54",
    detail(x, y, w, h) {
      for (let k = 0; k < 4; k++) {
        strand(x, y, w, y + h * (0.2 + 0.2 * k), 2.2, 0.12, k * 20, "rgba(255,240,230,0.7)", 2.4);
      }
    },
  },
  tuna: {
    base: "#cf463c",
    detail(x, y, w, h) {
      cubes(x, y, w, h, "#e35c51", "rgba(120,30,25,0.35)", 9);
    },
  },
  avocado: {
    base: "#6fa53f",
    detail(x, y, w, h) {
      cubes(x, y, w, h, "#a9d76e", "rgba(60,95,30,0.3)", 9);
    },
  },
  mango: {
    base: "#f0a52c",
    detail(x, y, w, h) {
      cubes(x, y, w, h, "#ffc65e", "rgba(150,90,10,0.3)", 9);
    },
  },
  cucumber: {
    base: "#bfe08a",
    detail(x, y, w, h) {
      ctx.fillStyle = "#8cbf5a"; // rind top & bottom
      ctx.fillRect(x, y, w, 3);
      ctx.fillRect(x, y + h - 3, w, 3);
      ctx.fillStyle = "#dcefb6"; // pale flesh center
      ctx.fillRect(x, y + h * 0.36, w, h * 0.28);
      ctx.fillStyle = "rgba(90,120,60,0.55)"; // seeds
      for (let gx = x + 9; gx < x + w - 4; gx += 15) {
        const gy = y + h * 0.5 + (hashRnd(gx, 3) - 0.5) * 4;
        ctx.beginPath();
        ctx.ellipse(gx, gy, 1.5, 2.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  onion: {
    base: "#a86487",
    detail(x, y, w, h) {
      ctx.strokeStyle = "rgba(246,233,241,0.5)";
      ctx.lineWidth = 1.4;
      for (let c = 0; c * 26 + 16 < w - 6; c++) {
        const ox = x + 16 + c * 26 + (hashRnd(c, x) - 0.5) * 8;
        const oy = y + h * 0.5;
        for (let r = 3; r <= 9; r += 3) {
          ctx.beginPath();
          ctx.ellipse(ox, oy, r, r * 0.75, 0, 0.3, Math.PI * 1.85);
          ctx.stroke();
        }
      }
    },
  },
  seaweed: {
    base: "#2f7d3f",
    detail(x, y, w, h) {
      for (let k = 0; k < 3; k++) {
        const style = k % 2 ? "rgba(18,66,28,0.55)" : "rgba(120,205,120,0.45)";
        strand(x, y, w, y + h * (0.28 + 0.22 * k), 3, 0.22, k * 13, style, 3);
      }
      for (let gx = x + 8; gx < x + w - 2; gx += 17) {
        const gy = y + h * (0.3 + 0.45 * hashRnd(gx, 7));
        ctx.fillStyle = "#f2e6cd"; // sesame
        ctx.beginPath();
        ctx.ellipse(gx, gy, 1.7, 1, hashRnd(gx, gy) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  edamame: {
    base: "#7cb63f",
    detail(x, y, w, h) {
      for (let gx = x + 9; gx < x + w - 5; gx += 18) {
        const gy = y + h * 0.5 + (hashRnd(gx, 2) - 0.5) * 6;
        ctx.fillStyle = "#9ccf5c";
        ctx.beginPath();
        ctx.ellipse(gx, gy, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(50,90,25,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#c3e58c"; // beans
        ctx.beginPath();
        ctx.ellipse(gx - 2, gy, 1.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(gx + 2, gy, 1.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  pineapple: {
    base: "#f2c233",
    detail(x, y, w, h) {
      ctx.strokeStyle = "rgba(180,135,15,0.5)";
      ctx.lineWidth = 1.2;
      for (let d = -h; d < w; d += 11) {
        ctx.beginPath();
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d + h, y + h);
        ctx.stroke();
      }
      for (let d = 0; d < w + h; d += 11) {
        ctx.beginPath();
        ctx.moveTo(x + d, y + h);
        ctx.lineTo(x + d - h, y);
        ctx.stroke();
      }
    },
  },
  cilantro: {
    base: "#3f9d4f",
    detail(x, y, w, h) {
      for (let gx = x + 4; gx < x + w - 2; gx += 8) {
        for (let gy = y + 3; gy < y + h - 2; gy += 8) {
          const j = hashRnd(gx, gy);
          ctx.fillStyle = j < 0.45 ? "#5cba69" : j < 0.8 ? "#2f7d3f" : "#79cf7f";
          ctx.beginPath();
          ctx.arc(gx + (j - 0.5) * 4, gy + (hashRnd(gy, gx) - 0.5) * 4, 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  corn: {
    base: "#efc13c",
    detail(x, y, w, h) {
      cubes(x, y, w, h, "#ffe084", "rgba(180,140,20,0.3)", 6);
    },
  },
  mandarin: {
    base: "#f2922e",
    detail(x, y, w, h) {
      for (let gx = x + 3; gx < x + w - 4; gx += 12) {
        ctx.fillStyle = "#ffb85a";
        ctx.beginPath();
        ctx.roundRect(gx, y + 3, 9, h - 6, 3);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,240,220,0.55)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
  },
  surimi: {
    base: "#f5f0e6",
    detail(x, y, w, h) {
      ctx.fillStyle = "#e0644f"; // red crab-stick edge
      ctx.fillRect(x, y, w, Math.max(3, h * 0.26));
      ctx.fillStyle = "rgba(224,100,79,0.4)";
      for (let gx = x + 8; gx < x + w - 2; gx += 16) ctx.fillRect(gx, y + h * 0.45, 2, h * 0.4);
    },
  },
  tofu: {
    base: "#f2eede",
    detail(x, y, w, h) {
      cubes(x, y, w, h, "#faf6ec", "rgba(180,170,140,0.4)", 10);
    },
  },
  masago: {
    base: "#ef8a3c",
    detail(x, y, w, h) {
      for (let gy = y + 3; gy < y + h - 1; gy += 4) {
        for (let gx = x + 3; gx < x + w - 1; gx += 4) {
          ctx.fillStyle = hashRnd(gx, gy) < 0.5 ? "#ffc46b" : "#ffab4d";
          ctx.beginPath();
          ctx.arc(gx + (hashRnd(gx, gy) - 0.5) * 2, gy, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  ginger: {
    base: "#f3c6cd",
    detail(x, y, w, h) {
      ctx.strokeStyle = "rgba(214,140,156,0.6)";
      ctx.lineWidth = 1.4;
      for (let gx = x + 6; gx < x + w - 2; gx += 14) {
        ctx.beginPath();
        ctx.moveTo(gx, y + 2);
        ctx.quadraticCurveTo(gx + 6, y + h * 0.5, gx, y + h - 2);
        ctx.stroke();
      }
    },
  },
  kale: {
    base: "#2f6b3a",
    detail(x, y, w, h) {
      for (let gx = x + 3; gx < x + w - 1; gx += 6) {
        for (let gy = y + 3; gy < y + h - 1; gy += 6) {
          const j = hashRnd(gx, gy);
          ctx.fillStyle = j < 0.5 ? "#3f8a48" : "#245a30";
          ctx.beginPath();
          ctx.arc(gx + (j - 0.5) * 3, gy + (hashRnd(gy, gx) - 0.5) * 3, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  chicken: {
    base: "#d6ac78",
    detail(x, y, w, h) {
      cubes(x, y, w, h, "#e6c79a", "rgba(120,85,45,0.35)", 9);
      ctx.fillStyle = "rgba(90,60,30,0.4)"; // seared specks
      for (let gx = x + 8; gx < x + w - 2; gx += 16) {
        ctx.fillRect(gx, y + h * 0.5 + (hashRnd(gx, 1) - 0.5) * 6, 4, 1.5);
      }
    },
  },
};

// Index 0 is a randomly chosen base; every layer above is a random topping
// (never the same as the one directly below it), so the order varies each game.
const BASES = ["rice", "brownRice"];
const TOPPINGS = [
  "salmon",
  "tuna",
  "avocado",
  "cucumber",
  "onion",
  "seaweed",
  "mango",
  "edamame",
  "pineapple",
  "cilantro",
  "corn",
  "mandarin",
  "surimi",
  "tofu",
  "masago",
  "ginger",
  "kale",
  "chicken",
];

function randomFrom(keys) {
  return INGREDIENTS[keys[Math.floor(Math.random() * keys.length)]];
}

// A random topping that isn't the one directly below (avoids two identical
// layers in a row).
function randomTopping(exclude) {
  let ing;
  do {
    ing = randomFrom(TOPPINGS);
  } while (ing === exclude && TOPPINGS.length > 1);
  return ing;
}

// Slide speed (px/sec) per difficulty, how much it ramps up per block, and an
// optional smaller starting block (defaults to the full bowl opening).
// `reward` is the score milestone that earns the `discount` (%) for that difficulty.
const DIFFICULTY = {
  easy: { speed: 190, ramp: 4, startWidth: 290, reward: 50, discount: 5 },
  medium: { speed: 320, ramp: 8, startWidth: 260, reward: 35, discount: 5 },
  impossible: { speed: 420, ramp: 12, startWidth: 180, reward: 25, discount: 10 },
};

const HIGH_SCORE_KEY = "pokeworks-high-score";

const state = {
  running: false,
  paused: false, // frozen while a reward / pause screen is up
  rewardShowing: false, // the reward screen (with confetti) is up
  rewarded: false, // reward already earned this game
  muted: false,
  score: 0,
  combo: 0, // consecutive perfect drops
  highScore: 0,
  difficulty: null,
  placed: [], // ingredients in the bowl: { x, width, color, landAnim }, index 0 = floor
  active: null, // the moving ingredient: { x, width, color, dir }
  particles: [], // splash bits (world space)
  shards: [], // trimmed overhang tumbling away (world space)
  powerups: [], // falling power-ups (screen/canvas space): { x, y, vy, age, type }
  toastTimer: 0, // seconds remaining on the collect toast
  magnetDrops: 0, // drops left with magnet assist (widened perfect window)
  hasShield: false, // holding a shield (survives one death)
  shieldEarned: false, // a shield was collected this game (once-per-game lock)
  hasSaver: false, // holding a combo saver (sticky rice)
  floaters: [], // floating text popups (world space): { text, color, x, y, life }
  shake: 0, // seconds of camera shake remaining
  sessionBest: 0, // high score when this run started (ghost line target)
  passedBest: false, // beat the ghost line this run
  stats: { perfects: 0, bestCombo: 0, powerups: 0 }, // per-run stats
  cam: { scale: ZOOM_IN, focusWorldY: BOWL_CENTER_Y, focusScreenY: H * 0.5 },
  lastTime: 0,
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
  if (!audioCtx || state.muted) return;
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

// Each consecutive perfect rings a step higher, so streaks *sound* like streaks.
function playPerfect(combo) {
  const step = Math.min(Math.max(combo, 1) - 1, 8);
  const base = 880 * Math.pow(1.122, step); // whole-tone steps upward
  tone({ freq: base, type: "sine", dur: 0.12, gain: 0.22 });
  tone({ freq: base * 1.5, type: "sine", dur: 0.16, gain: 0.18, delay: 0.09 });
}

function playMilestone() {
  tone({ freq: 784, type: "triangle", dur: 0.12, gain: 0.16 });
  tone({ freq: 1046, type: "triangle", dur: 0.12, gain: 0.15, delay: 0.09 });
  tone({ freq: 1568, type: "sine", dur: 0.2, gain: 0.13, delay: 0.18 });
}

function playNewBest() {
  tone({ freq: 659, type: "triangle", dur: 0.14, gain: 0.18 });
  tone({ freq: 880, type: "triangle", dur: 0.14, gain: 0.17, delay: 0.1 });
  tone({ freq: 1174, type: "triangle", dur: 0.16, gain: 0.16, delay: 0.2 });
  tone({ freq: 1568, type: "sine", dur: 0.26, gain: 0.15, delay: 0.3 });
}

function playSave() {
  tone({ freq: 500, freqEnd: 740, type: "sine", dur: 0.16, gain: 0.16 });
  tone({ freq: 990, type: "sine", dur: 0.12, gain: 0.1, delay: 0.12 });
}

// Small mobile haptics; silently ignored where unsupported.
function buzz(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* ignore */ }
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

// The ingredient for the next block: the game's base on the floor, otherwise a
// random topping that differs from the one directly below.
function nextIngredient() {
  if (state.placed.length === 0) return state.baseIngredient;
  return randomTopping(state.placed[state.placed.length - 1].ingredient);
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

// Horizontal limits the active block slides between. While filling the bowl
// (zoomed in) the barrier is the bowl's edges; once zoomed out above the bowl
// it may slide across the wider lane.
function slideBounds() {
  if (state.placed.length < CAPACITY) {
    return { min: BOWL_OPEN_X, max: BOWL_OPEN_X + BOWL_OPEN_WIDTH };
  }
  return { min: LANE_MIN, max: LANE_MAX };
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
  for (let i = state.floaters.length - 1; i >= 0; i--) {
    const f = state.floaters[i];
    f.y -= 46 * dt; // drift upward
    f.life -= dt;
    if (f.life <= 0) state.floaters.splice(i, 1);
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
}

// Floating in-world text ("Perfect x4!", "NEW BEST!", milestone pings).
function addFloater(text, color, x, y) {
  state.floaters.push({ text, color, x, y, life: 1.15, maxLife: 1.15 });
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
  // Brief screen shake on rough landings.
  let ox = 0;
  let oy = 0;
  if (state.shake > 0) {
    const m = 26 * state.shake;
    ox = (Math.random() - 0.5) * m;
    oy = (Math.random() - 0.5) * m;
  }
  ctx.setTransform(s, 0, 0, s, tx + ox, ty + oy);
}

// --- Screen / flow helpers ---------------------------------------------

function showDifficulty() {
  showScreen(screenDifficulty);
}

function showStartScreen() {
  showScreen(screenStart);
}

// --- Leaderboard (local, per browser) ----------------------------------

const LEADERBOARD_KEY = "pokeworks-bowl-leaderboard";
const LB_NAME_KEY = "pokeworks-bowl-lb-name";
const LB_MAX = 10; // scores kept per difficulty
const DIFF_LABEL = { easy: "Easy", medium: "Medium", impossible: "Impossible" };

let lbReturnScreen = screenStart; // where "Back" goes
let lbActiveTab = "easy";
let lbNewEntry = null; // { diff, name, score } — the row to highlight after a save

// Supabase makes the board global (shared across players). Without valid config
// it stays local-only (per browser). The anon key is public by design.
const SB = window.POKEWORKS_SUPABASE || {};
const useSupabase =
  !!SB.url && !!SB.anonKey && !/YOUR_/.test(SB.url) && !/YOUR_/.test(SB.anonKey);

function sbHeaders(extra) {
  return Object.assign(
    { apikey: SB.anonKey, Authorization: "Bearer " + SB.anonKey },
    extra || {}
  );
}

// One row per player: keep each name's best score (case-insensitive), so a
// player never appears on the board more than once.
function dedupeByName(list) {
  const sorted = list.slice().sort((a, b) => b.score - a.score);
  const seen = new Set();
  const out = [];
  for (const e of sorted) {
    const key = String(e.name).trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// Top scores for a difficulty from Supabase (falls back to the local board).
// Fetches extra rows and merges duplicate names down to their best.
async function fetchTopScores(diff) {
  if (!useSupabase) return dedupeByName(loadBoard()[diff] || []).slice(0, LB_MAX);
  const url =
    SB.url + "/rest/v1/bowl_scores?select=name,score&difficulty=eq." +
    encodeURIComponent(diff) + "&order=score.desc&limit=500";
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error("Supabase fetch " + res.status);
  const rows = await res.json();
  return dedupeByName(rows).slice(0, LB_MAX);
}

// Insert a score to Supabase; always keep a local mirror as a fallback.
async function submitScore(diff, name, score) {
  addLeaderboardScore(diff, name, score); // local mirror
  if (!useSupabase) return;
  const res = await fetch(SB.url + "/rest/v1/bowl_scores", {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ difficulty: diff, name: name, score: score }),
  });
  if (!res.ok) throw new Error("Supabase insert " + res.status);
}

function loadBoard() {
  try {
    const b = JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || {};
    return { easy: b.easy || [], medium: b.medium || [], impossible: b.impossible || [] };
  } catch (e) {
    return { easy: [], medium: [], impossible: [] };
  }
}

function saveBoard(board) {
  try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board)); } catch (e) { /* ignore */ }
}

// Would this score earn a spot on the given difficulty's board?
function scoreQualifies(diff, score) {
  if (score <= 0) return false;
  const list = loadBoard()[diff] || [];
  return list.length < LB_MAX || score > list[list.length - 1].score;
}

// Add/merge a score locally: one row per name, keeping the best.
function addLeaderboardScore(diff, name, score) {
  const board = loadBoard();
  const list = board[diff] || (board[diff] = []);
  const key = String(name || "Anon").trim().toLowerCase();
  const existing = list.find((e) => String(e.name).trim().toLowerCase() === key);
  if (existing) {
    if (score > existing.score) existing.score = score;
    existing.name = name || "Anon"; // keep the latest spelling
  } else {
    list.push({ name: name || "Anon", score });
  }
  list.sort((a, b) => b.score - a.score);
  board[diff] = list.slice(0, LB_MAX);
  saveBoard(board);
}

function setLbTab(diff) {
  lbActiveTab = diff;
  lbTabs.forEach((t) => t.classList.toggle("active", t.dataset.diff === diff));
  renderLeaderboard();
}

async function renderLeaderboard() {
  const diff = lbActiveTab;
  lbList.innerHTML = '<li class="lb-empty">Loading…</li>';
  let list;
  try {
    list = await fetchTopScores(diff);
  } catch (e) {
    list = loadBoard()[diff] || []; // offline / error → local mirror
  }
  if (diff !== lbActiveTab) return; // tab changed while awaiting

  lbList.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "lb-empty";
    li.textContent = "No scores yet. Be the first!";
    lbList.appendChild(li);
    return;
  }
  let highlighted = false;
  list.forEach((entry, i) => {
    const li = document.createElement("li");
    li.className = "lb-row";
    if (!highlighted && lbNewEntry && lbNewEntry.diff === diff &&
        String(lbNewEntry.name).trim().toLowerCase() === String(entry.name).trim().toLowerCase()) {
      li.classList.add("lb-me");
      highlighted = true;
    }
    li.innerHTML =
      `<span class="lb-rank">${i + 1}</span>` +
      `<span class="lb-name">${escapeHtml(entry.name)}</span>` +
      `<span class="lb-score">${entry.score}</span>`;
    lbList.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openLeaderboard(fromScreen, diff) {
  lbReturnScreen = fromScreen;
  setLbTab(diff || lbActiveTab);
  overlay.classList.remove("hidden");
  showScreen(screenLeaderboard);
}

function closeLeaderboard() {
  if (lbReturnScreen === screenStart) {
    showStartScreen();
  } else {
    showScreen(lbReturnScreen);
  }
}

// --- Combo counter, pause, mute ----------------------------------------

function updateCombo() {
  const show = state.running && !state.paused && state.combo >= 2;
  comboEl.classList.toggle("hidden", !show);
  if (show) {
    comboCountEl.textContent = "x" + state.combo;
    // restart the number pop and the ring burst
    comboCountEl.classList.remove("pop");
    comboEl.classList.remove("burst");
    void comboEl.offsetWidth;
    comboCountEl.classList.add("pop");
    comboEl.classList.add("burst");
  }
}

function updatePauseBtn() {
  const manualPaused = state.running && state.paused && !screenPaused.classList.contains("hidden");
  pauseBtn.textContent = manualPaused ? "▶ Resume" : "⏸ Pause";
}

function pauseGame() {
  if (!state.running || state.paused) return;
  state.paused = true;
  overlay.classList.remove("hidden");
  showScreen(screenPaused);
  updatePauseBtn();
  updateCombo();
}

function resumeFromPause() {
  if (!state.paused) return;
  state.paused = false;
  overlay.classList.add("hidden");
  state.lastTime = 0; // avoid a big dt jump on resume
  updatePauseBtn();
  updateCombo();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function togglePause() {
  if (!state.running) return;
  if (state.paused) {
    if (!screenPaused.classList.contains("hidden")) resumeFromPause(); // don't touch the reward pause
  } else {
    pauseGame();
  }
}

function quitFromPause() {
  state.paused = false;
  state.running = false;
  updatePauseBtn();
  updateCombo();
  showStartScreen();
}

const MUTE_KEY = "pokeworks-muted";

function updateMuteBtn() {
  muteBtn.textContent = state.muted ? "🔇 Muted" : "🔊 Sound";
}

function loadMute() {
  try {
    state.muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (e) {
    state.muted = false;
  }
  updateMuteBtn();
}

function toggleMute() {
  state.muted = !state.muted;
  try {
    localStorage.setItem(MUTE_KEY, state.muted ? "1" : "0");
  } catch (e) {
    /* ignore */
  }
  updateMuteBtn();
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
  const ingredient = nextIngredient();
  state.active = {
    x: slideBounds().min,
    width,
    ingredient,
    color: ingredient.base,
    dir: 1,
  };
}

function startGame(difficulty) {
  ensureAudio();
  state.running = true;
  state.paused = false;
  state.rewarded = false;
  state.difficulty = difficulty;
  setScore(0);
  state.combo = 0;
  updateCombo();
  updatePauseBtn();

  state.placed = [];
  state.particles = [];
  state.shards = [];
  state.floaters = [];
  state.shake = 0;
  state.sessionBest = state.highScore; // ghost line to chase this run
  state.passedBest = false;
  state.stats = { perfects: 0, bestCombo: 0, powerups: 0 };
  state.baseIngredient = randomFrom(BASES);
  state.cam = { scale: ZOOM_IN, focusWorldY: BOWL_CENTER_Y, focusScreenY: H * 0.5 };
  spawnActive();
  clearConfetti();
  clearPowerups();

  overlay.classList.add("hidden");
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur(); // so Space doesn't re-click a hidden button
  }
}

// Quippy remarks shown on game over. Edit these to taste.
const GAME_OVER_QUIPS = {
  best: ["New personal best! 🎉", "A new high, nicely done!", "Top of your game!"],
  none: ["Oof. The bowl deserved better.", "Zero ingredients. Bold strategy.", "Straight to the trash, huh?"],
  low: ["A humble start.", "Every bowl begins somewhere.", "Room to grow!"],
  mid: ["Now that's a snack.", "Solid bowl-building!", "Getting the hang of it."],
  high: ["Chef-level stacking!", "That's a serious bowl.", "The bowl is impressed."],
  elite: ["Absolute bowl legend.", "Poke perfection!", "Someone give this person a job."],
};

function pickQuip(score, isNewBest) {
  let pool;
  if (isNewBest) pool = GAME_OVER_QUIPS.best;
  else if (score === 0) pool = GAME_OVER_QUIPS.none;
  else if (score < 10) pool = GAME_OVER_QUIPS.low;
  else if (score < 25) pool = GAME_OVER_QUIPS.mid;
  else if (score < 40) pool = GAME_OVER_QUIPS.high;
  else pool = GAME_OVER_QUIPS.elite;
  return pool[Math.floor(Math.random() * pool.length)];
}

function endGame() {
  state.running = false;
  state.combo = 0;
  updateCombo();
  updatePauseBtn();
  clearPowerups();

  const isNewBest = updateHighScore();
  buzz(80);

  gameoverQuip.textContent = pickQuip(state.score, isNewBest);
  gameoverSubtitle.textContent =
    `You added ${state.score} ingredient${state.score === 1 ? "" : "s"}.`;

  // Run stats.
  const gsPerfects = document.getElementById("gs-perfects");
  const gsCombo = document.getElementById("gs-combo");
  const gsPower = document.getElementById("gs-power");
  if (gsPerfects) gsPerfects.textContent = state.stats.perfects;
  if (gsCombo) gsCombo.textContent = state.stats.bestCombo;
  if (gsPower) gsPower.textContent = state.stats.powerups;

  // Offer a leaderboard entry. Global (Supabase) boards accept any positive
  // score; a local-only board only offers when the score cracks the top 10.
  lbNewEntry = null;
  const offer = state.score > 0 && (useSupabase || scoreQualifies(state.difficulty, state.score));
  if (offer) {
    pendingScore = { diff: state.difficulty, score: state.score };
    lbNameInput.value = loadLbName();
    if (lbEntryMsg) {
      lbEntryMsg.textContent = useSupabase
        ? "🏆 Add your score to the leaderboard!"
        : "🏆 You made the leaderboard!";
    }
    lbEntry.classList.remove("hidden");
  } else {
    pendingScore = null;
    lbEntry.classList.add("hidden");
  }

  overlay.classList.remove("hidden");
  showScreen(screenGameover);
  lockScreenActions();
}

let pendingScore = null; // { diff, score } awaiting a name

function loadLbName() {
  try { return localStorage.getItem(LB_NAME_KEY) || ""; } catch (e) { return ""; }
}
function saveLbName(name) {
  try { localStorage.setItem(LB_NAME_KEY, name); } catch (e) { /* ignore */ }
}

// Save the pending score under the typed name, then show the board.
async function submitLeaderboardName() {
  if (!pendingScore) return;
  const name = (lbNameInput.value || "").trim().slice(0, 12) || "Anon";
  saveLbName(name);
  const diff = pendingScore.diff;
  const score = pendingScore.score;
  pendingScore = null;
  lbEntry.classList.add("hidden");
  lbSaveBtn.disabled = true;
  try {
    await submitScore(diff, name, score);
  } catch (e) {
    /* local mirror already saved */
  }
  lbSaveBtn.disabled = false;
  lbNewEntry = { diff: diff, name: name, score: score };
  openLeaderboard(screenGameover, diff);
}

// Drop the active ingredient, trimming it to its overlap with the surface below.
function dropActive() {
  if (!state.running || state.paused || !state.active) return;

  const below = surfaceBelow();
  const active = state.active;

  const overlapLeft = Math.max(active.x, below.x);
  const overlapRight = Math.min(active.x + active.width, below.x + below.width);
  const overlap = overlapRight - overlapLeft;

  if (overlap <= 0) {
    // A shield catches one otherwise-fatal miss, then it's spent for the game.
    if (state.hasShield) {
      state.hasShield = false;
      updateStatusBadges();
      showToast("🛡 Shield used!");
      playShieldSave();
      if (window.PokeAch) PokeAch.unlock("bb-shield");
      state.combo = 0;
      updateCombo();
      spawnActive(); // forgive the miss and keep going
      return;
    }
    playGameOver();
    endGame(); // missed the bowl / the stack entirely
    return;
  }

  const activeTopWorld = worldTopForIndex(state.placed.length);
  // The magnet widens the "perfect" window for a couple of drops.
  const tolerance = state.magnetDrops > 0 ? MAGNET_TOLERANCE : PERFECT_TOLERANCE;
  const perfect = overlap >= below.width - tolerance;
  if (state.magnetDrops > 0) {
    state.magnetDrops -= 1;
    updateStatusBadges();
  }

  // On a perfect drop, snap to the full width below so the tower doesn't
  // keep shrinking; otherwise trim to the overlap and let the overhang fall.
  let placedX = overlapLeft;
  let placedWidth = overlap;
  if (perfect) {
    placedX = below.x;
    placedWidth = below.width;
  } else {
    if (active.x < overlapLeft) {
      spawnShard(active.x, activeTopWorld, overlapLeft - active.x, active.color, -1);
    }
    const activeRight = active.x + active.width;
    if (activeRight > overlapRight) {
      spawnShard(overlapRight, activeTopWorld, activeRight - overlapRight, active.color, 1);
    }
  }

  // Combo bookkeeping. A held Sticky Rice saver absorbs one imperfect drop
  // so the streak survives.
  let comboSaved = false;
  if (perfect) {
    state.combo += 1;
    state.stats.perfects += 1;
    if (state.combo > state.stats.bestCombo) state.stats.bestCombo = state.combo;
  } else if (state.combo > 0 && state.hasSaver) {
    state.hasSaver = false;
    comboSaved = true;
    updateStatusBadges();
  } else {
    state.combo = 0;
  }
  updateCombo();

  state.placed.push({
    x: placedX,
    width: placedWidth,
    ingredient: active.ingredient,
    color: active.color,
    landAnim: 1,
  });
  setScore(state.placed.length);

  if (window.PokeAch) {
    if (state.score === 1) PokeAch.unlock("bb-first");
    if (state.score === 25) PokeAch.unlock("bb-25");
    if (state.score === 50) PokeAch.unlock("bb-50");
    if (state.combo >= 10) PokeAch.unlock("bb-combo10");
  }

  // Splash particles along the landing seam (bottom edge of the placed block).
  const seamY = worldTopForIndex(state.placed.length - 1) + BLOCK_H;
  spawnLandParticles(placedX, placedX + placedWidth, seamY, active.color);

  const midX = placedX + placedWidth / 2;
  const topY = activeTopWorld - 10;

  if (perfect) {
    playPerfect(state.combo);
    buzz(12);
    addFloater(state.combo > 1 ? `Perfect x${state.combo}!` : "Perfect!", "#fd9f27", midX, topY);
  } else {
    playLand();
    state.shake = Math.max(state.shake, 0.14); // rough landing rattles the camera
    if (comboSaved) {
      playSave();
      showToast("🍚 Combo saved!");
      addFloater("Combo saved!", "#4caf72", midX, topY);
    }
  }

  // Milestone flags every 10 blocks.
  if (state.score % 10 === 0) {
    playMilestone();
    addFloater(`▲ ${state.score}!`, "#22b2b4", midX, topY - 26);
    spawnLandParticles(placedX, placedX + placedWidth, activeTopWorld, "#ffd15a");
  }

  // Crossing your all-time best mid-run is worth celebrating immediately.
  if (!state.passedBest && state.sessionBest > 0 && state.score > state.sessionBest) {
    state.passedBest = true;
    playNewBest();
    buzz([30, 40, 30]);
    addFloater("NEW BEST!", "#ee435b", midX, topY - 52);
  }

  spawnActive();
  notePerfectStreak(); // 3-in-a-row perfect streak earns a power-up

  // Earn the reward the first time you reach the difficulty's milestone.
  const cfg = DIFFICULTY[state.difficulty] || DIFFICULTY.medium;
  if (!state.rewarded && state.score >= cfg.reward) {
    state.rewarded = true;
    triggerReward(cfg);
  }
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

  // Bounce within the current bounds — the bowl edges while zoomed in,
  // the wider lane once zoomed out.
  const { min, max } = slideBounds();
  const room = max - min - active.width;
  if (room <= 0) {
    active.x = min + room / 2; // wider than the barrier: sit centered
  } else if (active.x <= min) {
    active.x = min;
    active.dir = 1;
  } else if (active.x + active.width >= max) {
    active.x = max - active.width;
    active.dir = -1;
  }
}

// easeOutBack — overshoots slightly past 1 for a springy settle.
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Draw a textured ingredient slab into the rect (dx, dy, w, h).
function drawSlabRect(dx, dy, w, h, ingredient) {
  const r = Math.min(7, h / 2);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(dx, dy, w, h, r);
  ctx.clip();

  ctx.fillStyle = ingredient.base;
  ctx.fillRect(dx, dy, w, h);
  ingredient.detail(dx, dy, w, h);

  // Depth: a shadow along the bottom and a sheen along the top.
  ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
  ctx.fillRect(dx, dy + h - 4, w, 4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
  ctx.fillRect(dx, dy, w, 2.5);
  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(dx, dy, w, h, r);
  ctx.strokeStyle = "rgba(40, 25, 10, 0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Draw a game slab, optionally squashed (anchored at its bottom / center).
function drawBlock(x, topY, width, ingredient, scaleX = 1, scaleY = 1) {
  const w = width * scaleX;
  const h = BLOCK_H * scaleY;
  const dx = x + (width - w) / 2;
  const dy = topY + BLOCK_H - h; // keep the bottom edge fixed
  drawSlabRect(dx, dy, w, h, ingredient);
}

function drawIngredients() {
  // Only the top slabs are ever visible; skip the deep ones for performance.
  const start = Math.max(0, state.placed.length - 18);
  for (let i = start; i < state.placed.length; i++) {
    const b = state.placed[i];
    let sx = 1;
    let sy = 1;
    if (b.landAnim > 0) {
      const p = 1 - b.landAnim;
      sy = 0.6 + 0.4 * easeOutBack(p);
      sx = 1 + (1 - sy) * 0.6;
    }
    drawBlock(b.x, worldTopForIndex(i), b.width, b.ingredient, sx, sy);
  }

  if (state.active) {
    drawBlock(
      state.active.x,
      worldTopForIndex(state.placed.length),
      state.active.width,
      state.active.ingredient
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

// --- Evolving sky ---------------------------------------------------------
// The higher the tower, the later in the day it gets: day → golden hour →
// sunset → dusk → starry night. Colors blend continuously between stops.
const SKY_STOPS = [
  { h: 0, top: "#e9f5f5", bottom: "#f7fbfb" }, // bright day (matches the stage)
  { h: 12, top: "#fbe3b8", bottom: "#fdf4e0" }, // golden hour
  { h: 22, top: "#f7c2ae", bottom: "#fde5d6" }, // sunset
  { h: 32, top: "#b9aede", bottom: "#e6def4" }, // dusk
  { h: 44, top: "#16294a", bottom: "#3c5684" }, // night
];

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function lerpColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawBackground() {
  const h = state.placed.length;
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[0];
  let t = 0;
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (h >= SKY_STOPS[i].h) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      t = Math.min(1, (h - a.h) / (b.h - a.h));
    }
  }
  if (h >= SKY_STOPS[SKY_STOPS.length - 1].h) {
    a = b = SKY_STOPS[SKY_STOPS.length - 1];
    t = 0;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, lerpColor(a.top, b.top, t));
  grad.addColorStop(1, lerpColor(a.bottom, b.bottom, t));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars fade in as night falls.
  const starAlpha = Math.max(0, Math.min(1, (h - 34) / 10));
  if (starAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = starAlpha;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 46; i++) {
      const sx = rnd2(i, 7) * W;
      const sy = rnd2(i, 13) * H * 0.75;
      const sr = 0.8 + rnd2(i, 29) * 1.5;
      ctx.globalAlpha = starAlpha * (0.35 + rnd2(i, 41) * 0.65);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Deterministic pseudo-random in [0,1) from two seeds (stable every frame).
function rnd2(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Dashed ghost line at your all-time best height, with a tag. Turns green
// once you pass it.
function drawBestLine() {
  const best = state.sessionBest;
  if (!best) return;
  const y = FLOOR_Y - best * BLOCK_H;
  const col = state.passedBest ? "rgba(76,175,114,0.8)" : "rgba(238,67,91,0.55)";
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(LANE_MIN - 40, y);
  ctx.lineTo(LANE_MAX + 40, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = col;
  ctx.fillText("BEST " + best, LANE_MIN - 40, y - 7);
  ctx.restore();
}

// A little flag planted sideways into the block every 10 blocks: the pole
// sticks straight out of the block's side face, banner hanging from the tip.
function drawFlags() {
  for (let m = 10; m <= state.placed.length; m += 10) {
    const b = state.placed[m - 1];
    if (!b) continue;
    const y = worldTopForIndex(m - 1) + BLOCK_H * 0.5;
    const baseX = b.x + b.width - 3; // embedded a few px into the block
    const tipX = b.x + b.width + 26;

    // pole (horizontal, stuck into the side)
    ctx.strokeStyle = "#7a5b32";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(baseX, y);
    ctx.lineTo(tipX, y);
    ctx.stroke();
    // pole cap
    ctx.fillStyle = "#5d4426";
    ctx.beginPath();
    ctx.arc(tipX, y, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // banner hanging from the outer half of the pole
    ctx.fillStyle = m % 20 === 0 ? "#fd9f27" : "#22b2b4";
    ctx.beginPath();
    ctx.moveTo(tipX - 19, y + 2);
    ctx.lineTo(tipX - 1, y + 2);
    ctx.lineTo(tipX - 1, y + 19);
    ctx.lineTo(tipX - 10, y + 14);
    ctx.lineTo(tipX - 19, y + 19);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "800 9px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(m), tipX - 10, y + 12);
  }
}

function drawFloaters() {
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life / (f.maxLife * 0.45)));
    ctx.font = "800 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawBackground();

  applyCamera();
  const t = bowlOpacity(); // 0 see-through (zoomed in) → 1 opaque (zoomed out)
  drawBestLine();
  drawBowlBack(t); // far rim, behind the ingredients
  drawIngredients();
  drawFlags();
  drawBowlFront(t); // body + near rim, in front of the ingredients
  drawShards();
  drawParticles();
  drawFloaters();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// --- Menu background ----------------------------------------------------
// While the overlay is up, the box behind the text shows rows of ingredient
// slabs sliding across (alternating directions), stacked to fill it, looping
// forever. Each row's tile pattern is baked once into an offscreen canvas and
// then blitted, so the textures aren't recomputed every frame.

const MENU_ROW_H = 30;
const menu = { rows: [] };

function buildMenuRows() {
  menu.rows = [];
  const keys = ["rice", ...TOPPINGS];
  let ki = 0;
  let r = 0;
  for (let y = 4; y < H; y += MENU_ROW_H + 4) {
    const tiles = [];
    let patternW = 0;
    const count = 6 + (r % 3);
    for (let i = 0; i < count; i++) {
      const ing = INGREDIENTS[keys[ki % keys.length]];
      ki++;
      const w = 74 + ((ki * 37) % 92); // deterministic widths ~74–166
      tiles.push({ ing, w });
      patternW += w + 4;
    }

    // Bake the row's tiles into an offscreen strip once.
    const strip = document.createElement("canvas");
    strip.width = Math.ceil(patternW);
    strip.height = MENU_ROW_H;
    const sctx = strip.getContext("2d");
    withContext(sctx, () => {
      let tx = 0;
      for (const tile of tiles) {
        drawSlabRect(tx, 0, tile.w, MENU_ROW_H, tile.ing);
        tx += tile.w + 4;
      }
    });

    menu.rows.push({
      y,
      dir: r % 2 === 0 ? 1 : -1,
      speed: 26 + (r % 4) * 9,
      offset: (r * 53) % patternW,
      patternW,
      strip,
    });
    r++;
  }
}

function updateMenu(dt) {
  for (const row of menu.rows) {
    row.offset = (row.offset + row.speed * dt) % row.patternW;
  }
}

function renderMenu() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  for (const row of menu.rows) {
    const o = ((row.offset % row.patternW) + row.patternW) % row.patternW;
    const base = row.dir > 0 ? o - row.patternW : -o;
    for (let x = base; x < W; x += row.patternW) {
      ctx.drawImage(row.strip, x, row.y);
    }
  }
}

// --- Reward + confetti --------------------------------------------------

const CONFETTI_COLORS = ["#ee435b", "#22b2b4", "#ffffff", "#f5a3ad", "#8fd6d7", "#f0637a", "#4fc3c4"];
const confetti = [];

// fromTop=true spawns just above the box (ongoing emission); fromTop=false
// seeds across the whole box so the opening burst looks full immediately.
function spawnConfetti(n, fromTop = true) {
  for (let i = 0; i < n; i++) {
    confetti.push({
      x: Math.random() * CW,
      y: fromTop ? -20 - Math.random() * 80 : Math.random() * (CH + 40) - 40,
      vx: (Math.random() - 0.5) * 120,
      vy: 60 + Math.random() * 170,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 8,
      sway: Math.random() * Math.PI * 2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    });
  }
}

function updateConfetti(dt) {
  if (state.rewardShowing && confetti.length < 240) spawnConfetti(4); // keep it going while shown
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.sway += dt * 4;
    c.vy += 260 * dt;
    c.x += (c.vx + Math.sin(c.sway) * 30) * dt;
    c.y += c.vy * dt;
    c.rot += c.vrot * dt;
    if (c.y > CH + 30) confetti.splice(i, 1);
  }
}

function renderConfetti() {
  cctx.clearRect(0, 0, CW, CH);
  for (const c of confetti) {
    cctx.save();
    cctx.translate(c.x, c.y);
    cctx.rotate(c.rot);
    cctx.fillStyle = c.color;
    cctx.fillRect(-c.size / 2, -c.size * 0.35, c.size, c.size * 0.7);
    cctx.restore();
  }
}

function clearConfetti() {
  confetti.length = 0;
  cctx.clearRect(0, 0, CW, CH);
}

// A cheerful little arpeggio.
function playReward() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.18, gain: 0.18, delay: i * 0.09 }));
}

function triggerReward(cfg) {
  render(); // capture the just-completed bowl as the frozen backdrop
  state.paused = true;
  state.rewardShowing = true;
  rewardSubtitle.textContent = `You reached ${cfg.reward}, so here's ${cfg.discount}% off your next bowl.`;
  rewardCode.textContent = `POKEREWARDS${cfg.reward}`;
  spawnConfetti(200, false); // seed across the whole box so it's full immediately
  playReward();
  showScreen(screenReward);
  overlay.classList.remove("hidden");
  updateCombo();
  lockScreenActions();
  screenReward.scrollTop = 0; // start at the top so the cue makes sense
  updateScrollHint(); // measure now (reading scrollHeight forces a reflow)
  requestAnimationFrame(updateScrollHint); // and again after layout settles
}

// --- Power-ups ----------------------------------------------------------

const POWERUP_R = 30; // radius (canvas space)
const EXPAND_AMOUNT = 26; // px added to each affected block's width when collected
const POWERUP_FALL = 155; // fall speed (px/sec, canvas space)
// Power-ups are earned, not idle-farmed: land this many perfect drops in a row
// to drop one (and again for each further multiple while the streak holds).
const PERFECTS_PER_POWER = 3;
const MAGNET_DROPS = 2; // drops the magnet assists after collecting it
const MAGNET_TOLERANCE = 46; // widened "perfect" window (px) while the magnet is on
const SHIELD_CHANCE = 0.06; // chance a streak awards the rare shield (once/game)
const FLASH_DURATION = 1.2; // seconds a collect toast stays up

const puToast = document.getElementById("pu-toast");
const shieldBadge = document.getElementById("shield-badge");
const magnetBadge = document.getElementById("magnet-badge");
const magnetCount = document.getElementById("magnet-count");

function spawnPowerup(type) {
  state.powerups.push({
    x: 90 + Math.random() * (W - 180),
    y: -POWERUP_R - 12,
    vy: POWERUP_FALL,
    age: 0,
    type,
  });
}

// Which power-up a streak awards. Shield is a rare, once-per-game save; Sticky
// Rice (combo saver) is uncommon; the rest split evenly between expand/magnet.
function pickPowerType() {
  if (!state.shieldEarned && Math.random() < SHIELD_CHANCE) return "shield";
  if (!state.hasSaver && Math.random() < 0.22) return "saver";
  return Math.random() < 0.5 ? "expand" : "magnet";
}

// Called after each drop: reward a power-up whenever the perfect streak reaches
// a multiple of the requirement (state.combo counts consecutive perfects).
function notePerfectStreak() {
  if (state.powerups.length > 0) return; // one falling power-up at a time
  if (state.combo > 0 && state.combo % PERFECTS_PER_POWER === 0) {
    spawnPowerup(pickPowerType());
  }
}

function updatePowerups(dt) {
  if (state.toastTimer > 0) {
    state.toastTimer = Math.max(0, state.toastTimer - dt);
    if (state.toastTimer === 0 && puToast) puToast.classList.add("hidden");
  }

  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const p = state.powerups[i];
    p.age += dt;
    p.y += p.vy * dt;
    if (p.y > H + POWERUP_R + 12) state.powerups.splice(i, 1);
  }
}

// White disc + teal ring shared by every power-up glyph.
function powerDisc(x, y, r) {
  ctx.save();
  ctx.shadowColor = "rgba(34,178,180,0.85)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = 4;
  ctx.strokeStyle = "#22b2b4";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

// "grow" glyph: a little block with arrows pushing outward
function drawExpandGlyph(x, y, r) {
  const bw = r * 0.5;
  const bh = r * 0.5;
  ctx.fillStyle = "#ee435b";
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 4);
  ctx.fill();

  ctx.strokeStyle = "#1f2b2b";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const tip = r * 0.86;
  ctx.beginPath();
  ctx.moveTo(x + bw / 2 + 3, y);
  ctx.lineTo(x + tip, y);
  ctx.moveTo(x + tip - 6, y - 6);
  ctx.lineTo(x + tip, y);
  ctx.lineTo(x + tip - 6, y + 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - bw / 2 - 3, y);
  ctx.lineTo(x - tip, y);
  ctx.moveTo(x - tip + 6, y - 6);
  ctx.lineTo(x - tip, y);
  ctx.lineTo(x - tip + 6, y + 6);
  ctx.stroke();
}

// horseshoe magnet glyph
function drawMagnetGlyph(x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  const rad = r * 0.46;
  const lw = r * 0.32;
  const topY = -r * 0.05;
  const botY = r * 0.5;
  ctx.strokeStyle = "#ee435b"; // red U body
  ctx.lineWidth = lw;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.arc(0, topY, rad, Math.PI, 0); // top curve (opens downward)
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-rad, topY);
  ctx.lineTo(-rad, botY);
  ctx.moveTo(rad, topY);
  ctx.lineTo(rad, botY);
  ctx.stroke();
  ctx.strokeStyle = "#b9c6c6"; // grey pole tips
  ctx.beginPath();
  ctx.moveTo(-rad, botY - lw * 0.9);
  ctx.lineTo(-rad, botY);
  ctx.moveTo(rad, botY - lw * 0.9);
  ctx.lineTo(rad, botY);
  ctx.stroke();
  ctx.restore();
}

// shield glyph with a check mark
function drawShieldGlyph(x, y, r) {
  ctx.save();
  ctx.translate(x, y - r * 0.04);
  const w = r * 0.98;
  const h = r * 1.12;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w / 2, -h / 2 + h * 0.16);
  ctx.lineTo(w / 2, h * 0.12);
  ctx.quadraticCurveTo(w / 2, h * 0.42, 0, h / 2);
  ctx.quadraticCurveTo(-w / 2, h * 0.42, -w / 2, h * 0.12);
  ctx.lineTo(-w / 2, -h / 2 + h * 0.16);
  ctx.closePath();
  ctx.fillStyle = "#22b2b4";
  ctx.fill();

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-w * 0.22, 0);
  ctx.lineTo(-w * 0.02, h * 0.16);
  ctx.lineTo(w * 0.26, -h * 0.16);
  ctx.stroke();
  ctx.restore();
}

// sticky-rice glyph: a mound of rice in a little red bowl
function drawSaverGlyph(x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  // rice mound (three overlapping bumps)
  ctx.fillStyle = "#fff8ea";
  ctx.strokeStyle = "#dfd2b2";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.02, r * 0.28, Math.PI, 0);
  ctx.arc(0, -r * 0.2, r * 0.32, Math.PI, 0);
  ctx.arc(r * 0.3, -r * 0.02, r * 0.28, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // a few grains
  ctx.fillStyle = "#e4d7b8";
  for (const [gx, gy] of [[-0.25, -0.16], [0.05, -0.3], [0.28, -0.14], [-0.02, -0.08]]) {
    ctx.beginPath();
    ctx.ellipse(gx * r, gy * r, r * 0.07, r * 0.035, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // bowl
  ctx.fillStyle = "#ee435b";
  ctx.beginPath();
  ctx.moveTo(-r * 0.56, 0);
  ctx.quadraticCurveTo(0, r * 0.78, r * 0.56, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Drawn after render() (identity transform), so in plain canvas space.
function drawPowerups() {
  for (const p of state.powerups) {
    const pulse = 1 + Math.sin(p.age * 6) * 0.06;
    const r = POWERUP_R * pulse;
    powerDisc(p.x, p.y, r);
    if (p.type === "magnet") drawMagnetGlyph(p.x, p.y, r);
    else if (p.type === "shield") drawShieldGlyph(p.x, p.y, r);
    else if (p.type === "saver") drawSaverGlyph(p.x, p.y, r);
    else drawExpandGlyph(p.x, p.y, r);
  }
}

// Returns true if a power-up was collected at (px, py) — caller then skips the drop.
function collectPowerupAt(px, py) {
  for (let i = 0; i < state.powerups.length; i++) {
    const p = state.powerups[i];
    const hitR = POWERUP_R + 16; // generous hit area for touch
    if ((px - p.x) ** 2 + (py - p.y) ** 2 <= hitR * hitR) {
      const type = p.type;
      state.powerups.splice(i, 1);
      state.stats.powerups += 1;
      if (window.PokeAch && state.stats.powerups >= 5) PokeAch.unlock("bb-power5");
      applyPower(type);
      playPowerup();
      buzz(15);
      return true;
    }
  }
  return false;
}

function applyPower(type) {
  if (type === "magnet") {
    state.magnetDrops = MAGNET_DROPS;
    showToast("🧲 Magnet on!");
  } else if (type === "shield") {
    state.hasShield = true;
    state.shieldEarned = true;
    showToast("🛡 Shield up!");
  } else if (type === "saver") {
    state.hasSaver = true;
    showToast("🍚 Combo saver!");
  } else {
    applyExpand();
    showToast("↔ Bigger block!");
  }
  updateStatusBadges();
}

// Widen a block in place: grow from its center, capped to the lane and clamped
// so it stays on screen.
function widenBlock(b, min, max) {
  const center = b.x + b.width / 2;
  b.width = Math.min(b.width + EXPAND_AMOUNT, max - min);
  b.x = center - b.width / 2;
  if (b.x < min) b.x = min;
  if (b.x + b.width > max) b.x = max - b.width;
}

// Expand the block you're about to place AND the surface it lands on, so a good
// drop actually keeps the extra width instead of shedding it as overhang. The
// top couple of placed blocks widen together so the boost carries up the tower.
function applyExpand() {
  const { min, max } = slideBounds();
  if (state.active) widenBlock(state.active, min, max);
  // widen the top 2 placed blocks (the landing surface + its support)
  for (let i = state.placed.length - 1; i >= 0 && i >= state.placed.length - 2; i--) {
    widenBlock(state.placed[i], min, max);
  }
}

function playPowerup() {
  tone({ freq: 660, type: "sine", dur: 0.1, gain: 0.2 });
  tone({ freq: 990, type: "sine", dur: 0.15, gain: 0.18, delay: 0.08 });
}

function playShieldSave() {
  tone({ freq: 320, freqEnd: 680, type: "sawtooth", dur: 0.2, gain: 0.18 });
  tone({ freq: 660, freqEnd: 1040, type: "sine", dur: 0.28, gain: 0.16, delay: 0.11 });
}

function showToast(msg) {
  state.toastTimer = FLASH_DURATION;
  if (!puToast) return;
  puToast.textContent = msg;
  puToast.classList.remove("hidden");
}

function updateStatusBadges() {
  if (shieldBadge) shieldBadge.classList.toggle("hidden", !state.hasShield);
  const saverBadge = document.getElementById("saver-badge");
  if (saverBadge) saverBadge.classList.toggle("hidden", !state.hasSaver);
  if (magnetBadge) {
    if (state.magnetDrops > 0) {
      magnetBadge.classList.remove("hidden");
      if (magnetCount) magnetCount.textContent = state.magnetDrops;
    } else {
      magnetBadge.classList.add("hidden");
    }
  }
}

function clearPowerups() {
  state.powerups = [];
  state.toastTimer = 0;
  state.magnetDrops = 0;
  state.hasShield = false;
  state.shieldEarned = false;
  state.hasSaver = false;
  if (puToast) puToast.classList.add("hidden");
  updateStatusBadges();
}

function frame(timestamp) {
  if (!state.lastTime) state.lastTime = timestamp;
  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.05); // clamp big gaps
  state.lastTime = timestamp;

  if (state.running) {
    // While paused for the reward, leave the frozen frame on the canvas and
    // give the confetti all the frame budget.
    if (!state.paused) {
      updatePowerups(dt);
      update(dt);
      render();
      drawPowerups();
    }
  } else {
    updateMenu(dt);
    renderMenu();
  }

  if (state.rewardShowing) {
    updateConfetti(dt);
    renderConfetti();
  }

  requestAnimationFrame(frame);
}

// --- Input --------------------------------------------------------------

startBtn.addEventListener("click", showDifficulty);

difficultyBtns.forEach((btn) => {
  btn.addEventListener("click", () => startGame(btn.dataset.difficulty));
});

// --- Leaderboard wiring ---
lbStartBtn.addEventListener("click", () => openLeaderboard(screenStart, lbActiveTab));
lbViewBtn.addEventListener("click", () => {
  if (screenActionsLocked()) return;
  openLeaderboard(screenGameover, state.difficulty || lbActiveTab);
});
lbBackBtn.addEventListener("click", closeLeaderboard);
lbSaveBtn.addEventListener("click", submitLeaderboardName);
lbNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); submitLeaderboardName(); }
});
lbTabs.forEach((t) => t.addEventListener("click", () => setLbTab(t.dataset.diff)));

// Play Again restarts immediately at the same difficulty.
playAgainBtn.addEventListener("click", () => {
  if (screenActionsLocked()) return;
  startGame(state.difficulty);
});

// Quit returns to the "Bowl Builder" home screen.
quitBtn.addEventListener("click", () => {
  if (screenActionsLocked()) return;
  showStartScreen();
});

// Hide the scroll cue as soon as the reward card is scrolled toward the bottom.
screenReward.addEventListener("scroll", updateScrollHint);

// Resume play after the reward screen.
rewardBtn.addEventListener("click", () => {
  if (screenActionsLocked()) return;
  state.paused = false;
  state.rewardShowing = false;
  scrollHint.classList.add("hidden");
  overlay.classList.add("hidden");
  clearConfetti();
  updateCombo();
  state.lastTime = 0; // avoid a big dt jump on resume
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
});

// Order Now — don't fire on a stray rapid click while the screen is locking.
orderBtn.addEventListener("click", (e) => {
  if (screenActionsLocked()) e.preventDefault();
});

// Pause / resume via the button below the box.
pauseBtn.addEventListener("click", togglePause);
resumeBtn.addEventListener("click", resumeFromPause);
pauseQuitBtn.addEventListener("click", quitFromPause);

// Mute toggle.
muteBtn.addEventListener("click", toggleMute);

canvas.addEventListener("pointerdown", (e) => {
  if (!state.running || state.paused) return;
  // Map the pointer to canvas coordinates and check power-ups first — tapping
  // one collects it and must NOT also drop a block.
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (W / rect.width);
  const py = (e.clientY - rect.top) * (H / rect.height);
  if (collectPowerupAt(px, py)) {
    e.preventDefault();
    return;
  }
  dropActive();
});
window.addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return; // don't hijack name typing
  if (e.code === "Space") {
    e.preventDefault();
    dropActive();
  }
});

// Auto-pause when the tab is hidden so a background game never dies unfairly.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.running && !state.paused) pauseGame();
});

loadHighScore();
loadMute();
buildMenuRows();
requestAnimationFrame(frame);
