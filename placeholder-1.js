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
const clearBtn = document.getElementById("clear-btn");
const feedbackEl = document.getElementById("feedback");
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

function resetSelection() {
  selected = {};
  for (const c of CATEGORIES) selected[c] = new Set();
}

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

function mEll(rx, ry, stroke) { ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); if (stroke) ctx.stroke(); }
function mRR(x, y, w, h, r, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); if (stroke) ctx.stroke(); }
function mCirc(rad, stroke) { ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill(); if (stroke) ctx.stroke(); }
function mRing(rad) { ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke(); }

function drawMorsel(x, y, sz, name, seed) {
  const st = STYLE[name] || { c: ["#cfc6b0"], kind: "cube" };
  const col = st.c[seed % st.c.length];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rnd(seed * 1.3) - 0.5) * 1.7);
  ctx.fillStyle = col;
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = 0.8;
  switch (st.kind) {
    case "grain": mEll(sz * 0.95, sz * 0.4, true); break;
    case "cube": mRR(-sz * 0.75, -sz * 0.75, sz * 1.5, sz * 1.5, 2.5, true); break;
    case "bean": mEll(sz * 0.85, sz * 0.55, true); break;
    case "chunk": mRR(-sz * 0.75, -sz * 0.6, sz * 1.5, sz * 1.2, 2.5, true); break;
    case "slice":
      mCirc(sz * 0.85, false);
      ctx.strokeStyle = "rgba(60,90,40,0.5)"; ctx.lineWidth = 1.6; mRing(sz * 0.85);
      break;
    case "ring":
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.8, sz * 0.42); mRing(sz * 0.72);
      break;
    case "strand": mRR(-sz * 1.25, -sz * 0.22, sz * 2.5, sz * 0.44, sz * 0.22, false); break;
    case "shred": mRR(-sz * 1.35, -sz * 0.16, sz * 2.7, sz * 0.32, sz * 0.16, false); break;
    case "leaf": mEll(sz * 0.95, sz * 0.5, true); break;
    case "crisp": mRR(-sz * 0.7, -sz * 0.55, sz * 1.4, sz * 1.1, 1.5, true); break;
    case "tiny": case "fleck": mCirc(sz * 0.42, false); break;
    case "drizzle": ctx.globalAlpha = 0.6; mEll(sz * 0.7, sz * 0.5, false); break;
    default: mCirc(sz * 0.6, true);
  }
  ctx.restore();
}

// A full bed of the base (rice / salad) covering the whole opening.
function drawBed(cx, rimY, innerRx, innerRy, baseName) {
  const st = STYLE[baseName] || { c: ["#f4efe2"], kind: "grain" };
  const isSalad = baseName === "Salad Mix";

  // Solid base for depth so gaps between morsels don't show the bowl.
  ctx.fillStyle = isSalad ? "#356e2f" : "#e6d9bf";
  ctx.beginPath();
  ctx.ellipse(cx, rimY, innerRx - 5, innerRy - 2, 0, 0, Math.PI * 2);
  ctx.fill();

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
  ctx.save();
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.55;
  sauces.forEach((name, si) => {
    const st = STYLE[name] || { c: ["#8a5a2b"] };
    ctx.strokeStyle = st.c[0];
    ctx.lineWidth = 2.6;
    for (let k = 0; k < 3; k++) {
      const yy = rimY - 8 + si * 5 + k * 6;
      ctx.beginPath();
      for (let x = -58; x <= 58; x += 7) {
        const px = cx + x + (si * 12 - 10);
        const py = yy + Math.sin((x + si * 22 + k * 9) * 0.13) * 4;
        if (x === -58) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  });
  ctx.restore();
}

// Fill the bowl: a base bed, the proteins/mix-ins/toppings mounded on top,
// then a sauce drizzle.
function drawFill(cx, rimY, innerRx, innerRy) {
  const baseName = [...selected["Base"]][0];
  if (baseName) drawBed(cx, rimY, innerRx, innerRy, baseName);

  // Realistic amounts + sizes per category, spread across the whole bowl.
  const AMOUNT = { "Protein": 24, "Mix-ins": 22, "Toppings": 18 };
  const SIZE = { "Protein": 9, "Mix-ins": 7.5, "Toppings": 6 };
  const specs = [];
  for (const cat of ["Protein", "Mix-ins", "Toppings"]) {
    for (const name of selected[cat]) {
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

  const sauces = [...selected["Sauce"]];
  if (sauces.length) drawDrizzle(cx, rimY, sauces);
}

// --- Bowl drawing -------------------------------------------------------

function drawBowl() {
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  const rimY = 138;
  const rimRx = 226;
  const rimRy = 54;
  const innerRx = 208;
  const innerRy = 46;
  const bottomY = 300;

  // Ground shadow.
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.beginPath();
  ctx.ellipse(cx, bottomY + 12, rimRx * 0.8, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body.
  ctx.beginPath();
  ctx.moveTo(cx - rimRx, rimY);
  ctx.bezierCurveTo(cx - rimRx, rimY + 95, cx - 80, bottomY, cx, bottomY);
  ctx.bezierCurveTo(cx + 80, bottomY, cx + rimRx, rimY + 95, cx + rimRx, rimY);
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, 0, Math.PI, false);
  ctx.closePath();
  const body = ctx.createLinearGradient(0, rimY - rimRy, 0, bottomY);
  body.addColorStop(0, "#fbf6ec");
  body.addColorStop(1, "#e2d4bc");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = "rgba(120,95,55,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Interior.
  ctx.beginPath();
  ctx.ellipse(cx, rimY, innerRx, innerRy, 0, 0, Math.PI * 2);
  const inside = ctx.createRadialGradient(cx, rimY - 12, 10, cx, rimY + 8, innerRx);
  inside.addColorStop(0, "#e3d4b6");
  inside.addColorStop(1, "#bfa984");
  ctx.fillStyle = inside;
  ctx.fill();

  // Ingredients piled into the bowl.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, rimY - 4, innerRx - 4, innerRy + 20, 0, 0, Math.PI * 2);
  ctx.clip();
  drawFill(cx, rimY, innerRx, innerRy);
  ctx.restore();

  // Back-inside shadow + front lip.
  ctx.beginPath();
  ctx.ellipse(cx, rimY, innerRx, innerRy, 0, Math.PI, Math.PI * 2, false);
  ctx.strokeStyle = "rgba(85,65,38,0.2)";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, rimY, innerRx, innerRy, 0, 0, Math.PI, false);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(120,95,55,0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();
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
    btn.addEventListener("click", () => selectRecipe(r));
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
        return;
      }
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
    return;
  }
  selected[cat].add(name);
  clearFeedback();
  refresh();
}

function removeIngredient(cat, name) {
  selected[cat].delete(name);
  clearFeedback();
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
    feedbackEl.textContent = `${correctGroups} / ${CATEGORIES.length} groups correct — keep going!`;
    feedbackEl.className = "feedback bad";
    bowlArea.classList.remove("shake");
    void bowlArea.offsetWidth;
    bowlArea.classList.add("shake");
  }
}

function win() {
  successSub.textContent = hintsUsed
    ? `You built the ${currentRecipe.name} with ${hintsUsed} hint${hintsUsed === 1 ? "" : "s"}.`
    : `You built the ${currentRecipe.name} — no hints!`;
  successEl.classList.remove("hidden");
  runConfetti();
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

// --- Wiring -------------------------------------------------------------

changeBtn.addEventListener("click", openSelect);
nextBtn.addEventListener("click", openSelect);
checkBtn.addEventListener("click", checkBowl);
hintBtn.addEventListener("click", () => {
  hintBtn.classList.remove("pressed");
  void hintBtn.offsetWidth;
  hintBtn.classList.add("pressed");
  setTimeout(() => hintBtn.classList.remove("pressed"), 320);
  revealHint();
});

hintPop.addEventListener("click", () => hintPop.classList.add("hidden"));
clearBtn.addEventListener("click", () => {
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
