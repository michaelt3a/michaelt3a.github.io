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
const endShiftBtn = document.getElementById("end-shift-btn");
const workerEl = document.getElementById("worker");
const waitersEl = document.getElementById("waiters");
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
const BASE_TABLES = 3; // more via the tables upgrade
// The store runs on a wall clock: a shift compresses the workday into real
// play time, the HUD shows the time of day, and the shift ends at closing.
const OPEN_MIN = 11 * 60; // doors open at 11:00 AM
function closeMin() { return isRush() ? 14 * 60 : 21 * 60; } // Rush: lunch to 2:00; Full Shift to 9:00
function shiftLen() { return isRush() ? 300 : 480; } // real seconds the shift lasts
const MAX_WALKOUTS = 3; // a Full Shift also ends early if this many storm out
// Time of day (in minutes) for the current point in the shift.
function clockMin() {
  return OPEN_MIN + (1 - Math.max(0, S.timeLeft) / shiftLen()) * (closeMin() - OPEN_MIN);
}
function fmtClock(mins) {
  const h = Math.floor(mins / 60), m = Math.floor(mins % 60);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + ":" + String(m).padStart(2, "0") + " " + ap;
}
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
const WORKER_NAMES = ["Eli", "CJ", "Moe"];
const WORKER_SCOOP = 6; // base seconds per scoop, per worker
const WAITER_NAMES = ["Tess", "Nia", "Gus"];
const WAITER_SEAT = 4.5; // base seconds per auto-seat, per waiter
const DOOR_CAP = 3; // how many guests can wait at the door to be seated
const UPGRADES = {
  worker: {
    icon: "🧑‍🍳", name: "Hire cooks",
    desc: [
      "Eli joins the kitchen and preps other customers' bowls",
      "CJ makes it a crew of two",
      "Moe completes the kitchen brigade",
    ],
    costs: [250, 700, 1600],
  },
  waiter: {
    icon: "🧍", name: "Hire waiters",
    desc: [
      "Tess seats waiting guests for you",
      "Nia makes it two on the floor",
      "Gus rounds out the front-of-house",
    ],
    costs: [220, 600, 1400],
  },
  tables: {
    icon: "🪑", name: "More tables",
    desc: ["A 4th table for one more customer at a time", "A 5th table for a truly packed house"],
    costs: [300, 800],
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
  tipjar: {
    icon: "🫙", name: "Tip jar",
    desc: ["+30% tips", "+60% tips"],
    costs: [220, 480],
  },
  speed: {
    icon: "🔪", name: "Sharper knives",
    desc: ["The crew preps 25% faster", "The crew preps 50% faster"],
    costs: [350, 750],
  },
  loyalty: {
    icon: "💳", name: "Loyalty program",
    desc: ["Regulars talk you up, so richer customers arrive sooner", "The word is out, and VIPs seek you out"],
    costs: [400, 900],
  },
  proficiency: {
    icon: "🎓", name: "Staff training",
    desc: [
      "A trained crew works faster and starts earning while you are away",
      "Seasoned pros keep the doors open on their own",
      "A flawless team runs the whole place hands-off",
    ],
    costs: [500, 1100, 2200],
  },
};

// --- Persistent restaurant chain (bank, stores, lifetime) ----------------
// Each store (franchise location) keeps its OWN upgrades and reviews; the
// bank and lifetime stats are chain-wide. T.current picks the store you run.
function freshStore() {
  const u = {};
  for (const k of Object.keys(UPGRADES)) u[k] = 0;
  return { upgrades: u, reviews: [] };
}
function freshTycoon() {
  return {
    bank: 0,
    stores: [freshStore()],
    current: 0,
    life: { served: 0, perfect: 0, walkouts: 0, earned: 0, shifts: 0 },
    lastSeen: Date.now(), // for idle income while you're away
    save: 3, // schema version
  };
}
let T = freshTycoon();
function store() { return T.stores[T.current] || T.stores[0]; }
function loadTycoon() {
  try {
    const t = JSON.parse(localStorage.getItem(TYCOON_KEY));
    if (t && Array.isArray(t.stores)) {
      const out = Object.assign(freshTycoon(), t);
      out.stores = t.stores.map((st) => {
        const f = freshStore();
        return { upgrades: Object.assign(f.upgrades, st.upgrades || {}), reviews: st.reviews || [] };
      });
      out.current = Math.min(out.current || 0, out.stores.length - 1);
      out.life = Object.assign(freshTycoon().life, t.life || {});
      out.lastSeen = t.lastSeen || Date.now();
      return out;
    }
    if (t && t.upgrades) {
      // Migrate the single-store save: its upgrades/reviews become the newest
      // store, with an empty store per franchise already opened (those were
      // reset under the old model anyway, so nothing is lost).
      const out = freshTycoon();
      out.bank = t.bank || 0;
      out.life = Object.assign(out.life, t.life || {});
      out.stores = [];
      for (let i = 0; i < (t.franchises || 0); i++) out.stores.push(freshStore());
      const cur = freshStore();
      cur.upgrades = Object.assign(cur.upgrades, t.upgrades);
      cur.reviews = t.reviews || [];
      out.stores.push(cur);
      out.current = out.stores.length - 1;
      return out;
    }
  } catch { /* fall through */ }
  return freshTycoon();
}
function saveTycoon() {
  try { localStorage.setItem(TYCOON_KEY, JSON.stringify(T)); } catch { /* ignore */ }
}
// Rating = the current store's last 20 reviews; new stores open at 3.0.
function rating() {
  const r = store().reviews;
  if (!r.length) return 3;
  return r.reduce((a, b) => a + b, 0) / r.length;
}
// Upgrade effects. All of them sit out Daily Challenge runs so the day's board
// compares raw skill, not who's richest.
function upgradeLvl(k) { return isDailyRun ? 0 : store().upgrades[k] || 0; }
function workerCount() { return upgradeLvl("worker"); } // 0-3 cooks
function waiterCount() { return upgradeLvl("waiter"); } // 0-3 waiters
function tableCount() { return BASE_TABLES + upgradeLvl("tables"); }
// A waiter seats faster per level.
function waiterSeatTime() { return WAITER_SEAT * (1 - 0.18 * (waiterCount() - 1)); }
function priceMult() { return 1 + 0.2 * upgradeLvl("prices"); }
function lobbyMult() { return 1 - 0.1 * upgradeLvl("lobby"); }
function adsMult() { return 1 - 0.15 * upgradeLvl("ads"); }
// Every location past the first is a permanent +10% on earnings, chain-wide.
// Like upgrades, the perk sits out daily runs.
function franchiseMult() { return isDailyRun ? 1 : 1 + 0.1 * (T.stores.length - 1); }
const FRANCHISE_COST = 1500;
function franchiseReady() {
  return Object.keys(UPGRADES).every((k) => (store().upgrades[k] || 0) >= UPGRADES[k].costs.length);
}
// New upgrade effects. Staff training speeds the crew on top of Sharper knives.
function tipMult() { return 1 + 0.3 * upgradeLvl("tipjar"); }
function workerScoopTime() {
  return WORKER_SCOOP * (1 - 0.25 * upgradeLvl("speed")) * (1 - 0.1 * upgradeLvl("proficiency"));
}

// --- Economy: rent, idle income, and bankruptcy --------------------------
// A store you're not standing in still runs on its own once it has staff, and
// pays rent whether it's earning or not — so you can't just sit and do nothing.
const RENT_PER_MIN = 9; // per store, per real minute, while the game is open
const AUTO_PER_MIN = 22; // a fully-automated 5-star store's gross idle income/min
const IDLE_CAP_H = 8; // offline idle income is capped at this many hours
const BANKRUPT_LINE = -600; // bank below this and a location goes under
let bankrupted = false; // guards against re-firing mid-resolution

// How self-sufficient a store is (0..1): cooks + waiters + training. A store
// with no staff earns nothing on its own and just bleeds rent.
function storeAuto(st) {
  const c = (st.upgrades.worker || 0) / 3;
  const w = (st.upgrades.waiter || 0) / 3;
  const p = (st.upgrades.proficiency || 0) / 3;
  return Math.min(1, c * 0.4 + w * 0.4 + p * 0.2);
}
function storeRatingOf(st) {
  const r = st.reviews;
  if (!r || !r.length) return 3;
  return r.reduce((a, b) => a + b, 0) / r.length;
}
function storeIdlePerMin(st) {
  return AUTO_PER_MIN * storeAuto(st) * (storeRatingOf(st) / 5);
}

// Offline earnings: automated stores keep earning while you're away (capped,
// and no rent is charged offline so leaving can never bankrupt you).
function creditOffline() {
  const now = Date.now();
  if (!T.lastSeen) { T.lastSeen = now; return null; }
  let secs = Math.max(0, (now - T.lastSeen) / 1000);
  secs = Math.min(secs, IDLE_CAP_H * 3600);
  T.lastSeen = now;
  if (secs < 30) return null; // ignore trivial gaps
  let gain = 0;
  for (const st of T.stores) gain += storeIdlePerMin(st) * (secs / 60);
  gain = Math.round(gain);
  if (gain <= 0) return null;
  T.bank += gain;
  saveTycoon();
  return { gain, mins: Math.round(secs / 60) };
}

// Ticks every second the page is open: other stores earn, every store pays
// rent. Bankruptcy is only resolved between shifts, never mid-service.
let ecoSaveT = 0;
function economyTick() {
  if (isDailyRun) return; // dailies are stock, no chain economy
  let net = 0;
  T.stores.forEach((st, i) => {
    const playingHere = S.running && i === T.current;
    if (!playingHere) net += storeIdlePerMin(st) / 60; // idle income/sec
    net -= RENT_PER_MIN / 60; // rent/sec, every store
  });
  T.bank += net;
  T.lastSeen = Date.now();
  updateBankDisplays();
  if (++ecoSaveT >= 5) { ecoSaveT = 0; saveTycoon(); }
  if (!S.running && !bankrupted && T.bank < BANKRUPT_LINE) triggerBankruptcy();
}

// Bankruptcy closes the store that's dragging you down (the least self-
// sufficient one), wipes its build, and clears the debt with a bailout. Your
// other stores, your lifetime totals, and your saved progress all remain.
function triggerBankruptcy() {
  bankrupted = true;
  let idx = 0, worst = Infinity;
  T.stores.forEach((st, i) => { const a = storeAuto(st); if (a < worst) { worst = a; idx = i; } });
  const lost = idx + 1;
  if (T.stores.length > 1) {
    T.stores.splice(idx, 1);
    T.current = Math.min(T.current, T.stores.length - 1);
  } else {
    T.stores = [freshStore()]; // your last store reopens fresh
    T.current = 0;
  }
  T.bank = 0; // the bailout clears the red
  saveTycoon();
  bankrupted = false;
  showEventBanner("💸 Bankrupt! Location #" + lost + " closed. The books are back to zero.", 7000);
  renderRating();
  updateBankDisplays();
  if (!screenShop.classList.contains("hidden")) renderShop();
}

// Chain-wide net cash flow per real minute (idle income minus rent).
function netPerMin() {
  let net = 0;
  T.stores.forEach((st, i) => {
    const playing = S.running && i === T.current;
    if (!playing) net += storeIdlePerMin(st);
    net -= RENT_PER_MIN;
  });
  return net;
}
function bankLineHTML() {
  const npm = Math.round(netPerMin());
  return (
    "💰 Bank: <strong>$" + Math.floor(T.bank).toLocaleString() + "</strong> " +
    "<span class='ou-net " + (npm >= 0 ? "up" : "down") + "'>" +
    (npm >= 0 ? "📈 +$" + npm : "📉 -$" + Math.abs(npm)) + "/min</span>" +
    (T.stores.length > 1 ? " <span class='ou-fr-badge'>🏪 +" + (T.stores.length - 1) * 10 + "% chain</span>" : "")
  );
}
function updateBankDisplays() {
  const bl = document.getElementById("ou-bankline");
  if (bl) bl.innerHTML = bankLineHTML();
  if (bankEl && screenShop && !screenShop.classList.contains("hidden")) bankEl.innerHTML = bankLineHTML();
}

// --- Backup codes (so hard work survives a cleared browser or a new device) --
function exportSave() {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(T)))); } catch (e) { return ""; }
}
function importSave(code) {
  try {
    const obj = JSON.parse(decodeURIComponent(escape(atob(String(code).trim()))));
    if (!obj || !Array.isArray(obj.stores)) return false;
    localStorage.setItem(TYCOON_KEY, JSON.stringify(obj));
    T = loadTycoon(); // re-normalize and migrate the imported save
    return true;
  } catch (e) { return false; }
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
  paused: false, // true while the mid-shift shop is open
  mode: "normal", // normal | hard | normal-rush | hard-rush
  score: 0, // money earned this shift (the leaderboard number)
  served: 0,
  lost: 0,
  combo: 0,
  timeLeft: 0, // set to shiftLen() when a shift starts
  workerT: [],
  waiterT: [],
  shift: { tips: 0, perfects: 0, bestCombo: 0 },
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

// A visit's patience now covers the whole stay: waiting at the door to be
// seated, then waiting at the table for the bowl. Generous, since it spans two
// stages, and the ramp is gentle so late-shift customers stay reasonable.
function maxPatienceFor(recipe, tier) {
  const t = (tier && tier.pat) || 1;
  const ramp = Math.max(0.9, 1 - S.served * 0.007);
  return Math.round((recipeSize(recipe) * 5 + 62) * ramp * t);
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
    showEventBanner("🍜 LUNCH RUSH: double pay for 25 seconds!", 6000);
    SFX.bell();
  } else if (pick === "critic") {
    S.pendingSpecial = "critic";
    showEventBanner("🎩 A food critic is on their way. Their review counts triple.", 6000);
    SFX.bell();
  } else {
    S.pendingSpecial = "inspector";
    showEventBanner("📋 Health inspector incoming: a perfect bowl, or it goes on the record.", 6000);
    SFX.bell();
  }
}

// Which tier walks in. Odds scale with the restaurant's star rating — the
// richer clientele only shows up once the reviews say you're worth it. Daily
// runs are all regulars so the shared board stays fair.
function pickTier() {
  if (isDailyRun) return TIERS.regular;
  // The loyalty program makes the room read your rating generously.
  const r = rating() + 0.4 * upgradeLvl("loyalty");
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
function stickmanSVG(shirt, mood, sitting) {
  const mouth =
    mood === "ok" ? '<path d="M26 31 Q32 37 38 31" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>' :
    mood === "warn" ? '<path d="M27 33 L37 33" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>' :
    '<path d="M26 34 Q32 28 38 34" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>';
  const brow = mood === "mad"
    ? '<path d="M24 18 L30 20 M40 18 L34 20" stroke="#5a3a20" stroke-width="2" stroke-linecap="round"/>'
    : "";
  // A proper stick figure: thin line body (tinted the customer's colour),
  // round head with a face. Seated guests bend their knees onto the chair.
  const L = 'stroke="' + shirt + '" stroke-width="5" stroke-linecap="round"';
  // A chair drawn behind the seated figure so it always scales and lines up.
  const chair = sitting
    ? '<rect x="47" y="50" width="5" height="34" rx="2" fill="#b0803f"/>' + // backrest post
      '<rect x="30" y="49" width="20" height="5" rx="2" fill="#c08640"/>' + // backrest top
      '<rect x="26" y="79" width="30" height="6" rx="2" fill="#cf9a58"/>' + // seat
      '<rect x="28" y="85" width="4" height="26" rx="1" fill="#a9773f"/>' + // front-left leg
      '<rect x="50" y="85" width="4" height="26" rx="1" fill="#a9773f"/>'   // front-right leg
    : "";
  const legs = sitting
    ? // thighs forward (roughly level), shins straight down — a seated pose
      '<line x1="32" y1="79" x2="50" y2="80" ' + L + "/>" +
      '<line x1="50" y1="80" x2="50" y2="106" ' + L + "/>" +
      '<line x1="32" y1="79" x2="44" y2="83" ' + L + "/>" +
      '<line x1="44" y1="83" x2="44" y2="108" ' + L + "/>"
    : // standing
      '<line x1="32" y1="78" x2="20" y2="112" ' + L + "/>" +
      '<line x1="32" y1="78" x2="44" y2="112" ' + L + "/>";
  return (
    '<svg viewBox="0 0 64 120" width="100%" height="100%" aria-hidden="true">' +
    chair +
    legs +
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

// The dining tables live in the right ~66% of the floor; the left is the
// entrance where unseated guests wait. Tables spread evenly across their band.
function tableSpotPct(i, n) {
  return 34 + ((i + 0.5) / n) * 64;
}
function buildTables(n) {
  tablesEl.innerHTML = "";
  const w = Math.min(92, Math.round(300 / n) + 24);
  for (let i = 0; i < n; i++) {
    const t = document.createElement("div");
    t.className = "ou-table";
    t.style.cssText =
      "left:" + tableSpotPct(i, n) + "%;transform:translateX(-50%);" +
      "bottom:" + (i % 2 ? 72 : 58) + "px;width:" + w + "px";
    t.innerHTML = tableSVG();
    tablesEl.appendChild(t);
  }
  // Customers scale down a notch when the room is packed.
  document.querySelector(".ou-scene").dataset.tables = n;
}
// --- Seating -------------------------------------------------------------
// Guests now arrive at the door and wait to be seated. You (or a waiter) sit
// them at an open table; only then can their bowl be built. A guest whose
// patience runs out at the door leaves just like one who waited too long for
// food.
function seatedList() { return S.customers.filter((c) => c.seated); }
function unseatedList() { return S.customers.filter((c) => !c.seated); }

// First open table (only seated guests occupy one), or -1 when full.
function freeTable() {
  for (let i = 0; i < tableCount(); i++) {
    if (!seatedList().some((c) => c.tableIdx === i)) return i;
  }
  return -1;
}
// Where an unseated guest stands at the entrance (a short queue on the left).
function doorSpotPct(i) {
  return 5 + i * 13;
}
// Sit a waiting guest at the first free table. Returns false if the room's full.
function seatCustomer(c) {
  if (!c || c.seated) return false;
  const table = freeTable();
  if (table < 0) {
    // No room — a little "not yet" nudge.
    if (c.el) { c.el.classList.remove("noroom"); void c.el.offsetWidth; c.el.classList.add("noroom"); }
    return false;
  }
  c.seated = true;
  c.tableIdx = table;
  c.el.classList.remove("unseated");
  c.el.classList.add("seated");
  c.el.style.left = tableSpotPct(table, tableCount()) + "%";
  c.stickEl.innerHTML = stickmanSVG(c.shirt, c.mood, true); // sit down
  SFX.pick();
  reflowDoor();
  if (S.activeId == null) setActive(c.id);
  return true;
}
// Keep the door queue tidy after someone is seated or leaves.
function reflowDoor() {
  unseatedList().forEach((c, i) => { c.el.style.left = doorSpotPct(i) + "%"; });
}

// --- Customers ----------------------------------------------------------
function addCustomer() {
  // Arrivals wait at the door; spawning stops once the entrance is backed up.
  if (unseatedList().length >= DOOR_CAP) return;
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
    seated: false,
    tableIdx: null,
    special,
    sel: emptySel(),
    patience: maxP,
    maxPatience: maxP,
    shirt: special === "critic" ? "#2a2f31" : special === "inspector" ? "#5a7d8c" : tier.shirt || SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
    mood: "ok",
  };
  S.customers.push(c);
  buildCustomer(c);
  reflowDoor();
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
    `<span class="ou-seatme">Seat me!</span>` +
    `<span class="ou-stick">${stickmanSVG(c.shirt, c.mood, c.seated)}</span>` +
    `<span class="ou-nametag ${tagClass}">${tagIcon ? tagIcon + " " : ""}${c.custName}</span>` +
    `<span class="ou-pat"><i data-role="bar"></i></span>`;
  // Tap a waiting guest to seat them; tap a seated guest to serve them.
  el.addEventListener("click", () => {
    if (!S.running) return;
    if (c.seated) { SFX.pick(); setActive(c.id); }
    else seatCustomer(c);
  });
  el.classList.add(c.seated ? "seated" : "unseated");
  el.style.left = (c.seated ? tableSpotPct(c.tableIdx, tableCount()) : doorSpotPct(unseatedList().indexOf(c))) + "%";
  c.el = el;
  c.barEl = el.querySelector('[data-role="bar"]');
  c.stickEl = el.querySelector(".ou-stick");
  customersEl.appendChild(el);
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
  // The panic shake warns of a walkout — Rush has none, so no shake either.
  c.el.classList.toggle("urgent", !isRush() && frac <= 0.25);
  const mood = moodFor(frac);
  if (mood !== c.mood) {
    c.mood = mood;
    c.stickEl.innerHTML = stickmanSVG(c.shirt, mood, c.seated);
  }
}

function setActive(id) {
  const c = S.customers.find((x) => x.id === id);
  if (c && !c.seated) return; // can't work an order for someone still at the door
  S.activeId = id;
  for (const o of S.customers) o.el.classList.toggle("active", o.id === id);
  renderTicket();
  updatePans();
}

function removeCustomer(c, cls) {
  const el = c.el;
  el.classList.add(cls);
  setTimeout(() => el.remove(), 300);
  S.customers = S.customers.filter((x) => x.id !== c.id);
  reflowDoor();
  if (S.activeId === c.id) {
    // Fall back to another seated guest (the earliest still waiting on food).
    const next = seatedList()[0];
    S.activeId = next ? next.id : null;
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
  let tip = price * 0.6 * speedFrac * a.frac * tipMult();
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
  S.shift.tips += pay.tip;
  if (a.perfect) S.shift.perfects++;
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
  S.shift.bestCombo = Math.max(S.shift.bestCombo, S.combo);
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
  if (!isRush() && S.lost >= MAX_WALKOUTS && S.running) endGame("walkouts");
}

// --- Reviews & the star rating (the Secret Shopper toast, behind a counter) --
const REVIEW_5 = ["Absolute perfection!", "Best bowl in town. Take my money!", "Five stars, no notes.", "Exactly right, and fast."];
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
    const st = store();
    for (let i = 0; i < w; i++) st.reviews.push(r.stars);
    if (st.reviews.length > 20) st.reviews = st.reviews.slice(-20);
    saveTycoon();
    renderRating();
    if (window.PokeAch && st.reviews.length >= 10 && rating() >= 4.8) PokeAch.unlock("ou-5star");
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
// The pace tile shows the time of day on the store's wall clock. Full Shift
// also carries its walkout count in the tile's label.
function renderPace() {
  const str = fmtClock(clockMin());
  if (timeEl.textContent !== str) timeEl.textContent = str;
  const nearClose = S.timeLeft <= shiftLen() * 0.12; // last stretch before closing
  if (isRush()) {
    timeEl.classList.toggle("urgent", nearClose);
  } else {
    if (timeLabelEl) timeLabelEl.textContent = "🚶 " + S.lost + "/" + MAX_WALKOUTS;
    timeEl.classList.toggle("urgent", nearClose || S.lost >= MAX_WALKOUTS - 1);
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
    orderNameEl.textContent = unseatedList().length
      ? "Tap a guest at the door to seat them"
      : "Waiting for the next customer…";
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
// The figure is two layers: a body, and a separate arm-with-spoon that the
// CSS swings in a chopping loop while the crew is working.
function workerBodySVG(shirt) {
  const L = 'stroke="' + shirt + '" stroke-width="5" stroke-linecap="round"';
  return (
    '<svg viewBox="0 0 64 130" width="100%" height="100%" aria-hidden="true">' +
    '<line x1="32" y1="88" x2="20" y2="122" ' + L + "/>" +
    '<line x1="32" y1="88" x2="44" y2="122" ' + L + "/>" +
    '<line x1="32" y1="50" x2="32" y2="89" ' + L + "/>" +
    // the off hand rests on the counter
    '<line x1="32" y1="60" x2="18" y2="76" ' + L + "/>" +
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
function workerArmSVG(shirt) {
  return (
    '<svg viewBox="0 0 64 130" width="100%" height="100%" aria-hidden="true">' +
    '<line x1="32" y1="60" x2="52" y2="52" stroke="' + shirt + '" stroke-width="5" stroke-linecap="round"/>' +
    '<line x1="52" y1="52" x2="60" y2="46" stroke="#8b96a0" stroke-width="3" stroke-linecap="round"/>' +
    '<ellipse cx="61" cy="44" rx="4" ry="3" fill="#c6ced4"/>' +
    "</svg>"
  );
}
const WORKER_SHIRTS = ["#1b9092", "#7c5cff", "#d6304a"];

// The crew works the kitchen line at the back of the store, one figure per
// hire, each behind the counter with their own station.
function renderWorkers() {
  const n = workerCount();
  workerEl.classList.toggle("hidden", n === 0);
  workerEl.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const w = document.createElement("span");
    w.className = "ou-worker";
    w.innerHTML =
      `<span class="ou-worker-tag">🧑‍🍳 ${WORKER_NAMES[i]}</span>` +
      `<span class="ou-worker-fig">` +
      `<span class="ou-worker-stick">${workerBodySVG(WORKER_SHIRTS[i])}</span>` +
      `<span class="ou-worker-arm">${workerArmSVG(WORKER_SHIRTS[i])}</span>` +
      `</span>`;
    workerEl.appendChild(w);
  }
}

// Worker i's scoop: they cover the customers YOU aren't serving — each worker
// takes a different one (round-robin), falling back to the active customer
// only when there's no one else to help.
function workerAct(i) {
  if (!S.running) return;
  const seated = seatedList();
  const others = seated.filter((c) => c.id !== S.activeId && !isComplete(c));
  const c = others.length ? others[i % others.length] : (activeCustomer() && activeCustomer().seated ? activeCustomer() : null);
  if (!c) return;
  for (const cat of CATS) {
    for (const name of c.recipe.items[cat]) {
      if (!c.sel[cat].has(name)) {
        c.sel[cat].add(name);
        SFX.add();
        const fig = workerEl.children[i];
        if (fig) {
          fig.classList.remove("scooping");
          void fig.offsetWidth; // restart the animation
          fig.classList.add("scooping");
        }
        if (c.id === S.activeId) renderTicket();
        updatePans();
        updateCustomer(c);
        if (isComplete(c)) serve(c);
        return;
      }
    }
  }
}

const WAITER_SHIRTS = ["#e8709b", "#39a85b", "#f0a52c"];
// Waiters wait by the host stand at the entrance, one figure per hire.
function renderWaiters() {
  const n = waiterCount();
  waitersEl.classList.toggle("hidden", n === 0);
  waitersEl.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const w = document.createElement("span");
    w.className = "ou-waiter";
    w.innerHTML =
      `<span class="ou-worker-tag">🧍 ${WAITER_NAMES[i]}</span>` +
      `<span class="ou-stick">${stickmanSVG(WAITER_SHIRTS[i], "ok")}</span>`;
    waitersEl.appendChild(w);
  }
}

// A waiter seats the guest who's been waiting longest, if a table's open.
function waiterAct() {
  if (!S.running) return;
  if (freeTable() < 0) return;
  const next = unseatedList()[0];
  if (next) {
    seatCustomer(next);
    // A quick "on it" hop from a waiter.
    const fig = waitersEl.children[0];
    if (fig) { fig.classList.remove("seating"); void fig.offsetWidth; fig.classList.add("seating"); }
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

  if (S.running && !S.paused) {
    // Both modes run a closing clock so the shift always ends naturally;
    // Endless also ends early if too many guests storm out.
    S.timeLeft -= dt;
    renderPace();
    S.elapsed += dt;
    // Shift events fire on a loose timer (never during daily runs).
    if (S.elapsed >= S.nextEventAt) {
      fireEvent();
      S.nextEventAt = S.elapsed + 45 + Math.random() * 25;
    }
    if (S.timeLeft <= 0) {
      endGame("close");
    } else {
      // Kai, the auto-worker: every few seconds he scoops one correct
      // ingredient into the active customer's bowl.
      const crew = workerCount();
      if (crew) {
        const scoopT = workerScoopTime();
        for (let i = 0; i < crew; i++) {
          S.workerT[i] = (S.workerT[i] || 0) + dt;
          if (S.workerT[i] >= scoopT) { S.workerT[i] = 0; workerAct(i); }
        }
      }
      // The crew visibly works whenever there's a seated guest to cook for.
      workerEl.classList.toggle("working", seatedList().length > 0);
      // Waiters seat waiting guests on their own timers.
      const waiters = waiterCount();
      if (waiters) {
        const seatT = waiterSeatTime();
        for (let i = 0; i < waiters; i++) {
          S.waiterT[i] = (S.waiterT[i] || 0) + dt;
          if (S.waiterT[i] >= seatT) { S.waiterT[i] = 0; waiterAct(); }
        }
      }
      for (const c of S.customers.slice()) {
        // The customer you're serving loses patience at full speed; everyone
        // waiting drains slower. A comfy lobby slows the whole room down.
        const rate = (c.id === S.activeId ? 1 : WAIT_DRAIN) * lobbyMult();
        c.patience -= dt * rate;
        if (c.patience <= 0) {
          // In Rush the shift clock is the only timer — nobody storms out.
          // Patience still drains silently underneath as the speed measure
          // for tips (and the faces get grumpier the longer they wait).
          if (isRush()) { c.patience = 0; }
          else { loseCustomer(c); continue; }
        }
        updateCustomer(c);
      }
      if (S.running) {
        S.spawnTimer -= dt;
        if (S.spawnTimer <= 0 && unseatedList().length < DOOR_CAP) {
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
  S.timeLeft = shiftLen();
  S.workerT = WORKER_NAMES.map((_, i) => i * 2); // stagger the crew
  S.waiterT = WAITER_NAMES.map((_, i) => i * 1.5); // stagger the floor
  S.shift = { tips: 0, perfects: 0, bestCombo: 0 };
  S.paused = false;
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
  timeLabelEl.textContent = isRush() ? "Lunch" : "Time"; // Full Shift swaps in its walkout count
  // Rush hides the per-customer patience bars; the shift clock is the only
  // visible timer there.
  customersEl.classList.toggle("rush", isRush());
  buildTables(tableCount()); // the tables upgrade may have changed the room
  endShiftBtn.classList.remove("hidden");
  shopBtn.classList.toggle("hidden", isDailyRun); // dailies are stock — no shop
  resetEndShiftBtn();
  renderPace();
  renderWorkers();
  renderWaiters();
  updateCombo();
  overlay.classList.add("hidden");
  addCustomer(); // first customer right away
  S.spawnTimer = spawnInterval();
  renderTicket();
  updatePans();
}

function endGame(reason) {
  S.running = false;
  S.paused = false;
  endShiftBtn.classList.add("hidden");
  shopBtn.classList.add("hidden");
  screenShop.classList.add("hidden"); // in case the shift ends... it can't while paused, but belt and braces
  resetEndShiftBtn();
  SFX.over();
  // Whoever's still in line just heads home — the shift is over, no penalty.
  for (const c of S.customers.slice()) removeCustomer(c, "leaving");
  // Closing up is worth something: your reputation pays a closing bonus of up
  // to +25% of the shift, scaled by the store's rating. (Not on dailies — the
  // shared board stays raw.)
  let bonus = 0;
  if (!isDailyRun && S.score > 0) {
    bonus = Math.round(S.score * (rating() / 5) * 0.25);
    S.score += bonus;
    renderMoney();
  }
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
      (T.stores.length > 1 ? " · 🏪 ×" + T.stores.length : "");
  }
  const rNow = rating();
  const arrow = rNow > S.ratingStart + 0.01 ? "📈" : rNow < S.ratingStart - 0.01 ? "📉" : "";
  const headline =
    reason === "close" ? "🔔 Closing time! " :
    reason === "walkouts" ? "🚪 Too many walkouts. " :
    reason === "early" ? "🔚 Clocked out early. " : "";
  finalEl.innerHTML =
    headline +
    `<strong>${S.score}</strong> banked ` +
    `<span class="ou-mode-tag">${isHard() ? "Hard" : "Normal"}${isRush() ? " · Rush" : " · Full Shift"}</span>` +
    (isBest && S.score > 0 ? ` <span class="ou-best">★ New best shift!</span>` : "");
  const sumEl = document.getElementById("ou-summary");
  if (sumEl) {
    const rows = [
      ["🍜", "Bowls served", S.served],
      ["✨", "Perfect bowls", S.shift.perfects],
      ["💵", "Tips collected", "$" + Math.round(S.shift.tips)],
      ["🔥", "Best combo", "x" + S.shift.bestCombo],
    ];
    if (!isRush()) rows.push(["🚶", "Walkouts", S.lost]);
    if (bonus) rows.push(["⭐", "Closing bonus (★" + rNow.toFixed(1) + ")", "+$" + bonus]);
    rows.push(["📊", "Rating", "★ " + S.ratingStart.toFixed(1) + " → ★ " + rNow.toFixed(1) + " " + arrow]);
    sumEl.innerHTML = rows
      .map((r) => `<div class="ou-sum-row"><span>${r[0]} ${r[1]}</span><strong>${r[2]}</strong></div>`)
      .join("");
  }

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
  if (screenSaves) screenSaves.classList.add("hidden");
  screenOver.classList.remove("hidden");
  overlay.classList.remove("hidden");
}

// --- The upgrade shop (its own panel; reachable mid-shift too) ------------
const screenShop = document.getElementById("screen-shop");
const storesEl = document.getElementById("ou-stores");
const shopBtn = document.getElementById("shop-btn");
const shopDoneBtn = document.getElementById("shop-done");
const overShopBtn = document.getElementById("over-shop-btn");

// Purchases apply immediately — mid-shift buys reshape the running room.
function applyLive() {
  renderWorkers();
  renderWaiters();
  buildTables(tableCount());
  for (const c of seatedList()) {
    c.el.style.left = tableSpotPct(c.tableIdx, tableCount()) + "%";
  }
  reflowDoor();
  renderRating();
}

function renderShop() {
  if (!shopEl) return;
  bankEl.innerHTML = bankLineHTML();
  const note = document.getElementById("ou-econ-note");
  if (note) {
    note.textContent =
      "Rent runs $" + RENT_PER_MIN + "/min per location while you're open. " +
      "Staffed, well-rated stores earn on their own — even while you're away. " +
      "Fall too far in the red and a location goes under.";
  }

  // Store tabs: each location is its own build. Switching is a between-shifts
  // decision, so the tabs lock while a shift is running.
  storesEl.innerHTML = "";
  if (T.stores.length > 1) {
    T.stores.forEach((st, i) => {
      const starAvg = st.reviews.length
        ? st.reviews.reduce((a, b) => a + b, 0) / st.reviews.length
        : 3;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ou-store-tab" + (i === T.current ? " active" : "");
      b.textContent = "🏪 #" + (i + 1) + " · ★" + starAvg.toFixed(1);
      b.disabled = S.running && i !== T.current;
      b.addEventListener("click", () => {
        if (S.running || i === T.current) return;
        T.current = i;
        saveTycoon();
        SFX.pick();
        applyLive();
        renderShop();
      });
      storesEl.appendChild(b);
    });
  }

  shopEl.innerHTML = "";
  for (const key of Object.keys(UPGRADES)) {
    const u = UPGRADES[key];
    const lvl = store().upgrades[key] || 0;
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
        store().upgrades[key] = lvl + 1;
        saveTycoon();
        SFX.bell();
        if (window.PokeAch) PokeAch.unlock("ou-upgrade");
        applyLive();
        renderShop();
      });
    }
    card.appendChild(btn);
    shopEl.appendChild(card);
  }

  // Open the next location: needs the current store fully built out. Each new
  // store starts fresh but adds a permanent +10% chain-wide.
  const ready = franchiseReady();
  const fr = document.createElement("div");
  fr.className = "ou-up ou-up-franchise" + (ready ? "" : " locked");
  fr.innerHTML =
    `<span class="ou-up-icon">🏪</span>` +
    `<span class="ou-up-body"><strong>Open location #${T.stores.length + 1}</strong>` +
    `<small>${ready
      ? "A fresh store to build, and a permanent +10% chain bonus. Forever."
      : "Max every upgrade in this store to unlock."}</small></span>`;
  const frBtn = document.createElement("button");
  frBtn.type = "button";
  frBtn.className = "ou-up-buy";
  frBtn.textContent = "$" + FRANCHISE_COST;
  frBtn.disabled = !ready || T.bank < FRANCHISE_COST || S.running;
  frBtn.addEventListener("click", () => {
    if (!franchiseReady() || T.bank < FRANCHISE_COST || S.running) return;
    T.bank -= FRANCHISE_COST;
    T.stores.push(freshStore());
    T.current = T.stores.length - 1;
    saveTycoon();
    SFX.serve();
    if (window.PokeAch) PokeAch.unlock("ou-franchise");
    applyLive();
    renderShop();
  });
  fr.appendChild(frBtn);
  shopEl.appendChild(fr);
}

// Opening the shop mid-shift pauses the room; closing it resumes.
let shopReturn = null; // "over" | "game"
function openShop(from) {
  shopReturn = from;
  renderShop();
  screenOver.classList.add("hidden");
  screenStart.classList.add("hidden");
  screenVariant.classList.add("hidden");
  screenShop.classList.remove("hidden");
  if (from === "game") {
    S.paused = true;
    overlay.classList.remove("hidden");
  }
}
function closeShop() {
  screenShop.classList.add("hidden");
  if (shopReturn === "game") {
    overlay.classList.add("hidden");
    S.paused = false;
  } else {
    screenOver.classList.remove("hidden");
  }
  shopReturn = null;
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

// --- Save backup / restore wiring ---------------------------------------
const saveBackupBtn = document.getElementById("save-backup");
const saveRestoreBtn = document.getElementById("save-restore");
const saveCodeEl = document.getElementById("save-code");
const saveMsgEl = document.getElementById("save-msg");
if (saveBackupBtn) {
  saveBackupBtn.addEventListener("click", () => {
    const code = exportSave();
    saveCodeEl.readOnly = true;
    saveCodeEl.classList.remove("hidden");
    saveCodeEl.value = code;
    saveCodeEl.focus();
    saveCodeEl.select();
    const done = () => { saveMsgEl.textContent = "✓ Backup code copied. Keep it somewhere safe."; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, () => {
        saveMsgEl.textContent = "Select the code above and copy it (Ctrl/Cmd+C).";
      });
    } else {
      try { document.execCommand("copy"); done(); }
      catch (e) { saveMsgEl.textContent = "Select the code above and copy it."; }
    }
  });
}
if (saveRestoreBtn) {
  saveRestoreBtn.addEventListener("click", () => {
    // First tap reveals an empty box; second tap (with a code) restores.
    if (saveCodeEl.classList.contains("hidden") || saveCodeEl.readOnly || !saveCodeEl.value.trim()) {
      saveCodeEl.readOnly = false;
      saveCodeEl.value = "";
      saveCodeEl.classList.remove("hidden");
      saveCodeEl.focus();
      saveMsgEl.textContent = "Paste your backup code above, then tap Restore again.";
      return;
    }
    if (importSave(saveCodeEl.value)) {
      saveMsgEl.textContent = "✓ Restored! Reloading…";
      setTimeout(() => location.reload(), 700);
    } else {
      saveMsgEl.textContent = "That code didn't work. Check you copied all of it.";
    }
  });
}

// --- Saved games: named slots you can keep and load back later ----------
const SLOTS = 3;
const screenSaves = document.getElementById("screen-saves");
function slotKey(n) { return "pokeworks-orderup-slot-" + n; }
function readSlot(n) {
  try { const d = JSON.parse(localStorage.getItem(slotKey(n))); return d && Array.isArray(d.stores) ? d : null; }
  catch (e) { return null; }
}
// Human label for a saved mode, e.g. "Recipes Shown · Rush".
function modeLabel(mode) {
  mode = mode || "normal";
  const hard = mode.indexOf("hard") === 0;
  const rush = mode.indexOf("-rush") !== -1;
  return (hard ? "Hidden Recipes" : "Recipes Shown") + " · " + (rush ? "Rush" : "Full Shift");
}
function saveToSlot(n) {
  // Remember the mode so Load can drop straight back into that game.
  const snap = Object.assign({}, T, { savedAt: Date.now(), mode: S.mode });
  try { localStorage.setItem(slotKey(n), JSON.stringify(snap)); } catch (e) { /* ignore */ }
  SFX.bell();
  renderSlots();
}
function renderSlots() {
  const el = document.getElementById("ou-slots");
  if (!el) return;
  el.innerHTML = "";
  for (let n = 0; n < SLOTS; n++) {
    const d = readSlot(n);
    const row = document.createElement("div");
    row.className = "ou-slot";
    const info = document.createElement("span");
    info.className = "ou-slot-info";
    if (d) {
      const when = d.savedAt ? new Date(d.savedAt).toLocaleDateString() : "";
      const stars = d.stores.length;
      info.innerHTML = "<strong>Slot " + (n + 1) + "</strong><small>$" +
        Math.floor(d.bank || 0).toLocaleString() + " · " + stars + " store" + (stars === 1 ? "" : "s") +
        " · " + modeLabel(d.mode) + (when ? " · " + when : "") + "</small>";
    } else {
      info.innerHTML = "<strong>Slot " + (n + 1) + "</strong><small>Empty</small>";
    }
    row.appendChild(info);
    if (d) {
      const load = document.createElement("button");
      load.type = "button"; load.className = "ou-slot-btn"; load.textContent = "Load";
      load.addEventListener("click", () => {
        // Load the save and drop straight into a shift in its saved mode.
        localStorage.setItem(TYCOON_KEY, JSON.stringify(d));
        T = loadTycoon();
        T.lastSeen = Date.now(); // loading isn't "returning from away" — no idle payout
        bankrupted = false;
        saveTycoon();
        screenSaves.classList.add("hidden");
        ensureAudio();
        SFX.start();
        startGame(d.mode || "normal");
      });
      const over = document.createElement("button");
      over.type = "button"; over.className = "ou-slot-btn ghost"; over.textContent = "Overwrite";
      over.addEventListener("click", () => saveToSlot(n));
      row.append(load, over);
    } else {
      const save = document.createElement("button");
      save.type = "button"; save.className = "ou-slot-btn"; save.textContent = "Save here";
      save.addEventListener("click", () => saveToSlot(n));
      row.appendChild(save);
    }
    el.appendChild(row);
  }
}
function openSaves() {
  renderSlots();
  if (saveMsgEl) saveMsgEl.textContent = "";
  if (saveCodeEl) saveCodeEl.classList.add("hidden");
  screenStart.classList.add("hidden");
  screenSaves.classList.remove("hidden");
}
function closeSaves() {
  screenSaves.classList.add("hidden");
  screenStart.classList.remove("hidden");
}
const openSavesBtn = document.getElementById("open-saves");
const savesDoneBtn = document.getElementById("saves-done");
if (openSavesBtn) openSavesBtn.addEventListener("click", () => { SFX.pick(); openSaves(); });
if (savesDoneBtn) savesDoneBtn.addEventListener("click", () => { SFX.pick(); closeSaves(); });

// --- Wiring -------------------------------------------------------------
// Picking a ticket style opens the pace popup: Endless or Rush.
let pendingBase = "normal"; // which ticket style the popup starts
function openVariant(base) {
  pendingBase = base;
  variantTitleEl.textContent =
    (base === "hard" ? "Hidden Recipes" : "Recipes Shown") + ": pick your pace";
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

// End Shift: clock out whenever you like — earnings bank as usual. Two taps,
// so a stray thumb can't end a run: the first arms it, the second confirms.
let endShiftArmTimer = null;
function resetEndShiftBtn() {
  clearTimeout(endShiftArmTimer);
  endShiftBtn.classList.remove("armed");
  endShiftBtn.textContent = "🔚 End Shift";
}
shopBtn.addEventListener("click", () => {
  if (!S.running || isDailyRun) return;
  SFX.pick();
  openShop("game");
});
shopDoneBtn.addEventListener("click", () => { SFX.pick(); closeShop(); });
overShopBtn.addEventListener("click", () => { SFX.pick(); openShop("over"); });

endShiftBtn.addEventListener("click", () => {
  if (!S.running) return;
  if (!endShiftBtn.classList.contains("armed")) {
    endShiftBtn.classList.add("armed");
    endShiftBtn.textContent = "Clock out?";
    SFX.pick();
    clearTimeout(endShiftArmTimer);
    endShiftArmTimer = setTimeout(resetEndShiftBtn, 2500);
    return;
  }
  resetEndShiftBtn();
  endGame("early");
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
    if (sub) sub.textContent = "Everyone gets this exact shift today. One attempt, so make it count.";
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
// Playtest cheat: on a local/LAN server only, ?rich=1 stuffs the bank so
// upgrades and the franchise can be tried without grinding. The hostname gate
// makes it inert on the live site.
const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.)/.test(location.hostname);
if (isLocalHost && new URLSearchParams(location.search).get("rich") === "1") {
  T.bank = 999999;
  saveTycoon();
}
best = loadBest();
bestEl.textContent = "$" + best;
renderRating();
renderPace();
renderWorkers();
buildTables(tableCount());
buildStations();
renderPans();
B.draw(bctx, BW, BH, emptySel());

// Economy: credit offline earnings, show a welcome-back note, then run the
// live rent/idle clock while the page is open. (Dailies stay out of all this.)
if (!isDailyRun) {
  const back = creditOffline();
  const w = document.getElementById("ou-welcome");
  if (w && back) {
    w.textContent = "👋 Welcome back! Your stores earned $" + back.gain.toLocaleString() +
      " over " + (back.mins >= 60 ? Math.round(back.mins / 60) + "h" : back.mins + " min") + " away.";
    w.classList.remove("hidden");
  }
  updateBankDisplays();
  setInterval(economyTick, 1000);
}

requestAnimationFrame(frame);
