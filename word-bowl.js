// Word Bowl: one 5-letter word a day, six tries, same word for everyone.
// Solving it earns Rewards Shop points. Fewer guesses pay more, and the
// trickier menu words pay a bonus on top.
//
// Guesses aren't checked against a dictionary; any five letters count as a
// try. The word list mixes everyday words with Pokeworks menu vocabulary,
// tiered by how hard they are to come up with.
(function () {
  const KEY = "pokeworks-wordbowl";
  const TRIES = 6;
  const PLAY_PTS = 10;                 // showing up counts for something
  const WIN_PTS = 30;                  // solving it
  const TRY_PTS = 10;                  // per unused guess
  const TIER_PTS = { 1: 0, 2: 15, 3: 30 };
  const TIER_NAME = { 2: "menu word", 3: "deep-menu word" };

  // Order is hand-mixed so the tiers rotate instead of clumping.
  const WORDS = [
    { w: "OCEAN", tier: 1 }, { w: "MANGO", tier: 2 }, { w: "PLATE", tier: 1 },
    { w: "PONZU", tier: 3 }, { w: "SWEET", tier: 1 }, { w: "SUSHI", tier: 2 },
    { w: "SHORE", tier: 1 }, { w: "UMAMI", tier: 3 }, { w: "LEMON", tier: 1 },
    { w: "SPICY", tier: 2 }, { w: "GRAIN", tier: 1 }, { w: "KOMBU", tier: 3 },
    { w: "BEACH", tier: 1 }, { w: "RAMEN", tier: 2 }, { w: "HONEY", tier: 1 },
    { w: "MIRIN", tier: 3 }, { w: "SPOON", tier: 1 }, { w: "BROTH", tier: 2 },
    { w: "CORAL", tier: 1 }, { w: "PANKO", tier: 3 }, { w: "FRESH", tier: 1 },
    { w: "GLAZE", tier: 2 }, { w: "TASTE", tier: 1 }, { w: "UNAGI", tier: 3 },
    { w: "MELON", tier: 1 }, { w: "PRAWN", tier: 2 }, { w: "CATCH", tier: 1 },
    { w: "IKURA", tier: 3 }, { w: "SAUCE", tier: 1 }, { w: "SQUID", tier: 2 },
    { w: "TREAT", tier: 1 }, { w: "SHOYU", tier: 3 }, { w: "BERRY", tier: 1 },
    { w: "BENTO", tier: 2 }, { w: "STEAM", tier: 1 }, { w: "SHISO", tier: 3 },
    { w: "CRISP", tier: 1 }, { w: "CHILI", tier: 2 }, { w: "SHELL", tier: 1 },
    { w: "ALOHA", tier: 2 }, { w: "ONION", tier: 1 }, { w: "MOCHI", tier: 2 },
    { w: "LUNCH", tier: 1 }, { w: "SALTY", tier: 2 }, { w: "APPLE", tier: 1 },
    { w: "DICED", tier: 2 }, { w: "SPICE", tier: 1 }, { w: "WAVES", tier: 1 },
  ];

  function todaysWord() {
    const days = Math.floor(Date.parse(Daily.today() + "T00:00:00Z") / 86400000);
    return WORDS[((days % WORDS.length) + WORDS.length) % WORDS.length];
  }

  // --- State ---------------------------------------------------------------
  // day: today's attempt. career: lifetime solves and the day-to-day streak.
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* fall through */ }
    if (!s || typeof s !== "object") s = {};
    if (!s.career) s.career = { solved: 0, streak: 0, lastWin: null };
    if (!s.day || s.day.date !== Daily.today()) {
      s.day = { date: Daily.today(), guesses: [], done: false, won: false, pts: 0 };
    }
    return s;
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  // --- DOM -----------------------------------------------------------------
  const gridEl = document.getElementById("wb-grid");
  const keysEl = document.getElementById("wb-keys");
  const statusEl = document.getElementById("wb-status");
  const overlayEl = document.getElementById("wb-overlay");
  const subEl = document.getElementById("wb-sub");
  const startBtn = document.getElementById("wb-start");
  const solvedEl = document.getElementById("wb-solved");
  const streakEl = document.getElementById("wb-streak");

  const ROWS = [];
  for (let r = 0; r < TRIES; r++) {
    const row = document.createElement("div");
    row.className = "wb-row";
    const tiles = [];
    for (let c = 0; c < 5; c++) {
      const t = document.createElement("span");
      t.className = "wb-tile";
      row.appendChild(t);
      tiles.push(t);
    }
    gridEl.appendChild(row);
    ROWS.push(tiles);
  }

  const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "⏎ZXCVBNM⌫"];
  const keyEls = {};
  for (const rowStr of KEY_ROWS) {
    const row = document.createElement("div");
    row.className = "wb-key-row";
    for (const ch of rowStr) {
      const k = document.createElement("button");
      k.type = "button";
      k.className = "wb-key" + (ch === "⏎" || ch === "⌫" ? " wide" : "");
      k.textContent = ch === "⏎" ? "ENTER" : ch;
      k.addEventListener("click", () => press(ch));
      row.appendChild(k);
      if (ch !== "⏎" && ch !== "⌫") keyEls[ch] = k;
    }
    keysEl.appendChild(row);
  }

  // --- Scoring -------------------------------------------------------------
  function scoreFor(won, tries, tier) {
    let pts = PLAY_PTS;
    if (won) pts += WIN_PTS + (TRIES - tries) * TRY_PTS + TIER_PTS[tier];
    return pts;
  }

  // Two-pass coloring so doubled letters behave like the real thing.
  function grade(guess, answer) {
    const out = new Array(5).fill("miss");
    const left = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) out[i] = "good";
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (out[i] === "good") continue;
      if (left[guess[i]]) { out[i] = "near"; left[guess[i]]--; }
    }
    return out;
  }

  // --- Play ----------------------------------------------------------------
  let entry = ""; // letters typed into the current row
  let locked = true; // input off until Play is tapped (and after finishing)

  function paintSaved(s) {
    const answer = todaysWord().w;
    s.day.guesses.forEach((g, r) => {
      const marks = grade(g, answer);
      for (let c = 0; c < 5; c++) {
        ROWS[r][c].textContent = g[c];
        ROWS[r][c].classList.add("filled", marks[c]);
        paintKey(g[c], marks[c]);
      }
    });
  }
  function paintEntry() {
    const r = load().day.guesses.length;
    if (r >= TRIES) return;
    for (let c = 0; c < 5; c++) {
      ROWS[r][c].textContent = entry[c] || "";
      ROWS[r][c].classList.toggle("filled", !!entry[c]);
    }
  }
  // A key only ever gets more informative: miss < near < good.
  const KEY_RANK = { miss: 1, near: 2, good: 3 };
  function paintKey(ch, mark) {
    const k = keyEls[ch];
    if (!k) return;
    const cur = k.dataset.mark;
    if (cur && KEY_RANK[cur] >= KEY_RANK[mark]) return;
    k.dataset.mark = mark;
    k.classList.remove("good", "near", "miss");
    k.classList.add(mark);
  }

  function press(ch) {
    if (locked) return;
    const s = load();
    if (s.day.done) return;
    if (ch === "⌫") { entry = entry.slice(0, -1); paintEntry(); return; }
    if (ch === "⏎") { submit(); return; }
    if (entry.length < 5 && /^[A-Z]$/.test(ch)) { entry += ch; paintEntry(); }
  }

  function submit() {
    if (entry.length < 5) {
      statusEl.textContent = "Five letters first.";
      return;
    }
    const s = load();
    const word = todaysWord();
    const guess = entry;
    entry = "";
    s.day.guesses.push(guess);
    const marks = grade(guess, word.w);
    const r = s.day.guesses.length - 1;
    for (let c = 0; c < 5; c++) {
      ROWS[r][c].textContent = guess[c];
      ROWS[r][c].classList.add("filled", marks[c]);
      paintKey(guess[c], marks[c]);
    }

    const won = guess === word.w;
    if (won || s.day.guesses.length >= TRIES) {
      finish(s, won, word);
    } else {
      const leftTries = TRIES - s.day.guesses.length;
      statusEl.textContent = leftTries + (leftTries === 1 ? " try left" : " tries left");
      save(s);
    }
  }

  function finish(s, won, word) {
    const tries = s.day.guesses.length;
    const pts = scoreFor(won, tries, word.tier);
    s.day.done = true;
    s.day.won = won;
    s.day.pts = pts;
    if (won) {
      s.career.solved++;
      s.career.streak = s.career.lastWin === Daily.yesterday() ? s.career.streak + 1 : 1;
      s.career.lastWin = Daily.today();
    } else {
      s.career.streak = 0;
    }
    save(s);
    locked = true;
    if (window.PokePoints) {
      PokePoints.add(pts, won ? "Word Bowl: solved in " + tries : "Word Bowl: good try");
    }
    const bonus = TIER_PTS[word.tier] ? " It was a " + TIER_NAME[word.tier] + ", so it paid extra." : "";
    statusEl.textContent = won
      ? "🎉 " + word.w + " in " + tries + "! +" + pts + " pts." + bonus
      : "It was " + word.w + ". +" + pts + " pts for playing.";
    paintStats(s);
  }

  function paintStats(s) {
    solvedEl.textContent = s.career.solved;
    streakEl.textContent = s.career.streak;
  }

  // --- Boot ----------------------------------------------------------------
  const boot = load();
  paintStats(boot);
  if (boot.day.done) {
    paintSaved(boot);
    subEl.textContent = boot.day.won
      ? "You got today's word in " + boot.day.guesses.length + " (+" + boot.day.pts + " pts). New word tomorrow."
      : "Today's word got away. New word tomorrow.";
    startBtn.hidden = true;
    statusEl.textContent = boot.day.won ? "Solved. Back tomorrow!" : "Out of tries. Back tomorrow!";
  } else if (boot.day.guesses.length) {
    // Mid-game reload: put the board back and keep going.
    paintSaved(boot);
    overlayEl.classList.add("hidden");
    locked = false;
    const leftTries = TRIES - boot.day.guesses.length;
    statusEl.textContent = leftTries + (leftTries === 1 ? " try left" : " tries left");
  }

  startBtn.addEventListener("click", () => {
    if (window.PokeStreak) PokeStreak.mark();
    overlayEl.classList.add("hidden");
    locked = false;
    statusEl.textContent = "Guess the 5-letter word";
  });

  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT") return;
    if (e.key === "Enter") press("⏎");
    else if (e.key === "Backspace") press("⌫");
    else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toUpperCase());
  });
})();
