// Signature Works — learn the 9 Pokeworks recipes. Pick a signature, then
// build it from every possible ingredient (grouped into Base / Protein /
// Mix-ins / Sauce / Toppings). Click or drag ingredients into the bowl and
// check it; a correct bowl celebrates.

// --- Data ---------------------------------------------------------------

const CATEGORIES = ["Base", "Protein", "Mix-ins", "Sauce", "Toppings"];

const CATEGORY_COLOR = {
  "Base": "#c9a97a",
  "Protein": "#ee435b",
  "Mix-ins": "#4caf72",
  "Sauce": "#f0a52c",
  "Toppings": "#22b2b4",
};

// Every ingredient that appears across all 9 signature works, by category.
const INGREDIENTS = {
  "Base": ["White Rice", "Salad Mix"],
  "Protein": ["Ahi Tuna", "Atlantic Salmon", "Chicken", "Lobster Surimi", "Firm Tofu", "Avocado"],
  "Mix-ins": [
    "Cucumber", "Sliced Onion", "Edamame", "Pineapple", "Cilantro",
    "Hijiki Seaweed", "Mandarin Orange", "Shredded Cabbage", "Shredded Kale", "Sweet Corn",
  ],
  "Sauce": ["Sriracha Aioli", "Ponzu Fresh", "Pokeworks Classic", "Umami Shoyu", "Sweet Shoyu", "OG Shoyu"],
  "Toppings": [
    "Masago", "Green Onion", "Sesame Seeds", "Onion Crisps", "Shredded Nori",
    "Seaweed Salad", "Chili Flakes", "Surimi Salad", "Pickled Ginger",
    "Garlic Crisps", "Wonton Strips", "Avocado", "Chili Crisp",
  ],
};

const RECIPES = [
  { name: "Spicy Ahi", items: {
    "Base": ["White Rice"], "Protein": ["Ahi Tuna"],
    "Mix-ins": ["Cucumber", "Sliced Onion", "Edamame"],
    "Sauce": ["Sriracha Aioli"],
    "Toppings": ["Masago", "Green Onion", "Sesame Seeds", "Onion Crisps", "Shredded Nori"] } },
  { name: "Yuzu Ponzu Salmon", items: {
    "Base": ["White Rice"], "Protein": ["Atlantic Salmon"],
    "Mix-ins": ["Cucumber", "Sliced Onion", "Pineapple", "Cilantro"],
    "Sauce": ["Ponzu Fresh"],
    "Toppings": ["Seaweed Salad", "Green Onion", "Sesame Seeds", "Onion Crisps"] } },
  { name: "Hawaiian Ahi", items: {
    "Base": ["White Rice"], "Protein": ["Ahi Tuna"],
    "Mix-ins": ["Cucumber", "Sliced Onion", "Hijiki Seaweed", "Edamame"],
    "Sauce": ["Pokeworks Classic"],
    "Toppings": ["Chili Flakes", "Seaweed Salad", "Green Onion", "Sesame Seeds"] } },
  { name: "Umami Ahi", items: {
    "Base": ["White Rice"], "Protein": ["Ahi Tuna"],
    "Mix-ins": ["Cucumber", "Sliced Onion", "Hijiki Seaweed", "Edamame"],
    "Sauce": ["Umami Shoyu"],
    "Toppings": ["Surimi Salad", "Pickled Ginger", "Green Onion", "Sesame Seeds", "Garlic Crisps"] } },
  { name: "Sweet Sesame Chicken", items: {
    "Base": ["White Rice"], "Protein": ["Chicken"],
    "Mix-ins": ["Cucumber", "Sliced Onion", "Edamame", "Mandarin Orange", "Cilantro"],
    "Sauce": ["Pokeworks Classic"],
    "Toppings": ["Seaweed Salad", "Green Onion", "Sesame Seeds", "Wonton Strips"] } },
  { name: "Luxe Lobster", items: {
    "Base": ["White Rice"], "Protein": ["Lobster Surimi"],
    "Mix-ins": ["Cucumber", "Sliced Onion", "Shredded Cabbage", "Mandarin Orange", "Hijiki Seaweed"],
    "Sauce": ["Ponzu Fresh"],
    "Toppings": ["Sesame Seeds", "Onion Crisps"] } },
  { name: "Sweet Shoyu Tofu", items: {
    "Base": ["White Rice"], "Protein": ["Firm Tofu"],
    "Mix-ins": ["Cucumber", "Sliced Onion", "Shredded Kale", "Edamame"],
    "Sauce": ["Sweet Shoyu"],
    "Toppings": ["Avocado", "Green Onion", "Sesame Seeds"] } },
  { name: "Avocado Salad", items: {
    "Base": ["Salad Mix"], "Protein": ["Avocado"],
    "Mix-ins": ["Cucumber", "Shredded Cabbage", "Shredded Kale", "Sweet Corn"],
    "Sauce": ["Ponzu Fresh"],
    "Toppings": ["Pickled Ginger", "Green Onion", "Shredded Nori", "Wonton Strips"] } },
  { name: "Surf & Turf", items: {
    "Base": ["White Rice"], "Protein": ["Ahi Tuna", "Chicken"],
    "Mix-ins": ["Cucumber", "Sliced Onion", "Shredded Cabbage", "Shredded Kale", "Edamame"],
    "Sauce": ["OG Shoyu", "Pokeworks Classic"],
    "Toppings": ["Avocado", "Surimi Salad", "Green Onion", "Sesame Seeds", "Onion Crisps", "Chili Crisp"] } },
];

// --- DOM ----------------------------------------------------------------

const canvas = document.getElementById("bowl");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const overlay = document.getElementById("overlay");
const recipeGrid = document.getElementById("recipe-grid");
const recipeNameEl = document.getElementById("recipe-name");
const changeBtn = document.getElementById("change-recipe");
const builder = document.getElementById("builder");
const bowlArea = document.getElementById("bowl-area");
const tabsEl = document.getElementById("tabs");
const chipsEl = document.getElementById("chips");
const contentsEl = document.getElementById("bowl-contents");
const hintBtn = document.getElementById("hint-btn");
const hintPop = document.getElementById("hint-pop");
const hintCountEl = document.getElementById("hint-count");
const checkBtn = document.getElementById("check-btn");
const nextBowlBtn = document.getElementById("next-bowl-btn");
const clearBtn = document.getElementById("clear-btn");
const feedbackEl = document.getElementById("feedback");
const srProgress = document.getElementById("sr-progress");
const srTimer = document.getElementById("sr-timer");
const speedrunBtn = document.getElementById("speedrun-btn");
const resultsEl = document.getElementById("results");
const resultsGrid = document.getElementById("results-grid");
const resultsSummary = document.getElementById("results-summary");
const resultsClose = document.getElementById("results-close");
const resultsAgain = document.getElementById("results-again");
const resultsMenu = document.getElementById("results-menu");
const successEl = document.getElementById("success");
const successSub = document.getElementById("success-sub");
const nextBtn = document.getElementById("next-btn");
const scCanvas = document.getElementById("success-confetti");
const sctx = scCanvas.getContext("2d");

// --- State --------------------------------------------------------------

let currentRecipe = null;
let activeTab = "Base";
let selected = {}; // category -> Set of names
let hintsUsed = 0; // hints revealed for the current bowl

let mode = "practice"; // "practice" | "speedrun"
let run = null;        // active speedrun: { order, index, results, startMs }
let timerRAF = 0;

function resetSelection() {
  selected = {};
  for (const c of CATEGORIES) selected[c] = new Set();
}

// A deep copy of a selection map (independent Sets) — used to snapshot a
// finished speedrun bowl.
function cloneSelection(s) {
  const o = {};
  for (const c of CATEGORIES) o[c] = new Set(s[c]);
  return o;
}

// --- Sound effects ------------------------------------------------------
// Small synthesized blips via the Web Audio API (no asset files). The
// context is created lazily on the first interaction so autoplay policies
// are satisfied.

let audioCtx = null;

function actx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// One short note. `slideTo` bends the pitch; `delay` offsets it (for
// arpeggios).
function tone({ freq = 440, type = "triangle", dur = 0.11, gain = 0.13, slideTo = null, delay = 0 }) {
  const ac = actx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function arp(freqs, opts = {}) {
  const step = opts.step || 0.08;
  freqs.forEach((f, i) => tone({ freq: f, delay: i * step, ...opts }));
}

const SFX = {
  add: () => tone({ freq: 520, type: "triangle", dur: 0.10, slideTo: 760 }),
  remove: () => tone({ freq: 320, type: "sine", dur: 0.10, gain: 0.11, slideTo: 180 }),
  tab: () => tone({ freq: 400, type: "square", dur: 0.05, gain: 0.05 }),
  click: () => tone({ freq: 460, type: "triangle", dur: 0.07, gain: 0.11, slideTo: 600 }),
  hint: () => { tone({ freq: 680, dur: 0.09, gain: 0.10 }); tone({ freq: 1020, dur: 0.11, gain: 0.09, delay: 0.08 }); },
  wrong: () => tone({ freq: 200, type: "sawtooth", dur: 0.22, gain: 0.11, slideTo: 120 }),
  win: () => arp([523, 659, 784, 1047], { type: "triangle", dur: 0.17, step: 0.09 }),
  start: () => arp([392, 523, 659], { type: "triangle", dur: 0.12, step: 0.06 }),
  fanfare: () => arp([523, 659, 784, 1047, 1319, 1568], { type: "triangle", dur: 0.24, gain: 0.14, step: 0.11 }),
};

// --- Ingredient morsels -------------------------------------------------

// Per-ingredient look: colors + a shape "kind". Drawn as small morsels that
// pile into the bowl.
const STYLE = {
  // Base
  "White Rice": { c: ["#f7f2e6", "#ece3cf", "#fbf8ef"], kind: "grain" },
  "Salad Mix": { c: ["#8fc95f", "#5f9e3a", "#3f7d34", "#9c5a6a", "#a7d16a"], kind: "leaf" },
  // Protein
  "Ahi Tuna": { c: ["#d9483d", "#c23a30"], kind: "cube" },
  "Atlantic Salmon": { c: ["#f98d54", "#f2743a"], kind: "cube" },
  "Chicken": { c: ["#dcb684", "#caa063"], kind: "cube" },
  "Lobster Surimi": { c: ["#f6bdb2", "#e0644f"], kind: "cube" },
  "Firm Tofu": { c: ["#f5efe0", "#e7ddc6"], kind: "cube" },
  "Avocado": { c: ["#8dbf50", "#6fa53f"], kind: "cube" },
  // Mix-ins
  "Cucumber": { c: ["#cfe89a", "#a9d16a", "#dcefb6"], kind: "slice" },
  "Sliced Onion": { c: ["#ead9ef", "#c39ccb"], kind: "ring" },
  "Edamame": { c: ["#8ec63f", "#72af2c"], kind: "bean" },
  "Pineapple": { c: ["#f6ce3f", "#e8b120"], kind: "chunk" },
  "Cilantro": { c: ["#4faf59", "#2f7d3f"], kind: "fleck" },
  "Hijiki Seaweed": { c: ["#2a2a2a", "#141414"], kind: "strand" },
  "Mandarin Orange": { c: ["#f8a23a", "#f4922e"], kind: "chunk" },
  "Shredded Cabbage": { c: ["#e9e6c6", "#cdd98a"], kind: "shred" },
  "Shredded Kale": { c: ["#3a7d43", "#265a2f"], kind: "shred" },
  "Sweet Corn": { c: ["#f7cf4a", "#eab52a"], kind: "chunk" },
  // Sauce
  "Sriracha Aioli": { c: ["#e8674f", "#d9503a"], kind: "drizzle" },
  "Ponzu Fresh": { c: ["#b5892f", "#96702a"], kind: "drizzle" },
  "Pokeworks Classic": { c: ["#8a5a2b", "#6e461f"], kind: "drizzle" },
  "Umami Shoyu": { c: ["#6b4423", "#4f311a"], kind: "drizzle" },
  "Sweet Shoyu": { c: ["#7a4a1f", "#5c3717"], kind: "drizzle" },
  "OG Shoyu": { c: ["#5a3a1a", "#402812"], kind: "drizzle" },
  // Toppings
  "Masago": { c: ["#ffb35a", "#f6952e"], kind: "tiny" },
  "Green Onion": { c: ["#7cc24a", "#4e8a37"], kind: "ring" },
  "Sesame Seeds": { c: ["#f2e6c8", "#e2cf9e"], kind: "tiny" },
  "Onion Crisps": { c: ["#d9a441", "#c48a2a"], kind: "crisp" },
  "Shredded Nori": { c: ["#1f3a2a", "#12251b"], kind: "strand" },
  "Seaweed Salad": { c: ["#3f9d4f", "#2f7d3f"], kind: "strand" },
  "Chili Flakes": { c: ["#d6402c", "#b52f1a"], kind: "tiny" },
  "Surimi Salad": { c: ["#f6bdb2", "#ef958c"], kind: "shred" },
  "Pickled Ginger": { c: ["#f3c6cd", "#e79aa8"], kind: "slice" },
  "Garlic Crisps": { c: ["#e6c77a", "#d1a94e"], kind: "crisp" },
  "Wonton Strips": { c: ["#ecc266", "#d9a441"], kind: "chunk" },
  "Chili Crisp": { c: ["#b52f1a", "#8f2313"], kind: "tiny" },
};

function rnd(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// All bowl drawing routes through the module-level `g` context so the same
// routines can render the live bowl (main canvas) or a result thumbnail
// (an offscreen canvas). drawBowl() swaps `g` for the duration of a call.
let g = ctx;

function mEll(rx, ry, stroke) { g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill(); if (stroke) g.stroke(); }
function mRR(x, y, w, h, r, stroke) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); if (stroke) g.stroke(); }
function mCirc(rad, stroke) { g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill(); if (stroke) g.stroke(); }
function mRing(rad) { g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke(); }

function drawMorsel(x, y, sz, name, seed) {
  const st = STYLE[name] || { c: ["#cfc6b0"], kind: "cube" };
  const col = st.c[seed % st.c.length];
  g.save();
  g.translate(x, y);
  g.rotate((rnd(seed * 1.3) - 0.5) * 1.7);
  g.fillStyle = col;
  g.strokeStyle = "rgba(0,0,0,0.14)";
  g.lineWidth = 0.8;
  switch (st.kind) {
    case "grain": mEll(sz * 0.95, sz * 0.4, true); break;
    case "cube": mRR(-sz * 0.75, -sz * 0.75, sz * 1.5, sz * 1.5, 2.5, true); break;
    case "bean": mEll(sz * 0.85, sz * 0.55, true); break;
    case "chunk": mRR(-sz * 0.75, -sz * 0.6, sz * 1.5, sz * 1.2, 2.5, true); break;
    case "slice":
      mCirc(sz * 0.85, false);
      g.strokeStyle = "rgba(60,90,40,0.5)"; g.lineWidth = 1.6; mRing(sz * 0.85);
      break;
    case "ring":
      g.strokeStyle = col; g.lineWidth = Math.max(1.8, sz * 0.42); mRing(sz * 0.72);
      break;
    case "strand": mRR(-sz * 1.25, -sz * 0.22, sz * 2.5, sz * 0.44, sz * 0.22, false); break;
    case "shred": mRR(-sz * 1.35, -sz * 0.16, sz * 2.7, sz * 0.32, sz * 0.16, false); break;
    case "leaf": mEll(sz * 0.95, sz * 0.5, true); break;
    case "crisp": mRR(-sz * 0.7, -sz * 0.55, sz * 1.4, sz * 1.1, 1.5, true); break;
    case "tiny": case "fleck": mCirc(sz * 0.42, false); break;
    case "drizzle": g.globalAlpha = 0.6; mEll(sz * 0.7, sz * 0.5, false); break;
    default: mCirc(sz * 0.6, true);
  }
  g.restore();
}

// A full bed of the base (rice / salad) covering the whole opening.
function drawBed(cx, rimY, innerRx, innerRy, baseName) {
  const st = STYLE[baseName] || { c: ["#f4efe2"], kind: "grain" };
  const isSalad = baseName === "Salad Mix";

  // Solid base for depth so gaps between morsels don't show the bowl.
  g.fillStyle = isSalad ? "#356e2f" : "#e6d9bf";
  g.beginPath();
  g.ellipse(cx, rimY, innerRx - 5, innerRy - 2, 0, 0, Math.PI * 2);
  g.fill();

  // Dense grains (rice) or overlapping leaves (salad) covering the bed.
  const n = isSalad ? 320 : 680;
  const base = isSalad ? 8.5 : 3.6;
  for (let i = 0; i < n; i++) {
    // Uniform fill of the interior ellipse.
    const rn = Math.sqrt((i + 0.4) / n);
    const a = i * 2.39996 + rnd(i) * 0.5;
    const px = cx + Math.cos(a) * rn * (innerRx - 8);
    const py = rimY + Math.sin(a) * rn * (innerRy - 3);
    const sz = base * (0.8 + rnd(i * 2.3) * 0.5);
    drawMorsel(px, py, sz, baseName, i);
  }
}

// Wavy sauce drizzle over the top of the pile.
function drawDrizzle(cx, rimY, sauces) {
  g.save();
  g.lineCap = "round";
  g.globalAlpha = 0.55;
  sauces.forEach((name, si) => {
    const st = STYLE[name] || { c: ["#8a5a2b"] };
    g.strokeStyle = st.c[0];
    g.lineWidth = 2.6;
    for (let k = 0; k < 3; k++) {
      const yy = rimY - 8 + si * 5 + k * 6;
      g.beginPath();
      for (let x = -58; x <= 58; x += 7) {
        const px = cx + x + (si * 12 - 10);
        const py = yy + Math.sin((x + si * 22 + k * 9) * 0.13) * 4;
        if (x === -58) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
  });
  g.restore();
}

// Fill the bowl: a base bed, the proteins/mix-ins/toppings mounded on top,
// then a sauce drizzle. `sel` is a selection map (category -> Set of names).
function drawFill(cx, rimY, innerRx, innerRy, sel) {
  const baseName = [...sel["Base"]][0];
  if (baseName) drawBed(cx, rimY, innerRx, innerRy, baseName);

  // Realistic amounts + sizes per category, spread across the whole bowl.
  const AMOUNT = { "Protein": 24, "Mix-ins": 22, "Toppings": 18 };
  const SIZE = { "Protein": 9, "Mix-ins": 7.5, "Toppings": 6 };
  const specs = [];
  for (const cat of ["Protein", "Mix-ins", "Toppings"]) {
    for (const name of sel[cat]) {
      for (let k = 0; k < AMOUNT[cat]; k++) {
        specs.push({ name, size: SIZE[cat], key: rnd(specs.length * 1.7 + 0.3) });
      }
    }
  }
  specs.sort((a, b) => a.key - b.key); // deterministic mix

  const T = specs.length;
  const morsels = [];
  for (let i = 0; i < T; i++) {
    // Uniform fill of the interior ellipse (spread out, not mounded).
    const rn = Math.sqrt((i + 0.5) / T);
    const a = i * 2.39996;
    const px = cx + Math.cos(a) * rn * (innerRx - 12);
    const py = rimY + 2 + Math.sin(a) * rn * (innerRy - 6);
    morsels.push({ px, py, name: specs[i].name, size: specs[i].size, seed: i });
  }
  morsels.sort((a, b) => a.py - b.py); // back-to-front
  for (const m of morsels) drawMorsel(m.px, m.py, m.size, m.name, m.seed);

  const sauces = [...sel["Sauce"]];
  if (sauces.length) drawDrizzle(cx, rimY, sauces);
}

// --- Bowl drawing -------------------------------------------------------

// Render a bowl of `sel` (default: the live selection) into `context`
// (default: the main canvas context).
function drawBowl(context = ctx, sel = selected) {
  g = context;
  g.clearRect(0, 0, W, H);
  const cx = W / 2;
  const rimY = 138;
  const rimRx = 226;
  const rimRy = 54;
  const innerRx = 208;
  const innerRy = 46;
  const bottomY = 300;

  // Ground shadow.
  g.fillStyle = "rgba(0,0,0,0.1)";
  g.beginPath();
  g.ellipse(cx, bottomY + 12, rimRx * 0.8, 13, 0, 0, Math.PI * 2);
  g.fill();

  // Body.
  g.beginPath();
  g.moveTo(cx - rimRx, rimY);
  g.bezierCurveTo(cx - rimRx, rimY + 95, cx - 80, bottomY, cx, bottomY);
  g.bezierCurveTo(cx + 80, bottomY, cx + rimRx, rimY + 95, cx + rimRx, rimY);
  g.ellipse(cx, rimY, rimRx, rimRy, 0, 0, Math.PI, false);
  g.closePath();
  const body = g.createLinearGradient(0, rimY - rimRy, 0, bottomY);
  body.addColorStop(0, "#fbf6ec");
  body.addColorStop(1, "#e2d4bc");
  g.fillStyle = body;
  g.fill();
  g.strokeStyle = "rgba(120,95,55,0.25)";
  g.lineWidth = 2;
  g.stroke();

  // Interior.
  g.beginPath();
  g.ellipse(cx, rimY, innerRx, innerRy, 0, 0, Math.PI * 2);
  const inside = g.createRadialGradient(cx, rimY - 12, 10, cx, rimY + 8, innerRx);
  inside.addColorStop(0, "#e3d4b6");
  inside.addColorStop(1, "#bfa984");
  g.fillStyle = inside;
  g.fill();

  // Ingredients piled into the bowl.
  g.save();
  g.beginPath();
  g.ellipse(cx, rimY - 4, innerRx - 4, innerRy + 20, 0, 0, Math.PI * 2);
  g.clip();
  drawFill(cx, rimY, innerRx, innerRy, sel);
  g.restore();

  // Back-inside shadow + front lip.
  g.beginPath();
  g.ellipse(cx, rimY, innerRx, innerRy, 0, Math.PI, Math.PI * 2, false);
  g.strokeStyle = "rgba(85,65,38,0.2)";
  g.lineWidth = 6;
  g.stroke();
  g.beginPath();
  g.ellipse(cx, rimY, innerRx, innerRy, 0, 0, Math.PI, false);
  g.strokeStyle = "rgba(255,255,255,0.6)";
  g.lineWidth = 2.5;
  g.stroke();
  g.beginPath();
  g.ellipse(cx, rimY, rimRx, rimRy, 0, 0, Math.PI * 2);
  g.strokeStyle = "rgba(120,95,55,0.22)";
  g.lineWidth = 2;
  g.stroke();
}

// Flat list of selected {category, name}.
function currentIngredientList() {
  const list = [];
  for (const c of CATEGORIES) for (const n of selected[c]) list.push({ category: c, name: n });
  return list;
}

// --- Rendering ----------------------------------------------------------

function renderRecipes() {
  recipeGrid.innerHTML = "";
  for (const r of RECIPES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recipe-btn";
    btn.textContent = r.name;
    btn.addEventListener("click", () => { SFX.click(); selectRecipe(r); });
    recipeGrid.appendChild(btn);
  }
}

function hasBase() {
  return selected["Base"].size > 0;
}

function renderTabs() {
  tabsEl.innerHTML = "";
  const locked = !hasBase();
  for (const c of CATEGORIES) {
    const isLocked = locked && c !== "Base";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab" + (c === activeTab ? " active" : "") + (isLocked ? " locked" : "");
    btn.style.setProperty("--cat", CATEGORY_COLOR[c]);
    btn.innerHTML = `<span class="dot"></span>${c} <span class="count">${selected[c].size}</span>`;
    btn.addEventListener("click", () => {
      if (isLocked) {
        feedbackEl.textContent = "Add a base first!";
        feedbackEl.className = "feedback bad";
        SFX.wrong();
        return;
      }
      SFX.tab();
      activeTab = c;
      renderTabs();
      renderChips();
    });
    tabsEl.appendChild(btn);
  }
}

function renderChips() {
  chipsEl.innerHTML = "";
  for (const name of INGREDIENTS[activeTab]) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (selected[activeTab].has(name) ? " added" : "");
    chip.style.setProperty("--cat", CATEGORY_COLOR[activeTab]);
    chip.textContent = name;
    chip.draggable = true;
    chip.addEventListener("click", () => toggleIngredient(activeTab, name));
    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", activeTab + "|" + name);
    });
    chipsEl.appendChild(chip);
  }
}

function renderContents() {
  contentsEl.innerHTML = "";
  const list = currentIngredientList();
  for (const { category, name } of list) {
    const chip = document.createElement("span");
    chip.className = "content-chip";
    chip.style.setProperty("--cat", CATEGORY_COLOR[category]);
    chip.innerHTML = `${name} <span class="x">✕</span>`;
    chip.title = "Remove";
    chip.addEventListener("click", () => removeIngredient(category, name));
    contentsEl.appendChild(chip);
  }
}

function refresh() {
  // A base is required before anything else; snap back to the Base tab.
  if (!hasBase()) activeTab = "Base";
  renderTabs();
  renderChips();
  renderContents();
  drawBowl();
}

// --- Interaction --------------------------------------------------------

function addIngredient(cat, name) {
  if (!selected[cat]) return;
  if (cat !== "Base" && !hasBase()) {
    feedbackEl.textContent = "Add a base first!";
    feedbackEl.className = "feedback bad";
    SFX.wrong();
    return;
  }
  selected[cat].add(name);
  clearFeedback();
  SFX.add();
  refresh();
}

function removeIngredient(cat, name) {
  selected[cat].delete(name);
  clearFeedback();
  SFX.remove();
  refresh();
}

function toggleIngredient(cat, name) {
  if (selected[cat].has(name)) removeIngredient(cat, name);
  else addIngredient(cat, name);
}

function clearFeedback() {
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
}

function selectRecipe(recipe) {
  stopTimer();
  run = null;
  setMode("practice");
  currentRecipe = recipe;
  resetSelection();
  activeTab = "Base";
  recipeNameEl.textContent = recipe.name;
  changeBtn.hidden = false;
  builder.hidden = false;
  overlay.classList.add("hidden");
  successEl.classList.add("hidden");
  hintPop.classList.add("hidden");
  hintsUsed = 0;
  updateHintCount();
  feedbackEl.textContent = "Start with a base.";
  feedbackEl.className = "feedback";
  refresh();
}

function openSelect() {
  // Hide the builder so the previously-built bowl doesn't ghost through the
  // semi-transparent recipe menu. selectRecipe / startSpeedrun re-show it fresh.
  builder.hidden = true;
  changeBtn.hidden = true;
  recipeNameEl.textContent = "";
  overlay.classList.remove("hidden");
  successEl.classList.add("hidden");
  hintPop.classList.add("hidden");
}

function updateHintCount() {
  hintCountEl.textContent = String(hintsUsed);
}

// Recipe ingredients not yet in the bowl. Base must come first.
function missingIngredients() {
  const out = [];
  const cats = hasBase() ? CATEGORIES : ["Base"];
  for (const c of cats) {
    for (const n of currentRecipe.items[c]) {
      if (!selected[c].has(n)) out.push({ category: c, name: n });
    }
  }
  return out;
}

function flashChip(name) {
  for (const ch of chipsEl.querySelectorAll(".chip")) {
    if (ch.textContent === name) {
      ch.classList.remove("flash");
      void ch.offsetWidth;
      ch.classList.add("flash");
      break;
    }
  }
}

// Reveal a single missing ingredient (a light hint).
function revealHint() {
  if (!currentRecipe) return;
  const missing = missingIngredients();
  if (!missing.length) {
    hintPop.innerHTML = "You've got everything this bowl needs!";
    hintPop.classList.remove("hidden");
    return;
  }
  const pick = missing[Math.floor(rnd(hintsUsed + missing.length + 1) * missing.length)];
  hintsUsed++;
  updateHintCount();
  hintPop.innerHTML = `Hint: add <span class="hint-cat">${pick.name}</span> &middot; ${pick.category}`;
  hintPop.classList.remove("hidden");
  // Jump to that section and flash the chip.
  activeTab = pick.category;
  renderTabs();
  renderChips();
  flashChip(pick.name);
}

function setsEqual(set, arr) {
  if (set.size !== arr.length) return false;
  for (const n of arr) if (!set.has(n)) return false;
  return true;
}

function checkBowl() {
  if (!currentRecipe) return;
  let correctGroups = 0;
  for (const c of CATEGORIES) {
    if (setsEqual(selected[c], currentRecipe.items[c])) correctGroups++;
  }
  if (correctGroups === CATEGORIES.length) {
    win();
  } else {
    SFX.wrong();
    feedbackEl.textContent = `${correctGroups} / ${CATEGORIES.length} groups correct. Keep going!`;
    feedbackEl.className = "feedback bad";
    bowlArea.classList.remove("shake");
    void bowlArea.offsetWidth;
    bowlArea.classList.add("shake");
  }
}

function win() {
  successSub.textContent = hintsUsed
    ? `You built the ${currentRecipe.name} with ${hintsUsed} hint${hintsUsed === 1 ? "" : "s"}.`
    : `You built the ${currentRecipe.name} with no hints!`;
  successEl.classList.remove("hidden");
  SFX.win();
  runConfetti();
  if (window.PokeAch) {
    PokeAch.unlock("sw-first");
    if (hintsUsed === 0) PokeAch.unlock("sw-nohints");
  }
}

// --- Confetti (success) -------------------------------------------------

let confetti = [];
let confettiRAF = 0;

function runConfetti() {
  // Match the (now full-screen) overlay so confetti fills the viewport.
  scCanvas.width = successEl.clientWidth;
  scCanvas.height = successEl.clientHeight;
  const CW = scCanvas.width;
  const CH = scCanvas.height;
  const colors = ["#ee435b", "#22b2b4", "#f5a3ad", "#8fd6d7", "#ffd15a", "#ffffff"];
  confetti = [];
  for (let i = 0; i < 150; i++) {
    confetti.push({
      x: CW / 2 + (Math.random() - 0.5) * 140,
      y: CH * 0.4,
      vx: (Math.random() - 0.5) * 9,
      vy: -6 - Math.random() * 8,
      size: 5 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.4,
      color: colors[i % colors.length],
    });
  }
  cancelAnimationFrame(confettiRAF);
  let last = null;
  let elapsed = 0;
  const step = (t) => {
    if (last == null) last = t;
    elapsed += t - last;
    last = t;
    sctx.clearRect(0, 0, CW, CH);
    for (const c of confetti) {
      c.vy += 0.3;
      c.x += c.vx;
      c.y += c.vy;
      c.rot += c.vrot;
      sctx.save();
      sctx.translate(c.x, c.y);
      sctx.rotate(c.rot);
      sctx.fillStyle = c.color;
      sctx.fillRect(-c.size / 2, -c.size * 0.35, c.size, c.size * 0.7);
      sctx.restore();
    }
    if (elapsed < 2400 && !successEl.classList.contains("hidden")) {
      confettiRAF = requestAnimationFrame(step);
    } else {
      sctx.clearRect(0, 0, CW, CH);
    }
  };
  confettiRAF = requestAnimationFrame(step);
}

// --- Speedrun mode ------------------------------------------------------

const BEST_KEY = "sigworks_speedrun_best";

function loadBest() {
  try {
    const b = JSON.parse(localStorage.getItem(BEST_KEY));
    // Ignore values corrupted by the earlier double-finish bug (a run can
    // never have more perfect bowls than there are recipes).
    if (!b || typeof b.perfect !== "number" || b.perfect > RECIPES.length) return null;
    return b;
  } catch { return null; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

// --- Speedrun leaderboard (global via Supabase, local fallback) ---------

const SR_LB_LOCAL_KEY = "sigworks_speedrun_lb";
const SR_LB_NAME_KEY = "pokeworks-lb-name";
const SR_LB_MAX = 10;

const SB = window.POKEWORKS_SUPABASE || {};
const useSupabase =
  !!SB.url && !!SB.anonKey && !/YOUR_/.test(SB.url) && !/YOUR_/.test(SB.anonKey);
function sbHeaders(extra) {
  return Object.assign({ apikey: SB.anonKey, Authorization: "Bearer " + SB.anonKey }, extra || {});
}

// Leaderboard DOM
const srLeaderboardEl = document.getElementById("sr-leaderboard");
const srLbList = document.getElementById("sr-lb-list");
const srLbEntry = document.getElementById("sr-lb-entry");
const srLbNameInput = document.getElementById("sr-lb-name");
const srLbSubmitBtn = document.getElementById("sr-lb-submit");
const srLbOpenBtn = document.getElementById("sr-lb-open");
const srLbBackBtn = document.getElementById("sr-lb-back");
const srLbCloseBtn = document.getElementById("sr-lb-close");
const resultsLbBtn = document.getElementById("results-leaderboard");

let srPendingRun = null; // { perfect, ms } awaiting a name
let srLbNewName = null; // highlight the row for this name after a submit

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Better run = more perfect bowls, then faster time.
function betterRun(a, b) {
  return a.perfect !== b.perfect ? a.perfect > b.perfect : a.ms < b.ms;
}
function sortRuns(list) {
  return list.slice().sort((x, y) => (x.perfect !== y.perfect ? y.perfect - x.perfect : x.ms - y.ms));
}
// One row per player (case-insensitive), keeping their best run.
function dedupeRuns(list) {
  const seen = new Set();
  const out = [];
  for (const e of sortRuns(list)) {
    const key = String(e.name).trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function loadLocalRuns() {
  try { return JSON.parse(localStorage.getItem(SR_LB_LOCAL_KEY)) || []; } catch { return []; }
}
function saveLocalRuns(list) {
  try { localStorage.setItem(SR_LB_LOCAL_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
function addLocalRun(name, perfect, ms) {
  const list = loadLocalRuns();
  const key = String(name).trim().toLowerCase();
  const existing = list.find((e) => String(e.name).trim().toLowerCase() === key);
  const run = { name, perfect, ms };
  if (existing) {
    if (betterRun(run, existing)) { existing.perfect = perfect; existing.ms = ms; existing.name = name; }
  } else {
    list.push(run);
  }
  saveLocalRuns(dedupeRuns(list).slice(0, 100));
}

function loadLbName() {
  try { return localStorage.getItem(SR_LB_NAME_KEY) || ""; } catch { return ""; }
}
function saveLbName(n) {
  try { localStorage.setItem(SR_LB_NAME_KEY, n); } catch { /* ignore */ }
}

async function fetchSpeedrunTop() {
  if (!useSupabase) return dedupeRuns(loadLocalRuns()).slice(0, SR_LB_MAX);
  const url = SB.url +
    "/rest/v1/sigworks_speedruns?select=name,perfect,ms&order=perfect.desc,ms.asc&limit=500";
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error("Supabase fetch " + res.status);
  return dedupeRuns(await res.json()).slice(0, SR_LB_MAX);
}

async function submitSpeedrun(name, perfect, ms) {
  perfect = Math.round(perfect);
  ms = Math.round(ms); // int column — never send a fractional millisecond
  addLocalRun(name, perfect, ms); // local mirror
  if (!useSupabase) return;
  const res = await fetch(SB.url + "/rest/v1/sigworks_speedruns", {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ name: name, perfect: perfect, ms: ms }),
  });
  if (!res.ok) throw new Error("Supabase insert " + res.status);
}

async function renderSpeedrunBoard() {
  srLbList.innerHTML = '<li class="sr-lb-empty">Loading…</li>';
  let list;
  try {
    list = await fetchSpeedrunTop();
  } catch (e) {
    list = dedupeRuns(loadLocalRuns()).slice(0, SR_LB_MAX);
  }
  srLbList.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "sr-lb-empty";
    li.textContent = "No runs yet. Be the first!";
    srLbList.appendChild(li);
    return;
  }
  let highlighted = false;
  list.forEach((e, i) => {
    const li = document.createElement("li");
    li.className = "sr-lb-row";
    if (!highlighted && srLbNewName &&
        String(srLbNewName).trim().toLowerCase() === String(e.name).trim().toLowerCase()) {
      li.classList.add("sr-lb-me");
      highlighted = true;
    }
    li.innerHTML =
      `<span class="sr-lb-rank">${i + 1}</span>` +
      `<span class="sr-lb-name">${escapeHtml(e.name)}</span>` +
      `<span class="sr-lb-stat">${e.perfect}/${RECIPES.length} &middot; ${fmtTime(e.ms)}</span>`;
    srLbList.appendChild(li);
  });
}

function openSpeedrunBoard() {
  srLeaderboardEl.classList.remove("hidden");
  renderSpeedrunBoard();
}
function closeSpeedrunBoard() {
  srLeaderboardEl.classList.add("hidden");
}

// Submit the just-finished run under the typed name, then show the board.
async function submitSpeedrunName() {
  if (!srPendingRun) return;
  const name = (srLbNameInput.value || "").trim().slice(0, 12) || "Anon";
  saveLbName(name);
  const perfect = srPendingRun.perfect;
  const ms = srPendingRun.ms;
  srPendingRun = null;
  srLbEntry.classList.add("hidden");
  srLbSubmitBtn.disabled = true;
  try {
    await submitSpeedrun(name, perfect, ms);
  } catch (e) {
    /* local mirror already saved */
  }
  srLbSubmitBtn.disabled = false;
  srLbNewName = name;
  openSpeedrunBoard();
}

// Fisher–Yates shuffle (a fresh order each run).
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtTime(ms) {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}

// Show/hide the controls that differ between the two modes.
function setMode(m) {
  mode = m;
  const speed = m === "speedrun";
  hintBtn.hidden = speed;       // no hints in a speedrun
  checkBtn.hidden = speed;      // no checking either
  nextBowlBtn.hidden = !speed;
  srProgress.hidden = !speed;
  srTimer.hidden = !speed;
  if (speed) changeBtn.hidden = true;
  hintPop.classList.add("hidden");
}

function startTimer() {
  cancelAnimationFrame(timerRAF);
  const tick = () => {
    if (!run) return;
    srTimer.textContent = fmtTime(performance.now() - run.startMs);
    timerRAF = requestAnimationFrame(tick);
  };
  timerRAF = requestAnimationFrame(tick);
}
function stopTimer() {
  cancelAnimationFrame(timerRAF);
}

function startSpeedrun() {
  run = { order: shuffled(RECIPES), index: 0, results: [], startMs: performance.now() };
  setMode("speedrun");
  overlay.classList.add("hidden");
  resultsEl.classList.add("hidden");
  successEl.classList.add("hidden");
  srLeaderboardEl.classList.add("hidden");
  srLbEntry.classList.add("hidden");
  srPendingRun = null;
  builder.hidden = false;
  loadRunBowl();
  startTimer();
}

function loadRunBowl() {
  currentRecipe = run.order[run.index];
  resetSelection();
  activeTab = "Base";
  recipeNameEl.textContent = currentRecipe.name;
  changeBtn.hidden = true;
  srProgress.textContent = `Bowl ${run.index + 1} / ${run.order.length}`;
  const last = run.index === run.order.length - 1;
  nextBowlBtn.textContent = last ? "Finish ✓" : "Next Bowl →";
  feedbackEl.textContent = "Build it from memory";
  feedbackEl.className = "feedback";
  refresh();
}

// Lock in the current bowl and move on (or finish the run).
function nextRunBowl() {
  if (!run || run.finished) return;
  run.results.push({ recipe: currentRecipe, sel: cloneSelection(selected) });
  if (run.index >= run.order.length - 1) {
    finishSpeedrun();
    return;
  }
  run.index++;
  loadRunBowl();
}

// What the player got right / missed / wrong for one category.
function diffCategory(sel, want) {
  const selArr = [...sel];
  return {
    ok: selArr.filter((n) => want.includes(n)),
    bad: selArr.filter((n) => !want.includes(n)),
    miss: want.filter((n) => !sel.has(n)),
  };
}

function finishSpeedrun() {
  if (!run || run.finished) return; // a run finishes exactly once
  run.finished = true;
  stopTimer();
  nextBowlBtn.hidden = true; // can't be re-triggered from behind the results
  const totalMs = performance.now() - run.startMs;
  let perfect = 0;
  for (const r of run.results) {
    let groups = 0;
    for (const c of CATEGORIES) if (setsEqual(r.sel[c], r.recipe.items[c])) groups++;
    r.groups = groups;
    r.perfect = groups === CATEGORIES.length;
    if (r.perfect) perfect++;
  }
  renderResults(perfect, totalMs);
  resultsEl.classList.remove("hidden");

  if (window.PokeAch) {
    PokeAch.unlock("sw-speedrun");
    if (perfect === run.results.length) PokeAch.unlock("sw-perfectrun");
  }

  // Offer to add this run to the global leaderboard. Round the time — the DB
  // stores whole milliseconds (an int column).
  srPendingRun = { perfect: perfect, ms: Math.round(totalMs) };
  srLbNewName = null;
  if (srLbNameInput) srLbNameInput.value = loadLbName();
  if (srLbEntry) srLbEntry.classList.remove("hidden");

  // A flawless run (every bowl perfect) earns a full-screen confetti burst
  // and a fanfare.
  if (perfect === run.results.length) {
    SFX.fanfare();
    runResultsConfetti();
  }
}

let rConfettiRAF = 0;

function runResultsConfetti() {
  const cv = document.getElementById("results-confetti");
  cv.width = window.innerWidth;
  cv.height = window.innerHeight;
  const CW = cv.width;
  const CH = cv.height;
  const rctx = cv.getContext("2d");
  const colors = ["#ee435b", "#22b2b4", "#f5a3ad", "#8fd6d7", "#ffd15a", "#ffffff"];
  const EMIT_MS = 2800; // keep raining down for this long, then let it clear

  const parts = [];
  function spawn(n) {
    for (let i = 0; i < n; i++) {
      parts.push({
        x: Math.random() * CW,
        y: -20 - Math.random() * 40, // just above the top edge
        vx: (Math.random() - 0.5) * 3,
        vy: 1.5 + Math.random() * 2.5, // gentle fall so it lingers
        size: 6 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.25,
        sway: Math.random() * Math.PI * 2,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }
  spawn(220); // opening burst

  cancelAnimationFrame(rConfettiRAF);
  let last = null;
  let elapsed = 0;
  const step = (t) => {
    if (last == null) last = t;
    elapsed += t - last;
    last = t;
    if (elapsed < EMIT_MS) spawn(7); // steady stream, not a single puff
    rctx.clearRect(0, 0, CW, CH);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += 0.03;
      p.sway += 0.05;
      p.x += p.vx + Math.sin(p.sway) * 0.6; // flutter side to side
      p.y += p.vy;
      p.rot += p.vrot;
      if (p.y > CH + 24) { parts.splice(i, 1); continue; }
      rctx.save();
      rctx.translate(p.x, p.y);
      rctx.rotate(p.rot);
      rctx.fillStyle = p.color;
      rctx.fillRect(-p.size / 2, -p.size * 0.35, p.size, p.size * 0.7);
      rctx.restore();
    }
    if ((elapsed < EMIT_MS || parts.length) && !resultsEl.classList.contains("hidden")) {
      rConfettiRAF = requestAnimationFrame(step);
    } else {
      rctx.clearRect(0, 0, CW, CH);
    }
  };
  rConfettiRAF = requestAnimationFrame(step);
}

function renderResults(perfect, totalMs) {
  const N = run.results.length;
  const allPerfect = perfect === N;
  document.querySelector(".results-title").textContent =
    allPerfect ? "Perfect Run! 🎉" : "Speedrun Complete!";
  let summary = `<strong>${perfect} / ${N}</strong> bowls perfect &middot; <strong>${fmtTime(totalMs)}</strong>`;

  const best = loadBest();
  const isBest = !best || perfect > best.perfect || (perfect === best.perfect && totalMs < best.ms);
  if (isBest) {
    saveBest({ perfect, ms: totalMs });
    summary += ` &middot; <span class="rbest">★ New best!</span>`;
  } else if (best) {
    summary += ` &middot; Best: ${best.perfect}/${N} in ${fmtTime(best.ms)}`;
  }
  resultsSummary.innerHTML = summary;

  resultsGrid.innerHTML = "";
  for (const r of run.results) {
    const card = document.createElement("div");
    card.className = "rcard" + (r.perfect ? " perfect" : "");

    const cv = document.createElement("canvas");
    cv.className = "rcard-bowl";
    cv.width = W;
    cv.height = H;
    card.appendChild(cv);
    drawBowl(cv.getContext("2d"), r.sel);

    const head = document.createElement("div");
    head.className = "rcard-head";
    head.innerHTML =
      `<span class="rcard-name">${r.recipe.name}</span>` +
      `<span class="rcard-badge ${r.perfect ? "ok" : "bad"}">` +
      `${r.perfect ? "Perfect" : r.groups + " / " + CATEGORIES.length}</span>`;
    card.appendChild(head);

    const diff = document.createElement("div");
    diff.className = "rcard-diff";
    for (const c of CATEGORIES) {
      const { ok, bad, miss } = diffCategory(r.sel[c], r.recipe.items[c]);
      let pills = "";
      for (const n of ok) pills += `<span class="rp ok">✓ ${n}</span>`;
      for (const n of miss) pills += `<span class="rp miss">＋ ${n}</span>`;
      for (const n of bad) pills += `<span class="rp bad">✕ ${n}</span>`;
      const row = document.createElement("div");
      row.className = "rrow";
      row.innerHTML =
        `<span class="rrow-cat" style="--cat:${CATEGORY_COLOR[c]}">${c}</span>` +
        `<span class="rrow-pills">${pills}</span>`;
      diff.appendChild(row);
    }
    card.appendChild(diff);
    resultsGrid.appendChild(card);
  }
}

// --- Wiring -------------------------------------------------------------

speedrunBtn.addEventListener("click", () => { SFX.start(); startSpeedrun(); });
nextBowlBtn.addEventListener("click", () => { SFX.click(); nextRunBowl(); });

// Speedrun leaderboard wiring
srLbOpenBtn.addEventListener("click", () => { SFX.click(); srLbNewName = null; openSpeedrunBoard(); });
resultsLbBtn.addEventListener("click", () => { SFX.click(); openSpeedrunBoard(); });
srLbBackBtn.addEventListener("click", () => { SFX.click(); closeSpeedrunBoard(); });
srLbCloseBtn.addEventListener("click", () => { SFX.click(); closeSpeedrunBoard(); });
srLbSubmitBtn.addEventListener("click", submitSpeedrunName);
srLbNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); submitSpeedrunName(); }
});
resultsAgain.addEventListener("click", () => { SFX.start(); startSpeedrun(); });
resultsMenu.addEventListener("click", () => {
  SFX.click();
  stopTimer();
  run = null;
  resultsEl.classList.add("hidden");
  setMode("practice");
  openSelect();
});
resultsClose.addEventListener("click", () => {
  SFX.click();
  stopTimer();
  run = null;
  resultsEl.classList.add("hidden");
  setMode("practice");
  openSelect();
});

changeBtn.addEventListener("click", () => { SFX.click(); openSelect(); });
nextBtn.addEventListener("click", () => { SFX.click(); openSelect(); });
checkBtn.addEventListener("click", checkBowl);
hintBtn.addEventListener("click", () => {
  SFX.hint();
  hintBtn.classList.remove("pressed");
  void hintBtn.offsetWidth;
  hintBtn.classList.add("pressed");
  setTimeout(() => hintBtn.classList.remove("pressed"), 320);
  revealHint();
});

hintPop.addEventListener("click", () => hintPop.classList.add("hidden"));
clearBtn.addEventListener("click", () => {
  SFX.remove();
  resetSelection();
  clearFeedback();
  refresh();
});

// Drag ingredients onto the bowl.
bowlArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  bowlArea.classList.add("dragover");
});
bowlArea.addEventListener("dragleave", () => bowlArea.classList.remove("dragover"));
bowlArea.addEventListener("drop", (e) => {
  e.preventDefault();
  bowlArea.classList.remove("dragover");
  const data = e.dataTransfer.getData("text/plain");
  const [cat, name] = data.split("|");
  if (cat && name) addIngredient(cat, name);
});

resetSelection();
renderRecipes();
drawBowl();
