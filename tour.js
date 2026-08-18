// First-visit tour: three quick pointers so a new player finds the loop
// (daily -> challenges -> shop) instead of bouncing off a wall of cards.
// Runs once, is always skippable, and never bothers anyone who has already
// earned points somewhere.
(function () {
  const KEY = "pokeworks-toured";
  function done() {
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ }
  }
  try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }
  // Existing players clearly found their way around already.
  if (window.PokePoints && PokePoints.data().earned > 0) { done(); return; }

  const STEPS = [
    {
      sel: '[data-open="sheet-daily"]',
      title: "🗓 The Daily Challenge",
      text: "One shared run a day lives behind this button. Everyone gets the same game, one attempt each.",
    },
    {
      sel: '[data-open="sheet-you"]',
      title: "👤 Your profile",
      text: "Set your name here, plus stats, achievements, boards, and the day's point challenges.",
    },
    {
      sel: '.pk-corner a[href="shop.html"]',
      title: "🎁 The Rewards Shop",
      text: "Points add up to discount codes. That's the loop. Have fun!",
    },
  ];

  let idx = 0;
  let target = null;

  const dim = document.createElement("div");
  dim.className = "tour-dim";
  const bubble = document.createElement("div");
  bubble.className = "tour-bubble";
  bubble.innerHTML =
    '<strong class="tour-title"></strong><p class="tour-text"></p>' +
    '<div class="tour-row"><button class="tour-skip" type="button">Skip</button>' +
    '<span class="tour-dots"></span>' +
    '<button class="tour-next btn" type="button">Next</button></div>';

  function clear() {
    if (target) target.classList.remove("tour-spot");
    target = null;
  }
  function finish() {
    clear();
    dim.remove();
    bubble.remove();
    done();
  }

  function show(i) {
    clear();
    const step = STEPS[i];
    target = document.querySelector(step.sel);
    if (!target) { finish(); return; }
    target.classList.add("tour-spot");
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    bubble.querySelector(".tour-title").textContent = step.title;
    bubble.querySelector(".tour-text").textContent = step.text;
    bubble.querySelector(".tour-next").textContent = i === STEPS.length - 1 ? "Done" : "Next";
    bubble.querySelector(".tour-dots").textContent = (i + 1) + " / " + STEPS.length;
    // Place the bubble under the target once the scroll settles.
    setTimeout(function () {
      const r = target.getBoundingClientRect();
      const w = bubble.offsetWidth;
      bubble.style.top = Math.min(r.bottom + 10, window.innerHeight - bubble.offsetHeight - 12) + "px";
      bubble.style.left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) + "px";
    }, 350);
  }

  bubble.addEventListener("click", function (e) {
    if (e.target.closest(".tour-skip")) { finish(); return; }
    if (e.target.closest(".tour-next")) {
      idx++;
      if (idx >= STEPS.length) finish();
      else show(idx);
    }
  });
  dim.addEventListener("click", finish); // tapping the dark part bails out

  // Let the hub paint first so the targets exist and sit still.
  setTimeout(function () {
    if (!document.querySelector(STEPS[0].sel)) { done(); return; }
    document.body.appendChild(dim);
    document.body.appendChild(bubble);
    show(0);
  }, 700);
})();
