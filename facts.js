// "Did you know?" — one small Pokeworks fact per spot, rotating daily.
// Any element with data-fact="N" gets filled; N offsets the rotation so two
// spots on the same page never show the same fact.
(function () {
  const FACTS = [
    "Poke means \"to slice\" in Hawaiian.",
    "Pokeworks opened its first store in New York City in 2015.",
    "Pokeworks grew into the largest poke brand in North America.",
    "Building your own bowl is called Poke Your Way.",
    "The poke burrito is wrapped in sushi rice and seaweed.",
    "Pokeworks sources its seafood responsibly.",
    "Poke bowls are served fresh and cold, never cooked to order.",
    "Shoyu is the Japanese word for soy sauce.",
    "Masago is tiny fish roe.",
    "Hijiki is a type of seaweed.",
    "Ponzu sauce gets its tang from citrus.",
    "Edamame are young soybeans.",
    "Crunchy toppings go on last so they stay crunchy.",
    "Ahi tuna is the classic poke protein.",
    "You can get your poke as a bowl, a burrito, or a salad.",
    "The fish in poke is cut into cubes, not slices.",
  ];

  function dayNumber() {
    const d = new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }

  function fill() {
    const day = dayNumber();
    document.querySelectorAll("[data-fact]").forEach((el) => {
      const slot = parseInt(el.getAttribute("data-fact"), 10) || 0;
      const fact = FACTS[(day + slot * 5) % FACTS.length];
      el.textContent = "Did you know? " + fact;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fill);
  } else {
    fill();
  }
})();
