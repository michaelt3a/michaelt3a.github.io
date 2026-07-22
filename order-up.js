// Order Up (Rush Hour) — you're behind the Pokeworks line. Stick-figure
// customers step up across the counter wanting a signature bowl; scoop the
// ingredients from their bins before the customer loses patience. Serve fast
// for tips; lose three customers and the shift is over.

const B = window.Bowl;
const CATS = B.CATEGORIES;

// --- DOM ----------------------------------------------------------------
const customersEl = document.getElementById("customers");
const tablesEl = document.getElementById("tables");
const orderNameEl = document.getElementById("order-name");
const checklistEl = document.getElementById("checklist");
const stationsEl = document.getElementById("stations");
const pansEl = document.getElementById("pans");
const bowlCanvas = document.getElementById("bowl");
const bctx = bowlCanvas.getContext("2d");
const BW = bowlCanvas.width;
const BH = bowlCanvas.height;
const comboEl = document.getElementById("combo");
const livesEl = document.getElementById("lives");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const screenStart = document.getElementById("screen-start");
const screenOver = document.getElementById("screen-over");
const startBabyBtn = document.getElementById("start-baby");
const startNormalBtn = document.getElementById("start-normal");
const startHardBtn = document.getElementById("start-hard");
const againBtn = document.getElementById("again-btn");
const finalEl = document.getElementById("final");

// --- Constants ----------------------------------------------------------
const MAX_CUSTOMERS = 3;
const START_LIVES = 3;
const WAIT_DRAIN = 0.5; // patience rate for customers you're NOT serving
const BEST_KEY = "pokeworks-orderup-best";
// Shirt colors to vary the stick figures.
const SHIRTS = ["#ee435b", "#22b2b4", "#f0a52c", "#7c5cff", "#39a85b", "#e8709b"];

// --- State --------------------------------------------------------------
let best = 0; // best for the current mode (set once S exists)
const S = {
  running: false,
  mode: "normal", // "baby" | "normal" | "hard"
  score: 0,
  lives: START_LIVES,
  served: 0,
  combo: 0,
  customers: [],
  activeId: null,
  spawnTimer: 0,
  lastTime: 0,
};
let nextId = 1;
let activeStation = CATS[0]; // which station's pans are shown ("Base" first)
const panEls = {}; // name -> pan element (current station only)
const stationBtns = {}; // category -> station button

// --- Sound (tiny Web Audio synth) --------------------------------------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone({ freq = 440, type = "triangle", dur = 0.11, gain = 0.13, slideTo = null, delay = 0 }) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}
function arp(freqs, opts = {}) {
  const step = opts.step || 0.08;
  freqs.forEach((f, i) => tone({ freq: f, delay: i * step, ...opts }));
}
const SFX = {
  add: () => tone({ freq: 520, slideTo: 760, dur: 0.10 }),
  remove: () => tone({ freq: 320, type: "sine", slideTo: 180, dur: 0.10, gain: 0.11 }),
  pick: () => tone({ freq: 400, type: "square", dur: 0.05, gain: 0.05 }),
  serve: () => arp([523, 659, 784, 1047], { type: "triangle", dur: 0.16, step: 0.07 }),
  angry: () => tone({ freq: 200, type: "sawtooth", slideTo: 110, dur: 0.30, gain: 0.12 }),
  start: () => arp([392, 523, 659], { dur: 0.12, step: 0.06 }),
  over: () => arp([440, 349, 262], { type: "triangle", dur: 0.22, step: 0.12 }),
  bell: () => { tone({ freq: 880, type: "sine", dur: 0.08, gain: 0.09 }); tone({ freq: 1320, type: "sine", dur: 0.10, gain: 0.08, delay: 0.07 }); },
};

// --- Persistence (separate best per mode) -------------------------------
function bestKey() {
  return BEST_KEY + (S.mode === "normal" ? "" : "-" + S.mode);
}
function loadBest() {
  try { return parseInt(localStorage.getItem(bestKey()), 10) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(bestKey(), String(v)); } catch { /* ignore */ }
}

// --- Helpers ------------------------------------------------------------
function emptySel() {
  const o = {};
  for (const c of CATS) o[c] = new Set();
  return o;
}
function setsEqual(set, arr) {
  if (set.size !== arr.length) return false;
  for (const n of arr) if (!set.has(n)) return false;
  return true;
}
function recipeSize(r) {
  let n = 0;
  for (const c of CATS) n += r.items[c].length;
  return n;
}
function activeCustomer() {
  return S.customers.find((c) => c.id === S.activeId) || null;
}
function pickRecipe() {
  return B.RECIPES[Math.floor(Math.random() * B.RECIPES.length)];
}

// Difficulty ramps with how many bowls you've served. Baby mode is a flat,
// forgiving minute per customer with no ramp.
function maxPatienceFor(recipe) {
  if (S.mode === "baby") return 60;
  const ramp = Math.max(0.75, 1 - S.served * 0.02);
  return Math.round((recipeSize(recipe) * 2.2 + 12) * ramp);
}
function spawnInterval() {
  if (S.mode === "baby") return 9; // relaxed, steady arrivals
  return Math.max(4.5, 10.5 - S.served * 0.22);
}

// --- Stick figures ------------------------------------------------------
function moodFor(frac) {
  return frac > 0.5 ? "ok" : frac > 0.25 ? "warn" : "mad";
}
function stickmanSVG(shirt, mood) {
  const mouth =
    mood === "ok" ? '<path d="M26 31 Q32 37 38 31" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>' :
    mood === "warn" ? '<path d="M27 33 L37 33" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>' :
    '<path d="M26 34 Q32 28 38 34" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>';
  const brow = mood === "mad"
    ? '<path d="M24 18 L30 20 M40 18 L34 20" stroke="#5a3a20" stroke-width="2" stroke-linecap="round"/>'
    : "";
  // A proper stick figure: thin line body (tinted the customer's colour),
  // round head with a face. No bulky torso.
  const L = 'stroke="' + shirt + '" stroke-width="5" stroke-linecap="round"';
  return (
    '<svg viewBox="0 0 64 120" width="100%" height="100%" aria-hidden="true">' +
    // legs
    '<line x1="32" y1="78" x2="20" y2="112" ' + L + "/>" +
    '<line x1="32" y1="78" x2="44" y2="112" ' + L + "/>" +
    // spine
    '<line x1="32" y1="40" x2="32" y2="79" ' + L + "/>" +
    // arms
    '<line x1="32" y1="50" x2="15" y2="64" ' + L + "/>" +
    '<line x1="32" y1="50" x2="49" y2="64" ' + L + "/>" +
    // head
    '<circle cx="32" cy="24" r="15" fill="#ffe0bd" stroke="#e0b98f" stroke-width="1.5"/>' +
    // eyes
    '<circle cx="27" cy="24" r="2" fill="#333"/><circle cx="37" cy="24" r="2" fill="#333"/>' +
    brow + mouth +
    "</svg>"
  );
}

// A little café table with two chairs — background decor behind the customers.
function tableSVG() {
  return (
    '<svg viewBox="0 0 140 92" width="100%" height="100%" aria-hidden="true">' +
    '<ellipse cx="70" cy="84" rx="54" ry="7" fill="rgba(0,0,0,0.10)"/>' +
    // chair backrests
    '<rect x="18" y="34" width="13" height="30" rx="6" fill="#94a0aa"/>' +
    '<rect x="109" y="34" width="13" height="30" rx="6" fill="#94a0aa"/>' +
    // chair seats + legs
    '<rect x="14" y="54" width="30" height="9" rx="4" fill="#aab4bd"/>' +
    '<rect x="96" y="54" width="30" height="9" rx="4" fill="#aab4bd"/>' +
    '<line x1="20" y1="63" x2="20" y2="80" stroke="#8b96a0" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="38" y1="63" x2="38" y2="80" stroke="#8b96a0" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="102" y1="63" x2="102" y2="80" stroke="#8b96a0" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="120" y1="63" x2="120" y2="80" stroke="#8b96a0" stroke-width="4" stroke-linecap="round"/>' +
    // table pedestal + base
    '<rect x="66" y="46" width="8" height="30" fill="#b98f57"/>' +
    '<rect x="56" y="74" width="28" height="6" rx="3" fill="#9c7743"/>' +
    // tabletop
    '<ellipse cx="70" cy="44" rx="42" ry="12" fill="#d9b07a" stroke="#a97f4a" stroke-width="2"/>' +
    "</svg>"
  );
}

function buildTables() {
  const spots = [
    { pos: "left:2%", bottom: 60, w: 100 },
    { pos: "left:38%", bottom: 72, w: 84 },
    { pos: "right:2%", bottom: 58, w: 100 },
  ];
  tablesEl.innerHTML = "";
  for (const s of spots) {
    const t = document.createElement("div");
    t.className = "ou-table";
    t.style.cssText = s.pos + ";bottom:" + s.bottom + "px;width:" + s.w + "px";
    t.innerHTML = tableSVG();
    tablesEl.appendChild(t);
  }
}

// --- Customers ----------------------------------------------------------
function addCustomer() {
  if (S.customers.length >= MAX_CUSTOMERS) return;
  const recipe = pickRecipe();
  const maxP = maxPatienceFor(recipe);
  const c = {
    id: nextId++,
    recipe,
    name: recipe.name,
    sel: emptySel(),
    patience: maxP,
    maxPatience: maxP,
    shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
    mood: "ok",
  };
  // New arrivals join the back (left); everyone already in line shifts right.
  S.customers.unshift(c);
  buildCustomer(c);
  if (S.activeId == null) setActive(c.id);
  SFX.bell();
}

function buildCustomer(c) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ou-cust";
  el.innerHTML =
    `<span class="ou-bubble">${c.name}</span>` +
    `<span class="ou-stick">${stickmanSVG(c.shirt, c.mood)}</span>` +
    `<span class="ou-pat"><i data-role="bar"></i></span>`;
  el.addEventListener("click", () => { SFX.pick(); setActive(c.id); });
  c.el = el;
  c.barEl = el.querySelector('[data-role="bar"]');
  c.stickEl = el.querySelector(".ou-stick");
  customersEl.prepend(el); // newest on the left
  updateCustomer(c);
}

function countHave(c) {
  let n = 0;
  for (const cat of CATS) {
    for (const name of c.sel[cat]) if (c.recipe.items[cat].includes(name)) n++;
  }
  return n;
}

function updateCustomer(c) {
  const frac = Math.max(0, c.patience / c.maxPatience);
  c.barEl.style.width = frac * 100 + "%";
  c.barEl.style.background = frac > 0.5 ? "#4caf72" : frac > 0.25 ? "#fd9f27" : "#e2574c";
  c.el.classList.toggle("active", c.id === S.activeId);
  c.el.classList.toggle("urgent", frac <= 0.25);
  const mood = moodFor(frac);
  if (mood !== c.mood) {
    c.mood = mood;
    c.stickEl.innerHTML = stickmanSVG(c.shirt, mood);
  }
}

function setActive(id) {
  S.activeId = id;
  for (const c of S.customers) c.el.classList.toggle("active", c.id === id);
  renderTicket();
  updatePans();
}

function removeCustomer(c, cls) {
  const el = c.el;
  el.classList.add(cls);
  setTimeout(() => el.remove(), 300);
  S.customers = S.customers.filter((x) => x.id !== c.id);
  if (S.activeId === c.id) {
    // Fall back to the front of the line (oldest waiting = rightmost).
    S.activeId = S.customers.length ? S.customers[S.customers.length - 1].id : null;
    for (const o of S.customers) o.el.classList.toggle("active", o.id === S.activeId);
    renderTicket();
    updatePans();
  }
}

function isComplete(c) {
  for (const cat of CATS) if (!setsEqual(c.sel[cat], c.recipe.items[cat])) return false;
  return true;
}

function serve(c) {
  const speedFrac = Math.max(0, c.patience / c.maxPatience);
  const tip = Math.round(40 * speedFrac);
  let pts = 50 + tip + S.combo * 5;
  if (S.mode === "hard") pts = Math.round(pts * 1.5); // memory bonus
  else if (S.mode === "baby") pts = Math.round(pts * 0.6); // easy mode, fewer points
  S.score += pts;
  S.served++;
  S.combo++;
  scoreEl.textContent = S.score;
  updateCombo();
  SFX.serve();
  removeCustomer(c, "served");
}

function loseCustomer(c) {
  S.lives--;
  S.combo = 0;
  updateCombo();
  renderLives();
  SFX.angry();
  removeCustomer(c, "leaving");
  if (S.lives <= 0) endGame();
}

// --- Rendering ----------------------------------------------------------
function renderLives() {
  const full = Math.max(0, S.lives);
  livesEl.textContent = "❤️".repeat(full) + "🤍".repeat(Math.max(0, START_LIVES - full));
}

function updateCombo() {
  if (S.combo >= 2) {
    comboEl.textContent = "🔥 x" + S.combo;
    comboEl.classList.remove("hidden");
  } else {
    comboEl.classList.add("hidden");
  }
}

// The order ticket clipped to the counter for the active customer.
function renderTicket() {
  const c = activeCustomer();
  if (!c) {
    orderNameEl.textContent = "Waiting for the next customer…";
    checklistEl.innerHTML = "";
    B.draw(bctx, BW, BH, emptySel());
    return;
  }
  orderNameEl.textContent = c.name;
  checklistEl.innerHTML = "";
  // Hard mode: no ticket — the player builds it from memory.
  if (S.mode === "hard") {
    const note = document.createElement("span");
    note.className = "ou-memory";
    note.textContent = "🧠 Build it from memory";
    checklistEl.appendChild(note);
    B.draw(bctx, BW, BH, c.sel);
    return;
  }
  for (const cat of CATS) {
    for (const name of c.recipe.items[cat]) {
      const chip = document.createElement("span");
      const has = c.sel[cat].has(name);
      chip.className = "ou-check" + (has ? " checked" : "");
      chip.style.setProperty("--cat", B.CATEGORY_COLOR[cat]);
      chip.innerHTML = `<i class="ou-check-dot"></i>${name}`;
      checklistEl.appendChild(chip);
    }
  }
  // Wrong extras — flagged, tap to scoop back out.
  for (const cat of CATS) {
    for (const name of c.sel[cat]) {
      if (!c.recipe.items[cat].includes(name)) {
        const chip = document.createElement("span");
        chip.className = "ou-check wrong";
        chip.innerHTML = `<i class="ou-check-dot"></i>${name} ✕`;
        chip.addEventListener("click", () => toggle(cat, name));
        checklistEl.appendChild(chip);
      }
    }
  }
  B.draw(bctx, BW, BH, c.sel);
}

// Station selector down the left of the line. Clicking one shows that
// category's pans in the grid — no more scrolling across everything.
function buildStations() {
  stationsEl.innerHTML = "";
  for (const cat of CATS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ou-station-btn" + (cat === activeStation ? " active" : "");
    btn.style.setProperty("--cat", B.CATEGORY_COLOR[cat]);
    btn.innerHTML = `<i></i>${cat}`;
    btn.addEventListener("click", () => { SFX.pick(); setStation(cat); });
    stationBtns[cat] = btn;
    stationsEl.appendChild(btn);
  }
}

function setStation(cat) {
  activeStation = cat;
  for (const c of CATS) stationBtns[c].classList.toggle("active", c === cat);
  renderPans();
}

// Fill the grid with the active station's steam pans.
function renderPans() {
  pansEl.innerHTML = "";
  for (const key in panEls) delete panEls[key];
  for (const name of B.INGREDIENTS[activeStation]) {
    const bin = document.createElement("button");
    bin.type = "button";
    bin.className = "ou-bin";
    const cv = document.createElement("canvas");
    cv.width = 82;
    cv.height = 44;
    cv.className = "ou-bin-food";
    bin.appendChild(cv);
    const nm = document.createElement("span");
    nm.className = "ou-bin-name";
    nm.textContent = name;
    bin.appendChild(nm);
    bin.addEventListener("click", () => toggle(activeStation, name));
    pansEl.appendChild(bin);
    panEls[name] = bin;
    B.drawScoop(cv.getContext("2d"), cv.width, cv.height, name);
  }
  updatePans();
}

// Reflect the active customer's picks on the visible pans.
function updatePans() {
  const c = activeCustomer();
  for (const name in panEls) {
    const on = c && c.sel[activeStation].has(name);
    panEls[name].classList.toggle("added", !!on);
  }
}

// --- Interaction --------------------------------------------------------
function toggle(cat, name) {
  const c = activeCustomer();
  if (!c || !S.running) return;
  if (c.sel[cat].has(name)) {
    c.sel[cat].delete(name);
    SFX.remove();
  } else {
    c.sel[cat].add(name);
    SFX.add();
  }
  renderTicket();
  updatePans();
  updateCustomer(c);
  if (isComplete(c)) serve(c);
}

// --- Loop ---------------------------------------------------------------
function frame(t) {
  if (!S.lastTime) S.lastTime = t;
  const dt = Math.min((t - S.lastTime) / 1000, 0.05);
  S.lastTime = t;

  if (S.running) {
    for (const c of S.customers.slice()) {
      // The customer you're serving loses patience at full speed; everyone
      // waiting drains slower since you can only build one order at a time.
      const rate = c.id === S.activeId ? 1 : WAIT_DRAIN;
      c.patience -= dt * rate;
      if (c.patience <= 0) { loseCustomer(c); continue; }
      updateCustomer(c);
    }
    if (S.running) {
      S.spawnTimer -= dt;
      if (S.spawnTimer <= 0 && S.customers.length < MAX_CUSTOMERS) {
        addCustomer();
        S.spawnTimer = spawnInterval();
      }
    }
  }
  requestAnimationFrame(frame);
}

// --- Lifecycle ----------------------------------------------------------
function startGame(mode) {
  ensureAudio();
  S.customers.forEach((c) => c.el && c.el.remove());
  S.mode = mode || "normal";
  best = loadBest(); // best is tracked per mode
  S.running = true;
  S.score = 0;
  S.lives = START_LIVES;
  S.served = 0;
  S.combo = 0;
  S.customers = [];
  S.activeId = null;
  customersEl.innerHTML = "";
  scoreEl.textContent = "0";
  bestEl.textContent = best;
  renderLives();
  updateCombo();
  overlay.classList.add("hidden");
  addCustomer(); // first customer right away
  S.spawnTimer = spawnInterval();
  renderTicket();
  updatePans();
}

function endGame() {
  S.running = false;
  SFX.over();
  const isBest = S.score > best;
  if (isBest) { best = S.score; saveBest(best); }
  bestEl.textContent = best;
  finalEl.innerHTML =
    `You served <strong>${S.served}</strong> bowl${S.served === 1 ? "" : "s"} for <strong>${S.score}</strong> points` +
    ` <span class="ou-mode-tag">${S.mode === "hard" ? "Hard" : S.mode === "baby" ? "Baby" : "Normal"}</span>.` +
    (isBest && S.score > 0 ? `<br><span class="ou-best">★ New best!</span>` : "");
  screenStart.classList.add("hidden");
  screenOver.classList.remove("hidden");
  overlay.classList.remove("hidden");
}

// --- Wiring -------------------------------------------------------------
startBabyBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); startGame("baby"); });
startNormalBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); startGame("normal"); });
startHardBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); startGame("hard"); });
againBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); startGame(S.mode); });

// Initial paint.
best = loadBest();
bestEl.textContent = best;
renderLives();
buildTables();
buildStations();
renderPans();
B.draw(bctx, BW, BH, emptySel());
requestAnimationFrame(frame);
