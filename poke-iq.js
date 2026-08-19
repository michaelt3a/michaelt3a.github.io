// Poke IQ — quick multiple-choice trivia about Pokeworks: the menu, the
// ingredients, the brand. 10 questions a round, 10 seconds each, answer fast
// for bonus points. Easy on purpose; it's a snack, not an exam.
//
// Daily mode (?daily=1): the question deck and option order are seeded from
// the date so everyone answers the same round; one attempt, score posts to
// the day's board, and personal-best points sit the day out.
(function () {
  const playEl = document.getElementById("iq-play");
  const timerFill = document.getElementById("iq-timer-fill");
  const progressEl = document.getElementById("iq-progress");
  const questionEl = document.getElementById("iq-question");
  const answersEl = document.getElementById("iq-answers");
  const feedbackEl = document.getElementById("iq-feedback");
  const overlay = document.getElementById("overlay");
  const screenStart = document.getElementById("screen-start");
  const screenOver = document.getElementById("screen-gameover");
  const startTitle = document.getElementById("start-title");
  const startSub = document.getElementById("start-subtitle");
  const startBtn = document.getElementById("start-btn");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("high-score");
  const overSub = document.getElementById("gameover-subtitle");
  const pointsLine = document.getElementById("points-line");
  const playAgainBtn = document.getElementById("play-again-btn");
  const lbEntry = document.getElementById("lb-entry");
  const lbName = document.getElementById("lb-name");
  const lbSave = document.getElementById("lb-save-btn");
  const lbDone = document.getElementById("lb-done");

  const BEST_KEY = "pokeworks-iq-best";
  const STREAK_BEST_KEY = "pokeworks-iq-streak-best";
  const NAME_KEY = "pokeworks-lb-name";
  const ROUND = 10; // questions per round
  const isDaily = window.Daily && Daily.isRun();
  // The day's seeded twist, daily runs only: one parameter changes, same for everyone.
  const DAILY_TWIST = isDaily && Daily.twist ? Daily.twist() : null;
  const SECONDS = DAILY_TWIST && DAILY_TWIST.id === "quick" ? 7 : 10; // per question
  const BONUS_MULT = DAILY_TWIST && DAILY_TWIST.id === "bonus" ? 2 : 1;

  function sfx(name) {
    if (window.ArcadeSfx && ArcadeSfx[name]) { try { ArcadeSfx[name](); } catch (e) { /* ignore */ } }
  }

  // The bank. First option is always the correct one; each round shuffles.
  // Menu facts match the signature works the other games use. `f` is the
  // one-line "did you know" shown after the answer.
  const QUESTIONS = [
    // The brand
    { q: "What kind of food is Pokeworks best known for?", a: ["Poke bowls", "Burgers", "Ramen", "Tacos"], f: "Pokeworks grew into the largest poke brand in North America." },
    { q: "Poke originally comes from where?", a: ["Hawaii", "Texas", "Italy", "Alaska"], f: "Hawaiian fishermen made poke from the day's fresh catch." },
    { q: "What does \"poke\" mean in Hawaiian?", a: ["To slice or cut", "To fry", "Little fish", "Lunch"], f: "The name describes how the fish is cut, not the fish itself." },
    { q: "Build-your-own bowls at Pokeworks are called Poke Your ___.", a: ["Way", "Bowl", "Day", "Fish"], f: "Poke Your Way means any base, protein, mix-ins, sauce, and toppings." },
    { q: "What matters to Pokeworks when picking its seafood?", a: ["Responsible sourcing", "The lowest price", "The biggest fish", "The rarest catch"] },
    { q: "What year did Pokeworks open its first store?", a: ["2015", "1985", "2001", "2022"], f: "The first store opened in New York City in 2015." },
    { q: "Where was the first Pokeworks located?", a: ["New York City", "Honolulu", "Miami", "Las Vegas"] },
    { q: "Pokeworks grew into the largest poke brand in...", a: ["North America", "One neighborhood", "Antarctica", "The world's food courts"] },
    { q: "Pokeworks bowls are made...", a: ["Fresh to order", "The night before", "In a microwave", "At a factory"] },
    // The menu
    { q: "Which of these is on the Pokeworks menu?", a: ["Poke burrito", "Poke pizza", "Poke soup", "Poke sandwich"], f: "The poke burrito wraps a full bowl in sushi rice and seaweed." },
    { q: "What wraps a poke burrito?", a: ["Sushi rice and seaweed", "A flour tortilla", "Lettuce", "A pancake"] },
    { q: "Besides a bowl or a burrito, you can get your poke as a...", a: ["Salad", "Smoothie", "Sub", "Stew"], f: "A poke salad swaps the rice for greens." },
    { q: "Which protein is the classic star of a poke bowl?", a: ["Ahi tuna", "Bacon", "Meatballs", "Turkey"], f: "Ahi is the Hawaiian name for yellowfin tuna." },
    { q: "Which of these is a Pokeworks signature work?", a: ["Spicy Ahi", "Big Kahuna", "Tuna Melt", "Aloha Crunch"] },
    { q: "Which signature work comes with tofu?", a: ["Sweet Shoyu Tofu", "Spicy Ahi", "Luxe Lobster", "Hawaiian Ahi"], f: "Tofu is made from soybeans." },
    { q: "Which signature work comes with chicken?", a: ["Sweet Sesame Chicken", "Umami Ahi", "Yuzu Ponzu Salmon", "Avocado Salad"] },
    { q: "The Surf & Turf pairs ahi tuna with...", a: ["Chicken", "Steak", "Bacon", "Shrimp"], f: "The Surf & Turf sits on chilled ramen noodles and greens." },
    { q: "The Yuzu Ponzu Salmon is built on which protein?", a: ["Atlantic salmon", "Ahi tuna", "Tofu", "Chicken"], f: "Yuzu is a fragrant Japanese citrus." },
    { q: "Which signature work sits on salad instead of rice?", a: ["Avocado Salad", "Spicy Ahi", "Umami Ahi", "Sweet Shoyu Tofu"] },
    { q: "Which of these is a base you can pick?", a: ["White rice", "Mashed potatoes", "French fries", "Garlic bread"] },
    // Ingredients
    { q: "Which of these is a Pokeworks sauce?", a: ["Umami Shoyu", "Marinara", "Ranch", "Maple syrup"], f: "Umami is the savory \"fifth taste.\"" },
    { q: "What gives Sriracha Aioli its kick?", a: ["Chili peppers", "Black coffee", "Mint", "Lemon"] },
    { q: "Ponzu sauce gets its tang from...", a: ["Citrus", "Vinegar-soaked rice", "Mustard", "Pickles"] },
    { q: "Shoyu is the Japanese word for...", a: ["Soy sauce", "Seaweed", "Rice", "Spicy"] },
    { q: "What is masago?", a: ["Tiny fish eggs", "A type of rice", "Dried chili", "A green vegetable"], f: "Masago adds a light salty pop to a bowl." },
    { q: "Tofu is made from...", a: ["Soybeans", "Rice", "Potatoes", "Cheese"] },
    { q: "Shredded nori is thin strips of...", a: ["Dried seaweed", "Cabbage", "Noodles", "Coconut"], f: "Nori is the same seaweed that wraps sushi rolls." },
    { q: "Hijiki is a type of...", a: ["Seaweed", "Mushroom", "Pepper", "Bean"] },
    { q: "Which of these mix-ins is a fruit?", a: ["Pineapple", "Edamame", "Hijiki seaweed", "Green onion"] },
    { q: "Green onions are also called...", a: ["Scallions", "Shallots", "Leeks", "Chives"] },
    { q: "Which topping is pickled?", a: ["Pickled ginger", "Masago", "Sesame seeds", "Onion crisps"], f: "Pickled ginger cleanses the palate between bites." },
    { q: "Which of these is a crunchy topping?", a: ["Onion crisps", "Seaweed salad", "Masago", "Sriracha aioli"] },
    { q: "What do wonton strips add to a bowl?", a: ["Crunch", "Sweetness", "Heat", "Sauce"] },
    { q: "Chili crisp tastes...", a: ["Spicy", "Sweet", "Sour", "Minty"] },
    { q: "Which of these is a healthy fat you'll find in bowls?", a: ["Avocado", "White rice", "Wonton strips", "Pickled ginger"], f: "Avocado is a fruit, botanically speaking." },
    { q: "Salmon and tuna are famously rich in...", a: ["Protein and omega-3s", "Sugar", "Caffeine", "Gluten"] },
    { q: "Which of these does NOT belong on a poke bowl?", a: ["Pepperoni", "Masago", "Seaweed salad", "Cucumber"] },
    // How it's made
    { q: "How is the fish in poke usually cut?", a: ["Into cubes", "Into thin rings", "Ground up", "Whole"] },
    { q: "A poke bowl is served...", a: ["Fresh and cold", "Baked", "Deep-fried", "Flambeed"] },
    { q: "What goes into the bowl first?", a: ["The base", "The sauce", "The crunch", "The chopsticks"] },
    { q: "At the counter, your bowl gets built...", a: ["Step by step down the line", "All at once in the back", "By a robot", "Upside down"] },
    { q: "Why do crunchy toppings go on last?", a: ["So they stay crunchy", "They're the heaviest", "For good luck", "No reason"] },
    { q: "Raw fish stays safe to eat by staying...", a: ["Cold", "Salty", "In the dark", "Wrapped in rice"] },
    // Round two of the bank
    { q: "Which of these is a Pokeworks mix-in?", a: ["Edamame", "Croutons", "Bacon bits", "Marshmallows"], f: "Edamame are young soybeans." },
    { q: "What color is masago?", a: ["Orange", "Blue", "Black", "Green"] },
    { q: "The Spicy Ahi gets its heat from...", a: ["Sriracha aioli", "Black pepper", "Mustard", "Ketchup"] },
    { q: "Which signature work uses lobster surimi?", a: ["Luxe Lobster", "Spicy Ahi", "Hawaiian Ahi", "Avocado Salad"] },
    { q: "Besides greens, the Surf & Turf base includes...", a: ["Ramen noodles", "Fries", "Couscous", "Toast"] },
    { q: "Pickled ginger is usually what color?", a: ["Pink", "Blue", "Black", "Dark green"] },
    { q: "A poke salad swaps the rice for...", a: ["Salad greens", "Noodles", "Chips", "Bread"] },
    { q: "Seaweed salad is usually seasoned with...", a: ["Sesame", "Cinnamon", "Ketchup", "Maple syrup"] },
    { q: "Avocado is technically a...", a: ["Fruit", "Root", "Bean", "Grain"] },
    { q: "Which of these is NOT a Pokeworks sauce?", a: ["Alfredo", "Ponzu Fresh", "Sweet Shoyu", "Sriracha Aioli"] },
    { q: "Cucumber adds what to a bowl?", a: ["Crunch and freshness", "Heat", "Sweetness", "Smoke"] },
    { q: "Ahi is the Hawaiian name for...", a: ["Yellowfin tuna", "Salmon", "Shrimp", "Eel"] },
    { q: "Which topping is fish eggs?", a: ["Masago", "Sesame seeds", "Chili crisp", "Onion crisps"] },
    { q: "Sushi rice is seasoned with...", a: ["Rice vinegar", "Olive oil", "Butter", "Honey"], f: "The vinegar is what makes sushi rice taste different from plain rice." },
    { q: "A classic poke bowl is mostly...", a: ["Fresh fish, rice, and veggies", "Fried food", "Cheese", "Bread"] },
    { q: "Which protein fits a vegetarian bowl?", a: ["Tofu", "Ahi tuna", "Atlantic salmon", "Lobster surimi"] },
    { q: "Mandarin orange shows up in which signature work?", a: ["Sweet Sesame Chicken", "Spicy Ahi", "Umami Ahi", "Sweet Shoyu Tofu"] },
    { q: "What makes chili crisp crunchy?", a: ["Fried chili bits", "Ice", "Raw rice", "Sugar"] },
    { q: "Hijiki seaweed looks like...", a: ["Small dark strands", "Big green leaves", "White cubes", "Orange pearls"] },
    { q: "Sesame seeds on a bowl add...", a: ["A nutty finish", "Heat", "Sourness", "Color only"] },
  ];

  // --- Round state ---------------------------------------------------------
  let best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { /* ignore */ }
  bestEl.textContent = String(best);

  const state = {
    running: false,
    deck: [], // [{q, options: [..4], correct: index}]
    idx: 0,
    score: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    remaining: SECONDS,
    timer: 0,
    locked: false, // between answer and next question
    startAt: 0,
  };

  function setScore(n) {
    state.score = n;
    scoreEl.textContent = String(n);
  }

  // Deck for this round: pick ROUND questions and shuffle each one's options.
  // The daily deck draws everything from the seeded stream, so the whole
  // round is identical for everyone before anyone answers.
  function buildDeck() {
    const rng = isDaily ? Daily.stream("iq:deck") : Math.random;
    const order = QUESTIONS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order.slice(0, ROUND).map((qi) => {
      const src = QUESTIONS[qi];
      const opts = src.a.map((text, i) => ({ text: text, good: i === 0 }));
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      return { q: src.q, options: opts, f: src.f || null };
    });
  }

  // --- The question timer --------------------------------------------------
  // 100ms ticks; pauses while the tab is hidden so nobody loses a question
  // to a text message.
  function stopTimer() {
    clearInterval(state.timer);
    state.timer = 0;
  }
  function startTimer() {
    stopTimer();
    state.timer = setInterval(() => {
      if (document.hidden || state.locked) return;
      state.remaining -= 0.1;
      paintTimer();
      if (state.remaining <= 0) timeUp();
    }, 100);
  }
  function paintTimer() {
    const f = Math.max(0, state.remaining / SECONDS);
    timerFill.style.width = f * 100 + "%";
    timerFill.classList.toggle("low", f < 0.3);
  }

  // --- Questions -----------------------------------------------------------
  function showQuestion() {
    const item = state.deck[state.idx];
    state.locked = false;
    state.remaining = SECONDS;
    paintTimer();
    progressEl.textContent = (state.idx + 1) + " / " + ROUND;
    questionEl.textContent = item.q;
    feedbackEl.textContent = " ";
    answersEl.innerHTML = "";
    item.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "iq-answer";
      b.textContent = opt.text;
      b.addEventListener("click", () => pick(i));
      answersEl.appendChild(b);
    });
    startTimer();
  }

  function markAnswers(pickedIdx) {
    const item = state.deck[state.idx];
    const btns = answersEl.children;
    for (let i = 0; i < btns.length; i++) {
      btns[i].disabled = true;
      if (item.options[i].good) btns[i].classList.add("good");
      else if (i === pickedIdx) btns[i].classList.add("bad");
    }
  }

  // The result line, plus the question's "did you know" when it has one.
  // Facts get a longer beat so they can actually be read.
  function showFeedback(headline, fact) {
    feedbackEl.innerHTML = "";
    feedbackEl.appendChild(document.createTextNode(headline));
    if (fact) {
      const s = document.createElement("span");
      s.className = "iq-fact";
      s.textContent = "Did you know? " + fact;
      feedbackEl.appendChild(s);
    }
    return fact ? 2300 : 950;
  }

  function pick(i) {
    if (!state.running || state.locked) return;
    state.locked = true;
    stopTimer();
    const item = state.deck[state.idx];
    markAnswers(i);
    let delay;
    if (item.options[i].good) {
      const bonus = Math.round(50 * BONUS_MULT * (state.remaining / SECONDS));
      setScore(state.score + 100 + bonus);
      state.correct++;
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      delay = showFeedback("+" + (100 + bonus), item.f);
      sfx("pop");
    } else {
      state.streak = 0;
      delay = showFeedback("Not this one.", item.f);
      answersEl.classList.remove("iq-shake");
      void answersEl.offsetWidth;
      answersEl.classList.add("iq-shake");
      sfx("thunk");
    }
    setTimeout(next, delay);
  }

  function timeUp() {
    if (!state.running || state.locked) return;
    state.locked = true;
    stopTimer();
    state.streak = 0;
    markAnswers(-1);
    const delay = showFeedback("Time!", state.deck[state.idx].f);
    answersEl.classList.remove("iq-shake");
    void answersEl.offsetWidth;
    answersEl.classList.add("iq-shake");
    sfx("thunk");
    setTimeout(next, delay);
  }

  // Desktop: 1-4 answer the question.
  window.addEventListener("keydown", (e) => {
    if (!state.running || state.locked) return;
    if (e.target && e.target.tagName === "INPUT") return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4 && answersEl.children[n - 1]) {
      e.preventDefault();
      answersEl.children[n - 1].click();
    }
  });

  function next() {
    if (!state.running) return;
    state.idx++;
    if (state.idx >= ROUND) endGame();
    else showQuestion();
  }

  // --- Round start / end ---------------------------------------------------
  function startGame() {
    state.running = true;
    state.deck = buildDeck();
    state.idx = 0;
    state.correct = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.startAt = performance.now();
    setScore(0);
    playEl.hidden = false;
    overlay.classList.add("hidden");
    if (window.PokeStreak) PokeStreak.mark();
    if (window.PokeTrack) PokeTrack.hit(isDaily ? "daily" : "play", "iq");
    showQuestion();
  }

  function endGame() {
    state.running = false;
    stopTimer();
    playEl.hidden = true;
    sfx("over");
    // Keep the lifetime best streak around for the achievement wall.
    try {
      if (state.bestStreak > (parseInt(localStorage.getItem(STREAK_BEST_KEY), 10) || 0)) {
        localStorage.setItem(STREAK_BEST_KEY, String(state.bestStreak));
      }
    } catch (e) { /* ignore */ }
    if (window.PokeAch) {
      if (state.correct === ROUND) PokeAch.unlock("iq-perfect");
      if (state.bestStreak >= 10) PokeAch.unlock("iq-streak10");
    }
    // Feed the round into today's shop challenges (points for the Rewards Shop).
    if (window.PokeChallenges) {
      PokeChallenges.report("iq", {
        score: state.score,
        correct: state.correct,
        missed: ROUND - state.correct,
        streak: state.bestStreak,
        seconds: (performance.now() - state.startAt) / 1000,
        runs: 1,
      });
    }
    overSub.textContent =
      "You got " + state.correct + " of " + ROUND + " for " + state.score + " pts." +
      (state.score < best && best - state.score <= 100
        ? " " + (best - state.score) + " short of your best (" + best + ")."
        : "");
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
      const prevBest = best;
      if (state.score > best) {
        // Scores run 0-1500, so scale the new-best award down to the same
        // capped range the other arcade games pay.
        pts = Math.min(20, Math.max(1, Math.round((state.score - best) / 25)));
        best = state.score;
        try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
        bestEl.textContent = String(best);
        if (prevBest > 0) overSub.textContent += " Your old best was " + prevBest + ".";
        if (window.PokePoints) PokePoints.add(pts, "Poke IQ: new best " + best);
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

  function loadLbName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; }
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
    addDailyShare();
  }
  // One plain share line after posting a daily score.
  function addDailyShare() {
    if (document.getElementById("daily-share-btn")) return;
    const b = document.createElement("button");
    b.id = "daily-share-btn";
    b.type = "button";
    b.className = "btn btn-secondary";
    b.textContent = "Share score";
    b.addEventListener("click", () => {
      const text = "Pokeworks Daily · Poke IQ · " + state.score + " pts · " +
        location.origin + location.pathname.replace(/[^/]*$/, "");
      if (navigator.share) {
        navigator.share({ text: text }).catch(() => { /* backed out, fine */ });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => { b.textContent = "✓ Copied"; });
      }
    });
    lbDone.after(b);
  }
  lbSave.addEventListener("click", submitDaily);
  lbName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitDaily(); }
  });

  startBtn.addEventListener("click", startGame);
  playAgainBtn.addEventListener("click", () => {
    screenOver.classList.add("hidden");
    startGame();
  });

  // The next quest worth chasing, on the start screen (normal runs only).
  {
    const qh = document.getElementById("quest-hint");
    if (qh && !isDaily && window.PokeChallenges && PokeChallenges.startHint) {
      qh.textContent = PokeChallenges.startHint("iq");
    }
  }

  // Daily Challenge chrome: launched as poke-iq.html?daily=1.
  if (isDaily) {
    const done = Daily.result();
    startTitle.textContent = "🗓 Daily Challenge";
    if (!Daily.isTodaysGame("iq")) {
      // Stale link — today's challenge is a different game.
      startSub.textContent =
        "Today's challenge is " + Daily.challenge().game.label + ". Head back to the hub for it.";
      startBtn.hidden = true;
    } else if (done) {
      startSub.textContent =
        "You've already played today: " + done.score + " pts. Come back tomorrow.";
      startBtn.hidden = true;
    } else {
      startSub.textContent = "Everyone gets the same questions today. You get one attempt." +
        (DAILY_TWIST ? " Today's twist: " + DAILY_TWIST.label + ". " + DAILY_TWIST.desc : "");
    }
  }

  // Presentation Mode hook: jump straight to the results screen. Inert in
  // normal play.
  if (window.PokeDemo && PokeDemo.active) {
    PokeDemo.register("iq", {
      finish: () => {
        if (!state.running) return;
        stopTimer();
        state.idx = ROUND;
        endGame();
      },
    });
  }
})();
