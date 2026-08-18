// Secret Shopper — one of the three guests in your shift is the secret
// shopper (you won't know which). Every step of every visit is audited like
// the hospitality sheet. Every question is timed with four options. Normal
// guests storm out (and leave a bad review) if you keep messing up or stop
// responding; every guest leaves a star review when their visit ends.

const B = window.Bowl;
const RECIPES = B.RECIPES;
const ING = B.INGREDIENTS;

// --- DOM ----------------------------------------------------------------
const doorEl = document.getElementById("door");
const custWrap = document.getElementById("cust-wrap");
const custStick = document.getElementById("cust-stick");
const custBubble = document.getElementById("cust-bubble");
const empWrap = document.getElementById("emp-wrap");
const empStick = document.getElementById("emp-stick");
const empBubble = document.getElementById("emp-bubble");
const extraWrap = document.getElementById("extra-wrap");
const extraStick = document.getElementById("extra-stick");
const extraBubble = document.getElementById("extra-bubble");
const tableEl = document.getElementById("table");
const promptTitle = document.getElementById("prompt-title");
const choicesEl = document.getElementById("choices");
const timerEl = document.getElementById("timer");
const timerFill = document.getElementById("timer-fill");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start-btn");
const examBtn = document.getElementById("exam-btn");
const overlaySub = document.getElementById("overlay-sub");
const rankBadgeEl = document.getElementById("rank-badge");
const rankNameEl = document.getElementById("rank-name");
const repFillEl = document.getElementById("rep-fill");
const repLabelEl = document.getElementById("rep-label");
const careerStatsEl = document.getElementById("career-stats");
const repGainEl = document.getElementById("rep-gain");
const repLineFill = document.getElementById("rep-line-fill");
const repNextEl = document.getElementById("rep-next");
const scorecardEl = document.getElementById("scorecard");
const auditHeader = document.getElementById("audit-header");
const auditRows = document.getElementById("audit-rows");
const gradeEl = document.getElementById("grade");
const againBtn = document.getElementById("again-btn");
const bestEl = document.getElementById("best");

// --- Config ---------------------------------------------------------------
const BEST_KEY = "pokeworks-shopper-best";
const CAREER_KEY = "pokeworks-shopper-career";
const STRIKES_TO_LEAVE = 3; // wrong answers before a normal guest storms out
const SILENCE_TO_LEAVE = 2; // consecutive timeouts before they give up on you
const EXAM_PASS_PCT = 80; // audit score needed to pass a promotion exam

// Career ladder. Each rank tunes the whole shift: guest count, timer windows
// (qSecs = regular prompts, menuSecs = menu quizzes, walkinSecs = the walk-in
// event), where the menu-question difficulty ramp starts, and how many of the
// guests are secretly shoppers. `repNeed` is the lifetime reputation required
// to unlock the promotion exam INTO this rank.
const RANKS = [
  { name: "Trainee",         badge: "🧢", repNeed: 0,    guests: 3, qSecs: 7,   menuSecs: 9,   walkinSecs: 3,   qLevelBase: 1, shoppers: 1 },
  { name: "Team Member",     badge: "🥄", repNeed: 100,  guests: 4, qSecs: 7,   menuSecs: 9,   walkinSecs: 3,   qLevelBase: 1, shoppers: 1 },
  { name: "Shift Lead",      badge: "⭐", repNeed: 300,  guests: 4, qSecs: 6.5, menuSecs: 8.5, walkinSecs: 2.7, qLevelBase: 2, shoppers: 1 },
  { name: "Asst. Manager",   badge: "📋", repNeed: 600,  guests: 5, qSecs: 6.5, menuSecs: 8,   walkinSecs: 2.7, qLevelBase: 2, shoppers: 1 },
  { name: "Store Manager",   badge: "🏬", repNeed: 1000, guests: 5, qSecs: 6,   menuSecs: 7.5, walkinSecs: 2.4, qLevelBase: 2, shoppers: 2 },
  { name: "District Legend", badge: "👑", repNeed: 1500, guests: 6, qSecs: 6,   menuSecs: 7,   walkinSecs: 2.4, qLevelBase: 3, shoppers: 2 },
];
const SPOT = { door: 2, greet: 24, counter: 46, table: 10, tableTalk: 26, wait: 32 };
const CUST_SHIRTS = ["#22b2b4", "#fd9f27", "#7c5cff", "#39a85b", "#e8709b", "#4c7dd1"];

// Personalities change pacing, dialogue, and whether they dine in. `minRank`
// gates the newer faces behind career progress (index into RANKS).
const PERSONALITIES = {
  friendly: { label: "Friendly", greetSecs: 5, scoopSecs: 8, dineChance: 0.65, minRank: 0 },
  rush: { label: "In a rush", greetSecs: 3.5, scoopSecs: 6.5, dineChance: 0, minRank: 0 },
  chatty: { label: "Chatty", greetSecs: 5, scoopSecs: 8, dineChance: 0.75, minRank: 0 },
  grumpy: { label: "Grumpy", greetSecs: 4.5, scoopSecs: 7.5, dineChance: 0.5, minRank: 0 },
  // The Regular knows YOU — they order "the usual" and expect you to remember
  // the first bowl you made this shift. Never the first guest of the day.
  regular: { label: "The Regular", greetSecs: 5, scoopSecs: 8, dineChance: 0.5, minRank: 1 },
  // The Critic always dines in, always gets a level-3 menu question, and every
  // audit line on their visit counts DOUBLE.
  critic: { label: "The Critic", greetSecs: 4.5, scoopSecs: 7, dineChance: 1, minRank: 3 },
  // Content pack: easygoing faces that vary the pacing without special rules.
  tourist: { label: "Tourist", greetSecs: 6, scoopSecs: 9, dineChance: 0.8, minRank: 0 },
  foodie: { label: "The Foodie", greetSecs: 5, scoopSecs: 8.5, dineChance: 1, minRank: 1 },
};

// Audit line definitions (label may embed the greet window at runtime).
const ITEMDEF = {
  greetFast: { pts: 3, label: (s) => `Greeted within ${s} seconds of entering` },
  greetWarm: { pts: 3, label: () => "Warm and genuine greeting" },
  preOrder: { pts: 2, label: () => "Pleasant greeting before taking the order" },
  firstTime: { pts: 2, label: () => "Asked if it was their first time visiting" },
  menuKnow: { pts: 4, label: () => "Demonstrated menu knowledge" },
  upsell: { pts: 3, label: () => "Offered an upsell" },
  rewards: { pts: 2, label: () => "Asked about rewards/app" },
  fastOrder: { pts: 3, label: () => "Order ready in time" },
  parting: { pts: 2, label: () => "Pleasant parting comment" },
  dining: { pts: 1, label: () => "Engaged with their table in the dining room" },
};
const CORE_ORDER = ["greetFast", "greetWarm", "preOrder", "firstTime", "menuKnow", "upsell", "rewards", "fastOrder", "parting"];

// --- Dialogue pools -------------------------------------------------------
// Every option carries `t` (what YOU say/do) and `r` (how the GUEST reacts to
// that exact line), so their response always matches what actually happened.
const GREETS = {
  good: [
    { t: "“Aloha! Welcome in!”", r: "Aloha! Happy to be here." },
    { t: "“Welcome to Pokeworks!”", r: "Thanks! Smells amazing in here." },
    { t: "“Hey there, welcome in!”", r: "Hey! Good to be back." },
    { t: "“Good afternoon! Come on in!”", r: "Good afternoon to you too!" },
    { t: "“Hi there! Great to see you!”", r: "Great to be seen!" },
  ],
  bad: [
    { t: "“Yo.”", r: "...'Yo'? Okay then." },
    { t: "(Keep restocking the napkins)", r: "Um... hello? I'm right here?" },
    { t: "(Stare at the register)", r: "Should I... come back later?" },
    { t: "“We close in an hour.”", r: "I literally just walked in?" },
    { t: "(Check your phone)", r: "Is that phone more important than me?" },
    { t: "(Yawn loudly)", r: "Am I boring you already?" },
  ],
};
const PREORDER = {
  good: [
    { t: "“Welcome to Pokeworks! How's your day going?”", r: "Going great, thanks for asking!" },
    { t: "“Hi! How are you today?”", r: "Doing well! Hope you are too." },
    { t: "“Great to see you. How's it going?”", r: "Can't complain! Even better once I eat." },
    { t: "“Hi there! What can I get started for you?”", r: "Love the energy! Let me look real quick." },
  ],
  bad: [
    { t: "“What do you want?”", r: "Wow. A 'hello' would've been nice." },
    { t: "“Hurry it up, there's a line.”", r: "There is literally nobody behind me." },
    { t: "“Next.”", r: "I'm... the only person in line?" },
    { t: "(Point at the menu silently)", r: "Are we playing charades?" },
    { t: "(Sigh) “Go ahead.”", r: "Sorry to inconvenience you, I guess?" },
  ],
};
const FIRSTTIME = {
  good: [
    { t: "“Is this your first time visiting us?”", r: null }, // they answer below
    { t: "“Have you been in before?”", r: null },
  ],
  bad: [
    { t: "(Skip the small talk)", r: null },
    { t: "“You look like you eat here too much.”", r: "EXCUSE me?!" },
    { t: "“You already know what you want, right?”", r: "I mean... maybe? Kind of rude." },
    { t: "“Name for the order. Go.”", r: "It's... Sam? Sheesh." },
  ],
};
const FIRSTTIME_REPLIES = ["First time, actually!", "I come here all the time!", "First visit! What do you recommend?", "My friend wouldn't stop talking about this place."];
const UPSELL = {
  good: [
    { t: "“Would you like to add avocado or a drink?”", r: "Ooh, avocado please!" },
    { t: "“Can I add a snack or a drink for you?”", r: "A drink sounds good, actually!" },
    { t: "“Avocado on that? It's amazing.”", r: "Go on then, add the avocado." },
    { t: "“Any drinks or snacks with that today?”", r: "Twist my arm... a drink, sure." },
  ],
  bad: [
    { t: "“That everything? Cool.”", r: "...I guess that's everything, then." },
    { t: "“Anything else? No? Fine.”", r: "You answered for me?" },
    { t: "(Ring them up without asking)", r: "Oh. We're done? Okay." },
    { t: "(Just total it up)", r: "Didn't even get to ask about avocado..." },
  ],
};
const REWARDS = {
  good: [
    { t: "“Do you have our rewards app? You earn points!”", r: "Just downloaded it!" },
    { t: "“Are you in our rewards program yet?”", r: "Already am. 2,000 points!" },
    { t: "“Want me to scan your rewards app?”", r: "Sure, scan away!" },
  ],
  bad: [
    { t: "“Alright, that'll be $13.45.”", r: "Straight to business, huh." },
    { t: "(Skip straight to payment)", r: "No rewards pitch? My points..." },
    { t: "“Cash or card. Pick.”", r: "...Card, I guess?" },
    { t: "(Tap the card reader impatiently)", r: "Okay, okay, I'm tapping!" },
  ],
};
const PARTING = {
  good: [
    { t: "“Thank you! Have a great day!”", r: "You too! Thanks so much!" },
    { t: "“Thanks so much. Enjoy!”", r: "Oh, I will. Thank you!" },
    { t: "“Have a wonderful rest of your day!”", r: "What a sweetheart. You as well!" },
    { t: "“Mahalo! See you next time!”", r: "Mahalo! I'll be back." },
  ],
  bad: [
    { t: "“NEXT!”", r: "There is no one behind me!" },
    { t: "(Turn away silently)", r: "...Bye, I guess?" },
    { t: "“Finally.”", r: "'Finally'?? Wow." },
    { t: "(Slide the bowl over wordlessly)", r: "Thanks...?" },
  ],
};
const DINING = {
  good: [
    { t: "Visit their table: “How is everything?”", r: null }, // handled at the table
    { t: "Swing by: “Can I get you anything else?”", r: null },
  ],
  bad: [
    { t: "(Stand around behind the counter)", r: null },
    { t: "(Watch them eat, silently, from a distance)", r: "...Why are they staring at me?" },
    { t: "(Start sweeping loudly next to them)", r: "Could you sweep... literally anywhere else?" },
  ],
};
// What the guest says when a timer runs out and you never responded.
const TIMEOUT_LINE = {
  greet: "...I've been standing here a whole minute.",
  preOrder: "Hello? I'd like to order?",
  firstTime: "...Should I just order, then?",
  upsell: "So... is that everything, or?",
  rewards: "Do I just... pay now?",
  parting: "...I'll just take this and go, then.",
  dining: null,
};
const REPLY_TABLE = ["Delicious, thank you!", "So good. I'm telling everyone.", "Best bowl yet!", "Perfect, as always."];
const REPLY_SLOW = ["That took a while...", "I was about to send a search party.", "Finally..."];
const LEAVE_LINES = ["That's it. I'm leaving!", "Forget it, I'll go somewhere else.", "Unbelievable. I'm out."];

// --- Career (persistent) --------------------------------------------------
function defaultCareer() {
  return { v: 1, rank: 0, rep: 0, shifts: 0, stats: { shoppersImpressed: 0, stormOuts: 0, perfectGuests: 0 } };
}
function loadCareer() {
  try {
    const c = JSON.parse(localStorage.getItem(CAREER_KEY));
    if (c && c.v === 1 && RANKS[c.rank]) {
      return { ...defaultCareer(), ...c, stats: { ...defaultCareer().stats, ...(c.stats || {}) } };
    }
  } catch { /* fall through to a fresh career */ }
  return defaultCareer();
}
function saveCareer() {
  try { localStorage.setItem(CAREER_KEY, JSON.stringify(career)); } catch { /* ignore */ }
}
let career = loadCareer();
function nextRank() { return career.rank < RANKS.length - 1 ? RANKS[career.rank + 1] : null; }
function examReady() { const n = nextRank(); return !!n && career.rep >= n.repNeed; }

// --- State ------------------------------------------------------------------
let running = false;
let audit = []; // { guest, key, label, pts, got }
let guestMeta = []; // { label, dine, shopper, leftEarly } per guest
let shopperSet = new Set(); // which guest(s) are secretly shoppers
let shiftRank = 0; // rank config in effect for the current shift
let shiftGuests = 3; // guest count of the current shift (kept for the scorecard)
let examMode = false; // promotion exam shift: next rank's difficulty, pass/fail
let shiftOrders = []; // recipes ordered so far this shift (The Regular's memory test)
let corporateIdx = -1; // guest index the District Manager observes, -1 = none
let custShirt = CUST_SHIRTS[0];
let custSitting = false;

// Daily Challenge shift (secret-shopper.html?daily=1): consequential
// randomness is drawn from a date-seeded stream so everyone works the same
// shift, at a fixed rank whatever your career says. (Different answers can
// drift the later details apart, but the cast, orders, and questions start
// identical for every player.)
const isDailyRun = !!(window.Daily && Daily.isRun());
const DAILY_RANK = 2; // Shift Lead: 4 guests, one shopper — fair for everyone
let rand = Math.random; // swapped for the seeded stream during a daily shift

// Rank config in effect right now (exam shifts run at the NEXT rank).
const cfg = () => RANKS[shiftRank];
// Menu questions ramp from the rank's base level up to 3 across the shift.
function qLevel(idx) {
  const R = cfg();
  return Math.min(3, R.qLevelBase + Math.floor((idx * 3) / R.guests));
}

// --- Sound --------------------------------------------------------------
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
  bell: () => { tone({ freq: 880, type: "sine", dur: 0.08, gain: 0.09 }); tone({ freq: 1320, type: "sine", dur: 0.12, gain: 0.08, delay: 0.07 }); },
  good: () => tone({ freq: 620, slideTo: 900, dur: 0.12, gain: 0.12 }),
  bad: () => tone({ freq: 220, type: "sawtooth", slideTo: 130, dur: 0.22, gain: 0.1 }),
  scoop: () => tone({ freq: 460, type: "triangle", slideTo: 640, dur: 0.07, gain: 0.1 }),
  serve: () => arp([523, 659, 784], { dur: 0.13, step: 0.06 }),
  ring: () => { tone({ freq: 1180, type: "square", dur: 0.09, gain: 0.05 }); tone({ freq: 1180, type: "square", dur: 0.09, gain: 0.05, delay: 0.16 }); },
  crash: () => tone({ freq: 180, type: "sawtooth", slideTo: 70, dur: 0.3, gain: 0.12 }),
  storm: () => arp([330, 262, 196], { type: "sawtooth", dur: 0.16, gain: 0.11, step: 0.09 }),
  start: () => arp([392, 523, 659], { dur: 0.12, step: 0.06 }),
  fanfare: () => arp([523, 659, 784, 1047, 1319], { dur: 0.2, gain: 0.13, step: 0.09 }),
};

// --- Stick figures (same look as Order Up) ------------------------------
function faceSVG(cy, mood) {
  const my = cy + 7;
  const mouth =
    mood === "ok" ? `<path d="M${26} ${my} Q32 ${my + 6} ${38} ${my}" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>` :
    mood === "warn" ? `<path d="M27 ${my + 2} L37 ${my + 2}" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>` :
    `<path d="M26 ${my + 3} Q32 ${my - 3} 38 ${my + 3}" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>`;
  const brow = mood === "mad"
    ? `<path d="M24 ${cy - 6} L30 ${cy - 4} M40 ${cy - 6} L34 ${cy - 4}" stroke="#5a3a20" stroke-width="2" stroke-linecap="round"/>`
    : "";
  return (
    `<circle cx="32" cy="${cy}" r="15" fill="#ffe0bd" stroke="#e0b98f" stroke-width="1.5"/>` +
    `<circle cx="27" cy="${cy}" r="2" fill="#333"/><circle cx="37" cy="${cy}" r="2" fill="#333"/>` +
    brow + mouth
  );
}
function stickmanSVG(shirt, mood) {
  const L = 'stroke="' + shirt + '" stroke-width="5" stroke-linecap="round"';
  return (
    '<svg viewBox="0 0 64 120" width="100%" height="100%" aria-hidden="true">' +
    '<line x1="32" y1="78" x2="20" y2="112" ' + L + "/>" +
    '<line x1="32" y1="78" x2="44" y2="112" ' + L + "/>" +
    '<line x1="32" y1="40" x2="32" y2="79" ' + L + "/>" +
    '<line x1="32" y1="50" x2="15" y2="64" ' + L + "/>" +
    '<line x1="32" y1="50" x2="49" y2="64" ' + L + "/>" +
    faceSVG(24, mood) +
    "</svg>"
  );
}
// Seated pose for dining in: bent legs on the chair, one arm on the table.
function stickmanSitSVG(shirt, mood) {
  const L = 'stroke="' + shirt + '" stroke-width="5" stroke-linecap="round"';
  return (
    '<svg viewBox="0 0 64 120" width="100%" height="100%" aria-hidden="true">' +
    '<line x1="32" y1="84" x2="50" y2="86" ' + L + "/>" + // thigh
    '<line x1="50" y1="86" x2="50" y2="112" ' + L + "/>" + // shin
    '<line x1="32" y1="86" x2="44" y2="90" ' + L + "/>" + // back thigh
    '<line x1="44" y1="90" x2="44" y2="112" ' + L + "/>" + // back shin
    '<line x1="32" y1="49" x2="32" y2="86" ' + L + "/>" + // spine
    '<line x1="32" y1="60" x2="48" y2="70" ' + L + "/>" + // arm to the table
    '<line x1="32" y1="60" x2="42" y2="78" ' + L + "/>" +
    faceSVG(34, mood) +
    "</svg>"
  );
}
// White table with Pokeworks-orange chairs, like the real stores.
function tableSVG() {
  return (
    '<svg viewBox="0 0 140 92" width="100%" height="100%" aria-hidden="true">' +
    '<ellipse cx="70" cy="84" rx="54" ry="7" fill="rgba(0,0,0,0.10)"/>' +
    '<rect x="18" y="34" width="13" height="30" rx="6" fill="#fd9f27"/>' +
    '<rect x="109" y="34" width="13" height="30" rx="6" fill="#fd9f27"/>' +
    '<rect x="14" y="54" width="30" height="9" rx="4" fill="#fd9f27"/>' +
    '<rect x="96" y="54" width="30" height="9" rx="4" fill="#fd9f27"/>' +
    '<line x1="20" y1="63" x2="20" y2="80" stroke="#d9821b" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="38" y1="63" x2="38" y2="80" stroke="#d9821b" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="102" y1="63" x2="102" y2="80" stroke="#d9821b" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="120" y1="63" x2="120" y2="80" stroke="#d9821b" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="66" y="46" width="8" height="30" fill="#b98f57"/>' +
    '<rect x="56" y="74" width="28" height="6" rx="3" fill="#9c7743"/>' +
    '<ellipse cx="70" cy="44" rx="42" ry="12" fill="#ffffff" stroke="#c9ced2" stroke-width="2"/>' +
    "</svg>"
  );
}

let custMoodNow = "ok";
function custMood(m) {
  custMoodNow = m;
  custStick.innerHTML = custSitting ? stickmanSitSVG(custShirt, m) : stickmanSVG(custShirt, m);
}
function setSitting(on) {
  custSitting = on;
  custWrap.classList.toggle("sitting", on);
  custMood(custMoodNow);
}
function moodUp() {
  if (custMoodNow === "mad") custMood("warn");
  else custMood("ok");
}
function moodDown() {
  if (custMoodNow === "ok") custMood("warn");
  else custMood("mad");
}

// --- Helpers ------------------------------------------------------------
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickN(arr, n) { return shuffle(arr).slice(0, n); }
function loadBestPct() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch { return 0; }
}
function saveBestPct(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ }
}
function showBest() {
  const b = loadBestPct();
  bestEl.textContent = b > 0 ? b + "%" : "0%";
}

function walkTo(wrap, pct, ms) {
  wrap.classList.add("walking");
  wrap.style.setProperty("--walk", ms + "ms");
  wrap.style.left = pct + "%";
  return wait(ms).then(() => wrap.classList.remove("walking"));
}
// Teleport an actor without any walk animation.
function placeAt(wrap, pct) {
  wrap.style.setProperty("--walk", "0ms");
  wrap.style.left = pct + "%";
}
// They step out through the doorway: walk to the door, fade, door shuts.
async function exitDoor(wrap, walkMs) {
  doorEl.classList.add("open");
  await walkTo(wrap, SPOT.door, walkMs);
  wrap.classList.add("offstage");
  await wait(300);
  doorEl.classList.remove("open");
}
// They step in through the doorway: appear in it, then walk on in.
async function enterDoor(wrap) {
  wrap.classList.add("offstage");
  placeAt(wrap, SPOT.door);
  doorEl.classList.add("open");
  SFX.bell();
  await wait(300); // door swings first
  wrap.classList.remove("offstage");
  await wait(280); // fade in inside the doorway
}
function say(bubble, text, holdMs) {
  bubble.textContent = text;
  bubble.classList.remove("hidden");
  // Keep the bubble inside the scene on narrow screens: shift it horizontally
  // as needed, while the tail (::after) stays pointing at the speaker.
  bubble.style.transform = "";
  bubble.style.setProperty("--shift", "0px");
  const scene = document.querySelector(".ss-scene").getBoundingClientRect();
  const b = bubble.getBoundingClientRect();
  const pad = 6;
  let dx = 0;
  if (b.right > scene.right - pad) dx = scene.right - pad - b.right;
  if (b.left + dx < scene.left + pad) dx = scene.left + pad - b.left;
  if (dx !== 0) {
    bubble.style.transform = `translateX(${dx}px)`;
    bubble.style.setProperty("--shift", dx + "px");
  }
  const ms = Math.max(holdMs || 0, 1500, 900 + text.length * 55);
  return wait(ms).then(() => bubble.classList.add("hidden"));
}
function hush() {
  custBubble.classList.add("hidden");
  empBubble.classList.add("hidden");
  extraBubble.classList.add("hidden");
}
function log(guest, key, pts, got, labelText) {
  audit.push({ guest, key, label: labelText, pts, got: !!got });
}

// --- Prompt / choices ---------------------------------------------------
// Show a timed prompt. Resolves { good, text, inTime, timedOut }. Running out
// of time counts as a miss: the right answer flashes red and play moves on.
function ask(title, options, timerSec) {
  promptTitle.textContent = title;
  choicesEl.innerHTML = "";
  let settled = false;
  let timeoutId = null;

  if (timerSec) {
    timerEl.classList.remove("hidden");
    timerFill.style.transition = "none";
    timerFill.style.width = "100%";
    timerFill.classList.remove("late");
    void timerFill.offsetWidth;
    timerFill.style.transition = "width " + timerSec + "s linear";
    timerFill.style.width = "0%";
  } else {
    timerEl.classList.add("hidden");
  }

  return new Promise((resolve) => {
    const buttons = [];
    for (const opt of shuffle(options)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-choice";
      btn.textContent = opt.t;
      btn.dataset.good = opt.good ? "1" : "0";
      btn.addEventListener("click", async () => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        timerEl.classList.add("hidden");
        for (const b of buttons) b.disabled = true;
        btn.classList.add(opt.good ? "picked-good" : "picked-bad");
        if (opt.good) SFX.good(); else SFX.bad();
        await wait(650);
        resolve({ good: opt.good, text: opt.t, reply: opt.r || null, inTime: true, timedOut: false });
      });
      choicesEl.appendChild(btn);
      buttons.push(btn);
    }

    if (timerSec) {
      timeoutId = setTimeout(async () => {
        if (settled) return;
        settled = true;
        timerFill.classList.add("late");
        for (const b of buttons) b.disabled = true;
        const goodBtn = buttons.find((b) => b.dataset.good === "1");
        if (goodBtn) goodBtn.classList.add("reveal-answer");
        SFX.bad();
        await wait(900);
        timerEl.classList.add("hidden");
        resolve({ good: false, text: null, reply: null, inTime: false, timedOut: true });
      }, timerSec * 1000);
    }
  });
}
function note(title) {
  promptTitle.textContent = title;
  choicesEl.innerHTML = "";
  timerEl.classList.add("hidden");
}

// Build 1 good + (n) bad options from a {good, bad} pool, keeping each
// option's paired guest reaction.
function mix(pool, badCount) {
  const g = pick(pool.good);
  const opts = [{ t: g.t, r: g.r, good: true }];
  for (const b of pickN(pool.bad, badCount)) opts.push({ t: b.t, r: b.r, good: false });
  return opts;
}

// --- Menu questions: 4 options, harder for each guest ---------------------
const EXTRAS_POOL = [...new Set(ING["Mix-ins"].concat(ING["Toppings"]))];

function extrasOf(r) {
  return r.items["Mix-ins"].concat(r.items["Toppings"]);
}
function qSauceProtein() {
  const r = pick(RECIPES);
  const useSauce = rand() < 0.5;
  const cat = useSauce ? "Sauce" : "Protein";
  const correct = r.items[cat][0];
  const wrongs = pickN(ING[cat].filter((n) => !r.items[cat].includes(n)), 3);
  return {
    recipe: r, correct,
    text: useSauce
      ? `Quick question: what sauce comes on the ${r.name}?`
      : `Quick question: which protein is in the ${r.name}?`,
    options: [{ t: correct, good: true }].concat(wrongs.map((t) => ({ t, good: false }))),
  };
}
function qContains() {
  const r = pick(RECIPES);
  const inside = extrasOf(r);
  const correct = pick(inside);
  const wrongs = pickN(EXTRAS_POOL.filter((n) => !inside.includes(n)), 3);
  return {
    recipe: r, correct,
    text: `Which of these actually comes in the ${r.name}?`,
    options: [{ t: correct, good: true }].concat(wrongs.map((t) => ({ t, good: false }))),
  };
}
function qHowMany() {
  const r = pick(RECIPES);
  const n = r.items["Mix-ins"].length;
  const decoys = [n - 1, n + 1, n + 2].filter((x) => x > 0 && x !== n).slice(0, 3);
  return {
    recipe: r, correct: String(n),
    text: `How many mix-ins come in the ${r.name}?`,
    options: [{ t: String(n), good: true }].concat(decoys.map((d) => ({ t: String(d), good: false }))),
  };
}
function qNot() {
  const r = pick(RECIPES);
  const inside = extrasOf(r);
  const reals = pickN(inside, 3);
  const imposter = pick(EXTRAS_POOL.filter((n) => !inside.includes(n)));
  return {
    recipe: r, correct: imposter,
    text: `Tricky one: which of these is NOT in the ${r.name}?`,
    options: [{ t: imposter, good: true }].concat(reals.map((t) => ({ t, good: false }))),
  };
}
function qReverse() {
  for (const cat of shuffle(["Sauce", "Protein"])) {
    const count = {};
    for (const rec of RECIPES) for (const n of rec.items[cat]) count[n] = (count[n] || 0) + 1;
    const uniques = Object.keys(count).filter((n) => count[n] === 1);
    if (uniques.length) {
      const ingr = pick(uniques);
      const owner = RECIPES.find((rec) => rec.items[cat].includes(ingr));
      const others = pickN(RECIPES.filter((rec) => rec !== owner), 3);
      return {
        recipe: owner, correct: owner.name,
        text: `Which bowl comes with ${ingr}?`,
        options: [{ t: owner.name, good: true }].concat(others.map((o) => ({ t: o.name, good: false }))),
      };
    }
  }
  return qNot();
}
function qTotal() {
  const r = pick(RECIPES);
  const n = extrasOf(r).length;
  const decoys = [n - 2, n - 1, n + 1, n + 2].filter((x) => x > 0 && x !== n);
  return {
    recipe: r, correct: String(n),
    text: `Counting mix-ins AND toppings, how many extras come on the ${r.name}?`,
    options: [{ t: String(n), good: true }].concat(pickN(decoys, 3).map((d) => ({ t: String(d), good: false }))),
  };
}
function qCommon() {
  for (let tries = 0; tries < 6; tries++) {
    const [a, b2] = pickN(RECIPES, 2);
    const setA = new Set(extrasOf(a));
    const setB = new Set(extrasOf(b2));
    const common = [...setA].filter((x) => setB.has(x));
    const onlyOne = [...new Set([...setA, ...setB])].filter((x) => !(setA.has(x) && setB.has(x)));
    const outsiders = EXTRAS_POOL.filter((x) => !setA.has(x) && !setB.has(x));
    const wrongPool = onlyOne.concat(outsiders);
    if (common.length && wrongPool.length >= 3) {
      const correct = pick(common);
      return {
        recipe: a, correct,
        text: `Which ingredient do the ${a.name} and the ${b2.name} BOTH have?`,
        options: [{ t: correct, good: true }].concat(pickN(wrongPool, 3).map((t) => ({ t, good: false }))),
      };
    }
  }
  return qNot();
}
function menuQuestion(level) {
  const pools = {
    1: [qSauceProtein, qContains],
    2: [qContains, qHowMany, qNot],
    3: [qNot, qReverse, qTotal, qCommon],
  };
  return pick(pools[Math.min(3, Math.max(1, level))])();
}

// --- Random events --------------------------------------------------------
// The health inspector's spot-check pool: one right way, three write-ups.
const INSPECTOR_QUIZ = [
  { text: "You just handled raw salmon. What now?", options: [
    { t: "Wash hands and change gloves", good: true },
    { t: "Wipe hands on the apron", good: false },
    { t: "Give the gloves a quick rinse", good: false },
    { t: "Keep going, it's all fish anyway", good: false },
  ] },
  { text: "Where does raw protein live in the fridge?", options: [
    { t: "Sealed, on the bottom shelf", good: true },
    { t: "Top shelf, easy to reach", good: false },
    { t: "Wherever there's room", good: false },
    { t: "Next to the toppings", good: false },
  ] },
  { text: "A guest mentions a shellfish allergy. You…", options: [
    { t: "Fresh gloves, clean utensils, flag the order", good: true },
    { t: "Scoop around the shrimp carefully", good: false },
    { t: "Tell them they can pick it out", good: false },
    { t: "Nothing, the shrimp is cooked", good: false },
  ] },
  { text: "The rice is past its hold time. You…", options: [
    { t: "Toss it and start a fresh batch", good: true },
    { t: "Give it a stir and keep serving", good: false },
    { t: "Taste it, seems fine", good: false },
    { t: "Crank the warmer up", good: false },
  ] },
];

// `minRank` gates events behind career progress; `usesExtra` marks events that
// borrow the extra actor (skipped when the District Manager is on the floor).
const EVENTS = {
  spill: {
    when: "before",
    async run() {
      SFX.crash();
      await say(custBubble, pick(["Oh no, someone spilled a drink!", "Whoa, watch out, there's a spill!"]), 1400);
      const r = await ask("A drink spills near the counter!", [
        { t: "Grab the mop and a wet-floor sign", good: true, r: "Nice save. Very professional!" },
        { t: "(Someone else will get it)", good: false, r: "So the puddle just... lives here now?" },
        { t: "Toss one napkin at it from here", good: false, r: "One napkin is not going to cut it." },
        { t: "“Careful, everyone!” and keep working", good: false, r: "Warning us is not the same as mopping..." },
      ], cfg().qSecs);
      if (r.good) await say(empBubble, "All cleaned up. Sorry about that!", 1200);
      await say(custBubble, r.timedOut ? "Someone is going to slip on that..." : r.reply, 1200);
      return r;
    },
    label: "Handled the spill quickly",
  },
  phone: {
    when: "before",
    async run() {
      SFX.ring();
      await say(empBubble, "*ring ring*", 900);
      const r = await ask("The store phone rings mid-order.", [
        { t: "“Excuse me one moment,” then answer politely", good: true, r: "No problem, take your time!" },
        { t: "(Let it ring forever)", good: false, r: "Are you... going to get that?" },
        { t: "Answer it and chat for five minutes", good: false, r: "...I'm still standing right here." },
        { t: "(Unplug the phone)", good: false, r: "Did you just unplug the phone?!" },
      ], cfg().qSecs);
      if (!r.good) moodDown();
      await say(custBubble, r.timedOut ? "That ringing is driving me crazy." : r.reply, 1100);
      return r;
    },
    label: "Handled the phone professionally",
  },
  walkin: {
    when: "before",
    usesExtra: true,
    async run() {
      extraStick.innerHTML = stickmanSVG(pick(CUST_SHIRTS), "ok");
      extraWrap.classList.remove("hidden");
      await enterDoor(extraWrap);
      walkTo(extraWrap, SPOT.wait, 1400);
      const r = await ask("Another guest walks in while you're busy. Quick!", [
        { t: "“Welcome in! I'll be right with you!”", good: true, r: "No rush, just picking up!" },
        { t: "(Don't look up)", good: false, r: "Um... hello? Anyone?" },
        { t: "“There's a line. Wait.”", good: false, r: "...There are only two of us here." },
        { t: "(Groan audibly)", good: false, r: "Wow. Charming place." },
      ], cfg().walkinSecs);
      doorEl.classList.remove("open");
      // The reaction comes from the guest who just walked in.
      await say(extraBubble, r.timedOut ? "Guess I'll just... stand here, then." : r.reply, 1200);
      return r;
    },
    label: "Acknowledged the waiting guest",
  },
  rushpair: {
    when: "before",
    minRank: 2,
    usesExtra: true,
    async run() {
      extraStick.innerHTML = stickmanSVG(pick(CUST_SHIRTS), "ok");
      extraWrap.classList.remove("hidden");
      await enterDoor(extraWrap);
      walkTo(extraWrap, SPOT.wait, 1200);
      await say(extraBubble, "Hi! There's two of us, two orders!", 1300);
      const r = await ask("A PAIR walks in mid-order. Triage!", [
        { t: "“Welcome in! I'll take you both right after this bowl.”", good: true, r: "Perfect. We'll browse the menu!" },
        { t: "Try juggling all three orders at once", good: false, r: "You're already mixing our bowls up..." },
        { t: "“Can you two come back in ten?”", good: false, r: "Come BACK? We just walked in." },
        { t: "(Avoid eye contact until they sort themselves out)", good: false, r: "We can see you seeing us." },
      ], cfg().walkinSecs + 1);
      await say(extraBubble, r.timedOut ? "Are we invisible? Seriously?" : r.reply, 1200);
      await exitDoor(extraWrap, 1000);
      extraWrap.classList.add("hidden");
      return r;
    },
    label: "Triaged the two-guest rush",
  },
  inspector: {
    when: "before",
    minRank: 2,
    usesExtra: true,
    pts: 3,
    async run() {
      extraStick.innerHTML = stickmanSVG("#8a97a5", "warn");
      extraWrap.classList.remove("hidden");
      await enterDoor(extraWrap);
      await walkTo(extraWrap, SPOT.wait, 1200);
      await say(extraBubble, "Health inspector. One spot-check question.", 1400);
      const quiz = pick(INSPECTOR_QUIZ);
      const r = await ask(quiz.text, quiz.options, cfg().qSecs);
      await say(
        extraBubble,
        r.good ? pick(["Textbook. This place runs tight.", "Correct. Carry on!"]) :
        r.timedOut ? "Silence is NOT an answer on my form." :
        "Hmm. That's going on the report.",
        1400
      );
      await exitDoor(extraWrap, 1000);
      extraWrap.classList.add("hidden");
      return r;
    },
    label: "Passed the health inspector's spot check",
  },
  complaint: {
    when: "after",
    async run() {
      custMood("warn");
      const gripe = pick(["no onions", "extra sauce"]);
      await say(custBubble, gripe === "no onions" ? "Wait, I asked for no onions!" : "Hold on, I asked for extra sauce...", 1400);
      const r = await ask("They found a mistake in the bowl!", [
        { t: "“So sorry! I'll remake that right away.”", good: true, r: "Wow, that was fast. Thank you!" },
        { t: "“No refunds.”", good: false, r: "It's YOUR mistake and there are no refunds?!" },
        { t: "(Shrug)", good: false, r: "Did you seriously just shrug at me?" },
        { t: "“Are you sure you ordered that?”", good: false, r: "YES, I know what I ordered!" },
      ], cfg().qSecs);
      if (r.good) moodUp();
      else custMood("mad");
      await say(custBubble, r.timedOut ? "Hello?! My bowl is wrong!" : r.reply, 1200);
      return r;
    },
    label: "Recovered from a mistake",
  },
  influencer: {
    when: "before",
    minRank: 1,
    usesExtra: true,
    async run() {
      extraStick.innerHTML = stickmanSVG("#e8709b", "ok");
      extraWrap.classList.remove("hidden");
      await enterDoor(extraWrap);
      walkTo(extraWrap, SPOT.wait, 1300);
      await say(extraBubble, "Hiii! Food blogger here. Can I grab a quick pic of the line? 📸", 1500);
      const r = await ask("An influencer wants a photo mid-order.", [
        { t: "“Of course! One second while I finish this bowl.”", good: true, r: "Love it. You're going on the story!" },
        { t: "(Pose mid-scoop and drop the toppings)", good: false, r: "Um. That fell right in the sauce." },
        { t: "“No photos. Ever.”", good: false, r: "Deleting my five-star review as we speak." },
        { t: "(Duck behind the counter)", good: false, r: "Are they... hiding from me?" },
      ], cfg().qSecs);
      await say(extraBubble, r.timedOut ? "Okaaay, posting 'staff ignored me'..." : r.reply, 1300);
      await exitDoor(extraWrap, 1000);
      extraWrap.classList.add("hidden");
      return r;
    },
    label: "Handled the photo op gracefully",
  },
  allergy: {
    when: "before",
    pts: 3,
    async run() {
      custMood("warn");
      await say(custBubble, "Oh wait, I'm allergic to sesame. Is that a problem?", 1500);
      const r = await ask("The guest mentions an allergy!", [
        { t: "“Thanks for telling me! Fresh gloves and a clean scoop.”", good: true, r: "Oh good. That's so reassuring." },
        { t: "“It's probably fine.”", good: false, r: "PROBABLY?!" },
        { t: "(Pick the sesame seeds out by hand)", good: false, r: "That's... not how allergies work." },
        { t: "“The sauce hides the taste anyway.”", good: false, r: "The TASTE is not the problem!" },
      ], cfg().qSecs);
      if (r.good) moodUp();
      else custMood("mad");
      await say(custBubble, r.timedOut ? "So... is that a yes on the sesame?" : r.reply, 1300);
      return r;
    },
    label: "Took the allergy seriously",
  },
  smalltalk: {
    when: "before",
    async run() {
      await say(custBubble, pick([
        "...so anyway, that's when my cat learned to open the fridge...",
        "...and THAT'S why I'm never allowed back at that karaoke bar...",
      ]), 1700);
      const r = await ask("They're deep into a story. What do you do?", [
        { t: "Listen and react warmly", good: true, r: null },
        { t: "(Walk away mid-sentence)", good: false, r: "...And they just walked off. Nice." },
        { t: "“Is this going anywhere?”", good: false, r: "Well, EXCUSE me for sharing." },
        { t: "“Cool cool cool.” (Look at the door)", good: false, r: "You're not even listening, are you?" },
      ], cfg().qSecs);
      if (r.good) {
        await say(empBubble, pick(["No way. Through the child lock?!", "Stop, that's incredible."]), 1300);
        await say(custBubble, "Right?! You get it.", 1000);
      } else {
        moodDown();
        await say(custBubble, r.timedOut ? "...You zoned out completely, didn't you?" : r.reply, 1100);
      }
      return r;
    },
    label: "Stayed engaged with the guest",
  },
};

// --- One guest's visit ------------------------------------------------------
async function runGuest(idx, personaKey) {
  const P = PERSONALITIES[personaKey];
  const isShopper = shopperSet.has(idx);
  const dine = rand() < P.dineChance;
  const meta = { label: P.label, dine, shopper: isShopper, leftEarly: false };
  guestMeta.push(meta);

  // Strike tracking: normal guests walk out on repeated misses or silence.
  let strikes = 0;
  let silences = 0;
  const logged = new Set();
  // The Critic's visit counts double on the audit sheet.
  const ptsMult = personaKey === "critic" ? 2 : 1;
  const put = (key, got, ptsOverride, labelOverride) => {
    const def = ITEMDEF[key];
    const pts = (ptsOverride != null ? ptsOverride : (def ? def.pts : 2)) * ptsMult;
    const label = labelOverride || (def ? def.label(P.greetSecs) : key);
    log(idx, key, pts, got, label);
    logged.add(key);
  };
  const track = (res) => {
    if (res.timedOut) { strikes++; silences++; }
    else if (!res.good) { strikes++; silences = 0; }
    else silences = 0;
    return res;
  };
  const fedUp = () => !isShopper && (strikes >= STRIKES_TO_LEAVE || silences >= SILENCE_TO_LEAVE);

  // Fresh guest, waiting unseen in the doorway.
  custShirt = pick(CUST_SHIRTS);
  custSitting = false;
  custWrap.classList.remove("sitting");
  custMood(personaKey === "grumpy" ? "warn" : "ok");
  custWrap.classList.add("offstage");
  placeAt(custWrap, SPOT.door);
  hush();

  // The District Manager may be observing this guest (Store Manager rank up).
  const corporate = idx === corporateIdx;

  // Event pool: rank-gated, chatty guests always ramble, and extra-actor
  // events stand down while the District Manager has the floor.
  const eventKey = personaKey === "chatty"
    ? "smalltalk"
    : pick(Object.keys(EVENTS).filter((k) => {
        const ev = EVENTS[k];
        if (k === "smalltalk") return false;
        if ((ev.minRank || 0) > shiftRank) return false;
        if (ev.usesExtra && corporate) return false;
        return true;
      }));
  const event = EVENTS[eventKey];

  // Storms out mid-visit: mark everything not yet logged as missed.
  const stormOut = async () => {
    meta.leftEarly = true;
    for (const key of CORE_ORDER) if (!logged.has(key)) put(key, false);
    if (dine && !logged.has("dining")) put("dining", false);
    if (corporate && !logged.has("corporate")) put("corporate", false, 4, "Flawless under corporate's eye");
    custMood("mad");
    SFX.storm();
    note("They've had enough…");
    await say(custBubble, pick(LEAVE_LINES), 1400);
    doorEl.classList.add("open");
    await walkTo(custWrap, SPOT.door, 1300);
    custWrap.classList.add("offstage");
    if (!extraWrap.classList.contains("hidden")) {
      // the waiting guest bails too
      await walkTo(extraWrap, SPOT.door, 900);
      extraWrap.classList.add("offstage");
      extraWrap.classList.add("hidden");
    }
    await wait(300);
    doorEl.classList.remove("open");
    hush();
  };

  // The District Manager arrives first and posts up to watch the whole visit.
  if (corporate) {
    note("The District Manager just walked in…");
    extraStick.innerHTML = stickmanSVG("#5a6770", "warn");
    extraWrap.classList.remove("hidden");
    await enterDoor(extraWrap);
    await walkTo(extraWrap, SPOT.wait, 1400);
    await say(extraBubble, "Corporate visit. Pretend I'm not here.", 1500);
  }

  note(`Guest ${idx + 1} of ${shiftGuests} is arriving…`);
  await wait(500);

  // 1-2. They come in through the door, then greet fast + warm.
  await enterDoor(custWrap);
  walkTo(custWrap, SPOT.greet, 2000);
  if (personaKey === "rush") say(custBubble, "In a hurry, sorry!", 1400);
  else if (personaKey === "critic") say(custBubble, "I review restaurants. Impress me.", 1500);
  else if (personaKey === "regular") say(custBubble, "Aloha! It's me again!", 1400);
  const greet = track(await ask(
    personaKey === "rush" ? "A customer rushes in. Quick!" : "A customer just walked in!",
    mix(GREETS, 3),
    P.greetSecs
  ));
  doorEl.classList.remove("open");
  put("greetFast", greet.good && greet.inTime);
  put("greetWarm", greet.good);
  if (greet.good) {
    await say(empBubble, greet.text.replace(/[“”]/g, ""), 1100);
    moodUp();
    if (greet.reply) await say(custBubble, greet.reply, 1000);
  } else {
    moodDown();
    await say(custBubble, greet.timedOut ? TIMEOUT_LINE.greet : (greet.reply || "...hello?"), 1000);
  }
  if (fedUp()) return stormOut();

  note("They're heading to the counter…");
  await walkTo(custWrap, SPOT.counter, 1400);

  // 3. Pleasant greeting before the order.
  await say(custBubble, personaKey === "rush" ? "Hi, I'd like to order. Fast!" : "Hi, I'd like to order.", 1200);
  const pre = track(await ask("Take their order. How do you start?", mix(PREORDER, 3), cfg().qSecs));
  put("preOrder", pre.good);
  if (pre.good) {
    if (pre.reply) await say(custBubble, pre.reply, 1000);
  } else {
    moodDown();
    await say(custBubble, pre.timedOut ? TIMEOUT_LINE.preOrder : (pre.reply || "..."), 1000);
  }
  if (fedUp()) return stormOut();

  // 4. First time visiting?
  const ft = track(await ask("Anything to ask before the order?", mix(FIRSTTIME, 3), cfg().qSecs));
  put("firstTime", ft.good);
  if (ft.good) await say(custBubble, pick(FIRSTTIME_REPLIES), 1200);
  else if (ft.timedOut) { moodDown(); await say(custBubble, TIMEOUT_LINE.firstTime, 1000); }
  else if (ft.reply) { moodDown(); await say(custBubble, ft.reply, 1000); }
  if (fedUp()) return stormOut();

  // 5. Menu knowledge. The Regular tests your MEMORY instead: their "usual"
  // is the first bowl made this shift. The Critic always grills at level 3.
  const usualTest = personaKey === "regular" && shiftOrders.length > 0;
  let q;
  if (usualTest) {
    const usual = shiftOrders[0];
    q = {
      recipe: usual,
      correct: usual.name,
      text: "I'll have the usual! You remember my bowl, right?",
      options: [{ t: usual.name, good: true }]
        .concat(pickN(RECIPES.filter((r) => r.name !== usual.name), 3).map((r) => ({ t: r.name, good: false }))),
    };
  } else {
    q = menuQuestion(personaKey === "critic" ? 3 : qLevel(idx));
  }
  shiftOrders.push(q.recipe);
  await say(custBubble, q.text, 1600);
  const mk = track(await ask(
    usualTest ? "Their usual is the FIRST bowl you made this shift…" : q.text,
    q.options,
    cfg().menuSecs
  ));
  put("menuKnow", mk.good, usualTest ? 5 : null, usualTest ? "Remembered the regular's usual" : null);
  if (mk.good) {
    moodUp();
    await say(custBubble, usualTest ? "That's the one! Best service in town." : pick([
      `Exactly! ${q.correct} it is. One ${q.recipe.name}, please!`,
      `Yep, ${q.correct}! You know your menu. I'll take the ${q.recipe.name}.`,
      `Right on. Okay, one ${q.recipe.name} for me!`,
    ]), 1500);
  } else {
    moodDown();
    await say(custBubble, mk.timedOut
      ? `Uh, hello? Anyway... one ${q.recipe.name}, please.`
      : usualTest
        ? `It's the ${q.correct}! I order it every single time...`
        : `It's actually ${q.correct}... I'll still take a ${q.recipe.name}.`, 1500);
  }
  if (fedUp()) return stormOut();

  // 6. Upsell.
  const up = track(await ask("They've picked their bowl. Anything else?", mix(UPSELL, 3), cfg().qSecs));
  put("upsell", up.good);
  if (up.timedOut) { moodDown(); await say(custBubble, TIMEOUT_LINE.upsell, 1000); }
  else if (up.reply) { if (!up.good) moodDown(); await say(custBubble, up.reply, 1100); }
  if (fedUp()) return stormOut();

  // 7. Rewards / app.
  const rw = track(await ask("Before ringing them up…", mix(REWARDS, 3), cfg().qSecs));
  put("rewards", rw.good);
  if (rw.timedOut) { moodDown(); await say(custBubble, TIMEOUT_LINE.rewards, 1000); }
  else if (rw.reply) { if (!rw.good) moodDown(); await say(custBubble, rw.reply, 1100); }
  if (fedUp()) return stormOut();

  // Surprise event (pre-serve ones fire here).
  if (event.when === "before") {
    const er = track(await event.run());
    put(eventKey, er.good, event.pts || 2, event.label);
    if (fedUp()) return stormOut();
  }

  // 8. Make the order fast.
  const made = await scoopStage(q.recipe, P.scoopSecs);
  put("fastOrder", made);
  if (made) {
    SFX.serve();
    await say(empBubble, `Order up! One ${q.recipe.name}!`, 1200);
  } else {
    moodDown();
    await say(custBubble, pick(REPLY_SLOW), 1200);
  }

  // The pickup guest grabs their order and heads out before anything else.
  if (eventKey === "walkin" && !extraWrap.classList.contains("hidden")) {
    say(extraBubble, "Got my pickup. Thanks!", 1000);
    await wait(300);
    await exitDoor(extraWrap, 1200);
    extraWrap.classList.add("hidden");
  }

  // Post-serve event (complaint).
  if (event.when === "after") {
    const er = track(await event.run());
    put(eventKey, er.good, event.pts || 2, event.label);
    if (fedUp()) return stormOut();
  }

  // 9. Parting comment.
  const part = track(await ask("Hand it over and say goodbye:", mix(PARTING, 3), cfg().qSecs));
  put("parting", part.good);
  if (part.good) {
    moodUp();
    if (part.reply) await say(custBubble, part.reply, 1000);
  } else {
    moodDown();
    await say(custBubble, part.timedOut ? TIMEOUT_LINE.parting : (part.reply || "..."), 1000);
  }

  // 10. Dine in (they sit down at the table) or leave (takeout).
  if (dine) {
    note("They're sitting down in the dining room…");
    await walkTo(custWrap, SPOT.table, 1700);
    setSitting(true);
    await wait(350);
    const dr = await ask("They're dining in. What do you do?", mix(DINING, 3), cfg().qSecs);
    put("dining", dr.good);
    if (!dr.good && dr.reply) await say(custBubble, dr.reply, 1100);
    if (dr.good) {
      note("Checking in on their table…");
      await walkTo(empWrap, SPOT.tableTalk, 1400);
      await say(empBubble, "How is everything?", 1200);
      moodUp();
      await say(custBubble, pick(REPLY_TABLE), 1200);
      await walkTo(empWrap, 74, 1400);
    }
    note("They're finishing up…");
    await wait(500);
    setSitting(false);
    await exitDoor(custWrap, 900);
  } else {
    note("They're taking it to go…");
    SFX.bell();
    await exitDoor(custWrap, 1600);
  }

  // The District Manager delivers the verdict once the guest is gone.
  if (corporate) {
    put("corporate", strikes === 0, 4, "Flawless under corporate's eye");
    await say(extraBubble, strikes === 0
      ? "Not a single slip. HQ will hear about this."
      : "We'll talk about what I saw. Later.", 1600);
    await exitDoor(extraWrap, 1100);
    extraWrap.classList.add("hidden");
  }
  hush();
}

// Tap-to-scoop stage.
function scoopStage(recipe, secs) {
  const NEED = 6;
  return new Promise((resolve) => {
    promptTitle.textContent = `Make the ${recipe.name}: tap Scoop, fast!`;
    choicesEl.innerHTML = "";

    const prog = document.createElement("div");
    prog.className = "ss-scoop-prog";
    const segs = [];
    const segColors = ["#c9a97a", "#ee435b", "#4caf72", "#fd9f27", "#22b2b4", "#7c5cff"];
    for (let i = 0; i < NEED; i++) {
      const s = document.createElement("i");
      s.style.setProperty("--seg", segColors[i]);
      prog.appendChild(s);
      segs.push(s);
    }
    choicesEl.appendChild(prog);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ss-choice ss-scoop-btn";
    btn.id = "ss-scoop";
    btn.dataset.good = "1";
    btn.textContent = "Scoop!";
    choicesEl.appendChild(btn);

    timerEl.classList.remove("hidden");
    timerFill.style.transition = "none";
    timerFill.style.width = "100%";
    timerFill.classList.remove("late");
    void timerFill.offsetWidth;
    timerFill.style.transition = "width " + secs + "s linear";
    timerFill.style.width = "0%";

    let count = 0;
    let done = false;
    const timeoutId = setTimeout(() => {
      if (done) return;
      done = true;
      btn.disabled = true;
      timerEl.classList.add("hidden");
      SFX.bad();
      resolve(false);
    }, secs * 1000);

    btn.addEventListener("click", () => {
      if (done) return;
      SFX.scoop();
      segs[count].classList.add("full");
      count++;
      if (count >= NEED) {
        done = true;
        clearTimeout(timeoutId);
        btn.disabled = true;
        timerEl.classList.add("hidden");
        resolve(true);
      }
    });
  });
}

// --- The shift ----------------------------------------------------------
async function runShift(exam) {
  if (running) return;
  if (isDailyRun && Daily.isDone()) return; // one attempt a day
  if (window.PokeStreak) PokeStreak.mark();
  if (window.PokeTrack) PokeTrack.hit(isDailyRun ? "daily" : "play", "ss");
  running = true;
  audit = [];
  guestMeta = [];
  if (isDailyRun) {
    rand = Daily.stream("ss:shift");
    examMode = false;
    shiftRank = DAILY_RANK;
  } else {
    rand = Math.random;
    examMode = !!exam && examReady();
    shiftRank = Math.min(career.rank + (examMode ? 1 : 0), RANKS.length - 1);
  }
  const R = cfg();
  shiftGuests = R.guests;
  shopperSet = new Set();
  while (shopperSet.size < Math.min(R.shoppers, shiftGuests)) {
    shopperSet.add(Math.floor(rand() * shiftGuests));
  }

  empStick.innerHTML = stickmanSVG("#ee435b", "ok");
  placeAt(empWrap, 74);
  extraWrap.classList.add("hidden");
  extraWrap.classList.remove("offstage");
  doorEl.classList.remove("open");
  overlay.classList.add("hidden");
  scorecardEl.classList.add("hidden");
  hush();

  if (examMode) {
    note(`📋 PROMOTION EXAM: score ${EXAM_PASS_PCT}%+ to make ${R.name}.`);
    await wait(2000);
  }

  // At Store Manager and up, the District Manager sometimes drops in to
  // observe one guest's visit from start to finish.
  shiftOrders = [];
  corporateIdx = shiftRank >= 4 && rand() < 0.35
    ? Math.floor(rand() * shiftGuests)
    : -1;

  // Shifts can outnumber the personality pool, so repeats are allowed —
  // shuffle the rank-unlocked pool and cycle through it.
  const pool = shuffle(Object.keys(PERSONALITIES).filter((k) => PERSONALITIES[k].minRank <= shiftRank));
  const cast = [];
  for (let i = 0; i < shiftGuests; i++) cast.push(pool[i % pool.length]);
  // The Regular's memory test needs an earlier order to remember.
  if (cast[0] === "regular") [cast[0], cast[1]] = [cast[1], cast[0]];
  for (let i = 0; i < shiftGuests; i++) {
    await runGuest(i, cast[i]);
    if (i < shiftGuests - 1) {
      note("Next guest incoming…");
      await wait(1000);
    }
  }
  finishShift();
}

// --- Scorecard ----------------------------------------------------------
function finishShift() {
  running = false;
  let earned = 0;
  let total = 0;
  auditRows.innerHTML = "";

  for (let g = 0; g < shiftGuests; g++) {
    const rows = audit.filter((a) => a.guest === g);
    let gEarned = 0;
    let gTotal = 0;
    for (const a of rows) {
      gTotal += a.pts;
      if (a.got) gEarned += a.pts;
    }
    earned += gEarned;
    total += gTotal;

    const meta = guestMeta[g] || { label: "?", dine: false };
    // Lifetime career stats, per guest.
    if (meta.leftEarly) career.stats.stormOuts++;
    if (gTotal > 0 && gEarned === gTotal) career.stats.perfectGuests++;
    if (meta.shopper && !meta.leftEarly && gTotal > 0 && gEarned / gTotal >= 0.8) career.stats.shoppersImpressed++;
    const bits = [`Guest ${g + 1} · ${meta.label} · ${meta.dine ? "Dine-in" : "Takeout"}`];
    if (meta.shopper) bits.push("🕵️ the secret shopper");
    if (meta.leftEarly) bits.push("stormed out");
    const head = document.createElement("div");
    head.className = "ss-audit-cust";
    head.innerHTML = `<span>${bits.join(" · ")}</span><span>${gEarned}/${gTotal}</span>`;
    auditRows.appendChild(head);

    for (const a of rows) {
      const row = document.createElement("div");
      row.className = "ss-audit-row" + (a.got ? " got" : " missed");
      row.innerHTML =
        `<span class="ss-audit-mark">${a.got ? "✓" : "✗"}</span>` +
        `<span class="ss-audit-label">${a.label}</span>` +
        `<span class="ss-audit-pts">${a.got ? a.pts : 0}/${a.pts}</span>`;
      auditRows.appendChild(row);
    }
  }

  const pct = total ? Math.round((earned / total) * 100) : 0;
  auditHeader.textContent =
    `${isDailyRun ? "DAILY CHALLENGE · " : examMode ? "PROMOTION EXAM · " : ""}HOSPITALITY ${pct}% (${earned}/${total})`;

  // Reputation: pct scaled by shift size, so bigger shifts pay more. A perfect
  // 3-guest shift = 100 rep; a perfect 6-guest shift = 200.
  const gain = Math.round((pct * shiftGuests) / 3);
  career.rep += gain;
  career.shifts += 1;
  let promoted = false;
  if (examMode) {
    if (pct >= EXAM_PASS_PCT) { career.rank++; promoted = true; }
    examMode = false;
  }
  saveCareer();

  gradeEl.textContent =
    promoted ? `Exam passed at ${pct}%. You're now ${RANKS[career.rank].name}.` :
    !isDailyRun && shiftRank > career.rank ? `Exam failed at ${pct}%. You needed ${EXAM_PASS_PCT}%. Your rep is safe, retake anytime.` :
    pct === 100 ? "A perfect audit." :
    pct >= 90 ? "Outstanding shift." :
    pct >= 80 ? "Great shift." :
    pct >= 60 ? "Decent, but the audit found some gaps." :
    pct >= 40 ? "Rough shift." :
    "Rough shift. The audit found a lot of gaps.";

  // Rep line: +gain, then the bar animates from where you were to where you
  // are within the current promotion window.
  const n = nextRank();
  const cur = RANKS[career.rank];
  const frac = (rep) => {
    if (!n) return 1;
    return Math.max(0, Math.min(1, (rep - cur.repNeed) / (n.repNeed - cur.repNeed)));
  };
  repGainEl.textContent = `+${gain} ★`;
  repNextEl.textContent =
    promoted ? `Now ${cur.badge} ${cur.name} · ${career.rep} ★` :
    !n ? `${career.rep} ★ · top of the ladder` :
    career.rep >= n.repNeed ? `Promotion exam unlocked: ${n.name}` :
    `${career.rep}/${n.repNeed} ★ to ${n.name}`;
  repLineFill.style.transition = "none";
  repLineFill.style.width = frac(career.rep - gain) * 100 + "%";
  void repLineFill.offsetWidth;
  repLineFill.style.transition = "width 1.1s ease";
  repLineFill.style.width = frac(career.rep) * 100 + "%";

  const prevBest = loadBestPct();
  if (pct > prevBest) saveBestPct(pct);
  showBest();

  if (window.PokeAch) {
    PokeAch.unlock("ss-first");
    if (pct >= 80) PokeAch.unlock("ss-pass");
    if (pct === 100) PokeAch.unlock("ss-perfect");
    if (guestMeta.every((m) => !m.leftEarly)) PokeAch.unlock("ss-noleave");
    if (promoted) {
      PokeAch.unlock("ss-promoted");
      if (pct === 100) PokeAch.unlock("ss-exam100");
    }
    // Rank milestones re-check every shift, so they can't be missed.
    if (career.rank >= 4) PokeAch.unlock("ss-manager");
    if (career.rank === RANKS.length - 1) PokeAch.unlock("ss-legend");
  }

  // A daily shift locks until tomorrow and offers a spot on the day's board.
  if (isDailyRun) {
    Daily.complete(pct);
    ssLbPending = pct;
    ssLbName.value = loadLbName();
    ssLbDone.classList.add("hidden");
    ssLbEntry.classList.remove("hidden");
  } else {
    ssLbEntry.classList.add("hidden");
    ssLbDone.classList.add("hidden");
  }

  if (pct === 100) SFX.fanfare();
  scorecardEl.classList.remove("hidden");
  scorecardEl.scrollTop = 0;
}

// --- Daily board submission (viewed on the hub) --------------------------
const ssLbEntry = document.getElementById("ss-lb-entry");
const ssLbDone = document.getElementById("ss-lb-done");
const ssLbName = document.getElementById("ss-lb-name");
const ssLbSave = document.getElementById("ss-lb-save");
const SS_NAME_KEY = "pokeworks-lb-name";
let ssLbPending = null; // today's pct awaiting a name

function loadLbName() {
  try { return localStorage.getItem(SS_NAME_KEY) || ""; } catch (e) { return ""; }
}
function saveLbName(n) {
  try { localStorage.setItem(SS_NAME_KEY, n); } catch (e) { /* ignore */ }
}
async function submitDailyName() {
  if (ssLbPending == null) return;
  const raw = (ssLbName.value || "").trim().slice(0, 12);
  const name = (window.PokeFilter ? PokeFilter.clean(raw) : raw) || "Anon";
  saveLbName(name);
  const score = ssLbPending;
  ssLbPending = null;
  ssLbSave.disabled = true;
  try {
    await Daily.submit(name, score);
  } catch (e) {
    /* the local mirror in Daily.submit already saved */
  }
  ssLbSave.disabled = false;
  ssLbEntry.classList.add("hidden");
  ssLbDone.classList.remove("hidden");
}

// --- Career card (start overlay) ----------------------------------------
function renderCareer() {
  const cur = RANKS[career.rank];
  const n = nextRank();
  rankBadgeEl.textContent = cur.badge;
  rankNameEl.textContent = cur.name;

  let fill = 1;
  if (n) fill = Math.max(0, Math.min(1, (career.rep - cur.repNeed) / (n.repNeed - cur.repNeed)));
  repFillEl.style.width = fill * 100 + "%";
  repLabelEl.textContent =
    !n ? `${career.rep} ★ · top of the ladder` :
    examReady() ? `Promotion exam unlocked: ${n.name}` :
    `${career.rep}/${n.repNeed} ★ to ${n.name}`;

  const s = career.stats;
  careerStatsEl.textContent = career.shifts === 0
    ? "Your career starts with the first shift."
    : `${career.shifts} shift${career.shifts === 1 ? "" : "s"} · best ${loadBestPct()}% · ` +
      `${s.shoppersImpressed} shopper${s.shoppersImpressed === 1 ? "" : "s"} impressed · ${s.perfectGuests} perfect guests`;

  overlaySub.textContent =
    `${cur.guests} guests are coming, and ` +
    (cur.shoppers > 1 ? `${cur.shoppers} of them are secret shoppers` : "one of them is the secret shopper") +
    ". You won't know which.";

  examBtn.classList.toggle("hidden", !examReady());
  if (n && examReady()) examBtn.textContent = `📋 Promotion Exam: ${n.name}`;
}

// Daily Challenge: launched as secret-shopper.html?daily=1. The career card
// gives way to the day's fixed shift, and there's one attempt.
function dailyOverlay() {
  const title = overlay.querySelector(".overlay-title");
  if (title) title.textContent = "🗓 Daily Challenge";
  examBtn.classList.add("hidden");
  const done = Daily.result();
  if (!Daily.isTodaysGame("ss")) {
    // Stale link — today's challenge is a different game.
    overlaySub.textContent =
      "Today's challenge is " + Daily.challenge().game.label + ". Head back to the hub for it.";
    startBtn.hidden = true;
  } else if (done) {
    overlaySub.textContent =
      "You've already played today: " + done.score + "%. Come back tomorrow.";
    startBtn.hidden = true;
  } else {
    const R = RANKS[DAILY_RANK];
    overlaySub.textContent =
      `Everyone works the same ${R.name} shift today: ${R.guests} guests, one of them ` +
      "the secret shopper. You get one attempt.";
    startBtn.hidden = false;
  }
}

// --- Wiring -------------------------------------------------------------
startBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); runShift(false); });
examBtn.addEventListener("click", () => { ensureAudio(); SFX.fanfare(); runShift(true); });
// The scorecard hands you back to the career card, where the next shift (or
// a promotion exam) begins. After a daily it shows the played-for-today state.
againBtn.addEventListener("click", () => {
  ensureAudio();
  scorecardEl.classList.add("hidden");
  renderCareer();
  if (isDailyRun) dailyOverlay();
  overlay.classList.remove("hidden");
});
ssLbSave.addEventListener("click", submitDailyName);
ssLbName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); submitDailyName(); }
});

// Initial paint
tableEl.innerHTML = tableSVG();
empStick.innerHTML = stickmanSVG("#ee435b", "ok");
custStick.innerHTML = stickmanSVG(custShirt, "ok");
custWrap.classList.add("offstage");
placeAt(custWrap, SPOT.door);
placeAt(empWrap, 74);
showBest();
renderCareer();
if (isDailyRun) dailyOverlay();
