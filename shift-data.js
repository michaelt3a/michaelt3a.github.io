// The Shift — data layer. Menu knowledge, ingredient specs, order
// generation, customer names and dialogue. No state, no DOM, no canvas.
(function () {
  // Every ingredient the line can hold. utensil = the right tool for it.
  // Roster follows the store's Toppings SOP: scooped toppings ring the bowl,
  // sprinkles go on top of the protein with a (gloved) pinch.
  const INGREDIENTS = {
    tuna:      { name: "Ahi Tuna",      kind: "protein",  utensil: "spoodle" },
    salmon:    { name: "Salmon",        kind: "protein",  utensil: "spoodle" },
    chicken:   { name: "Chicken",       kind: "protein",  utensil: "spoodle" },
    tofu:      { name: "Tofu",          kind: "protein",  utensil: "spoodle" },
    shrimp:    { name: "Shrimp",        kind: "protein",  utensil: "spoodle" },
    cucumber:  { name: "Cucumber",      kind: "mixin",    utensil: "tongs" },
    slonion:   { name: "Sliced Onion",  kind: "mixin",    utensil: "tongs" },
    cabbage:   { name: "Cabbage",       kind: "mixin",    utensil: "tongs" },
    edamame:   { name: "Edamame",       kind: "mixin",    utensil: "tongs" },
    corn:      { name: "Sweet Corn",    kind: "mixin",    utensil: "tongs" },
    avocado:   { name: "Avocado",       kind: "topping",  utensil: "tongs" },
    surimi:    { name: "Surimi Salad",  kind: "topping",  utensil: "tongs" },
    seaweed:   { name: "Seaweed Salad", kind: "topping",  utensil: "tongs" },
    masago:    { name: "Masago",        kind: "topping",  utensil: "tongs" },
    gonion:    { name: "Green Onion",   kind: "sprinkle", utensil: "pinch" },
    sesame:    { name: "Sesame Seeds",  kind: "sprinkle", utensil: "pinch" },
    crisponion:{ name: "Crispy Onion",  kind: "sprinkle", utensil: "pinch" },
    wonton:    { name: "Wontons",       kind: "sprinkle", utensil: "pinch" },
  };
  const PROTEINS = ["tuna", "salmon", "chicken", "tofu", "shrimp"];
  const MIXINS = ["cucumber", "slonion", "cabbage", "edamame", "corn"];
  const TOPPINGS = ["avocado", "surimi", "seaweed", "masago"];
  const SPRINKLES = ["gonion", "sesame", "crisponion", "wonton"];

  const SAUCES = {
    classic:  { name: "Pokeworks Classic", color: "#8a5a2b", cap: "#c98a3d" },
    shoyu:    { name: "Umami Shoyu",       color: "#4a2f1d", cap: "#2f4a68" },
    ginger:   { name: "Spicy Ginger",      color: "#d4552a", cap: "#e0762d" },
    sriracha: { name: "Sriracha Aioli",    color: "#e8935c", cap: "#d1452e" },
    wasabi:   { name: "Wasabi Aioli",      color: "#b9cf8e", cap: "#6d9b4a" },
    chili:    { name: "Sweet Chili",       color: "#c43d3d", cap: "#e0a32d" },
  };

  const DRINKS = {
    greentea: { name: "Green Tea",   color: "#b7d9a0" },
    lemonade: { name: "Lemonade",    color: "#f2e08a" },
    punch:    { name: "Fruit Punch", color: "#e05a6e" },
    water:    { name: "Water",       color: "#bcd9e8" },
  };

  const SIDES = {
    taro:    { name: "Taro Chips",   where: "shelf",   color: "#8a63b0" },
    wchips:  { name: "Wonton Chips", where: "shelf",   color: "#d9a441" },
    mochi:   { name: "Mochi",        where: "freezer", color: "#8fd0a8" },
    cookie:  { name: "Cookie",       where: "shelf",   color: "#a0714a" },
  };

  const RICES = { white: { name: "White Rice" }, brown: { name: "Brown Rice" } };

  // Customer names. Pickup orders get one of these on the ticket.
  const NAMES = ["Kai", "Jordan", "Sam", "Riley", "Maya", "Leo", "Ana", "Marcus",
    "Nina", "Theo", "Priya", "Drew", "Wes", "Lena", "Omar", "Casey", "Iris", "Beto"];

  // Questions customers may ask before ordering (the A in Mahalo).
  // One right answer, two wrong ones.
  const QUESTIONS = [
    { q: "Is the salmon raw?",
      right: "Yes, it's sushi grade raw salmon.",
      wrong: ["No, everything here is cooked.", "It's smoked, like lox."] },
    { q: "Which sauce is the spiciest?",
      right: "Spicy Ginger has the most heat.",
      wrong: ["Umami Shoyu is the spicy one.", "None of our sauces have heat."] },
    { q: "Do you have anything vegetarian?",
      right: "Yes, the tofu bowl is vegetarian.",
      wrong: ["No, every bowl has fish.", "Only the shrimp bowl."] },
    { q: "What is masago?",
      right: "Seasoned fish roe, tiny crunchy eggs.",
      wrong: ["A kind of seaweed.", "Pickled radish."] },
    { q: "What's the difference between regular and large?",
      right: "Large gets an extra rice and protein scoop.",
      wrong: ["Large just comes in a bigger bowl.", "Large comes with a free drink."] },
    { q: "Is the sweet chili sauce gluten free?",
      right: "I can check the allergen card for you.",
      wrong: ["Everything here is gluten free.", "Sauce never has gluten."] },
  ];

  // Comment strings for the end-of-shift feedback wall, picked by star band.
  const COMMENTS = {
    5: ["Perfect bowl, perfect service.", "Fast, friendly, exactly right.",
        "Best lunch stop around.", "They even asked how it was. Nice touch."],
    4: ["Really good, tiny wait.", "Solid bowl, would come back.",
        "Good spot. Almost perfect."],
    3: ["Food was fine. Service was okay.", "Took a while to get my order.",
        "Decent, but something was off."],
    2: ["My order wasn't right.", "Long wait and a messy counter.",
        "Nobody greeted me for a while."],
    1: ["Wrong order and no apology.", "Waited forever. Not coming back.",
        "The counter was a mess and so was my bowl."],
  };

  // ---- Order generation --------------------------------------------------
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickN(arr, n) {
    const a = arr.slice();
    const out = [];
    while (out.length < n && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
    return out;
  }

  let orderSeq = 30 + Math.floor(Math.random() * 20);

  // One bowl: size, rice, protein scoops (split across 1-2 proteins),
  // mix-ins, one sauce, toppings, mixed or drizzled.
  function genBowl() {
    const size = Math.random() < 0.32 ? "large" : "regular";
    const scoops = size === "large" ? 3 : 2;
    const prots = Math.random() < 0.3 ? pickN(PROTEINS, 2) : [pick(PROTEINS)];
    const protein = {};
    if (prots.length === 2) {
      protein[prots[0]] = scoops - 1;
      protein[prots[1]] = 1;
    } else {
      protein[prots[0]] = scoops;
    }
    return {
      size: size,
      rice: Math.random() < 0.3 ? "brown" : "white",
      protein: protein,
      mixins: pickN(MIXINS, 1 + Math.floor(Math.random() * 2)),
      sauce: pick(Object.keys(SAUCES)),
      toppings: pickN(TOPPINGS, 1 + Math.floor(Math.random() * 2)),
      sprinkles: pickN(SPRINKLES, 1 + Math.floor(Math.random() * 2)),
      mixed: Math.random() < 0.65,
    };
  }

  function genOrder(type, name) {
    orderSeq += 1 + Math.floor(Math.random() * 3);
    const bowls = [genBowl()];
    if (type === "pickup" && Math.random() < 0.25) bowls.push(genBowl());
    const o = {
      id: "o" + orderSeq + "-" + Math.floor(Math.random() * 999),
      num: orderSeq,
      name: name || pick(NAMES),
      type: type,
      bowls: bowls,
      drink: Math.random() < 0.55 ? pick(Object.keys(DRINKS)) : null,
      side: Math.random() < 0.45 ? pick(Object.keys(SIDES)) : null,
    };
    return o;
  }

  // The big pre-open catering job: several bowls plus drinks and sides.
  function genCatering() {
    orderSeq += 1;
    return {
      id: "cat" + orderSeq,
      num: orderSeq,
      name: "Harbor Office",
      type: "catering",
      bowls: [genBowl(), genBowl(), genBowl()],
      drink: pick(Object.keys(DRINKS)),
      side: pick(Object.keys(SIDES)),
    };
  }

  // Spoken version of an order, for walk-in speech bubbles.
  function speakOrder(o) {
    const parts = [];
    for (const b of o.bowls) {
      const prots = Object.keys(b.protein).map(function (p) {
        return INGREDIENTS[p].name.toLowerCase();
      }).join(" and ");
      parts.push("a " + b.size + " " + prots + " bowl on " + b.rice + " rice, " +
        b.mixins.map(function (m) { return INGREDIENTS[m].name.toLowerCase(); }).join(" and ") +
        ", " + SAUCES[b.sauce].name.toLowerCase() + (b.mixed ? ", mixed" : ", sauce on top") +
        ", topped with " + b.toppings.concat(b.sprinkles || []).map(function (t) { return INGREDIENTS[t].name.toLowerCase(); }).join(" and "));
    }
    if (o.drink) parts.push("a " + DRINKS[o.drink].name.toLowerCase());
    if (o.side) parts.push(SIDES[o.side].name.toLowerCase());
    return "I'll take " + parts.join(", plus ") + ".";
  }

  // Printed ticket lines, for the KDS and rail labels.
  function ticketLines(o) {
    const lines = [];
    for (const b of o.bowls) {
      lines.push((b.size === "large" ? "LG" : "REG") + " bowl, " + b.rice + " rice");
      lines.push("  " + Object.keys(b.protein).map(function (p) {
        return INGREDIENTS[p].name + " x" + b.protein[p];
      }).join(", "));
      lines.push("  " + b.mixins.map(function (m) { return INGREDIENTS[m].name; }).join(", "));
      lines.push("  " + SAUCES[b.sauce].name + (b.mixed ? " (mixed)" : " (on top)"));
      lines.push("  + " + b.toppings.map(function (t) { return INGREDIENTS[t].name; }).join(", "));
      if (b.sprinkles && b.sprinkles.length)
        lines.push("  ~ " + b.sprinkles.map(function (t) { return INGREDIENTS[t].name; }).join(", "));
    }
    if (o.drink) lines.push(DRINKS[o.drink].name);
    if (o.side) lines.push(SIDES[o.side].name);
    return lines;
  }

  window.ShiftData = {
    INGREDIENTS: INGREDIENTS, PROTEINS: PROTEINS, MIXINS: MIXINS, TOPPINGS: TOPPINGS, SPRINKLES: SPRINKLES,
    SAUCES: SAUCES, DRINKS: DRINKS, SIDES: SIDES, RICES: RICES,
    NAMES: NAMES, QUESTIONS: QUESTIONS, COMMENTS: COMMENTS,
    genOrder: genOrder, genCatering: genCatering,
    speakOrder: speakOrder, ticketLines: ticketLines,
    pick: pick,
  };
})();
