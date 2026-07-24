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
const scorecardEl = document.getElementById("scorecard");
const auditHeader = document.getElementById("audit-header");
const auditRows = document.getElementById("audit-rows");
const gradeEl = document.getElementById("grade");
const againBtn = document.getElementById("again-btn");
const bestEl = document.getElementById("best");
const toastsEl = document.getElementById("toasts");

// --- Config ---------------------------------------------------------------
const GUESTS_PER_SHIFT = 3;
const BEST_KEY = "pokeworks-shopper-best";
const QUESTION_SECS = 7; // thinking time on regular prompts
const MENU_SECS = 9; // menu quizzes get a little longer to read
const WALKIN_SECS = 3; // a waiting guest wants acknowledging FAST
const STRIKES_TO_LEAVE = 3; // wrong answers before a normal guest storms out
const SILENCE_TO_LEAVE = 2; // consecutive timeouts before they give up on you
const SPOT = { door: 2, greet: 24, counter: 46, table: 10, tableTalk: 26, wait: 32 };
const CUST_SHIRTS = ["#22b2b4", "#fd9f27", "#7c5cff", "#39a85b", "#e8709b", "#4c7dd1"];

// Personalities change pacing, dialogue, and whether they dine in.
const PERSONALITIES = {
  friendly: { label: "Friendly", greetSecs: 5, scoopSecs: 8, dineChance: 0.65 },
  rush: { label: "In a rush", greetSecs: 3.5, scoopSecs: 6.5, dineChance: 0 },
  chatty: { label: "Chatty", greetSecs: 5, scoopSecs: 8, dineChance: 0.75 },
  grumpy: { label: "Grumpy", greetSecs: 4.5, scoopSecs: 7.5, dineChance: 0.5 },
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

// Review comment fragments, keyed by audit item.
const REVIEW_BAD = {
  greetFast: "Walked in and nobody said a word.",
  greetWarm: "The greeting was... not a greeting.",
  preOrder: "The counter person was kind of rude.",
  firstTime: "Zero warmth, no small talk at all.",
  menuKnow: "They don't even know their own menu.",
  upsell: "Service felt like a drive-thru.",
  rewards: "Never mentioned the rewards app.",
  fastOrder: "Waited forever for one bowl.",
  parting: "Not even a thank-you on the way out.",
  dining: "Nobody checked on our table.",
  spill: "There was a spill on the floor the whole visit.",
  phone: "They let the phone ring off the hook.",
  walkin: "Watched them ignore another guest.",
  complaint: "They got my order wrong and barely cared.",
  smalltalk: "They clearly weren't listening to me.",
};
const REVIEW_GOOD = {
  greetFast: "Greeted the second I walked in!",
  greetWarm: "So welcoming!",
  preOrder: "Super friendly at the counter.",
  firstTime: "They made me feel like a regular.",
  menuKnow: "They know the menu inside out.",
  upsell: "Great recommendations!",
  rewards: "Hooked me up with the rewards app.",
  fastOrder: "My bowl came out fast.",
  parting: "Sweetest goodbye.",
  dining: "They even checked on our table!",
  spill: "Handled a spill like a pro.",
  phone: "Juggled a phone call politely.",
  walkin: "Made sure everyone felt seen.",
  complaint: "Fixed a mixup instantly.",
  smalltalk: "Great conversation!",
};
const REVIEW_LEFT = [
  "Walked out before I even got my food. Never again.",
  "Three strikes and I was OUT of there.",
  "Couldn't get a single response out of them. Left.",
];

// --- State ------------------------------------------------------------------
let running = false;
let audit = []; // { guest, key, label, pts, got }
let guestMeta = []; // { label, dine, shopper, leftEarly } per guest
let shopperIdx = 0; // which guest is secretly the shopper
let custShirt = CUST_SHIRTS[0];
let custSitting = false;

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
  toast: () => { tone({ freq: 740, type: "sine", dur: 0.09, gain: 0.09 }); tone({ freq: 988, type: "sine", dur: 0.12, gain: 0.08, delay: 0.08 }); },
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
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
  const useSauce = Math.random() < 0.5;
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
      ], QUESTION_SECS);
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
      ], QUESTION_SECS);
      if (!r.good) moodDown();
      await say(custBubble, r.timedOut ? "That ringing is driving me crazy." : r.reply, 1100);
      return r;
    },
    label: "Handled the phone professionally",
  },
  walkin: {
    when: "before",
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
      ], WALKIN_SECS);
      doorEl.classList.remove("open");
      // The reaction comes from the guest who just walked in.
      await say(extraBubble, r.timedOut ? "Guess I'll just... stand here, then." : r.reply, 1200);
      return r;
    },
    label: "Acknowledged the waiting guest",
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
      ], QUESTION_SECS);
      if (r.good) moodUp();
      else custMood("mad");
      await say(custBubble, r.timedOut ? "Hello?! My bowl is wrong!" : r.reply, 1200);
      return r;
    },
    label: "Recovered from a mistake",
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
      ], QUESTION_SECS);
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

// --- Reviews ---------------------------------------------------------------
function starRow(n) {
  let s = "";
  for (let i = 1; i <= 5; i++) s += `<span class="${i <= n ? "on" : "off"}">★</span>`;
  return s;
}
function showReview(idx) {
  const meta = guestMeta[idx];
  const rows = audit.filter((a) => a.guest === idx);
  let earned = 0, total = 0;
  for (const a of rows) { total += a.pts; if (a.got) earned += a.pts; }
  const pct = total ? earned / total : 0;
  let stars, comment;

  if (meta.leftEarly) {
    stars = 0;
    comment = pick(REVIEW_LEFT);
  } else {
    stars = Math.max(0, Math.min(5, Math.round(pct * 5)));
    const gots = rows.filter((a) => a.got && REVIEW_GOOD[a.key]).map((a) => REVIEW_GOOD[a.key]);
    const misses = rows.filter((a) => !a.got && REVIEW_BAD[a.key]).map((a) => REVIEW_BAD[a.key]);
    if (stars >= 4) comment = pickN(gots, 2).join(" ") || "Lovely visit!";
    else if (stars <= 2) comment = pickN(misses, 2).join(" ") || "Not great.";
    else comment = ((pickN(gots, 1)[0] || "") + " But... " + (pickN(misses, 1)[0] || "")).trim();
  }

  const toast = document.createElement("div");
  toast.className = "ss-toast";
  toast.innerHTML =
    `<div class="ss-toast-head"><span>Guest ${idx + 1} left a review</span>` +
    `<span class="ss-toast-stars">${starRow(stars)}</span></div>` +
    `<div class="ss-toast-body">“${comment}”</div>`;
  toastsEl.appendChild(toast);
  SFX.toast();
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 400);
  }, 6500);
}

// --- One guest's visit ------------------------------------------------------
async function runGuest(idx, personaKey) {
  const P = PERSONALITIES[personaKey];
  const isShopper = idx === shopperIdx;
  const dine = Math.random() < P.dineChance;
  const meta = { label: P.label, dine, shopper: isShopper, leftEarly: false };
  guestMeta.push(meta);

  // Strike tracking: normal guests walk out on repeated misses or silence.
  let strikes = 0;
  let silences = 0;
  const logged = new Set();
  const put = (key, got, ptsOverride, labelOverride) => {
    const def = ITEMDEF[key];
    const pts = ptsOverride != null ? ptsOverride : (def ? def.pts : 2);
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

  const eventKey = personaKey === "chatty"
    ? "smalltalk"
    : pick(["spill", "phone", "walkin", "complaint"]);
  const event = EVENTS[eventKey];

  // Storms out mid-visit: mark everything not yet logged as missed.
  const stormOut = async () => {
    meta.leftEarly = true;
    for (const key of CORE_ORDER) if (!logged.has(key)) put(key, false);
    if (dine && !logged.has("dining")) put("dining", false);
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
    showReview(idx);
  };

  note(`Guest ${idx + 1} of ${GUESTS_PER_SHIFT} is arriving…`);
  await wait(500);

  // 1-2. They come in through the door, then greet fast + warm.
  await enterDoor(custWrap);
  walkTo(custWrap, SPOT.greet, 2000);
  if (personaKey === "rush") say(custBubble, "In a hurry, sorry!", 1400);
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
  const pre = track(await ask("Take their order. How do you start?", mix(PREORDER, 3), QUESTION_SECS));
  put("preOrder", pre.good);
  if (pre.good) {
    if (pre.reply) await say(custBubble, pre.reply, 1000);
  } else {
    moodDown();
    await say(custBubble, pre.timedOut ? TIMEOUT_LINE.preOrder : (pre.reply || "..."), 1000);
  }
  if (fedUp()) return stormOut();

  // 4. First time visiting?
  const ft = track(await ask("Anything to ask before the order?", mix(FIRSTTIME, 3), QUESTION_SECS));
  put("firstTime", ft.good);
  if (ft.good) await say(custBubble, pick(FIRSTTIME_REPLIES), 1200);
  else if (ft.timedOut) { moodDown(); await say(custBubble, TIMEOUT_LINE.firstTime, 1000); }
  else if (ft.reply) { moodDown(); await say(custBubble, ft.reply, 1000); }
  if (fedUp()) return stormOut();

  // 5. Menu knowledge, harder with each guest.
  const q = menuQuestion(idx + 1);
  await say(custBubble, q.text, 1600);
  const mk = track(await ask(q.text, q.options, MENU_SECS));
  put("menuKnow", mk.good);
  if (mk.good) {
    moodUp();
    await say(custBubble, pick([
      `Exactly! ${q.correct} it is. One ${q.recipe.name}, please!`,
      `Yep, ${q.correct}! You know your menu. I'll take the ${q.recipe.name}.`,
      `Right on. Okay, one ${q.recipe.name} for me!`,
    ]), 1500);
  } else {
    moodDown();
    await say(custBubble, mk.timedOut
      ? `Uh, hello? Anyway... one ${q.recipe.name}, please.`
      : `It's actually ${q.correct}... I'll still take a ${q.recipe.name}.`, 1500);
  }
  if (fedUp()) return stormOut();

  // 6. Upsell.
  const up = track(await ask("They've picked their bowl. Anything else?", mix(UPSELL, 3), QUESTION_SECS));
  put("upsell", up.good);
  if (up.timedOut) { moodDown(); await say(custBubble, TIMEOUT_LINE.upsell, 1000); }
  else if (up.reply) { if (!up.good) moodDown(); await say(custBubble, up.reply, 1100); }
  if (fedUp()) return stormOut();

  // 7. Rewards / app.
  const rw = track(await ask("Before ringing them up…", mix(REWARDS, 3), QUESTION_SECS));
  put("rewards", rw.good);
  if (rw.timedOut) { moodDown(); await say(custBubble, TIMEOUT_LINE.rewards, 1000); }
  else if (rw.reply) { if (!rw.good) moodDown(); await say(custBubble, rw.reply, 1100); }
  if (fedUp()) return stormOut();

  // Surprise event (pre-serve ones fire here).
  if (event.when === "before") {
    const er = track(await event.run());
    put(eventKey, er.good, 2, event.label);
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
    put(eventKey, er.good, 2, event.label);
    if (fedUp()) return stormOut();
  }

  // 9. Parting comment.
  const part = track(await ask("Hand it over and say goodbye:", mix(PARTING, 3), QUESTION_SECS));
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
    const dr = await ask("They're dining in. What do you do?", mix(DINING, 3), QUESTION_SECS);
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
  hush();
  showReview(idx);
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
async function runShift() {
  if (running) return;
  running = true;
  audit = [];
  guestMeta = [];
  shopperIdx = Math.floor(Math.random() * GUESTS_PER_SHIFT);
  toastsEl.innerHTML = "";

  empStick.innerHTML = stickmanSVG("#ee435b", "ok");
  placeAt(empWrap, 74);
  extraWrap.classList.add("hidden");
  extraWrap.classList.remove("offstage");
  doorEl.classList.remove("open");
  overlay.classList.add("hidden");
  scorecardEl.classList.add("hidden");
  ssLeaderboardEl.classList.add("hidden");
  ssLbEntry.classList.add("hidden");
  ssLbPending = null;
  hush();

  const cast = pickN(Object.keys(PERSONALITIES), GUESTS_PER_SHIFT);
  for (let i = 0; i < GUESTS_PER_SHIFT; i++) {
    await runGuest(i, cast[i]);
    if (i < GUESTS_PER_SHIFT - 1) {
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

  for (let g = 0; g < GUESTS_PER_SHIFT; g++) {
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
    const bits = [`Guest ${g + 1} · ${meta.label} · ${meta.dine ? "Dine-in" : "Takeout"}`];
    if (meta.shopper) bits.push("🕵️ the secret shopper!");
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
  auditHeader.textContent = `HOSPITALITY ${pct}% (${earned}/${total})`;

  gradeEl.textContent =
    pct === 100 ? "Perfect audit! The secret shopper is telling everyone about you." :
    pct >= 90 ? "Outstanding! Corporate is framing this one." :
    pct >= 80 ? "Great shift. The secret shopper left smiling." :
    pct >= 60 ? "Decent, but the audit found some gaps." :
    pct >= 40 ? "Rough shift. Time to reread the training binder." :
    "Yikes. Corporate wants a word…";

  const prevBest = loadBestPct();
  if (pct > prevBest) saveBestPct(pct);
  showBest();

  if (window.PokeAch) {
    PokeAch.unlock("ss-first");
    if (pct >= 80) PokeAch.unlock("ss-pass");
    if (pct === 100) PokeAch.unlock("ss-perfect");
    if (guestMeta.every((m) => !m.leftEarly)) PokeAch.unlock("ss-noleave");
  }

  // Offer a global leaderboard entry for the shift.
  ssLbNewName = null;
  ssLbPending = { pct: pct, pts: earned };
  ssLbNameInput.value = loadLbNameSaved();
  ssLbEntry.classList.remove("hidden");

  if (pct === 100) SFX.fanfare();
  scorecardEl.classList.remove("hidden");
  scorecardEl.scrollTop = 0;
}

// --- Global leaderboard (Supabase; local fallback) -----------------------
// Ranked by hospitality percent, then points earned. Falls back to a
// per-browser board when Supabase is unreachable or the table is missing.
const SBC = window.POKEWORKS_SUPABASE || {};
const useSupabase =
  !!SBC.url && !!SBC.anonKey && !/YOUR_/.test(SBC.url) && !/YOUR_/.test(SBC.anonKey);
function sbHeaders(extra) {
  return Object.assign({ apikey: SBC.anonKey, Authorization: "Bearer " + SBC.anonKey }, extra || {});
}

const SS_LB_LOCAL = "pokeworks-shopper-lb";
const NAME_KEY = "pokeworks-lb-name";
const SS_LB_MAX = 10;

const ssLeaderboardEl = document.getElementById("ss-leaderboard");
const ssLbList = document.getElementById("ss-lb-list");
const ssLbEntry = document.getElementById("ss-lb-entry");
const ssLbNameInput = document.getElementById("ss-lb-name");
const ssLbSaveBtn = document.getElementById("ss-lb-save");
const ssLbOpenBtn = document.getElementById("ss-lb-open");
const ssLbViewBtn = document.getElementById("ss-lb-view");
const ssLbBackBtn = document.getElementById("ss-lb-back");

let ssLbPending = null; // { pct, pts } awaiting a name
let ssLbNewName = null;

function betterAudit(a, b) {
  return a.pct !== b.pct ? a.pct > b.pct : a.pts > b.pts;
}
function sortAudits(list) {
  return list.slice().sort((x, y) => (x.pct !== y.pct ? y.pct - x.pct : y.pts - x.pts));
}
function dedupeAudits(list) {
  const seen = new Set();
  const out = [];
  for (const e of sortAudits(list)) {
    const k = String(e.name).trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}
function loadLocalAudits() {
  try { return JSON.parse(localStorage.getItem(SS_LB_LOCAL)) || []; } catch { return []; }
}
function saveLocalAudits(l) {
  try { localStorage.setItem(SS_LB_LOCAL, JSON.stringify(l)); } catch { /* ignore */ }
}
function addLocalAudit(name, pct, pts) {
  const list = loadLocalAudits();
  const k = name.trim().toLowerCase();
  const ex = list.find((e) => String(e.name).trim().toLowerCase() === k);
  const entry = { name, pct, pts };
  if (ex) {
    if (betterAudit(entry, ex)) { ex.pct = pct; ex.pts = pts; ex.name = name; }
  } else {
    list.push(entry);
  }
  saveLocalAudits(dedupeAudits(list).slice(0, 50));
}
function loadLbNameSaved() {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}
function saveLbNameSaved(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function fetchTopAudits() {
  if (!useSupabase) return dedupeAudits(loadLocalAudits()).slice(0, SS_LB_MAX);
  const url = SBC.url + "/rest/v1/shopper_scores?select=name,pct,pts&order=pct.desc,pts.desc&limit=500";
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error("Supabase fetch " + res.status);
  return dedupeAudits(await res.json()).slice(0, SS_LB_MAX);
}
async function submitAudit(name, pct, pts) {
  addLocalAudit(name, pct, pts); // local mirror
  if (!useSupabase) return;
  const res = await fetch(SBC.url + "/rest/v1/shopper_scores", {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ name: name, pct: pct, pts: pts }),
  });
  if (!res.ok) throw new Error("Supabase insert " + res.status);
}
async function renderShopperBoard() {
  ssLbList.innerHTML = '<li class="lb-empty">Loading…</li>';
  let list;
  try {
    list = await fetchTopAudits();
  } catch {
    list = dedupeAudits(loadLocalAudits()).slice(0, SS_LB_MAX);
  }
  ssLbList.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "lb-empty";
    li.textContent = "No audits yet. Be the first!";
    ssLbList.appendChild(li);
    return;
  }
  let hi = false;
  list.forEach((e, i) => {
    const li = document.createElement("li");
    li.className = "lb-row";
    if (!hi && ssLbNewName &&
        String(ssLbNewName).trim().toLowerCase() === String(e.name).trim().toLowerCase()) {
      li.classList.add("lb-me");
      hi = true;
    }
    li.innerHTML =
      `<span class="lb-rank">${i + 1}</span>` +
      `<span class="lb-name">${escapeHtml(e.name)}</span>` +
      `<span class="lb-score">${e.pct}% · ${e.pts} pts</span>`;
    ssLbList.appendChild(li);
  });
}
function openShopperBoard() {
  ssLeaderboardEl.classList.remove("hidden");
  renderShopperBoard();
}
function closeShopperBoard() {
  ssLeaderboardEl.classList.add("hidden");
}
async function submitShopperName() {
  if (!ssLbPending) return;
  const name = (ssLbNameInput.value || "").trim().slice(0, 12) || "Anon";
  saveLbNameSaved(name);
  const pct = ssLbPending.pct;
  const pts = ssLbPending.pts;
  ssLbPending = null;
  ssLbEntry.classList.add("hidden");
  ssLbSaveBtn.disabled = true;
  try {
    await submitAudit(name, pct, pts);
  } catch (e) {
    /* local mirror already saved */
  }
  ssLbSaveBtn.disabled = false;
  ssLbNewName = name;
  openShopperBoard();
}

// --- Wiring -------------------------------------------------------------
startBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); runShift(); });
againBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); runShift(); });

// Leaderboard wiring
ssLbOpenBtn.addEventListener("click", () => { ssLbNewName = null; openShopperBoard(); });
ssLbViewBtn.addEventListener("click", openShopperBoard);
ssLbBackBtn.addEventListener("click", closeShopperBoard);
ssLbSaveBtn.addEventListener("click", submitShopperName);
ssLbNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); submitShopperName(); }
});

// Initial paint
tableEl.innerHTML = tableSVG();
empStick.innerHTML = stickmanSVG("#ee435b", "ok");
custStick.innerHTML = stickmanSVG(custShirt, "ok");
custWrap.classList.add("offstage");
placeAt(custWrap, SPOT.door);
placeAt(empWrap, 74);
showBest();
