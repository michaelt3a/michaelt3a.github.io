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

function resetSelection() {
  selected = {};
  for (const c of CATEGORIES) selected[c] = new Set();
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

  // Ingredient pucks piled in the interior (colored by category).
  const all = currentIngredientList();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, rimY + 2, innerRx - 6, innerRy + 4, 0, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < all.length; i++) {
    const radius = 13 * Math.sqrt(i);
    const angle = i * 2.39996;
    const px = cx + radius * Math.cos(angle);
    const py = rimY + 6 + radius * Math.sin(angle) * 0.42;
    ctx.fillStyle = CATEGORY_COLOR[all[i].category];
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
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

function renderTabs() {
  tabsEl.innerHTML = "";
  for (const c of CATEGORIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab" + (c === activeTab ? " active" : "");
    btn.style.setProperty("--cat", CATEGORY_COLOR[c]);
    btn.innerHTML = `<span class="dot"></span>${c} <span class="count">${selected[c].size}</span>`;
    btn.addEventListener("click", () => {
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
  renderTabs();
  renderChips();
  renderContents();
  drawBowl();
}

// --- Interaction --------------------------------------------------------

function addIngredient(cat, name) {
  if (!selected[cat]) return;
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
  clearFeedback();
  refresh();
}

function openSelect() {
  overlay.classList.remove("hidden");
  successEl.classList.add("hidden");
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
  successSub.textContent = `You built the ${currentRecipe.name}.`;
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
