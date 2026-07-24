// Order Up (Rush Hour) — you run the Pokeworks line, and now the register.
// Stick-figure customers order signature bowls; every serve pays money based
// on how right the bowl is (mistakes still pay, just less), and every visit
// ends in a star review that moves your restaurant's rating. Money banks
// between shifts and buys upgrades — including a visible auto-worker — and a
// higher rating pulls in richer customers with fatter checks.

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
const starsEl = document.getElementById("ou-stars");
const starFillEl = document.getElementById("ou-star-fill");
const starNumEl = document.getElementById("ou-star-num");
const timeEl = document.getElementById("ou-time");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const serveBtn = document.getElementById("serve-btn");
const workerEl = document.getElementById("worker");
const toastsEl = document.getElementById("ou-toasts");
const bowlWrapEl = document.querySelector(".ou-bowl-wrap");
const bankEl = document.getElementById("ou-bank");
const shopEl = document.getElementById("ou-shop");
const overlay = document.getElementById("overlay");
const screenStart = document.getElementById("screen-start");
const screenVariant = document.getElementById("screen-variant");
const screenOver = document.getElementById("screen-over");
const startNormalBtn = document.getElementById("start-normal");
const startHardBtn = document.getElementById("start-hard");
const timeLabelEl = document.getElementById("ou-time-label");
const variantTitleEl = document.getElementById("variant-title");
const varEndlessBtn = document.getElementById("var-endless");
const varRushBtn = document.getElementById("var-rush");
const varBackBtn = document.getElementById("var-back");
const againBtn = document.getElementById("again-btn");
const finalEl = document.getElementById("final");

// --- Constants ----------------------------------------------------------
const MAX_CUSTOMERS = 3;
const SHIFT_LEN = 150; // seconds per Rush shift
const MAX_WALKOUTS = 3; // an Endless shift survives until this many storm out
const WAIT_DRAIN = 0.5; // patience rate for customers you're NOT serving
// "-v2": bests are dollars now, so point-era records start over.
const BEST_KEY = "pokeworks-orderup-best-v2";
const TYCOON_KEY = "pokeworks-orderup-tycoon";
// Shirt colors to vary the stick figures.
const SHIRTS = ["#ee435b", "#22b2b4", "#f0a52c", "#7c5cff", "#39a85b", "#e8709b"];
const CUST_NAMES = [
  "Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Quinn", "Avery",
  "Jamie", "Drew", "Skyler", "Reese", "Parker", "Rowan", "Emerson", "Finley",
  "Harper", "Kendall", "Logan", "Peyton", "Sage", "Tatum", "Blake", "Marlow",
];
// Wealth tiers. A better-rated restaurant pulls in richer customers: they pay
// more (and tip more), but they're a little less patient. The nametag and
// shirt make the tier obvious at a glance.
const TIERS = {
  regular: { key: "regular", icon: "", pay: 1, pat: 1 },
  foodie: { key: "foodie", icon: "⭐", pay: 1.5, pat: 0.95, shirt: "#22b2b4" },
  vip: { key: "vip", icon: "💎", pay: 2.5, pat: 0.8, shirt: "#f5c542" },
};

// Upgrades bought with banked money between shifts.
const UPGRADES = {
  worker: {
    icon: "🧑‍🍳", name: "Hire Kai",
    desc: ["Auto-worker scoops an ingredient every 8s", "Kai speeds up: every 5.5s", "Turbo Kai: every 3.5s"],
    costs: [250, 600, 1400],
  },
  prices: {
    icon: "💎", name: "Premium ingredients",
    desc: ["+20% money per bowl", "+40% money per bowl", "+60% money per bowl"],
    costs: [200, 500, 1200],
  },
  lobby: {
    icon: "🛋️", name: "Comfy lobby",
    desc: ["Customers wait 10% longer", "Customers wait 20% longer"],
    costs: [150, 400],
  },
  ads: {
    icon: "📣", name: "Local ads",
    desc: ["Customers arrive 15% sooner", "Customers arrive 30% sooner"],
    costs: [180, 450],
  },
};

// --- Persistent restaurant (bank, upgrades, reviews, lifetime) ----------
function freshTycoon() {
  return {
    bank: 0,
    upgrades: { worker: 0, prices: 0, lobby: 0, ads: 0 },
    reviews: [],
    franchises: 0, // permanent +10% earnings each (see the Franchise shop card)
    life: { served: 0, perfect: 0, walkouts: 0, earned: 0, shifts: 0 },
  };
}
let T = freshTycoon();
function loadTycoon() {
  try {
    const t = JSON.parse(localStorage.getItem(TYCOON_KEY));
    if (t && t.upgrades) {
      const fresh = freshTycoon();
      return Object.assign(fresh, t, {
        upgrades: Object.assign(fresh.upgrades, t.upgrades),
        life: Object.assign(fresh.life, t.life || {}),
      });
    }
  } catch { /* fall through */ }
  return freshTycoon();
}
function saveTycoon() {
  try { localStorage.setItem(TYCOON_KEY, JSON.stringify(T)); } catch { /* ignore */ }
}
// Rating = average of the last 20 reviews; a new restaurant starts at 3.0.
function rating() {
  const r = T.reviews;
  if (!r.length) return 3;
  return r.reduce((a, b) => a + b, 0) / r.length;
}
// Upgrade effects. All of them sit out Daily Challenge runs so the day's board
// compares raw skill, not who's richest.
function upgradeLvl(k) { return isDailyRun ? 0 : T.upgrades[k] || 0; }
function workerInterval() { return [0, 8, 5.5, 3.5][upgradeLvl("worker")] || 0; }
function priceMult() { return 1 + 0.2 * upgradeLvl("prices"); }
function lobbyMult() { return 1 - 0.1 * upgradeLvl("lobby"); }
function adsMult() { return 1 - 0.15 * upgradeLvl("ads"); }
// Each franchise is a permanent +10% on earnings. Like upgrades, it sits out
// daily runs.
function franchiseMult() { return isDailyRun ? 1 : 1 + 0.1 * (T.franchises || 0); }
const FRANCHISE_COST = 1500;
function franchiseReady() {
  return Object.keys(UPGRADES).every((k) => (T.upgrades[k] || 0) >= UPGRADES[k].costs.length);
}

// --- State --------------------------------------------------------------
let best = 0; // best for the current mode (set once S exists)
// Modes compose a ticket style with a pace: "normal" and "hard" are Endless
// (no clock, three walkouts end the shift); "normal-rush" and "hard-rush"
// race the 2:30 clock. Each of the four keeps its own best and board.
function isHard() { return S.mode.indexOf("hard") === 0; }
function isRush() { return S.mode.indexOf("-rush") !== -1; }
const S = {
  running: false,
  mode: "normal", // normal | hard | normal-rush | hard-rush
  score: 0, // money earned this shift (the leaderboard number)
  served: 0,
  lost: 0,
  combo: 0,
  timeLeft: SHIFT_LEN,
  workerT: 0,
  ratingStart: 3,
  customers: [],
  activeId: null,
  spawnTimer: 0,
  lastTime: 0,
  // Shift events (never on daily runs — the shared board stays deterministic)
  elapsed: 0,
  nextEventAt: Infinity,
  rushUntil: 0, // Lunch Rush: while elapsed < this, double pay + faster spawns
  pendingSpecial: null, // "critic" | "inspector" — claims the next walk-in
};
function lunchRushActive() { return S.elapsed < S.rushUntil; }
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
// Is this page load a Daily Challenge run? (order-up.html?daily=1)
const isDailyRun = !!(window.Daily && Daily.isRun());

function activeCustomer() {
  return S.customers.find((c) => c.id === S.activeId) || null;
}
// Routed through a swappable generator so a Daily Challenge run can use the
// day's seeded stream and every player gets the same queue of orders. The
// customer's shirt colour stays truly random — it can't change an outcome.
let rngRecipe = Math.random;
function pickRecipe() {
  return B.RECIPES[Math.floor(rngRecipe() * B.RECIPES.length)];
}

// Difficulty ramps with how many bowls you've served. Baby mode is a flat,
// forgiving minute per customer with no ramp. Richer tiers are less patient.
function maxPatienceFor(recipe, tier) {
  const t = (tier && tier.pat) || 1;
  const ramp = Math.max(0.75, 1 - S.served * 0.02);
  return Math.round((recipeSize(recipe) * 2.2 + 12) * ramp * t);
}
function spawnInterval() {
  const base = Math.max(4.5, 10.5 - S.served * 0.22);
  return base * adsMult() * (lunchRushActive() ? 0.5 : 1);
}

// --- Shift events --------------------------------------------------------
// Every so often the shift throws a moment at you: a Lunch Rush (double pay,
// customers pour in), a Food Critic (their review counts triple), or the
// Health Inspector (no check, but the visit swings your rating hard).
const eventBannerEl = document.getElementById("ou-event");
let eventBannerTimer = null;
function showEventBanner(text, ms) {
  eventBannerEl.textContent = text;
  eventBannerEl.classList.remove("hidden");
  eventBannerEl.classList.remove("show");
  void eventBannerEl.offsetWidth;
  eventBannerEl.classList.add("show");
  clearTimeout(eventBannerTimer);
  eventBannerTimer = setTimeout(() => eventBannerEl.classList.remove("show"), ms || 5000);
}

function fireEvent() {
  const pool = ["rush"];
  // one special guest in the pipeline at a time
  if (!S.pendingSpecial && !S.customers.some((c) => c.special)) pool.push("critic", "inspector");
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === "rush") {
    S.rushUntil = S.elapsed + 25;
    showEventBanner("🍜 LUNCH RUSH — double pay for 25 seconds!", 6000);
    SFX.bell();
  } else if (pick === "critic") {
    S.pendingSpecial = "critic";
    showEventBanner("🎩 A food critic is on their way — their review counts triple.", 6000);
    SFX.bell();
  } else {
    S.pendingSpecial = "inspector";
    showEventBanner("📋 Health inspector incoming — a perfect bowl or it goes on the record.", 6000);
    SFX.bell();
  }
}

// Which tier walks in. Odds scale with the restaurant's star rating — the
// richer clientele only shows up once the reviews say you're worth it. Daily
// runs are all regulars so the shared board stays fair.
function pickTier() {
  if (isDailyRun) return TIERS.regular;
  const r = rating();
  const roll = Math.random();
  if (r >= 4.6) {
    if (roll < 0.2) return TIERS.vip;
    if (roll < 0.6) return TIERS.foodie;
  } else if (r >= 4.2) {
    if (roll < 0.1) return TIERS.vip;
    if (roll < 0.45) return TIERS.foodie;
  } else if (r >= 3.5) {
    if (roll < 0.25) return TIERS.foodie;
  }
  return TIERS.regular;
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
  // A pending critic/inspector claims this walk-in (plain tier — their whole
  // point is the review, not the check).
  const special = S.pendingSpecial;
  S.pendingSpecial = null;
  const tier = special ? TIERS.regular : pickTier();
  const maxP = maxPatienceFor(recipe, tier);
  const c = {
    id: nextId++,
    recipe,
    name: recipe.name,
    custName: special === "critic" ? "The Critic" : special === "inspector" ? "Inspector" : CUST_NAMES[Math.floor(Math.random() * CUST_NAMES.length)],
    tier,
    special,
    sel: emptySel(),
    patience: maxP,
    maxPatience: maxP,
    shirt: special === "critic" ? "#2a2f31" : special === "inspector" ? "#5a7d8c" : tier.shirt || SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
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
  const tagClass = c.special ? "t-" + c.special : "t-" + c.tier.key;
  const tagIcon = c.special === "critic" ? "🎩" : c.special === "inspector" ? "📋" : c.tier.icon;
  el.innerHTML =
    `<span class="ou-bubble">${c.name}</span>` +
    `<span class="ou-stick">${stickmanSVG(c.shirt, c.mood)}</span>` +
    `<span class="ou-nametag ${tagClass}">${tagIcon ? tagIcon + " " : ""}${c.custName}</span>` +
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

// What's actually in the bowl vs the ticket. Wrong scoops half-cancel a
// correct one — sloppy still pays, careless doesn't.
function bowlAccuracy(c) {
  const size = recipeSize(c.recipe);
  let correct = 0, wrong = 0, picked = 0;
  for (const cat of CATS) {
    for (const name of c.sel[cat]) {
      picked++;
      if (c.recipe.items[cat].includes(name)) correct++;
      else wrong++;
    }
  }
  const frac = Math.max(0, Math.min(1, (correct - wrong * 0.5) / size));
  return { size, correct, wrong, picked, frac, perfect: correct === size && wrong === 0 };
}

// The check plus the tip. The tip is where speed lives: it scales with how
// much patience the customer still has when the bowl lands (up to 60% of the
// check for an instant perfect serve), shrinks with mistakes, and rich tiers
// tip on their bigger checks.
function payoutFor(c, a) {
  // The inspector isn't a customer — no check, the visit is about the rating.
  if (c.special === "inspector") return { money: 0, tip: 0 };
  const price = (10 + a.size * 1.5) * a.frac;
  const speedFrac = Math.max(0, c.patience / c.maxPatience);
  let tip = price * 0.6 * speedFrac * a.frac;
  if (!a.perfect) tip *= 0.5; // a fast-but-wrong bowl still earns a little
  let m = price + tip + (a.perfect ? S.combo * 2 : 0);
  const mult =
    c.tier.pay * priceMult() * franchiseMult() *
    (isHard() ? 1.5 : 1) *
    (lunchRushActive() ? 2 : 1) *
    (c.special === "critic" ? 2 : 1);
  m *= mult;
  tip *= mult;
  if (a.frac <= 0) return { money: 0, tip: 0 };
  return { money: Math.max(1, Math.round(m)), tip: Math.round(tip) };
}

function serve(c) {
  const a = bowlAccuracy(c);
  const pay = payoutFor(c, a);
  const money = pay.money;
  S.score += money;
  S.served++;
  T.life.served++;
  if (a.perfect) T.life.perfect++;
  T.life.earned += money;
  if (window.PokeAch) {
    if (S.served === 1) PokeAch.unlock("ou-first");
    if (S.served === 10) PokeAch.unlock("ou-10");
    if (isHard() && S.served === 5) PokeAch.unlock("ou-hard");
    if (c.tier.key === "vip" && a.perfect) PokeAch.unlock("ou-vip");
  }
  // Only a perfect bowl keeps the combo alive.
  S.combo = a.perfect ? S.combo + 1 : 0;
  renderMoney();
  updateCombo();
  if (a.perfect) SFX.serve();
  else { SFX.serve(); SFX.remove(); } // a slightly sour note under the ring
  cashFloater(money, pay.tip, a.perfect);
  if (c.special === "inspector") {
    // Pass or fail: the inspection is worth two reviews' weight either way.
    postReview(c, a.perfect
      ? { stars: 5, comment: "Passed with flying colors. Spotless line." }
      : { stars: 1, comment: "Violations noted. Ticket accuracy: poor." }, 2);
  } else {
    const r = reviewForServe(c, a);
    // A critic's verdict lands three times as hard on the rating.
    postReview(c, r, c.special === "critic" ? 3 : 1);
    if (window.PokeAch && c.special === "critic" && r.stars === 5) PokeAch.unlock("ou-critic");
  }
  removeCustomer(c, "served");
}

function loseCustomer(c) {
  S.lost++;
  T.life.walkouts++;
  S.combo = 0;
  updateCombo();
  SFX.angry();
  // Losing the critic or inspector hurts as much as their good visit helps.
  const weight = c.special === "critic" ? 3 : c.special === "inspector" ? 2 : 1;
  const comment = c.special === "inspector"
    ? "Establishment refused inspection. Reported."
    : pickFrom(REVIEW_LEFT);
  postReview(c, { stars: Math.random() < 0.5 ? 0 : 1, comment }, weight);
  removeCustomer(c, "leaving");
  renderPace();
  // In Endless, walkouts are the end condition.
  if (!isRush() && S.lost >= MAX_WALKOUTS && S.running) endGame();
}

// --- Reviews & the star rating (the Secret Shopper toast, behind a counter) --
const REVIEW_5 = ["Absolute perfection!", "Best bowl in town — take my money!", "Five stars, no notes.", "Exactly right, and fast."];
const REVIEW_4 = ["Great bowl, just a bit of a wait.", "Worth it. Would return.", "Solid. Kai's got competition."];
const REVIEW_3 = ["Decent, but they missed a couple things.", "Almost what I ordered... almost.", "Fine. Just fine."];
const REVIEW_2 = ["Half my order was missing.", "Not really what I asked for.", "The ticket was more of a suggestion, apparently."];
const REVIEW_1 = ["Wrong bowl entirely. Yikes.", "Did they even read the ticket?", "I've had better bowls from a vending machine."];
const REVIEW_LEFT = ["Waited forever and left hungry. Avoid.", "Line didn't move. I'm done.", "Gave up and walked out."];

function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function reviewForServe(c, a) {
  let stars, pool;
  if (a.perfect) {
    const speedFrac = Math.max(0, c.patience / c.maxPatience);
    stars = speedFrac > 0.45 ? 5 : 4;
    pool = stars === 5 ? REVIEW_5 : REVIEW_4;
  } else if (a.frac >= 0.75) { stars = 3; pool = REVIEW_3; }
  else if (a.frac >= 0.4) { stars = 2; pool = REVIEW_2; }
  else { stars = 1; pool = REVIEW_1; }
  return { stars, comment: pickFrom(pool) };
}

function starRow(n) {
  let s = "";
  for (let i = 1; i <= 5; i++) s += `<span class="${i <= n ? "on" : "off"}">★</span>`;
  return s;
}

// Show the toast and fold the stars into the restaurant's rating. Daily runs
// show toasts for flavour but don't move the persistent rating — a bad daily
// shouldn't tank the restaurant you're building.
function postReview(c, r, weight) {
  const w = weight || 1;
  if (!isDailyRun) {
    for (let i = 0; i < w; i++) T.reviews.push(r.stars);
    if (T.reviews.length > 20) T.reviews = T.reviews.slice(-20);
    saveTycoon();
    renderRating();
    if (window.PokeAch && T.reviews.length >= 10 && rating() >= 4.8) PokeAch.unlock("ou-5star");
  }
  const headIcon = c.special === "critic" ? "🎩 " : c.special === "inspector" ? "📋 " : c.tier.icon ? c.tier.icon + " " : "";
  const toast = document.createElement("div");
  toast.className = "ou-toast" + (c.special ? " special" : "");
  toast.innerHTML =
    `<div class="ou-toast-head"><span>${headIcon}${c.custName} left a review${w > 1 ? " (×" + w + ")" : ""}</span>` +
    `<span class="ou-toast-stars">${starRow(r.stars)}</span></div>` +
    `<div class="ou-toast-body">“${r.comment}”</div>`;
  toastsEl.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 400);
  }, 5200);
}

// --- Rendering ----------------------------------------------------------
// Five real stars that fill to the exact rating — 4.2 shows four full stars
// and a fifth that's a fifth full — with the number alongside.
function renderRating() {
  const r = rating();
  starFillEl.style.width = (r / 5) * 100 + "%";
  starNumEl.textContent = r.toFixed(1);
  starsEl.setAttribute("aria-label", "Restaurant rating: " + r.toFixed(1) + " out of 5 stars");
}
function renderMoney() {
  scoreEl.textContent = "$" + S.score;
}
// The pace tile: the countdown in Rush, the walkout count in Endless.
function renderPace() {
  if (isRush()) {
    const t = Math.max(0, Math.ceil(S.timeLeft));
    const str = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
    if (timeEl.textContent !== str) timeEl.textContent = str;
    timeEl.classList.toggle("urgent", t <= 15);
  } else {
    timeEl.textContent = "🚶 " + S.lost + "/" + MAX_WALKOUTS;
    timeEl.classList.toggle("urgent", S.lost >= MAX_WALKOUTS - 1);
  }
}
// A little "+$12" that floats up off the bowl when a serve pays out, with the
// tip called out underneath so fast serves visibly pay better.
function cashFloater(money, tip, perfect) {
  if (!bowlWrapEl || money <= 0) return;
  const f = document.createElement("span");
  f.className = "ou-cash" + (perfect ? " perfect" : "");
  f.innerHTML =
    "+$" + money +
    (tip >= 1 ? `<small>incl. $${tip} tip${tip >= 8 ? "!" : ""}</small>` : "");
  bowlWrapEl.appendChild(f);
  setTimeout(() => f.remove(), 1150);
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
  if (isHard()) {
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

// --- Kai, the visible auto-worker ---------------------------------------
// A teal stick figure in whites who stands at the end of the line and scoops
// for you. He's drawn in the scene so hiring him visibly changes the store.
function workerSVG() {
  const L = 'stroke="#1b9092" stroke-width="5" stroke-linecap="round"';
  return (
    '<svg viewBox="0 0 64 130" width="100%" height="100%" aria-hidden="true">' +
    '<line x1="32" y1="88" x2="20" y2="122" ' + L + "/>" +
    '<line x1="32" y1="88" x2="44" y2="122" ' + L + "/>" +
    '<line x1="32" y1="50" x2="32" y2="89" ' + L + "/>" +
    // one arm out toward the pans, one down
    '<line x1="32" y1="60" x2="52" y2="52" ' + L + "/>" +
    '<line x1="32" y1="60" x2="18" y2="76" ' + L + "/>" +
    // spoon in the outstretched hand
    '<line x1="52" y1="52" x2="60" y2="46" stroke="#8b96a0" stroke-width="3" stroke-linecap="round"/>' +
    '<ellipse cx="61" cy="44" rx="4" ry="3" fill="#c6ced4"/>' +
    // apron over the spine
    '<rect x="24" y="58" width="16" height="26" rx="5" fill="#ffffff" opacity="0.92"/>' +
    // head + chef hat
    '<circle cx="32" cy="34" r="15" fill="#ffe0bd" stroke="#e0b98f" stroke-width="1.5"/>' +
    '<circle cx="27" cy="34" r="2" fill="#333"/><circle cx="37" cy="34" r="2" fill="#333"/>' +
    '<path d="M26 41 Q32 46 38 41" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>' +
    '<rect x="20" y="12" width="24" height="9" rx="3" fill="#fff" stroke="#dfe5e8"/>' +
    '<circle cx="24" cy="10" r="6" fill="#fff"/><circle cx="32" cy="8" r="7" fill="#fff"/><circle cx="40" cy="10" r="6" fill="#fff"/>' +
    "</svg>"
  );
}

function renderWorker() {
  const hired = workerInterval() > 0;
  workerEl.classList.toggle("hidden", !hired);
  if (hired && !workerEl.innerHTML) {
    workerEl.innerHTML =
      `<span class="ou-worker-tag">🧑‍🍳 Kai</span>` +
      `<span class="ou-worker-stick">${workerSVG()}</span>`;
  }
}

// One scoop: add a missing correct ingredient to the active customer's bowl.
function workerAct() {
  const c = activeCustomer();
  if (!c || !S.running) return;
  for (const cat of CATS) {
    for (const name of c.recipe.items[cat]) {
      if (!c.sel[cat].has(name)) {
        c.sel[cat].add(name);
        SFX.add();
        workerEl.classList.remove("scooping");
        void workerEl.offsetWidth; // restart the animation
        workerEl.classList.add("scooping");
        renderTicket();
        updatePans();
        updateCustomer(c);
        if (isComplete(c)) serve(c);
        return;
      }
    }
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
    // Rush races the clock; Endless has no clock and ends on walkouts.
    if (isRush()) {
      S.timeLeft -= dt;
      renderPace();
    }
    S.elapsed += dt;
    // Shift events fire on a loose timer (never during daily runs).
    if (S.elapsed >= S.nextEventAt) {
      fireEvent();
      S.nextEventAt = S.elapsed + 45 + Math.random() * 25;
    }
    if (isRush() && S.timeLeft <= 0) {
      endGame();
    } else {
      // Kai, the auto-worker: every few seconds he scoops one correct
      // ingredient into the active customer's bowl.
      const wi = workerInterval();
      if (wi) {
        S.workerT += dt;
        if (S.workerT >= wi) { S.workerT = 0; workerAct(); }
      }
      for (const c of S.customers.slice()) {
        // The customer you're serving loses patience at full speed; everyone
        // waiting drains slower. A comfy lobby slows the whole room down.
        const rate = (c.id === S.activeId ? 1 : WAIT_DRAIN) * lobbyMult();
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
  }
  requestAnimationFrame(frame);
}

// --- Lifecycle ----------------------------------------------------------
function startGame(mode) {
  if (window.PokeStreak) PokeStreak.mark();
  rngRecipe = isDailyRun ? Daily.stream("ou:recipe") : Math.random;
  ensureAudio();
  S.customers.forEach((c) => c.el && c.el.remove());
  S.mode = mode || "normal";
  best = loadBest(); // best is tracked per mode
  S.running = true;
  S.score = 0;
  S.served = 0;
  S.lost = 0;
  S.combo = 0;
  S.timeLeft = SHIFT_LEN;
  S.workerT = 0;
  S.ratingStart = rating();
  S.elapsed = 0;
  S.rushUntil = 0;
  S.pendingSpecial = null;
  // First event lands 20–35s in; dailies get none.
  S.nextEventAt = isDailyRun ? Infinity : 20 + Math.random() * 15;
  if (eventBannerEl) eventBannerEl.classList.remove("show");
  S.customers = [];
  S.activeId = null;
  customersEl.innerHTML = "";
  renderMoney();
  bestEl.textContent = "$" + best;
  renderRating();
  timeLabelEl.textContent = isRush() ? "Time" : "Walkouts";
  renderPace();
  renderWorker();
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
  // Whoever's still in line just heads home — the shift is over, no penalty.
  for (const c of S.customers.slice()) removeCustomer(c, "leaving");
  const isBest = S.score > best;
  if (isBest) { best = S.score; saveBest(best); }
  bestEl.textContent = "$" + best;
  // Shift earnings go into the bank that buys upgrades.
  T.bank += S.score;
  T.life.shifts++;
  saveTycoon();
  const lifeEl = document.getElementById("ou-life");
  if (lifeEl) {
    lifeEl.textContent =
      "Lifetime: $" + T.life.earned.toLocaleString() + " earned · " +
      T.life.served + " served · " + T.life.shifts + " shift" + (T.life.shifts === 1 ? "" : "s") +
      (T.franchises ? " · 🏪 ×" + (T.franchises + 1) : "");
  }
  const rNow = rating();
  const arrow = rNow > S.ratingStart + 0.01 ? "📈" : rNow < S.ratingStart - 0.01 ? "📉" : "";
  finalEl.innerHTML =
    `You made <strong>$${S.score}</strong> — served ${S.served}, lost ${S.lost}` +
    ` <span class="ou-mode-tag">${isHard() ? "Hard" : "Normal"}${isRush() ? " · Rush" : " · Endless"}</span>.` +
    `<br>★ ${S.ratingStart.toFixed(1)} → <strong>${rNow.toFixed(1)}</strong> ${arrow}` +
    (isBest && S.score > 0 ? `<br><span class="ou-best">★ New best shift!</span>` : "");
  renderShop();

  // Offer a leaderboard entry for any scoring shift (boards live on the hub).
  ouLbDone.classList.add("hidden");
  if (isDailyRun) {
    // A daily run posts to the day's board and locks until tomorrow.
    Daily.complete(S.score);
    lbPending = { daily: true, score: S.score };
    ouLbName.value = loadLbNameSaved();
    ouLbEntry.classList.remove("hidden");
    if (againBtn) againBtn.classList.add("hidden"); // one attempt a day
  } else if (S.score > 0) {
    lbPending = { mode: S.mode, score: S.score };
    ouLbName.value = loadLbNameSaved();
    ouLbEntry.classList.remove("hidden");
  } else {
    lbPending = null;
    ouLbEntry.classList.add("hidden");
  }
  screenStart.classList.add("hidden");
  screenVariant.classList.add("hidden"); // may still be up if the run started from the popup
  screenOver.classList.remove("hidden");
  overlay.classList.remove("hidden");
}

// --- The upgrade shop (on the Shift Over screen) --------------------------
function renderShop() {
  if (!shopEl) return;
  // Daily runs are stock-restaurant; no shopping between attempts.
  if (isDailyRun) {
    bankEl.classList.add("hidden");
    shopEl.classList.add("hidden");
    return;
  }
  bankEl.classList.remove("hidden");
  shopEl.classList.remove("hidden");
  bankEl.innerHTML =
    `💰 Bank: <strong>$${T.bank}</strong>` +
    (T.franchises ? ` <span class="ou-fr-badge">🏪 Pokeworks #${T.franchises + 1} · +${T.franchises * 10}% earnings</span>` : "");
  shopEl.innerHTML = "";
  for (const key of Object.keys(UPGRADES)) {
    const u = UPGRADES[key];
    const lvl = T.upgrades[key] || 0;
    const maxed = lvl >= u.costs.length;
    const cost = maxed ? 0 : u.costs[lvl];
    const card = document.createElement("div");
    card.className = "ou-up" + (maxed ? " maxed" : "");
    const pips = u.costs.map((_, i) => `<i class="${i < lvl ? "on" : ""}"></i>`).join("");
    card.innerHTML =
      `<span class="ou-up-icon">${u.icon}</span>` +
      `<span class="ou-up-body"><strong>${u.name}</strong>` +
      `<small>${maxed ? "Fully upgraded" : u.desc[lvl]}</small>` +
      `<span class="ou-up-pips">${pips}</span></span>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ou-up-buy";
    if (maxed) {
      btn.textContent = "MAX";
      btn.disabled = true;
    } else {
      btn.textContent = "$" + cost;
      btn.disabled = T.bank < cost;
      btn.addEventListener("click", () => {
        if (T.bank < cost) return;
        T.bank -= cost;
        T.upgrades[key] = lvl + 1;
        saveTycoon();
        SFX.bell();
        if (window.PokeAch) PokeAch.unlock("ou-upgrade");
        renderShop();
        renderWorker(); // hiring Kai shows him immediately
      });
    }
    card.appendChild(btn);
    shopEl.appendChild(card);
  }

  // Franchise: the endgame card. Max everything, then trade it all in for a
  // permanent +10% and a fresh store.
  const ready = franchiseReady();
  const fr = document.createElement("div");
  fr.className = "ou-up ou-up-franchise" + (ready ? "" : " locked");
  fr.innerHTML =
    `<span class="ou-up-icon">🏪</span>` +
    `<span class="ou-up-body"><strong>Open a franchise</strong>` +
    `<small>${ready
      ? "Reset upgrades & rating for a permanent +10% earnings. Forever."
      : "Max every upgrade to unlock. Then: permanent +10% earnings."}</small></span>`;
  const frBtn = document.createElement("button");
  frBtn.type = "button";
  frBtn.className = "ou-up-buy";
  frBtn.textContent = "$" + FRANCHISE_COST;
  frBtn.disabled = !ready || T.bank < FRANCHISE_COST;
  frBtn.addEventListener("click", () => {
    if (!franchiseReady() || T.bank < FRANCHISE_COST) return;
    T.bank -= FRANCHISE_COST;
    T.franchises = (T.franchises || 0) + 1;
    T.upgrades = { worker: 0, prices: 0, lobby: 0, ads: 0 };
    T.reviews = []; // a new store earns its own reputation
    saveTycoon();
    SFX.serve();
    if (window.PokeAch) PokeAch.unlock("ou-franchise");
    renderRating();
    renderWorker(); // Kai heads to the new store too
    renderShop();
  });
  fr.appendChild(frBtn);
  shopEl.appendChild(fr);
}

// --- Leaderboard submission (viewed on the hub) ---------------------------
// Scores post to Supabase (with a per-browser mirror the hub can fall back
// to); the boards themselves live on the hub page now.
const SBC = window.POKEWORKS_SUPABASE || {};
const useSupabase =
  !!SBC.url && !!SBC.anonKey && !/YOUR_/.test(SBC.url) && !/YOUR_/.test(SBC.anonKey);
function sbHeaders(extra) {
  return Object.assign({ apikey: SBC.anonKey, Authorization: "Bearer " + SBC.anonKey }, extra || {});
}

const OU_LB_LOCAL = "pokeworks-orderup-lb";
const NAME_KEY = "pokeworks-lb-name";

const ouLbEntry = document.getElementById("ou-lb-entry");
const ouLbDone = document.getElementById("ou-lb-done");
const ouLbName = document.getElementById("ou-lb-name");
const ouLbSave = document.getElementById("ou-lb-save");

let lbPending = null; // { mode, score } awaiting a name

// One row per player (case-insensitive), keeping their best score.
function dedupeScores(list) {
  const sorted = list.slice().sort((a2, b2) => b2.score - a2.score);
  const seen = new Set();
  const out = [];
  for (const e of sorted) {
    const k = String(e.name).trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}
function loadLocalLb() {
  try { return JSON.parse(localStorage.getItem(OU_LB_LOCAL)) || {}; } catch { return {}; }
}
function saveLocalLb(b2) {
  try { localStorage.setItem(OU_LB_LOCAL, JSON.stringify(b2)); } catch { /* ignore */ }
}
function addLocalScore(mode, name, score) {
  const b2 = loadLocalLb();
  const list = b2[mode] || (b2[mode] = []);
  const k = name.trim().toLowerCase();
  const ex = list.find((e) => String(e.name).trim().toLowerCase() === k);
  if (ex) {
    if (score > ex.score) { ex.score = score; ex.name = name; }
  } else {
    list.push({ name, score });
  }
  b2[mode] = dedupeScores(list).slice(0, 50);
  saveLocalLb(b2);
}
async function submitScore(mode, name, score) {
  addLocalScore(mode, name, score); // local mirror for the hub fallback
  if (!useSupabase) return;
  const res = await fetch(SBC.url + "/rest/v1/orderup_scores", {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ mode: mode, name: name, score: score }),
  });
  if (!res.ok) throw new Error("Supabase insert " + res.status);
}
function loadLbNameSaved() {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}
function saveLbNameSaved(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ }
}
async function submitLbName() {
  if (!lbPending) return;
  const name = (ouLbName.value || "").trim().slice(0, 12) || "Anon";
  saveLbNameSaved(name);
  const mode = lbPending.mode;
  const score = lbPending.score;
  const daily = lbPending.daily;
  lbPending = null;
  ouLbSave.disabled = true;
  try {
    if (daily) await Daily.submit(name, score);
    else await submitScore(mode, name, score);
  } catch (e) {
    /* local mirror already saved */
  }
  ouLbSave.disabled = false;
  ouLbEntry.classList.add("hidden");
  ouLbDone.classList.remove("hidden");
}

// --- Wiring -------------------------------------------------------------
// Picking a ticket style opens the pace popup: Endless or Rush.
let pendingBase = "normal"; // which ticket style the popup starts
function openVariant(base) {
  pendingBase = base;
  variantTitleEl.textContent =
    (base === "hard" ? "Hidden Recipes" : "Recipes Shown") + " — pick your pace";
  screenStart.classList.add("hidden");
  screenVariant.classList.remove("hidden");
}
startNormalBtn.addEventListener("click", () => { ensureAudio(); SFX.pick(); openVariant("normal"); });
startHardBtn.addEventListener("click", () => { ensureAudio(); SFX.pick(); openVariant("hard"); });
varEndlessBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); startGame(pendingBase); });
varRushBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); startGame(pendingBase + "-rush"); });
varBackBtn.addEventListener("click", () => {
  SFX.pick();
  screenVariant.classList.add("hidden");
  screenStart.classList.remove("hidden");
});
againBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); startGame(S.mode); });

// Serve whatever's in the bowl — mistakes and all. Less money, worse review,
// but it beats letting them walk.
serveBtn.addEventListener("click", () => {
  const c = activeCustomer();
  if (!c || !S.running) return;
  if (bowlAccuracy(c).picked === 0) return; // no serving an empty bowl
  serve(c);
});

// Leaderboard submission wiring (boards are viewed on the hub)
ouLbSave.addEventListener("click", submitLbName);
ouLbName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); submitLbName(); }
});

// Daily Challenge: launched as order-up.html?daily=1. The mode is fixed so the
// run is the same for everyone, and there's one attempt a day.
if (isDailyRun) {
  const title = screenStart.querySelector(".overlay-title");
  const sub = screenStart.querySelector(".overlay-subtitle");
  const modes = screenStart.querySelector(".ou-modes");
  const done = Daily.result();
  if (title) title.textContent = "🗓 Daily Challenge";
  if (modes) modes.innerHTML = "";
  if (!Daily.isTodaysGame("ou")) {
    // Stale link — today's challenge is a different game.
    if (sub) {
      sub.textContent =
        "Today's challenge is " + Daily.challenge().game.label + ". Head back to the hub for it.";
    }
  } else if (done) {
    if (sub) {
      sub.textContent =
        "You've already played today: $" + done.score + ". Back tomorrow for a new run.";
    }
  } else {
    if (sub) sub.textContent = "Everyone gets this exact shift today. One attempt — make it count.";
    if (modes) {
      const go = document.createElement("button");
      go.className = "btn";
      go.type = "button";
      go.textContent = "Start";
      go.addEventListener("click", () => {
        ensureAudio();
        SFX.start();
        startGame(Daily.challenge().game.setting);
      });
      modes.appendChild(go);
    }
  }
}

// Initial paint.
T = loadTycoon();
best = loadBest();
bestEl.textContent = "$" + best;
renderRating();
renderPace();
renderWorker();
buildTables();
buildStations();
renderPans();
B.draw(bctx, BW, BH, emptySel());
requestAnimationFrame(frame);
