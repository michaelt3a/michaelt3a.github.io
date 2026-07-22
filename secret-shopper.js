// Secret Shopper — a mystery shopper audits your shift. Walk through every
// step of the restaurant experience (greet fast, warm greeting, first-time
// question, menu knowledge, upsell, rewards, quick order, parting comment,
// dining-room check-in) and get graded on a hospitality scorecard.

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

// --- Audit items (25 pts total, mirroring the hospitality sheet) --------
const ITEMS = [
  { key: "greetFast", label: "Greeted within 5 seconds of entering", pts: 3 },
  { key: "greetWarm", label: "Warm and genuine greeting", pts: 3 },
  { key: "preOrder", label: "Pleasant greeting before taking the order", pts: 2 },
  { key: "firstTime", label: "Asked if it was their first time visiting", pts: 2 },
  { key: "menuKnow", label: "Demonstrated menu knowledge", pts: 4 },
  { key: "upsell", label: "Offered an upsell", pts: 3 },
  { key: "rewards", label: "Asked about rewards/app", pts: 2 },
  { key: "fastOrder", label: "Order ready in time", pts: 3 },
  { key: "parting", label: "Pleasant parting comment", pts: 2 },
  { key: "dining", label: "Engaged with their table in the dining room", pts: 1 },
];
const TOTAL_PTS = 25;

const BEST_KEY = "pokeworks-shopper-best";

// Scene spots (percent of scene width)
const SPOT = { enter: 4, greet: 22, counter: 52, table: 10 };
const CUST_SHIRTS = ["#22b2b4", "#f0a52c", "#7c5cff", "#39a85b", "#e8709b"];

let earned = {};
let running = false;

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
  start: () => arp([392, 523, 659], { dur: 0.12, step: 0.06 }),
  fanfare: () => arp([523, 659, 784, 1047, 1319], { dur: 0.2, gain: 0.13, step: 0.09 }),
};

// --- Stick figures (same look as Order Up) ------------------------------
function stickmanSVG(shirt, mood) {
  const mouth =
    mood === "ok" ? '<path d="M26 31 Q32 37 38 31" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>' :
    mood === "warn" ? '<path d="M27 33 L37 33" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>' :
    '<path d="M26 34 Q32 28 38 34" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>';
  const brow = mood === "mad"
    ? '<path d="M24 18 L30 20 M40 18 L34 20" stroke="#5a3a20" stroke-width="2" stroke-linecap="round"/>'
    : "";
  const L = 'stroke="' + shirt + '" stroke-width="5" stroke-linecap="round"';
  return (
    '<svg viewBox="0 0 64 120" width="100%" height="100%" aria-hidden="true">' +
    '<line x1="32" y1="78" x2="20" y2="112" ' + L + "/>" +
    '<line x1="32" y1="78" x2="44" y2="112" ' + L + "/>" +
    '<line x1="32" y1="40" x2="32" y2="79" ' + L + "/>" +
    '<line x1="32" y1="50" x2="15" y2="64" ' + L + "/>" +
    '<line x1="32" y1="50" x2="49" y2="64" ' + L + "/>" +
    '<circle cx="32" cy="24" r="15" fill="#ffe0bd" stroke="#e0b98f" stroke-width="1.5"/>' +
    '<circle cx="27" cy="24" r="2" fill="#333"/><circle cx="37" cy="24" r="2" fill="#333"/>' +
    brow + mouth +
    "</svg>"
  );
}

function tableSVG() {
  return (
    '<svg viewBox="0 0 140 92" width="100%" height="100%" aria-hidden="true">' +
    '<ellipse cx="70" cy="84" rx="54" ry="7" fill="rgba(0,0,0,0.10)"/>' +
    '<rect x="18" y="34" width="13" height="30" rx="6" fill="#94a0aa"/>' +
    '<rect x="109" y="34" width="13" height="30" rx="6" fill="#94a0aa"/>' +
    '<rect x="14" y="54" width="30" height="9" rx="4" fill="#aab4bd"/>' +
    '<rect x="96" y="54" width="30" height="9" rx="4" fill="#aab4bd"/>' +
    '<line x1="20" y1="63" x2="20" y2="80" stroke="#8b96a0" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="38" y1="63" x2="38" y2="80" stroke="#8b96a0" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="102" y1="63" x2="102" y2="80" stroke="#8b96a0" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="120" y1="63" x2="120" y2="80" stroke="#8b96a0" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="66" y="46" width="8" height="30" fill="#b98f57"/>' +
    '<rect x="56" y="74" width="28" height="6" rx="3" fill="#9c7743"/>' +
    '<ellipse cx="70" cy="44" rx="42" ry="12" fill="#d9b07a" stroke="#a97f4a" stroke-width="2"/>' +
    "</svg>"
  );
}

let custShirt = CUST_SHIRTS[0];
let custMoodNow = "ok";
function custMood(m) {
  custMoodNow = m;
  custStick.innerHTML = stickmanSVG(custShirt, m);
}

// --- Helpers ------------------------------------------------------------
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function loadBestPct() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch { return 0; }
}
function saveBestPct(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ }
}
function showBest() {
  const b = loadBestPct();
  bestEl.textContent = b > 0 ? b + "%" : "—";
}

// Move an actor (walking bob) to a percent position; resolves when there.
function walkTo(wrap, pct, ms) {
  wrap.classList.add("walking");
  wrap.style.transitionDuration = ms + "ms";
  wrap.style.left = pct + "%";
  return wait(ms).then(() => wrap.classList.remove("walking"));
}

function say(bubble, text, holdMs) {
  bubble.textContent = text;
  bubble.classList.remove("hidden");
  if (holdMs) {
    return wait(holdMs).then(() => bubble.classList.add("hidden"));
  }
  return Promise.resolve();
}
function hush() {
  custBubble.classList.add("hidden");
  empBubble.classList.add("hidden");
}

// --- Prompt / choices ---------------------------------------------------
// Show a prompt with options; resolves { good, text, inTime }.
// options: [{ t: "text", good: true/false }]. timerSec starts a countdown —
// clicks after it expires resolve with inTime: false.
function ask(title, options, timerSec) {
  promptTitle.textContent = title;
  choicesEl.innerHTML = "";
  let timedOut = false;
  let timeoutId = null;

  if (timerSec) {
    timerEl.classList.remove("hidden");
    timerFill.style.transition = "none";
    timerFill.style.width = "100%";
    timerFill.classList.remove("late");
    void timerFill.offsetWidth; // reflow so the transition restarts
    timerFill.style.transition = "width " + timerSec + "s linear";
    timerFill.style.width = "0%";
    timeoutId = setTimeout(() => {
      timedOut = true;
      timerFill.classList.add("late");
    }, timerSec * 1000);
  } else {
    timerEl.classList.add("hidden");
  }

  return new Promise((resolve) => {
    for (const opt of shuffle(options)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-choice";
      btn.textContent = opt.t;
      btn.dataset.good = opt.good ? "1" : "0";
      btn.addEventListener("click", async () => {
        if (timeoutId) clearTimeout(timeoutId);
        timerEl.classList.add("hidden");
        for (const b of choicesEl.querySelectorAll("button")) b.disabled = true;
        btn.classList.add(opt.good ? "picked-good" : "picked-bad");
        if (opt.good) SFX.good(); else SFX.bad();
        await wait(650);
        resolve({ good: opt.good, text: opt.t, inTime: !timedOut });
      });
      choicesEl.appendChild(btn);
    }
  });
}

function note(title) {
  promptTitle.textContent = title;
  choicesEl.innerHTML = "";
  timerEl.classList.add("hidden");
}

// --- Menu knowledge question from the real recipe data ------------------
function menuQuestion() {
  const r = pick(RECIPES);
  const useSauce = Math.random() < 0.5;
  const cat = useSauce ? "Sauce" : "Protein";
  const correct = r.items[cat][0];
  const wrongPool = ING[cat].filter((n) => !r.items[cat].includes(n));
  const wrongs = shuffle(wrongPool).slice(0, 2);
  return {
    recipe: r,
    text: useSauce
      ? `Quick question — what sauce comes on the ${r.name}?`
      : `Quick question — which protein is in the ${r.name}?`,
    options: shuffle([
      { t: correct, good: true },
      { t: wrongs[0], good: false },
      { t: wrongs[1], good: false },
    ]),
  };
}

// --- The shift ----------------------------------------------------------
async function runShift() {
  if (running) return;
  running = true;
  earned = {};

  // Reset the scene
  custShirt = pick(CUST_SHIRTS);
  custMood("ok");
  empStick.innerHTML = stickmanSVG("#ee435b", "ok");
  hush();
  custWrap.style.transitionDuration = "0ms";
  custWrap.style.left = "-12%";
  empWrap.style.transitionDuration = "0ms";
  empWrap.style.left = "74%";
  doorEl.classList.remove("open");
  overlay.classList.add("hidden");
  scorecardEl.classList.add("hidden");
  note("Your shift is starting…");

  await wait(600);

  // 1-2. The shopper walks in — greet fast and warm.
  doorEl.classList.add("open");
  SFX.bell();
  await wait(250);
  walkTo(custWrap, SPOT.greet, 2200); // they keep walking while you decide
  const greet = await ask("A customer just walked in!", [
    { t: "“Aloha! Welcome in!”", good: true },
    { t: "(Keep restocking the napkins)", good: false },
    { t: "“Yo.”", good: false },
  ], 5);
  doorEl.classList.remove("open");
  if (greet.good) {
    earned.greetWarm = true;
    if (greet.inTime) earned.greetFast = true;
    await say(empBubble, "Aloha! Welcome in!", 1100);
    custMood("ok");
  } else {
    custMood("warn");
    await say(custBubble, "…hello?", 1100);
  }

  // Walk up to the counter.
  note("They're heading to the counter…");
  await walkTo(custWrap, SPOT.counter, 1600);

  // 3. Pleasant greeting before the order.
  await say(custBubble, "Hi, I'd like to order.", 1300);
  const pre = await ask("Take their order — how do you start?", [
    { t: "“Welcome to Pokeworks! How's your day going?”", good: true },
    { t: "“What do you want?”", good: false },
  ]);
  if (pre.good) {
    earned.preOrder = true;
    await say(custBubble, "Great, thanks for asking!", 1100);
  } else {
    custMood("warn");
    await say(custBubble, "Uh… okay then.", 1100);
  }

  // 4. First time visiting?
  const ft = await ask("Anything to ask before the order?", [
    { t: "“Is this your first time visiting us?”", good: true },
    { t: "(Skip the small talk)", good: false },
  ]);
  if (ft.good) {
    earned.firstTime = true;
    await say(custBubble, pick(["First time, actually!", "I come here all the time!"]), 1200);
  }

  // 5. Menu knowledge quiz.
  const q = menuQuestion();
  await say(custBubble, q.text, 1500);
  const mk = await ask("Show your menu knowledge:", q.options);
  if (mk.good) {
    earned.menuKnow = true;
    await say(custBubble, "Nice — you know your stuff. I'll take one " + q.recipe.name + "!", 1600);
  } else {
    custMood("warn");
    await say(custBubble, "…that's not right. I'll take a " + q.recipe.name + " anyway.", 1600);
  }

  // 6. Upsell.
  const up = await ask("They've picked their bowl. Anything else?", [
    { t: "“Would you like to add avocado or a drink?”", good: true },
    { t: "“That everything? Cool.”", good: false },
  ]);
  if (up.good) {
    earned.upsell = true;
    await say(custBubble, pick(["Ooh, avocado please!", "A drink sounds good!"]), 1200);
  }

  // 7. Rewards / app.
  const rw = await ask("Before ringing them up…", [
    { t: "“Do you have our rewards app? You earn points!”", good: true },
    { t: "“Alright, that'll be $13.45.”", good: false },
  ]);
  if (rw.good) {
    earned.rewards = true;
    await say(custBubble, "Just downloaded it!", 1100);
  }

  // 8. Make the order fast (tap to scoop).
  const made = await scoopStage(q.recipe);
  if (made) {
    earned.fastOrder = true;
    SFX.serve();
    await say(empBubble, "Order up! One " + q.recipe.name + "!", 1300);
  } else {
    custMood("warn");
    await say(custBubble, "That took a while…", 1300);
  }

  // 9. Parting comment.
  const part = await ask("Hand it over — say goodbye:", [
    { t: "“Thank you! Have a great day!”", good: true },
    { t: "“NEXT!”", good: false },
  ]);
  if (part.good) {
    earned.parting = true;
    custMood("ok");
    await say(custBubble, "Thanks so much!", 1100);
  } else {
    custMood("mad");
  }

  // 10. They dine in — engage with the table.
  note("They're sitting down in the dining room…");
  await walkTo(custWrap, SPOT.table, 1800);
  const dine = await ask("They're dining in. What do you do?", [
    { t: "Visit their table: “How is everything?”", good: true },
    { t: "(Stand around behind the counter)", good: false },
  ]);
  if (dine.good) {
    earned.dining = true;
    note("Checking in on their table…");
    await walkTo(empWrap, SPOT.table + 9, 1500);
    await say(empBubble, "How is everything?", 1300);
    custMood("ok");
    await say(custBubble, "Delicious, thank you!", 1300);
    await walkTo(empWrap, 74, 1500);
  }

  finishShift();
}

// Tap-to-scoop stage: 6 scoops inside 8 seconds.
function scoopStage(recipe) {
  const NEED = 6;
  const SECS = 8;
  return new Promise((resolve) => {
    promptTitle.textContent = "Make the " + recipe.name + " — tap Scoop, fast!";
    choicesEl.innerHTML = "";

    const prog = document.createElement("div");
    prog.className = "ss-scoop-prog";
    const segs = [];
    const segColors = ["#c9a97a", "#ee435b", "#4caf72", "#f0a52c", "#22b2b4", "#7c5cff"];
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
    timerFill.style.transition = "width " + SECS + "s linear";
    timerFill.style.width = "0%";

    let count = 0;
    let done = false;
    const timeoutId = setTimeout(() => {
      if (done) return;
      done = true;
      btn.disabled = true;
      timerEl.classList.add("hidden");
      SFX.bad();
      resolve(false); // too slow
    }, SECS * 1000);

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

// --- Scorecard ----------------------------------------------------------
function finishShift() {
  running = false;
  let pts = 0;
  auditRows.innerHTML = "";
  for (const item of ITEMS) {
    const got = !!earned[item.key];
    if (got) pts += item.pts;
    const row = document.createElement("div");
    row.className = "ss-audit-row" + (got ? " got" : " missed");
    row.innerHTML =
      `<span class="ss-audit-mark">${got ? "✓" : "✗"}</span>` +
      `<span class="ss-audit-label">${item.label}</span>` +
      `<span class="ss-audit-pts">${got ? item.pts : 0}/${item.pts}</span>`;
    auditRows.appendChild(row);
  }
  const pct = Math.round((pts / TOTAL_PTS) * 100);
  auditHeader.textContent = `HOSPITALITY ${pct}% (${pts}/${TOTAL_PTS})`;

  gradeEl.textContent =
    pct === 100 ? "Perfect audit! The shopper is telling everyone about you." :
    pct >= 80 ? "Great shift — the shopper left smiling." :
    pct >= 60 ? "Decent, but the audit found some gaps." :
    "Yikes. Corporate wants a word…";

  const prevBest = loadBestPct();
  if (pct > prevBest) saveBestPct(pct);
  showBest();

  if (pct === 100) SFX.fanfare();
  scorecardEl.classList.remove("hidden");
}

// --- Wiring -------------------------------------------------------------
startBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); runShift(); });
againBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); runShift(); });

// Initial paint
tableEl.innerHTML = tableSVG();
empStick.innerHTML = stickmanSVG("#ee435b", "ok");
custStick.innerHTML = stickmanSVG(custShirt, "ok");
custWrap.style.left = "-12%"; // waiting outside until the shift starts
empWrap.style.left = "74%"; // behind the counter
showBest();
