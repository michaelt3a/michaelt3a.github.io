// Secret Shopper — the secret shopper is somewhere in your shift. Three guests
// come in, each with their own personality, and every step of every visit is
// audited like the hospitality sheet: greeting speed, warmth, first-time
// question, menu knowledge (harder with each guest), upsell, rewards, order
// speed, parting comment, dining-room check-ins — plus surprise events
// (spills, phone calls, walk-ins, complaints) that test you too.

const B = window.Bowl;
const RECIPES = B.RECIPES;
const ING = B.INGREDIENTS;
const CATS = B.CATEGORIES;

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

// --- Config ---------------------------------------------------------------
const GUESTS_PER_SHIFT = 3;
const BEST_KEY = "pokeworks-shopper-best";
const SPOT = { enter: 4, greet: 22, counter: 52, table: 10, wait: 12 };
const CUST_SHIRTS = ["#22b2b4", "#f0a52c", "#7c5cff", "#39a85b", "#e8709b", "#4c7dd1"];

// Personalities change pacing, dialogue, and whether they dine in.
const PERSONALITIES = {
  friendly: { label: "Friendly", greetSecs: 5, scoopSecs: 8, dineChance: 0.65 },
  rush: { label: "In a rush", greetSecs: 3.5, scoopSecs: 6.5, dineChance: 0 },
  chatty: { label: "Chatty", greetSecs: 5, scoopSecs: 8, dineChance: 0.75 },
  grumpy: { label: "Grumpy", greetSecs: 4.5, scoopSecs: 7.5, dineChance: 0.5 },
};

// --- Dialogue pools (variety between runs) --------------------------------
const GREET_GOOD = ["“Aloha! Welcome in!”", "“Welcome to Pokeworks!”", "“Hey there — welcome in!”", "“Good afternoon! Come on in!”"];
const GREET_BAD = ["“Yo.”", "(Keep restocking the napkins)", "(Stare at the register)", "“We close in an hour.”", "(Check your phone)"];
const PREORDER_GOOD = ["“Welcome to Pokeworks! How's your day going?”", "“Hi! How are you today?”", "“Great to see you — how's it going?”"];
const PREORDER_BAD = ["“What do you want?”", "“Hurry it up, there's a line.”", "“Next.”", "(Point at the menu silently)"];
const UPSELL_GOOD = ["“Would you like to add avocado or a drink?”", "“Can I add a snack or a drink for you?”", "“Avocado on that? It's amazing.”"];
const UPSELL_BAD = ["“That everything? Cool.”", "“Anything else? No? Fine.”", "(Ring them up without asking)"];
const REWARDS_GOOD = ["“Do you have our rewards app? You earn points!”", "“Are you in our rewards program yet?”"];
const REWARDS_BAD = ["“Alright, that'll be $13.45.”", "(Skip straight to payment)", "“Cash or card. Pick.”"];
const PARTING_GOOD = ["“Thank you! Have a great day!”", "“Thanks so much — enjoy!”", "“Have a wonderful rest of your day!”"];
const PARTING_BAD = ["“NEXT!”", "(Turn away silently)", "“Finally.”"];

const REPLY_HAPPY = ["Great, thanks for asking!", "Doing well, thanks!", "Aw, thanks for asking!"];
const REPLY_ANNOYED = ["Uh… okay then.", "Wow. Friendly.", "…sure."];

// --- State ------------------------------------------------------------------
let running = false;
let audit = []; // { guest, label, pts, got }
let guestMeta = []; // { label, dine } per guest
let custShirt = CUST_SHIRTS[0];

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

let custMoodNow = "ok";
function custMood(m) {
  custMoodNow = m;
  custStick.innerHTML = stickmanSVG(custShirt, m);
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
  bestEl.textContent = b > 0 ? b + "%" : "—";
}

function walkTo(wrap, pct, ms) {
  wrap.classList.add("walking");
  wrap.style.transitionDuration = ms + "ms";
  wrap.style.left = pct + "%";
  return wait(ms).then(() => wrap.classList.remove("walking"));
}
function say(bubble, text, holdMs) {
  bubble.textContent = text;
  bubble.classList.remove("hidden");
  // Hold long enough to actually read it: scale with text length, and treat
  // any explicit hold as a minimum, not a cap.
  const ms = Math.max(holdMs || 0, 1500, 900 + text.length * 55);
  return wait(ms).then(() => bubble.classList.add("hidden"));
}
function hush() {
  custBubble.classList.add("hidden");
  empBubble.classList.add("hidden");
  extraBubble.classList.add("hidden");
}
function log(guest, label, pts, got) {
  audit.push({ guest, label, pts, got: !!got });
}

// --- Prompt / choices ---------------------------------------------------
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
    void timerFill.offsetWidth;
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

// Build 1 good + (n-1) bad options from pools.
function mix(goodPool, badPool, badCount) {
  const opts = [{ t: pick(goodPool), good: true }];
  for (const b of pickN(badPool, badCount)) opts.push({ t: b, good: false });
  return opts;
}

// --- Menu questions, harder for each guest -------------------------------
// level 0: sauce/protein of a bowl (3 options)
// level 1: what's inside / how many mix-ins (3 options)
// level 2: NOT in the bowl, or reverse lookup (4 options)
function menuQuestion(level) {
  const r = pick(RECIPES);

  if (level <= 0) {
    const useSauce = Math.random() < 0.5;
    const cat = useSauce ? "Sauce" : "Protein";
    const correct = r.items[cat][0];
    const wrongs = pickN(ING[cat].filter((n) => !r.items[cat].includes(n)), 2);
    return {
      recipe: r,
      text: useSauce
        ? `Quick question — what sauce comes on the ${r.name}?`
        : `Quick question — which protein is in the ${r.name}?`,
      options: [{ t: correct, good: true }, { t: wrongs[0], good: false }, { t: wrongs[1], good: false }],
    };
  }

  if (level === 1) {
    if (Math.random() < 0.5) {
      // which of these comes in the bowl?
      const inside = r.items["Mix-ins"].concat(r.items["Toppings"]);
      const correct = pick(inside);
      const pool = ING["Mix-ins"].concat(ING["Toppings"]).filter((n) => !inside.includes(n) && n !== correct);
      const wrongs = pickN([...new Set(pool)], 2);
      return {
        recipe: r,
        text: `Hmm — which of these actually comes in the ${r.name}?`,
        options: [{ t: correct, good: true }, { t: wrongs[0], good: false }, { t: wrongs[1], good: false }],
      };
    }
    // how many mix-ins?
    const n = r.items["Mix-ins"].length;
    const decoys = shuffle([n - 1, n + 1, n + 2].filter((x) => x > 0 && x !== n)).slice(0, 2);
    return {
      recipe: r,
      text: `How many mix-ins come in the ${r.name}?`,
      options: [{ t: String(n), good: true }, { t: String(decoys[0]), good: false }, { t: String(decoys[1]), good: false }],
    };
  }

  // level >= 2
  if (Math.random() < 0.5) {
    // which is NOT in the bowl? (3 real + 1 imposter)
    const inside = r.items["Mix-ins"].concat(r.items["Toppings"]);
    const reals = pickN(inside, 3);
    const pool = ING["Mix-ins"].concat(ING["Toppings"]).filter((n) => !inside.includes(n));
    const imposter = pick([...new Set(pool)]);
    return {
      recipe: r,
      text: `Tricky one — which of these is NOT in the ${r.name}?`,
      options: [{ t: imposter, good: true }].concat(reals.map((t) => ({ t, good: false }))),
    };
  }
  // reverse lookup: which bowl comes with X? (pick an ingredient unique to one recipe)
  for (const cat of shuffle(["Sauce", "Protein"])) {
    const count = {};
    for (const rec of RECIPES) for (const n of rec.items[cat]) count[n] = (count[n] || 0) + 1;
    const uniques = Object.keys(count).filter((n) => count[n] === 1);
    if (uniques.length) {
      const ingr = pick(uniques);
      const owner = RECIPES.find((rec) => rec.items[cat].includes(ingr));
      const others = pickN(RECIPES.filter((rec) => rec !== owner), 3);
      return {
        recipe: owner,
        text: `Which bowl comes with ${ingr}?`,
        options: [{ t: owner.name, good: true }].concat(others.map((o) => ({ t: o.name, good: false }))),
      };
    }
  }
  return menuQuestion(0); // fallback (shouldn't happen)
}

// --- Random events --------------------------------------------------------
// Each event is worth 2 audit points. `when` is "before" (pre-order-making)
// or "after" (after serving).
const EVENTS = {
  spill: {
    when: "before",
    label: "Handled the spill quickly",
    async run(g) {
      SFX.crash();
      await say(custBubble, "Oh no — someone spilled a drink!", 1400);
      const r = await ask("A drink spills near the counter!", [
        { t: "Grab the mop and a wet-floor sign", good: true },
        { t: "(Someone else will get it)", good: false },
        { t: "Toss one napkin at it from here", good: false },
      ]);
      if (r.good) await say(empBubble, "All cleaned up — sorry about that!", 1200);
      return r.good;
    },
  },
  phone: {
    when: "before",
    label: "Handled the phone professionally",
    async run(g) {
      SFX.ring();
      await say(empBubble, "*ring ring*", 900);
      const r = await ask("The store phone rings mid-order.", [
        { t: "“Excuse me one moment” — answer politely", good: true },
        { t: "(Let it ring forever)", good: false },
        { t: "Answer it and chat for five minutes", good: false },
      ]);
      if (r.good) await say(custBubble, "No problem, take your time!", 1100);
      else moodDown();
      return r.good;
    },
  },
  walkin: {
    when: "before",
    label: "Acknowledged the waiting guest",
    async run(g) {
      doorEl.classList.add("open");
      SFX.bell();
      extraStick.innerHTML = stickmanSVG(pick(CUST_SHIRTS), "ok");
      extraWrap.classList.remove("hidden");
      extraWrap.style.transitionDuration = "0ms";
      extraWrap.style.left = "-12%";
      await wait(60);
      walkTo(extraWrap, SPOT.wait, 1400);
      const r = await ask("Another guest walks in while you're busy.", [
        { t: "“Welcome in! I'll be right with you!”", good: true },
        { t: "(Don't look up)", good: false },
        { t: "“There's a line. Wait.”", good: false },
      ]);
      doorEl.classList.remove("open");
      if (r.good) await say(extraBubble, "No rush — just picking up!", 1200);
      return r.good;
    },
  },
  complaint: {
    when: "after",
    label: "Recovered from a mistake",
    async run(g) {
      custMood("warn");
      await say(custBubble, "Wait — I asked for no onions!", 1400);
      const r = await ask("They found a mistake in the bowl!", [
        { t: "“So sorry! I'll remake that right away.”", good: true },
        { t: "“No refunds.”", good: false },
        { t: "(Shrug)", good: false },
      ]);
      if (r.good) {
        moodUp();
        await say(custBubble, "Wow, that was fast — thank you!", 1200);
      } else {
        custMood("mad");
      }
      return r.good;
    },
  },
  smalltalk: {
    when: "before",
    label: "Stayed engaged with the guest",
    async run(g) {
      await say(custBubble, "…so anyway, that's when my cat learned to open the fridge—", 1700);
      const r = await ask("They're deep into a story. What do you do?", [
        { t: "Listen and react warmly", good: true },
        { t: "(Walk away mid-sentence)", good: false },
        { t: "“Is this going anywhere?”", good: false },
      ]);
      if (r.good) await say(empBubble, "No way — through the child lock?!", 1300);
      else moodDown();
      return r.good;
    },
  },
};

// --- One guest's visit ------------------------------------------------------
async function runGuest(idx, personaKey) {
  const P = PERSONALITIES[personaKey];
  const dine = Math.random() < P.dineChance;
  guestMeta.push({ label: P.label, dine });

  // Fresh guest
  custShirt = pick(CUST_SHIRTS);
  custMood(personaKey === "grumpy" ? "warn" : "ok");
  custWrap.style.transitionDuration = "0ms";
  custWrap.style.left = "-12%";
  hush();

  // Pick this guest's surprise event. Chatty guests always launch the story.
  const eventKey = personaKey === "chatty"
    ? "smalltalk"
    : pick(["spill", "phone", "walkin", "complaint"]);
  const event = EVENTS[eventKey];

  note(`Guest ${idx + 1} of ${GUESTS_PER_SHIFT} is arriving…`);
  await wait(500);

  // 1-2. Walk in — greet fast and warm (rushed guests give you less time).
  doorEl.classList.add("open");
  SFX.bell();
  await wait(250);
  walkTo(custWrap, SPOT.greet, 2200);
  if (personaKey === "rush") say(custBubble, "In a hurry, sorry!", 1400);
  const greet = await ask(
    personaKey === "rush" ? "A customer rushes in — quick!" : "A customer just walked in!",
    mix(GREET_GOOD, GREET_BAD, 2),
    P.greetSecs
  );
  doorEl.classList.remove("open");
  log(idx, `Greeted within ${P.greetSecs} seconds of entering`, 3, greet.good && greet.inTime);
  log(idx, "Warm and genuine greeting", 3, greet.good);
  if (greet.good) {
    await say(empBubble, greet.text.replace(/[“”]/g, ""), 1100);
    moodUp();
  } else {
    moodDown();
    await say(custBubble, "…hello?", 1000);
  }

  note("They're heading to the counter…");
  await walkTo(custWrap, SPOT.counter, 1400);

  // 3. Pleasant greeting before the order.
  await say(custBubble, personaKey === "rush" ? "Hi — I'd like to order, fast!" : "Hi, I'd like to order.", 1200);
  const pre = await ask("Take their order — how do you start?", mix(PREORDER_GOOD, PREORDER_BAD, 2));
  log(idx, "Pleasant greeting before taking the order", 2, pre.good);
  if (pre.good) await say(custBubble, pick(REPLY_HAPPY), 1000);
  else { moodDown(); await say(custBubble, pick(REPLY_ANNOYED), 1000); }

  // 4. First time visiting?
  const ft = await ask("Anything to ask before the order?", [
    { t: "“Is this your first time visiting us?”", good: true },
    { t: "(Skip the small talk)", good: false },
    { t: "“You look like you eat here too much.”", good: false },
  ]);
  log(idx, "Asked if it was their first time visiting", 2, ft.good);
  if (ft.good) {
    await say(custBubble, pick(["First time, actually!", "I come here all the time!", "First visit — what do you recommend?"]), 1200);
  }

  // 5. Menu knowledge — harder with each guest.
  const q = menuQuestion(idx);
  await say(custBubble, q.text, 1600);
  // Repeat the question in the panel so it stays readable on every screen.
  const mk = await ask(q.text, q.options);
  log(idx, "Demonstrated menu knowledge", 4, mk.good);
  if (mk.good) {
    await say(custBubble, `Nice — you know your stuff. One ${q.recipe.name}, please!`, 1500);
    moodUp();
  } else {
    moodDown();
    await say(custBubble, `…that's not right. I'll take a ${q.recipe.name} anyway.`, 1500);
  }

  // 6. Upsell.
  const up = await ask("They've picked their bowl. Anything else?", mix(UPSELL_GOOD, UPSELL_BAD, 2));
  log(idx, "Offered an upsell", 3, up.good);
  if (up.good) await say(custBubble, pick(["Ooh, avocado please!", "A drink sounds good!", "Go on then — add the avocado."]), 1100);

  // 7. Rewards / app.
  const rw = await ask("Before ringing them up…", mix(REWARDS_GOOD, REWARDS_BAD, 2));
  log(idx, "Asked about rewards/app", 2, rw.good);
  if (rw.good) await say(custBubble, pick(["Just downloaded it!", "Already got it — 2,000 points!"]), 1100);

  // Surprise event (pre-serve ones fire here).
  if (event.when === "before") {
    log(idx, event.label, 2, await event.run(idx));
  }

  // 8. Make the order fast.
  const made = await scoopStage(q.recipe, P.scoopSecs);
  log(idx, "Order ready in time", 3, made);
  if (made) {
    SFX.serve();
    await say(empBubble, `Order up! One ${q.recipe.name}!`, 1200);
  } else {
    moodDown();
    await say(custBubble, "That took a while…", 1200);
  }

  // Post-serve event (complaint).
  if (event.when === "after") {
    log(idx, event.label, 2, await event.run(idx));
  }

  // 9. Parting comment.
  const part = await ask("Hand it over — say goodbye:", mix(PARTING_GOOD, PARTING_BAD, 2));
  log(idx, "Pleasant parting comment", 2, part.good);
  if (part.good) { moodUp(); await say(custBubble, "Thanks so much!", 1000); }
  else moodDown();

  // 10. Dine in (check the table) or leave (takeout).
  if (dine) {
    note("They're sitting down in the dining room…");
    await walkTo(custWrap, SPOT.table, 1700);
    const dr = await ask("They're dining in. What do you do?", [
      { t: "Visit their table: “How is everything?”", good: true },
      { t: "(Stand around behind the counter)", good: false },
      { t: "(Watch them eat, silently, from a distance)", good: false },
    ]);
    log(idx, "Engaged with their table in the dining room", 1, dr.good);
    if (dr.good) {
      note("Checking in on their table…");
      await walkTo(empWrap, SPOT.table + 9, 1400);
      await say(empBubble, "How is everything?", 1200);
      moodUp();
      await say(custBubble, pick(["Delicious, thank you!", "So good. I'm telling everyone.", "Best bowl yet!"]), 1200);
      await walkTo(empWrap, 74, 1400);
    }
    // They finish and head out.
    note("They're finishing up…");
    await wait(400);
    doorEl.classList.add("open");
    await walkTo(custWrap, -12, 1700);
    doorEl.classList.remove("open");
  } else {
    note("They're taking it to go…");
    doorEl.classList.add("open");
    SFX.bell();
    await walkTo(custWrap, -12, 1900);
    doorEl.classList.remove("open");
  }

  // If a walk-in guest was waiting, they grab their pickup and leave.
  if (eventKey === "walkin" && !extraWrap.classList.contains("hidden")) {
    say(extraBubble, "Got my pickup — thanks!", 1000);
    await wait(300);
    doorEl.classList.add("open");
    await walkTo(extraWrap, -12, 1400);
    doorEl.classList.remove("open");
    extraWrap.classList.add("hidden");
  }
  hush();
}

// Tap-to-scoop stage.
function scoopStage(recipe, secs) {
  const NEED = 6;
  return new Promise((resolve) => {
    promptTitle.textContent = `Make the ${recipe.name} — tap Scoop, fast!`;
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

  empStick.innerHTML = stickmanSVG("#ee435b", "ok");
  empWrap.style.transitionDuration = "0ms";
  empWrap.style.left = "74%";
  extraWrap.classList.add("hidden");
  doorEl.classList.remove("open");
  overlay.classList.add("hidden");
  scorecardEl.classList.add("hidden");
  hush();

  // A varied cast: three different personalities each shift.
  const cast = pickN(Object.keys(PERSONALITIES), GUESTS_PER_SHIFT);

  for (let i = 0; i < GUESTS_PER_SHIFT; i++) {
    await runGuest(i, cast[i]);
    if (i < GUESTS_PER_SHIFT - 1) {
      note("Nice — next guest incoming…");
      await wait(700);
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
    const head = document.createElement("div");
    head.className = "ss-audit-cust";
    head.innerHTML =
      `<span>Guest ${g + 1} · ${meta.label} · ${meta.dine ? "Dine-in" : "Takeout"}</span>` +
      `<span>${gEarned}/${gTotal}</span>`;
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
    pct >= 90 ? "Outstanding — corporate is framing this one." :
    pct >= 80 ? "Great shift — the secret shopper left smiling." :
    pct >= 60 ? "Decent, but the audit found some gaps." :
    pct >= 40 ? "Rough shift. Time to reread the training binder." :
    "Yikes. Corporate wants a word…";

  const prevBest = loadBestPct();
  if (pct > prevBest) saveBestPct(pct);
  showBest();

  if (pct === 100) SFX.fanfare();
  scorecardEl.classList.remove("hidden");
  scorecardEl.scrollTop = 0;
}

// --- Wiring -------------------------------------------------------------
startBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); runShift(); });
againBtn.addEventListener("click", () => { ensureAudio(); SFX.start(); runShift(); });

// Initial paint
tableEl.innerHTML = tableSVG();
empStick.innerHTML = stickmanSVG("#ee435b", "ok");
custStick.innerHTML = stickmanSVG(custShirt, "ok");
custWrap.style.left = "-12%";
empWrap.style.left = "74%";
showBest();
