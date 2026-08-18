// Bowl Rush — ingredients ride a conveyor across the box; drag each one into
// its station tub (Base, Protein, Mix-ins, Sauce, Toppings) before it rolls
// off the end. Wrong tub costs 3 seconds; a chip that escapes breaks your
// streak. The list mirrors Signature Works; Avocado is left out because it
// legitimately lives in two categories. Points are stingy on purpose: only a
// new personal best pays, capped per run.
(function () {
  const CATS = [
    { name: "Base", color: "#c9a97a" },
    { name: "Protein", color: "#ee435b" },
    { name: "Mix-ins", color: "#4caf72" },
    { name: "Sauce", color: "#f0a52c" },
    { name: "Toppings", color: "#22b2b4" },
  ];

  const DECK = [];
  const add = (cat, names) => names.forEach((n) => DECK.push({ name: n, cat: cat }));
  add("Base", ["White Rice", "Salad Mix", "Ramen Noodles"]);
  add("Protein", ["Ahi Tuna", "Atlantic Salmon", "Chicken", "Lobster Surimi", "Firm Tofu"]);
  add("Mix-ins", [
    "Cucumber", "Sliced Onion", "Edamame", "Pineapple", "Cilantro",
    "Hijiki Seaweed", "Mandarin Orange", "Shredded Cabbage", "Shredded Kale", "Sweet Corn",
  ]);
  add("Sauce", ["Sriracha Aioli", "Ponzu Fresh", "Pokeworks Classic", "Umami Shoyu", "Sweet Shoyu", "OG Shoyu"]);
  add("Toppings", [
    "Masago", "Green Onion", "Sesame Seeds", "Onion Crisps", "Shredded Nori",
    "Seaweed Salad", "Chili Flakes", "Surimi Salad", "Pickled Ginger",
    "Garlic Crisps", "Wonton Strips", "Chili Crisp",
  ]);

  const ROUND_SECS = 60;
  const WRONG_PENALTY = 3;
  const BELT_Y = 22; // chip row inside the belt strip
  const BEST_KEY = "pokeworks-rush-best";
  const NAME_KEY = "pokeworks-lb-name";

  // Daily plumbing: a live daily run only if the link says so, it's actually
  // Bowl Rush's day, and today's attempt isn't spent. The deck order comes
  // from the day's seeded stream so everyone sorts the same sequence.
  const wantsDaily = !!(window.Daily && Daily.isRun());
  const isDaily = wantsDaily && Daily.isTodaysGame("br") && !Daily.result();
  let rng = Math.random;

  function sfx(name) {
    if (window.ArcadeSfx && ArcadeSfx[name]) { try { ArcadeSfx[name](); } catch (e) { /* ignore */ } }
  }

  const fieldEl = document.getElementById("rush-field");
  const msgEl = document.getElementById("rush-msg");
  const binsEl = document.getElementById("rush-bins");
  const fillEl = document.getElementById("rush-timer-fill");
  const playEl = document.getElementById("rush-play");
  const overlay = document.getElementById("overlay");
  const screenStart = document.getElementById("screen-start");
  const screenOver = document.getElementById("screen-gameover");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("high-score");
  const overSub = document.getElementById("gameover-subtitle");
  const pointsLine = document.getElementById("points-line");

  let best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { /* ignore */ }
  bestEl.textContent = String(best);

  const screenCount = document.getElementById("screen-count");
  const countNum = document.getElementById("count-num");
  const startTitle = document.getElementById("start-title");
  const startSub = document.getElementById("start-subtitle");
  const startBtn = document.getElementById("start-btn");
  const playAgainBtn = document.getElementById("play-again-btn");
  const lbEntry = document.getElementById("lb-entry");
  const lbName = document.getElementById("lb-name");
  const lbSave = document.getElementById("lb-save-btn");
  const lbDone = document.getElementById("lb-done");

  if (wantsDaily) {
    startTitle.textContent = "🗓 Daily Challenge";
    if (!Daily.isTodaysGame("br")) {
      startSub.textContent =
        "Today's challenge is " + Daily.challenge().game.label + ". Head back to the hub for it.";
      startBtn.classList.add("hidden");
      startBtn.style.display = "none";
    } else if (Daily.result()) {
      startSub.textContent =
        "You've already played today: " + Daily.result().score + " sorted. Back tomorrow for a new line.";
      startBtn.classList.add("hidden");
      startBtn.style.display = "none";
    } else {
      startSub.textContent =
        "Everyone sorts this exact line today. One attempt, so make it count. Wrong tub costs 3 seconds.";
    }
  }

  const state = {
    running: false,
    paused: false,
    score: 0,
    streak: 0,
    bestStreak: 0,
    // Rush orders: a station gets called out and pays double for 8 seconds.
    // Fixed rotation and fixed times, so seeded runs stay identical.
    callAt: 20,
    callUntil: 0,
    callCat: null,
    callIdx: 0,
    timeLeft: ROUND_SECS,
    items: [], // {el, x, y, w, name, cat, dragging, offX, offY}
    spawnIn: 0.6,
    lastName: "",
    lastTime: 0,
  };

  // The rush-order callout chip, floating over the field while a call is on.
  const callEl = document.createElement("div");
  callEl.className = "rush-call";
  callEl.hidden = true;
  fieldEl.appendChild(callEl);

  // Station tubs, colored like the Signature Works palette. Alpha-suffixed
  // hexes feed the tub fill and its drag-hover glow.
  for (const c of CATS) {
    const b = document.createElement("div");
    b.className = "rush-bin";
    b.dataset.cat = c.name;
    b.style.setProperty("--cat", c.color);
    b.style.setProperty("--cat-soft", c.color + "3d");
    b.style.setProperty("--cat-hot", c.color + "8c");
    b.textContent = c.name;
    binsEl.appendChild(b);
  }
  const binByName = (n) => [...binsEl.children].find((b) => b.dataset.cat === n);

  function elapsed() { return ROUND_SECS - state.timeLeft; }
  // The belt hurries up as the round wears on.
  function beltSpeed() {
    const traverse = Math.max(8.5 - elapsed() * 0.05, 5.5); // seconds across
    return (fieldEl.clientWidth + 170) / traverse;
  }
  function spawnEvery() { return Math.max(2.3 - elapsed() * 0.02, 1.2); }

  function setScore(n) {
    state.score = n;
    scoreEl.textContent = String(n);
  }

  function say(text, tone) {
    msgEl.textContent = text;
    msgEl.className = "rush-msg" + (tone ? " " + tone : "");
  }

  function pickIngredient() {
    let it;
    do { it = DECK[Math.floor(rng() * DECK.length)]; }
    while (it.name === state.lastName);
    state.lastName = it.name;
    return it;
  }

  // --- Chips on the belt -----------------------------------------------------
  function spawn() {
    const ing = pickIngredient();
    // One extra roll per spawn, always drawn, keeps seeded runs in lockstep:
    // some ingredients arrive rotten. They belong in NO tub; flick them up
    // off the belt for a point instead.
    const rotten = rng() < 0.15 && elapsed() > 5;
    const el = document.createElement("div");
    el.className = "rush-item" + (rotten ? " rotten" : "");
    el.textContent = (rotten ? "🤢 " : "") + ing.name;
    fieldEl.appendChild(el);
    const item = {
      el: el,
      x: -el.offsetWidth - 6,
      y: BELT_Y,
      w: el.offsetWidth,
      name: ing.name,
      cat: ing.cat,
      rotten: rotten,
      dragging: false,
      offX: 0,
      offY: 0,
    };
    place(item);
    wireDrag(item);
    state.items.push(item);
  }

  function place(it) {
    it.el.style.left = it.x + "px";
    it.el.style.top = it.y + "px";
  }

  function removeItem(it, popAway) {
    const i = state.items.indexOf(it);
    if (i >= 0) state.items.splice(i, 1);
    if (popAway) {
      it.el.classList.add("gone");
      setTimeout(() => it.el.remove(), 200);
    } else {
      it.el.remove();
    }
  }

  function hotBinAt(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    return el ? el.closest(".rush-bin") : null;
  }
  function clearHot() {
    for (const b of binsEl.children) b.classList.remove("hot");
  }

  function wireDrag(it) {
    it.el.addEventListener("pointerdown", (e) => {
      if (!state.running || state.paused || state.manualPause) return;
      e.preventDefault();
      it.dragging = true;
      const rect = fieldEl.getBoundingClientRect();
      it.offX = e.clientX - rect.left - it.x;
      it.offY = e.clientY - rect.top - it.y;
      it.el.classList.add("drag");
      try { it.el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or stale pointer */ }
    });
    it.el.addEventListener("pointermove", (e) => {
      if (!it.dragging) return;
      const rect = fieldEl.getBoundingClientRect();
      it.x = e.clientX - rect.left - it.offX;
      it.y = e.clientY - rect.top - it.offY;
      place(it);
      clearHot();
      const bin = hotBinAt(e.clientX, e.clientY);
      if (bin) bin.classList.add("hot");
    });
    const drop = (e) => {
      if (!it.dragging) return;
      // Hit-test BEFORE restoring the chip's pointer-events, or the chip
      // itself is what elementFromPoint finds and every drop bounces back.
      const bin = hotBinAt(e.clientX, e.clientY);
      it.dragging = false;
      it.el.classList.remove("drag");
      clearHot();
      if (bin) {
        answer(it, bin.dataset.cat);
      } else if (it.rotten && it.y < BELT_Y - 34) {
        // Rotten and flicked up off the belt: binned properly, +1.
        setScore(state.score + 1);
        say("Tossed the rotten " + it.name + ". +1", "good");
        sfx("pop");
        removeItem(it, true);
      } else {
        // Nowhere useful: hop back onto the belt where it left off.
        it.y = BELT_Y;
        it.x = Math.min(it.x, fieldEl.clientWidth - 20);
        place(it);
      }
    };
    it.el.addEventListener("pointerup", drop);
    it.el.addEventListener("pointercancel", drop);
  }

  function answer(it, catName) {
    if (!state.running) return;
    // Rotten food never belongs in a tub.
    if (it.rotten) {
      state.streak = 0;
      state.timeLeft = Math.max(0, state.timeLeft - WRONG_PENALTY);
      say("That " + it.name + " was rotten! Flick it off the belt. -" + WRONG_PENALTY + "s", "bad");
      sfx("thunk");
      if (navigator.vibrate) { try { navigator.vibrate(35); } catch (e) { /* ignore */ } }
      removeItem(it, true);
      return;
    }
    if (catName === it.cat) {
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      if (state.streak >= 25 && window.PokeAch) PokeAch.unlock("br-streak25");
      let gain = 1;
      let note = "+1";
      if (state.streak % 5 === 0) {
        gain += 2;
        note = "🔥 " + state.streak + " in a row! +" + gain;
        sfx("chime");
      } else {
        sfx("pop");
      }
      // Rush orders: the called-out station pays double while the call is on.
      if (state.callUntil > elapsed() && it.cat === state.callCat) {
        gain *= 2;
        note = "📢 " + it.cat + " x2! +" + gain;
      }
      say(note, "good");
      setScore(state.score + gain);
      removeItem(it, true);
    } else {
      state.streak = 0;
      state.timeLeft = Math.max(0, state.timeLeft - WRONG_PENALTY);
      say(it.name + " goes to " + it.cat + ". -" + WRONG_PENALTY + "s", "bad");
      sfx("thunk");
      const right = binByName(it.cat);
      if (right) {
        right.classList.remove("reveal");
        void right.offsetWidth;
        right.classList.add("reveal");
      }
      if (navigator.vibrate) { try { navigator.vibrate(35); } catch (e) { /* ignore */ } }
      removeItem(it, true);
    }
  }

  // --- Round flow --------------------------------------------------------------
  function startGame() {
    for (const it of state.items) it.el.remove();
    state.items = [];
    state.running = true;
    state.paused = false;
    setScore(0);
    state.streak = 0;
    state.bestStreak = 0;
    state.callAt = 20;
    state.callUntil = 0;
    state.callCat = null;
    state.callIdx = 0;
    callEl.hidden = true;
    // The equipped belt skin colors the conveyor.
    if (window.PokeSkins) {
      const beltFace = document.querySelector(".rush-conveyor .belt");
      if (beltFace) beltFace.style.backgroundColor = PokeSkins.active("belt").belt;
    }
    state.timeLeft = ROUND_SECS;
    state.spawnIn = 0.5;
    state.lastName = "";
    state.lastTime = 0;
    say(" ");
    playEl.hidden = false;
    state.manualPause = false;
    screenPaused.classList.add("hidden");
    pauseBtn.style.display = "";
    pauseBtn.textContent = "⏸";
    overlay.classList.add("hidden");
    rng = isDaily ? Daily.stream("br:deck") : Math.random;
    if (window.PokeStreak) PokeStreak.mark();
    if (window.PokeTrack) PokeTrack.hit(isDaily ? "daily" : "play", "rush");
  }

  // 3-2-1 so your hand is over the belt before chips start rolling.
  let counting = false;
  function runCountdown() {
    if (counting || state.running) return;
    counting = true;
    screenStart.classList.add("hidden");
    screenOver.classList.add("hidden");
    screenCount.classList.remove("hidden");
    overlay.classList.remove("hidden");
    let n = 3;
    countNum.textContent = "3";
    sfx("tick");
    const tick = setInterval(() => {
      n--;
      if (n > 0) { countNum.textContent = String(n); sfx("tick"); return; }
      clearInterval(tick);
      counting = false;
      screenCount.classList.add("hidden");
      sfx("go");
      startGame();
    }, 750);
  }

  function loadLbName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; }
  }

  function endGame() {
    state.running = false;
    state.manualPause = false;
    screenPaused.classList.add("hidden");
    pauseBtn.style.display = "none";
    sfx("over");
    // Keep the lifetime best streak around for the achievement wall.
    try {
      const k = "pokeworks-rush-streak-best";
      if (state.bestStreak > (parseInt(localStorage.getItem(k), 10) || 0)) {
        localStorage.setItem(k, String(state.bestStreak));
      }
    } catch (e) { /* ignore */ }
    // Feed the round into today's shop challenges (points for the Rewards Shop).
    if (window.PokeChallenges) {
      PokeChallenges.report("br", {
        score: state.score,
        streak: state.bestStreak,
        seconds: elapsed(),
        runs: 1,
      });
    }
    for (const it of state.items) it.el.remove();
    state.items = [];
    playEl.hidden = true;
    overSub.textContent =
      "You sorted " + state.score + " ingredient" + (state.score === 1 ? "" : "s") + ".";
    pointsLine.hidden = true;
    lbEntry.classList.add("hidden");
    lbDone.classList.add("hidden");

    if (isDaily) {
      // One attempt: post to the day's board; the +50 pts land via the hub.
      Daily.complete(state.score);
      playAgainBtn.hidden = true;
      lbName.value = loadLbName();
      lbEntry.classList.remove("hidden");
    } else {
      playAgainBtn.hidden = false;
      let pts = 0;
      if (state.score > best) {
        pts = Math.min(20, state.score - best);
        best = state.score;
        try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
        bestEl.textContent = String(best);
        if (window.PokePoints) PokePoints.add(pts, "Bowl Rush: new best " + best);
      }
      if (pts > 0) {
        pointsLine.hidden = false;
        pointsLine.textContent = "🏆 New best! +" + pts + " points";
      }
    }
    screenStart.classList.add("hidden");
    screenOver.classList.remove("hidden");
    overlay.classList.remove("hidden");
  }

  async function submitDaily() {
    let name = (lbName.value || "").trim().slice(0, 12);
    if (!name) { lbName.focus(); return; }
    if (window.PokeFilter && !PokeFilter.ok(name)) {
      lbName.value = "";
      lbName.placeholder = "Pick another name";
      return;
    }
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* ignore */ }
    lbSave.disabled = true;
    try { await Daily.submit(name, state.score); } catch (e) { /* local mirror already saved */ }
    lbSave.disabled = false;
    lbEntry.classList.add("hidden");
    lbDone.classList.remove("hidden");
  }
  lbSave.addEventListener("click", submitDaily);
  lbName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitDaily(); }
  });

  startBtn.addEventListener("click", runCountdown);
  playAgainBtn.addEventListener("click", runCountdown);

  // A backgrounded tab freezes the clock rather than eating the round.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) { state.paused = true; state.lastTime = 0; }
    else state.paused = false;
  });

  // Manual pause: the corner ⏸ freezes the clock; Resume picks it back up.
  const pauseBtn = document.getElementById("pause-btn");
  const screenPaused = document.getElementById("screen-paused");
  function setPause(on) {
    if (!state.running) return;
    state.manualPause = on;
    state.lastTime = 0;
    screenPaused.classList.toggle("hidden", !on);
    overlay.classList.toggle("hidden", !on);
    pauseBtn.textContent = on ? "▶" : "⏸";
  }
  pauseBtn.addEventListener("click", () => setPause(!state.manualPause));
  document.getElementById("resume-btn").addEventListener("click", () => setPause(false));

  function frame(t) {
    if (state.running && !state.paused && !state.manualPause) {
      if (!state.lastTime) state.lastTime = t;
      const dt = Math.min((t - state.lastTime) / 1000, 0.05);
      state.lastTime = t;

      state.timeLeft -= dt;
      fillEl.style.transform = "scaleX(" + Math.max(0, state.timeLeft / ROUND_SECS) + ")";
      if (state.timeLeft <= 0) { endGame(); requestAnimationFrame(frame); return; }

      // Rush orders fire every 20 seconds on a fixed station rotation.
      const now = elapsed();
      if (now >= state.callAt) {
        const CALL_ORDER = ["Sauce", "Toppings", "Mix-ins", "Protein", "Base"];
        state.callCat = CALL_ORDER[state.callIdx++ % CALL_ORDER.length];
        state.callUntil = now + 8;
        state.callAt += 20;
        callEl.hidden = false;
        callEl.textContent = "📢 " + state.callCat + " x2";
        say("📢 " + state.callCat + " pay double!", "good");
        sfx("chime");
      }
      if (!callEl.hidden && state.callUntil <= now) callEl.hidden = true;

      state.spawnIn -= dt;
      if (state.spawnIn <= 0) {
        spawn();
        state.spawnIn = spawnEvery();
      }

      const speed = beltSpeed();
      const edge = fieldEl.clientWidth;
      for (let i = state.items.length - 1; i >= 0; i--) {
        const it = state.items[i];
        if (it.dragging) continue;
        it.x += speed * dt;
        place(it);
        if (it.x > edge + 10) {
          // Rolled off the end: no time lost, but the streak is gone.
          // Rotten food leaving on its own is fine.
          if (!it.rotten) {
            if (state.streak > 0) say("Missed " + it.name + "!", "bad");
            state.streak = 0;
          }
          removeItem(it, false);
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
