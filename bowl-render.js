// Shared realistic poke-bowl renderer + the Pokeworks signature recipe data.
// Draws the same bowls as Signature Works so both games look identical.
// Self-contained; attaches everything to window.Bowl. Expects a 560x320 canvas.
(function () {
  const CATEGORIES = ["Base", "Protein", "Mix-ins", "Sauce", "Toppings"];

  const CATEGORY_COLOR = {
    "Base": "#c9a97a",
    "Protein": "#ee435b",
    "Mix-ins": "#4caf72",
    "Sauce": "#f0a52c",
    "Toppings": "#22b2b4",
  };

  // Every ingredient that appears across the signature works, by category.
  const INGREDIENTS = {
    "Base": ["White Rice", "Salad Mix"],
    "Protein": ["Ahi Tuna", "Atlantic Salmon", "Chicken", "Lobster Surimi", "Firm Tofu", "Avocado"],
    "Mix-ins": [
      "Cucumber", "Sliced Onion", "Edamame", "Pineapple", "Cilantro",
      "Hijiki Seaweed", "Mandarin Orange", "Shredded Cabbage", "Shredded Kale", "Sweet Corn",
    ],
    "Sauce": ["Sriracha Aioli", "Ponzu Fresh", "Pokeworks Classic", "Umami Shoyu", "Sweet Shoyu", "OG Shoyu"],
    "Toppings": [
      "Masago", "Green Onion", "Sesame Seeds", "Onion Crisps", "Shredded Nori",
      "Seaweed Salad", "Chili Flakes", "Surimi Salad", "Pickled Ginger",
      "Garlic Crisps", "Wonton Strips", "Avocado", "Chili Crisp",
    ],
  };

  const RECIPES = [
    { name: "Spicy Ahi", items: {
      "Base": ["White Rice"], "Protein": ["Ahi Tuna"],
      "Mix-ins": ["Cucumber", "Sliced Onion", "Edamame"],
      "Sauce": ["Sriracha Aioli"],
      "Toppings": ["Masago", "Green Onion", "Sesame Seeds", "Onion Crisps", "Shredded Nori"] } },
    { name: "Yuzu Ponzu Salmon", items: {
      "Base": ["White Rice"], "Protein": ["Atlantic Salmon"],
      "Mix-ins": ["Cucumber", "Sliced Onion", "Pineapple", "Cilantro"],
      "Sauce": ["Ponzu Fresh"],
      "Toppings": ["Seaweed Salad", "Green Onion", "Sesame Seeds", "Onion Crisps"] } },
    { name: "Hawaiian Ahi", items: {
      "Base": ["White Rice"], "Protein": ["Ahi Tuna"],
      "Mix-ins": ["Cucumber", "Sliced Onion", "Hijiki Seaweed", "Edamame"],
      "Sauce": ["Pokeworks Classic"],
      "Toppings": ["Chili Flakes", "Seaweed Salad", "Green Onion", "Sesame Seeds"] } },
    { name: "Umami Ahi", items: {
      "Base": ["White Rice"], "Protein": ["Ahi Tuna"],
      "Mix-ins": ["Cucumber", "Sliced Onion", "Hijiki Seaweed", "Edamame"],
      "Sauce": ["Umami Shoyu"],
      "Toppings": ["Surimi Salad", "Pickled Ginger", "Green Onion", "Sesame Seeds", "Garlic Crisps"] } },
    { name: "Sweet Sesame Chicken", items: {
      "Base": ["White Rice"], "Protein": ["Chicken"],
      "Mix-ins": ["Cucumber", "Sliced Onion", "Edamame", "Mandarin Orange", "Cilantro"],
      "Sauce": ["Pokeworks Classic"],
      "Toppings": ["Seaweed Salad", "Green Onion", "Sesame Seeds", "Wonton Strips"] } },
    { name: "Luxe Lobster", items: {
      "Base": ["White Rice"], "Protein": ["Lobster Surimi"],
      "Mix-ins": ["Cucumber", "Sliced Onion", "Shredded Cabbage", "Mandarin Orange", "Hijiki Seaweed"],
      "Sauce": ["Ponzu Fresh"],
      "Toppings": ["Sesame Seeds", "Onion Crisps"] } },
    { name: "Sweet Shoyu Tofu", items: {
      "Base": ["White Rice"], "Protein": ["Firm Tofu"],
      "Mix-ins": ["Cucumber", "Sliced Onion", "Shredded Kale", "Edamame"],
      "Sauce": ["Sweet Shoyu"],
      "Toppings": ["Avocado", "Green Onion", "Sesame Seeds"] } },
    { name: "Avocado Salad", items: {
      "Base": ["Salad Mix"], "Protein": ["Avocado"],
      "Mix-ins": ["Cucumber", "Shredded Cabbage", "Shredded Kale", "Sweet Corn"],
      "Sauce": ["Ponzu Fresh"],
      "Toppings": ["Pickled Ginger", "Green Onion", "Shredded Nori", "Wonton Strips"] } },
  ];

  // Per-ingredient look: colors + a shape "kind".
  const STYLE = {
    "White Rice": { c: ["#f7f2e6", "#ece3cf", "#fbf8ef"], kind: "grain" },
    "Salad Mix": { c: ["#8fc95f", "#5f9e3a", "#3f7d34", "#9c5a6a", "#a7d16a"], kind: "leaf" },
    "Ahi Tuna": { c: ["#d9483d", "#c23a30"], kind: "cube" },
    "Atlantic Salmon": { c: ["#f98d54", "#f2743a"], kind: "cube" },
    "Chicken": { c: ["#dcb684", "#caa063"], kind: "cube" },
    "Lobster Surimi": { c: ["#f6bdb2", "#e0644f"], kind: "cube" },
    "Firm Tofu": { c: ["#f5efe0", "#e7ddc6"], kind: "cube" },
    "Avocado": { c: ["#8dbf50", "#6fa53f"], kind: "cube" },
    "Cucumber": { c: ["#cfe89a", "#a9d16a", "#dcefb6"], kind: "slice" },
    "Sliced Onion": { c: ["#ead9ef", "#c39ccb"], kind: "ring" },
    "Edamame": { c: ["#8ec63f", "#72af2c"], kind: "bean" },
    "Pineapple": { c: ["#f6ce3f", "#e8b120"], kind: "chunk" },
    "Cilantro": { c: ["#4faf59", "#2f7d3f"], kind: "fleck" },
    "Hijiki Seaweed": { c: ["#2a2a2a", "#141414"], kind: "strand" },
    "Mandarin Orange": { c: ["#f8a23a", "#f4922e"], kind: "chunk" },
    "Shredded Cabbage": { c: ["#e9e6c6", "#cdd98a"], kind: "shred" },
    "Shredded Kale": { c: ["#3a7d43", "#265a2f"], kind: "shred" },
    "Sweet Corn": { c: ["#f7cf4a", "#eab52a"], kind: "chunk" },
    "Sriracha Aioli": { c: ["#e8674f", "#d9503a"], kind: "drizzle" },
    "Ponzu Fresh": { c: ["#b5892f", "#96702a"], kind: "drizzle" },
    "Pokeworks Classic": { c: ["#8a5a2b", "#6e461f"], kind: "drizzle" },
    "Umami Shoyu": { c: ["#6b4423", "#4f311a"], kind: "drizzle" },
    "Sweet Shoyu": { c: ["#7a4a1f", "#5c3717"], kind: "drizzle" },
    "OG Shoyu": { c: ["#5a3a1a", "#402812"], kind: "drizzle" },
    "Masago": { c: ["#ffb35a", "#f6952e"], kind: "tiny" },
    "Green Onion": { c: ["#7cc24a", "#4e8a37"], kind: "ring" },
    "Sesame Seeds": { c: ["#f2e6c8", "#e2cf9e"], kind: "tiny" },
    "Onion Crisps": { c: ["#d9a441", "#c48a2a"], kind: "crisp" },
    "Shredded Nori": { c: ["#1f3a2a", "#12251b"], kind: "strand" },
    "Seaweed Salad": { c: ["#3f9d4f", "#2f7d3f"], kind: "strand" },
    "Chili Flakes": { c: ["#d6402c", "#b52f1a"], kind: "tiny" },
    "Surimi Salad": { c: ["#f6bdb2", "#ef958c"], kind: "shred" },
    "Pickled Ginger": { c: ["#f3c6cd", "#e79aa8"], kind: "slice" },
    "Garlic Crisps": { c: ["#e6c77a", "#d1a94e"], kind: "crisp" },
    "Wonton Strips": { c: ["#ecc266", "#d9a441"], kind: "chunk" },
    "Chili Crisp": { c: ["#b52f1a", "#8f2313"], kind: "tiny" },
  };

  function rnd(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  // All drawing routes through the module-level `g` context, set at draw() entry.
  let g = null;

  function mEll(rx, ry, stroke) { g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill(); if (stroke) g.stroke(); }
  function mRR(x, y, w, h, r, stroke) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); if (stroke) g.stroke(); }
  function mCirc(rad, stroke) { g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill(); if (stroke) g.stroke(); }
  function mRing(rad) { g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke(); }

  function drawMorsel(x, y, sz, name, seed) {
    const st = STYLE[name] || { c: ["#cfc6b0"], kind: "cube" };
    const col = st.c[seed % st.c.length];
    g.save();
    g.translate(x, y);
    g.rotate((rnd(seed * 1.3) - 0.5) * 1.7);
    g.fillStyle = col;
    g.strokeStyle = "rgba(0,0,0,0.14)";
    g.lineWidth = 0.8;
    switch (st.kind) {
      case "grain": mEll(sz * 0.95, sz * 0.4, true); break;
      case "cube": mRR(-sz * 0.75, -sz * 0.75, sz * 1.5, sz * 1.5, 2.5, true); break;
      case "bean": mEll(sz * 0.85, sz * 0.55, true); break;
      case "chunk": mRR(-sz * 0.75, -sz * 0.6, sz * 1.5, sz * 1.2, 2.5, true); break;
      case "slice":
        mCirc(sz * 0.85, false);
        g.strokeStyle = "rgba(60,90,40,0.5)"; g.lineWidth = 1.6; mRing(sz * 0.85);
        break;
      case "ring":
        g.strokeStyle = col; g.lineWidth = Math.max(1.8, sz * 0.42); mRing(sz * 0.72);
        break;
      case "strand": mRR(-sz * 1.25, -sz * 0.22, sz * 2.5, sz * 0.44, sz * 0.22, false); break;
      case "shred": mRR(-sz * 1.35, -sz * 0.16, sz * 2.7, sz * 0.32, sz * 0.16, false); break;
      case "leaf": mEll(sz * 0.95, sz * 0.5, true); break;
      case "crisp": mRR(-sz * 0.7, -sz * 0.55, sz * 1.4, sz * 1.1, 1.5, true); break;
      case "tiny": case "fleck": mCirc(sz * 0.42, false); break;
      case "drizzle": g.globalAlpha = 0.6; mEll(sz * 0.7, sz * 0.5, false); break;
      default: mCirc(sz * 0.6, true);
    }
    g.restore();
  }

  function drawBed(cx, rimY, innerRx, innerRy, baseName) {
    const isSalad = baseName === "Salad Mix";
    g.fillStyle = isSalad ? "#356e2f" : "#e6d9bf";
    g.beginPath();
    g.ellipse(cx, rimY, innerRx - 5, innerRy - 2, 0, 0, Math.PI * 2);
    g.fill();

    const n = isSalad ? 320 : 680;
    const base = isSalad ? 8.5 : 3.6;
    for (let i = 0; i < n; i++) {
      const rn = Math.sqrt((i + 0.4) / n);
      const a = i * 2.39996 + rnd(i) * 0.5;
      const px = cx + Math.cos(a) * rn * (innerRx - 8);
      const py = rimY + Math.sin(a) * rn * (innerRy - 3);
      const sz = base * (0.8 + rnd(i * 2.3) * 0.5);
      drawMorsel(px, py, sz, baseName, i);
    }
  }

  function drawDrizzle(cx, rimY, sauces) {
    g.save();
    g.lineCap = "round";
    g.globalAlpha = 0.55;
    sauces.forEach((name, si) => {
      const st = STYLE[name] || { c: ["#8a5a2b"] };
      g.strokeStyle = st.c[0];
      g.lineWidth = 2.6;
      for (let k = 0; k < 3; k++) {
        const yy = rimY - 8 + si * 5 + k * 6;
        g.beginPath();
        for (let x = -58; x <= 58; x += 7) {
          const px = cx + x + (si * 12 - 10);
          const py = yy + Math.sin((x + si * 22 + k * 9) * 0.13) * 4;
          if (x === -58) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      }
    });
    g.restore();
  }

  function drawFill(cx, rimY, innerRx, innerRy, sel) {
    const baseName = [...sel["Base"]][0];
    if (baseName) drawBed(cx, rimY, innerRx, innerRy, baseName);

    const AMOUNT = { "Protein": 24, "Mix-ins": 22, "Toppings": 18 };
    const SIZE = { "Protein": 9, "Mix-ins": 7.5, "Toppings": 6 };
    const specs = [];
    for (const cat of ["Protein", "Mix-ins", "Toppings"]) {
      for (const name of sel[cat]) {
        for (let k = 0; k < AMOUNT[cat]; k++) {
          specs.push({ name, size: SIZE[cat], key: rnd(specs.length * 1.7 + 0.3) });
        }
      }
    }
    specs.sort((a, b) => a.key - b.key);

    const T = specs.length;
    const morsels = [];
    for (let i = 0; i < T; i++) {
      const rn = Math.sqrt((i + 0.5) / T);
      const a = i * 2.39996;
      const px = cx + Math.cos(a) * rn * (innerRx - 12);
      const py = rimY + 2 + Math.sin(a) * rn * (innerRy - 6);
      morsels.push({ px, py, name: specs[i].name, size: specs[i].size, seed: i });
    }
    morsels.sort((a, b) => a.py - b.py);
    for (const m of morsels) drawMorsel(m.px, m.py, m.size, m.name, m.seed);

    const sauces = [...sel["Sauce"]];
    if (sauces.length) drawDrizzle(cx, rimY, sauces);
  }

  // Draw a bowl of `sel` (category -> Set of names) into `context`.
  // Coordinates are tuned for a 560x320 canvas.
  function draw(context, W, H, sel) {
    g = context;
    g.clearRect(0, 0, W, H);
    const cx = W / 2;
    const rimY = 138;
    const rimRx = 226;
    const rimRy = 54;
    const innerRx = 208;
    const innerRy = 46;
    const bottomY = 300;

    g.fillStyle = "rgba(0,0,0,0.1)";
    g.beginPath();
    g.ellipse(cx, bottomY + 12, rimRx * 0.8, 13, 0, 0, Math.PI * 2);
    g.fill();

    g.beginPath();
    g.moveTo(cx - rimRx, rimY);
    g.bezierCurveTo(cx - rimRx, rimY + 95, cx - 80, bottomY, cx, bottomY);
    g.bezierCurveTo(cx + 80, bottomY, cx + rimRx, rimY + 95, cx + rimRx, rimY);
    g.ellipse(cx, rimY, rimRx, rimRy, 0, 0, Math.PI, false);
    g.closePath();
    const body = g.createLinearGradient(0, rimY - rimRy, 0, bottomY);
    body.addColorStop(0, "#fbf6ec");
    body.addColorStop(1, "#e2d4bc");
    g.fillStyle = body;
    g.fill();
    g.strokeStyle = "rgba(120,95,55,0.25)";
    g.lineWidth = 2;
    g.stroke();

    g.beginPath();
    g.ellipse(cx, rimY, innerRx, innerRy, 0, 0, Math.PI * 2);
    const inside = g.createRadialGradient(cx, rimY - 12, 10, cx, rimY + 8, innerRx);
    inside.addColorStop(0, "#e3d4b6");
    inside.addColorStop(1, "#bfa984");
    g.fillStyle = inside;
    g.fill();

    g.save();
    g.beginPath();
    g.ellipse(cx, rimY - 4, innerRx - 4, innerRy + 20, 0, 0, Math.PI * 2);
    g.clip();
    drawFill(cx, rimY, innerRx, innerRy, sel);
    g.restore();

    g.beginPath();
    g.ellipse(cx, rimY, innerRx, innerRy, 0, Math.PI, Math.PI * 2, false);
    g.strokeStyle = "rgba(85,65,38,0.2)";
    g.lineWidth = 6;
    g.stroke();
    g.beginPath();
    g.ellipse(cx, rimY, innerRx, innerRy, 0, 0, Math.PI, false);
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.lineWidth = 2.5;
    g.stroke();
    g.beginPath();
    g.ellipse(cx, rimY, rimRx, rimRy, 0, 0, Math.PI * 2);
    g.strokeStyle = "rgba(120,95,55,0.22)";
    g.lineWidth = 2;
    g.stroke();
  }

  // A full pan of one ingredient, filled to the brim — for the metal
  // containers on the ingredient line. Draws into a small canvas.
  function drawScoop(context, W, H, name) {
    g = context;
    g.clearRect(0, 0, W, H);
    const st = STYLE[name] || { c: ["#ccc"] };

    // Colour wash so gaps between morsels never show the empty pan.
    g.fillStyle = st.c[st.c.length > 1 ? 1 : 0];
    g.fillRect(0, 0, W, H);

    // Dense jittered grid covering the whole pan.
    const size = 6.2;
    const step = size * 1.5;
    let seed = 1;
    const pts = [];
    for (let y = size * 0.4; y < H + step; y += step) {
      for (let x = size * 0.4; x < W + step; x += step) {
        const jx = x + (rnd(seed * 1.7) - 0.5) * step * 0.8;
        const jy = y + (rnd(seed * 2.3) - 0.5) * step * 0.8;
        pts.push({ jx, jy, seed });
        seed++;
      }
    }
    pts.sort((a, b) => a.jy - b.jy); // back-to-front so overlaps read right
    for (const p of pts) drawMorsel(p.jx, p.jy, size, name, p.seed);

    // Soft top sheen, like light on food in a pan.
    g.save();
    const sheen = g.createLinearGradient(0, 0, 0, H);
    sheen.addColorStop(0, "rgba(255,255,255,0.22)");
    sheen.addColorStop(0.35, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  window.Bowl = { CATEGORIES, CATEGORY_COLOR, INGREDIENTS, RECIPES, STYLE, draw, drawScoop };
})();
