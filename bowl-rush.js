// Bowl Rush — sort each called-out ingredient to its station (Base, Protein,
// Mix-ins, Sauce, Toppings) before the 60-second clock runs out. A wrong
// station costs 3 seconds. The ingredient list mirrors Signature Works;
// Avocado is left out because it legitimately lives in two categories.
// Points are stingy on purpose: only a new personal best pays, capped.
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
  const BEST_KEY = "pokeworks-rush-best";

  const playEl = document.getElementById("rush-play");
  const cardEl = document.getElementById("rush-card");
  const msgEl = document.getElementById("rush-msg");
  const binsEl = document.getElementById("rush-bins");
  const fillEl = document.getElementById("rush-timer-fill");
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

  const state = {
    running: false,
    paused: false,
    score: 0,
    streak: 0,
    timeLeft: ROUND_SECS,
    order: [], // shuffled indexes into DECK
    pos: 0,
    current: null,
    lastTime: 0,
    locked: false, // brief input lock while a wrong answer is revealed
  };

  // Station buttons, colored like the Signature Works palette.
  for (const c of CATS) {
    const b = document.createElement("button");
    b.className = "rush-bin";
    b.type = "button";
    b.style.setProperty("--cat", c.color);
    b.textContent = c.name;
    b.addEventListener("click", () => answer(c.name, b));
    binsEl.appendChild(b);
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function nextItem() {
    if (state.pos >= state.order.length) {
      const last = state.current;
      state.order = shuffle(DECK.map((_, i) => i));
      // Don't show the same ingredient twice in a row across the reshuffle.
      if (last && DECK[state.order[0]].name === last.name) {
        [state.order[0], state.order[1]] = [state.order[1], state.order[0]];
      }
      state.pos = 0;
    }
    state.current = DECK[state.order[state.pos++]];
    cardEl.textContent = state.current.name;
    cardEl.classList.remove("pop", "shake");
    void cardEl.offsetWidth; // restart the animation
    cardEl.classList.add("pop");
  }

  function setScore(n) {
    state.score = n;
    scoreEl.textContent = String(n);
  }

  function say(text, tone) {
    msgEl.textContent = text;
    msgEl.className = "rush-msg" + (tone ? " " + tone : "");
  }

  function answer(catName, btn) {
    if (!state.running || state.locked || !state.current) return;
    if (catName === state.current.cat) {
      state.streak++;
      let gain = 1;
      // Every 5 in a row pays a small bonus and says so.
      if (state.streak % 5 === 0) {
        gain += 2;
        say("🔥 " + state.streak + " in a row! +" + gain, "good");
      } else {
        say("+1", "good");
      }
      setScore(state.score + gain);
      nextItem();
    } else {
      state.streak = 0;
      state.timeLeft = Math.max(0, state.timeLeft - WRONG_PENALTY);
      say(state.current.name + " goes to " + state.current.cat + ". -" + WRONG_PENALTY + "s", "bad");
      cardEl.classList.remove("pop", "shake");
      void cardEl.offsetWidth;
      cardEl.classList.add("shake");
      if (navigator.vibrate) { try { navigator.vibrate(35); } catch (e) { /* ignore */ } }
      // Flash the right station, hold input a beat, then move on.
      const bins = [...binsEl.children];
      const right = bins.find((b) => b.textContent === state.current.cat);
      if (right) {
        right.classList.remove("reveal");
        void right.offsetWidth;
        right.classList.add("reveal");
      }
      state.locked = true;
      setTimeout(() => {
        state.locked = false;
        if (state.running) nextItem();
      }, 650);
    }
  }

  function startGame() {
    state.running = true;
    state.paused = false;
    state.locked = false;
    setScore(0);
    state.streak = 0;
    state.timeLeft = ROUND_SECS;
    state.order = shuffle(DECK.map((_, i) => i));
    state.pos = 0;
    state.current = null;
    state.lastTime = 0;
    say(" ");
    playEl.hidden = false;
    overlay.classList.add("hidden");
    nextItem();
    if (window.PokeStreak) PokeStreak.mark();
    if (window.PokeTrack) PokeTrack.hit("play", "rush");
  }

  function endGame() {
    state.running = false;
    playEl.hidden = true;
    overSub.textContent =
      "You sorted " + state.score + " ingredient" + (state.score === 1 ? "" : "s") + ".";
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
    } else {
      pointsLine.hidden = true;
    }
    screenStart.classList.add("hidden");
    screenOver.classList.remove("hidden");
    overlay.classList.remove("hidden");
  }

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("play-again-btn").addEventListener("click", () => {
    screenOver.classList.add("hidden");
    startGame();
  });

  // A backgrounded tab freezes the clock rather than eating the round.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) { state.paused = true; state.lastTime = 0; }
    else state.paused = false;
  });

  function frame(t) {
    if (state.running && !state.paused) {
      if (!state.lastTime) state.lastTime = t;
      const dt = Math.min((t - state.lastTime) / 1000, 0.05);
      state.lastTime = t;
      state.timeLeft -= dt;
      fillEl.style.transform = "scaleX(" + Math.max(0, state.timeLeft / ROUND_SECS) + ")";
      if (state.timeLeft <= 0) endGame();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
