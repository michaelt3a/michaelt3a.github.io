// The Shift — canvas drawing library. Pure functions, no game state.
// Everything food-related is drawn here so pans, scoops, bowls and bags
// all show the same ingredient art at any size.
(function () {
  const D = () => window.ShiftData;

  // Small seeded rng so chunk layouts inside pans don't reshuffle per frame.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Single chunk renderers (drawn around 0,0; r is a size hint) -------
  const CHUNKS = {
    tuna: function (c, r) {
      c.fillStyle = "#a8283a"; c.beginPath(); c.roundRect(-r, -r * 0.7, r * 2, r * 1.5, r * 0.3); c.fill();
      c.fillStyle = "#c23b4a"; c.beginPath(); c.roundRect(-r, -r * 0.9, r * 2, r * 1.3, r * 0.3); c.fill();
      c.fillStyle = "rgba(255,255,255,0.28)"; c.beginPath(); c.roundRect(-r * 0.6, -r * 0.75, r * 0.9, r * 0.35, r * 0.18); c.fill();
    },
    salmon: function (c, r) {
      c.fillStyle = "#d96f47"; c.beginPath(); c.roundRect(-r, -r * 0.7, r * 2, r * 1.5, r * 0.3); c.fill();
      c.fillStyle = "#f28963"; c.beginPath(); c.roundRect(-r, -r * 0.9, r * 2, r * 1.3, r * 0.3); c.fill();
      c.strokeStyle = "rgba(255,240,230,0.7)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-r * 0.7, -r * 0.4); c.quadraticCurveTo(0, -r * 0.7, r * 0.7, -r * 0.4); c.stroke();
    },
    chicken: function (c, r) {
      c.fillStyle = "#a06b38"; c.beginPath(); c.ellipse(0, r * 0.15, r, r * 0.75, 0, 0, 7); c.fill();
      c.fillStyle = "#c68a4e"; c.beginPath(); c.ellipse(0, 0, r, r * 0.75, 0, 0, 7); c.fill();
      c.fillStyle = "rgba(255,220,170,0.5)"; c.beginPath(); c.ellipse(-r * 0.3, -r * 0.25, r * 0.4, r * 0.25, 0, 0, 7); c.fill();
    },
    tofu: function (c, r) {
      c.fillStyle = "#d8cfba"; c.beginPath(); c.roundRect(-r, -r * 0.6, r * 2, r * 1.4, r * 0.2); c.fill();
      c.fillStyle = "#f2ead8"; c.beginPath(); c.roundRect(-r, -r * 0.85, r * 2, r * 1.25, r * 0.2); c.fill();
    },
    shrimp: function (c, r) {
      c.strokeStyle = "#f5a8a0"; c.lineWidth = r * 0.85; c.lineCap = "round";
      c.beginPath(); c.arc(0, 0, r * 0.8, 0.6, 3.6); c.stroke();
      c.strokeStyle = "#e06a5e"; c.lineWidth = r * 0.2;
      c.beginPath(); c.arc(0, 0, r * 0.8, 1.2, 1.7); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.8, 2.3, 2.8); c.stroke();
    },
    cucumber: function (c, r) {
      c.fillStyle = "#7fae5c"; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
      c.fillStyle = "#d9ecc0"; c.beginPath(); c.arc(0, 0, r * 0.8, 0, 7); c.fill();
      c.fillStyle = "#b8d698";
      for (let i = 0; i < 5; i++) { const a = i * 1.256; c.beginPath(); c.arc(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, r * 0.1, 0, 7); c.fill(); }
    },
    edamame: function (c, r) {
      c.fillStyle = "#5da03f"; c.beginPath(); c.ellipse(-r * 0.4, r * 0.1, r * 0.5, r * 0.4, 0.4, 0, 7); c.fill();
      c.fillStyle = "#7cc25e"; c.beginPath(); c.ellipse(-r * 0.45, 0, r * 0.5, r * 0.4, 0.4, 0, 7); c.fill();
      c.fillStyle = "#5da03f"; c.beginPath(); c.ellipse(r * 0.45, r * 0.1, r * 0.5, r * 0.4, -0.3, 0, 7); c.fill();
      c.fillStyle = "#7cc25e"; c.beginPath(); c.ellipse(r * 0.4, 0, r * 0.5, r * 0.4, -0.3, 0, 7); c.fill();
    },
    corn: function (c, r) {
      c.fillStyle = "#d9b52d"; c.beginPath(); c.arc(0, r * 0.15, r * 0.55, 0, 7); c.fill();
      c.fillStyle = "#f5d442"; c.beginPath(); c.arc(0, 0, r * 0.55, 0, 7); c.fill();
    },
    gonion: function (c, r) {
      c.strokeStyle = "#9ccf6e"; c.lineWidth = r * 0.35;
      c.beginPath(); c.arc(0, 0, r * 0.55, 0, 7); c.stroke();
      c.strokeStyle = "#6da844"; c.lineWidth = r * 0.12;
      c.beginPath(); c.arc(0, 0, r * 0.72, 0, 7); c.stroke();
    },
    avocado: function (c, r) {
      c.strokeStyle = "#5e8f4a"; c.lineCap = "round"; c.lineWidth = r * 0.9;
      c.beginPath(); c.arc(0, 0, r * 0.9, 3.5, 5.9); c.stroke();
      c.strokeStyle = "#b6d98a"; c.lineWidth = r * 0.6;
      c.beginPath(); c.arc(0, 0, r * 0.9, 3.55, 5.85); c.stroke();
    },
    seaweed: function (c, r) {
      c.strokeStyle = "#3f7a4e"; c.lineWidth = r * 0.3; c.lineCap = "round";
      c.beginPath(); c.moveTo(-r, r * 0.3); c.quadraticCurveTo(-r * 0.2, -r, r * 0.5, r * 0.2); c.stroke();
      c.strokeStyle = "#2c5c38"; c.beginPath(); c.moveTo(-r * 0.6, r * 0.6); c.quadraticCurveTo(r * 0.3, -r * 0.5, r, r * 0.4); c.stroke();
    },
    masago: function (c, r) {
      c.fillStyle = "#f5923e";
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, rr = (i % 3 + 1) * r * 0.22;
        c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.7, r * 0.22, 0, 7); c.fill();
      }
      c.fillStyle = "#e07a28"; c.beginPath(); c.arc(r * 0.2, r * 0.2, r * 0.2, 0, 7); c.fill();
    },
    crisponion: function (c, r) {
      c.strokeStyle = "#d9a45e"; c.lineWidth = r * 0.28; c.lineCap = "round";
      c.beginPath(); c.moveTo(-r, 0); c.bezierCurveTo(-r * 0.3, -r, r * 0.3, r, r, -r * 0.2); c.stroke();
      c.strokeStyle = "#b8823d";
      c.beginPath(); c.moveTo(-r * 0.7, r * 0.5); c.quadraticCurveTo(0, -r * 0.4, r * 0.8, r * 0.4); c.stroke();
    },
    wonton: function (c, r) {
      c.fillStyle = "#c9a144"; c.beginPath(); c.moveTo(-r, r * 0.75); c.lineTo(r, r * 0.75); c.lineTo(r * 0.2, -r * 0.75); c.closePath(); c.fill();
      c.fillStyle = "#e8c05e"; c.beginPath(); c.moveTo(-r, r * 0.6); c.lineTo(r * 0.9, r * 0.6); c.lineTo(r * 0.15, -r * 0.8); c.closePath(); c.fill();
    },
  };

  function drawChunk(c, ing, x, y, r, rot) {
    const fn = CHUNKS[ing];
    if (!fn) return;
    c.save(); c.translate(x, y); c.rotate(rot || 0); fn(c, r); c.restore();
  }

  // Rice drawn as a speckled mound inside a clipping region.
  function riceFill(c, type) {
    return type === "brown" ? "#d9b98a" : "#f5f0e4";
  }
  function riceSpeck(c, type) {
    return type === "brown" ? "#b8905c" : "#ddd6c2";
  }
  function drawRiceMound(c, x, y, w, h, type, seed) {
    const r = rng(seed || 7);
    c.fillStyle = riceFill(c, type);
    c.beginPath(); c.ellipse(x, y, w / 2, h / 2, 0, 0, 7); c.fill();
    c.fillStyle = riceSpeck(c, type);
    for (let i = 0; i < Math.max(8, w / 3); i++) {
      const a = r() * 6.28, d = Math.sqrt(r());
      c.beginPath();
      c.ellipse(x + Math.cos(a) * d * w * 0.42, y + Math.sin(a) * d * h * 0.42, 1.6, 0.8, a, 0, 7);
      c.fill();
    }
  }

  // ---- Hotel pan (sixth/third pan seen from the worker's side) -----------
  // fill: 0..1. Food chunks sit in the opening; fewer chunks and visible
  // steel as the pan empties. seed keeps the layout stable.
  function drawHotelPan(c, x, y, w, h, ing, fill, seed, label) {
    // outer steel
    c.fillStyle = "#b6bdc4";
    c.beginPath(); c.roundRect(x - 3, y - 3, w + 6, h + 6, 6); c.fill();
    c.fillStyle = "#d7dce0";
    c.beginPath(); c.roundRect(x - 3, y - 3, w + 6, 5, 3); c.fill();
    // cavity
    c.fillStyle = "#878f96";
    c.beginPath(); c.roundRect(x, y, w, h, 4); c.fill();
    c.fillStyle = "#6f767d";
    c.beginPath(); c.roundRect(x, y, w, h * 0.35, 4); c.fill();
    if (ing && fill > 0.01) {
      const r = rng(seed || 3);
      c.save();
      c.beginPath(); c.roundRect(x + 2, y + 2, w - 4, h - 4, 3); c.clip();
      // food occupies the lower portion as it empties
      const topY = y + 4 + (h - 8) * (1 - Math.min(1, fill)) * 0.55;
      const n = Math.round((w * h) / 260 * Math.max(0.15, fill));
      const cr = Math.min(9, w / 11);
      // a darker bed under the chunks so gaps read as food, not steel
      if (fill > 0.25) {
        c.fillStyle = "rgba(0,0,0,0.16)";
        c.beginPath(); c.roundRect(x + 3, topY, w - 6, y + h - topY, 3); c.fill();
      }
      const chunks = [];
      for (let i = 0; i < n; i++) {
        chunks.push({
          cx: x + 6 + r() * (w - 12),
          cy: topY + 3 + r() * Math.max(4, (y + h - 6) - topY),
          rot: r() * 6.28, sc: 0.75 + r() * 0.5,
        });
      }
      chunks.sort(function (a, b) { return a.cy - b.cy; });
      for (const ch of chunks) drawChunk(c, ing, ch.cx, ch.cy, cr * ch.sc, ch.rot);
      c.restore();
    }
    if (label) {
      c.fillStyle = "#f4ede3";
      c.beginPath(); c.roundRect(x + w / 2 - 26, y + h - 1, 52, 11, 2); c.fill();
      c.fillStyle = "#333"; c.font = "700 7px system-ui, sans-serif"; c.textAlign = "center";
      c.fillText(label.toUpperCase(), x + w / 2, y + h + 7);
    }
  }

  // ---- Rice cooker -------------------------------------------------------
  function drawRiceCooker(c, x, y, R, o) {
    // body
    c.fillStyle = o.type === "brown" ? "#7d6a58" : "#8d949c";
    c.beginPath(); c.roundRect(x - R, y - R * 0.6, R * 2, R * 1.35, 10); c.fill();
    c.fillStyle = "rgba(255,255,255,0.16)";
    c.beginPath(); c.roundRect(x - R * 0.8, y - R * 0.55, R * 0.5, R * 1.2, 6); c.fill();
    // opening
    c.fillStyle = "#5c6268";
    c.beginPath(); c.ellipse(x, y - R * 0.6, R * 0.92, R * 0.3, 0, 0, 7); c.fill();
    if (o.level > 0 && o.cooked) {
      const lv = Math.min(1, o.level / o.capacity);
      drawRiceMound(c, x, y - R * 0.6 - lv * 4, R * 1.7 * (0.6 + lv * 0.4), R * 0.5 * (0.5 + lv * 0.5), o.type, 11);
    } else if (o.level > 0) {
      // uncooked: wet grain sitting low in the pot
      c.fillStyle = o.type === "brown" ? "#a8916c" : "#dcd6c6";
      c.beginPath(); c.ellipse(x, y - R * 0.58, R * 0.7, R * 0.18, 0, 0, 7); c.fill();
    }
    // lid, resting on top or set beside
    if (!o.open) {
      c.fillStyle = "#d7dce0";
      c.beginPath(); c.ellipse(x, y - R * 0.68, R * 0.98, R * 0.34, 0, 0, 7); c.fill();
      c.fillStyle = "#b6bdc4";
      c.beginPath(); c.ellipse(x, y - R * 0.72, R * 0.3, R * 0.12, 0, 0, 7); c.fill();
    }
    // switch + light
    c.fillStyle = "#3a3f45";
    c.beginPath(); c.roundRect(x - R * 0.35, y + R * 0.42, R * 0.7, R * 0.3, 4); c.fill();
    c.fillStyle = o.on ? (o.cooked ? "#4be07a" : "#ffd15a") : "#61686e";
    c.beginPath(); c.arc(x - R * 0.15, y + R * 0.57, 3.4, 0, 7); c.fill();
    c.fillStyle = "#c9ced2";
    c.beginPath(); c.roundRect(x + R * 0.05, y + R * 0.48, R * 0.22, R * 0.18, 2); c.fill();
  }

  // ---- Serving bowl ------------------------------------------------------
  // b: {size, riceType, rice, base:[{ing,amount}], pour:{color,amount},
  //     sauce:{id,amount}, toppings:[{ing,amount}], lid}
  function drawServingBowl(c, x, y, s, b) {
    const w = (b.size === "large" ? 66 : 54) * s, h = w * 0.42;
    // shadow
    c.fillStyle = "rgba(0,0,0,0.15)";
    c.beginPath(); c.ellipse(x, y + h * 0.55, w * 0.55, h * 0.2, 0, 0, 7); c.fill();
    // bowl
    c.fillStyle = "#e8e4dc";
    c.beginPath(); c.moveTo(x - w * 0.55, y); c.quadraticCurveTo(x, y + h * 1.5, x + w * 0.55, y); c.closePath(); c.fill();
    c.fillStyle = "#f7f4ee";
    c.beginPath(); c.ellipse(x, y, w * 0.55, h * 0.42, 0, 0, 7); c.fill();
    c.fillStyle = "#ddd8ce";
    c.beginPath(); c.ellipse(x, y, w * 0.47, h * 0.34, 0, 0, 7); c.fill();
    const hasFood = b.rice > 0 || b.base.length || (b.pour && b.pour.amount > 0);
    if (b.rice > 0) {
      drawRiceMound(c, x, y - 2 * s, w * 0.85 * Math.min(1, 0.7 + b.rice * 0.15), h * 0.62, b.riceType, 21);
    }
    // direct-built base items (unmixed orders)
    let bi = 0;
    for (const it of b.base) {
      const r = rng(31 + bi * 7); bi++;
      for (let k = 0; k < Math.round(it.amount * 3); k++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * w * 0.3;
        drawChunk(c, it.ing, x + Math.cos(a) * d, y - 3 * s - r() * 4 + Math.sin(a) * d * 0.35, 5.5 * s, r() * 6.28);
      }
    }
    // poured mix from the metal bowl: one blended, saucy heap
    if (b.pour && b.pour.amount > 0) {
      c.fillStyle = b.pour.color;
      c.beginPath(); c.ellipse(x, y - 4 * s, w * 0.4, h * 0.34, 0, 0, 7); c.fill();
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.beginPath(); c.ellipse(x - w * 0.1, y - 6 * s, w * 0.18, h * 0.12, 0, 0, 7); c.fill();
      const r = rng(47);
      for (let k = 0; k < Math.round(b.pour.amount * 5); k++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * w * 0.3;
        drawChunk(c, b.pour.bits[Math.floor(r() * b.pour.bits.length)], x + Math.cos(a) * d, y - 4 * s + Math.sin(a) * d * 0.3, 4.5 * s, r() * 6.28);
      }
    }
    // toppings sit last, on top
    let ti = 0;
    for (const t of b.toppings) {
      const r = rng(61 + ti * 13); ti++;
      for (let k = 0; k < Math.round(t.amount * 3); k++) {
        const a = (ti * 1.9 + k * 2.1) % 6.28, d = (0.12 + r() * 0.22) * w;
        drawChunk(c, t.ing, x + Math.cos(a) * d, y - 6 * s + Math.sin(a) * d * 0.3, 5 * s, r() * 6.28);
      }
    }
    // drizzle
    if (b.sauce && b.sauce.amount > 0 && hasFood) {
      c.strokeStyle = (D().SAUCES[b.sauce.id] || {}).color || "#8a5a2b";
      c.lineWidth = 2 * s; c.lineCap = "round";
      const zig = Math.min(4, 1 + Math.floor(b.sauce.amount * 3));
      c.beginPath();
      for (let i = 0; i <= zig * 2; i++) {
        const px = x - w * 0.33 + (i / (zig * 2)) * w * 0.66;
        const py = y - 6 * s + (i % 2 ? -4 : 4) * s;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
      if (b.sauce.amount > 1.6) { // drowned
        c.fillStyle = (D().SAUCES[b.sauce.id] || {}).color || "#8a5a2b";
        c.globalAlpha = 0.45;
        c.beginPath(); c.ellipse(x, y - 2 * s, w * 0.42, h * 0.3, 0, 0, 7); c.fill();
        c.globalAlpha = 1;
      }
    }
    if (b.lid) {
      c.fillStyle = "rgba(235,240,244,0.72)";
      c.beginPath(); c.ellipse(x, y - 4 * s, w * 0.56, h * 0.5, 0, 3.14, 6.28); c.lineTo(x + w * 0.56, y);
      c.ellipse(x, y - 1 * s, w * 0.56, h * 0.22, 0, 0, 3.14, false); c.closePath(); c.fill();
      c.strokeStyle = "rgba(160,170,178,0.9)"; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(x, y - 1 * s, w * 0.56, h * 0.22, 0, 0, 7); c.stroke();
      c.fillStyle = "rgba(255,255,255,0.5)";
      c.beginPath(); c.ellipse(x - w * 0.2, y - h * 0.42, w * 0.12, h * 0.1, -0.5, 0, 7); c.fill();
    }
  }

  // ---- Metal mixing bowl -------------------------------------------------
  // m: {items:[{ing,amount}], sauce:{id,amount}|null, mix:0..1}
  function mixColor(m) {
    const s = m.sauce ? (D().SAUCES[m.sauce.id] || {}).color : "#b0b6a4";
    return s || "#b0b6a4";
  }
  function drawMetalBowl(c, x, y, s, m) {
    const w = 56 * s, h = 24 * s;
    c.fillStyle = "rgba(0,0,0,0.15)";
    c.beginPath(); c.ellipse(x, y + h * 0.6, w * 0.5, h * 0.18, 0, 0, 7); c.fill();
    c.fillStyle = "#9ea6ad";
    c.beginPath(); c.moveTo(x - w * 0.55, y); c.quadraticCurveTo(x, y + h * 1.7, x + w * 0.55, y); c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.beginPath(); c.moveTo(x - w * 0.4, y + h * 0.25); c.quadraticCurveTo(x - w * 0.28, y + h * 0.85, x - w * 0.05, y + h * 0.95);
    c.quadraticCurveTo(x - w * 0.3, y + h * 0.7, x - w * 0.28, y + h * 0.25); c.closePath(); c.fill();
    c.fillStyle = "#c8cfd5";
    c.beginPath(); c.ellipse(x, y, w * 0.55, h * 0.5, 0, 0, 7); c.fill();
    c.fillStyle = "#7c848b";
    c.beginPath(); c.ellipse(x, y, w * 0.47, h * 0.4, 0, 0, 7); c.fill();
    const total = m.items.reduce(function (a, i) { return a + i.amount; }, 0);
    if (total > 0) {
      const r = rng(77);
      if (m.mix > 0.05 && m.sauce) {
        // sauce coating spreads with mixing
        c.globalAlpha = Math.min(0.85, m.mix);
        c.fillStyle = mixColor(m);
        c.beginPath(); c.ellipse(x, y + 1, w * 0.42, h * 0.32, 0, 0, 7); c.fill();
        c.globalAlpha = 1;
      } else if (m.sauce && m.sauce.amount > 0) {
        // unmixed sauce: a puddle sitting on one side
        c.fillStyle = mixColor(m);
        c.beginPath(); c.ellipse(x + w * 0.15, y + 2, w * 0.18, h * 0.16, 0, 0, 7); c.fill();
      }
      for (const it of m.items) {
        for (let k = 0; k < Math.round(it.amount * 3); k++) {
          const a = r() * 6.28, d = Math.sqrt(r()) * w * 0.32;
          c.save();
          if (m.mix > 0.05 && m.sauce) { c.globalAlpha = 1 - m.mix * 0.25; }
          drawChunk(c, it.ing, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.35, 5 * s, r() * 6.28);
          c.restore();
        }
      }
    }
  }

  // ---- Drinks ------------------------------------------------------------
  function drawCup(c, x, y, s, cup) {
    const w = 22 * s, h = 34 * s;
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.beginPath(); c.ellipse(x, y + h * 0.52, w * 0.55, 3 * s, 0, 0, 7); c.fill();
    // translucent cup with drink inside
    if (cup.drink && cup.fill > 0) {
      const col = (D().DRINKS[cup.drink] || {}).color || "#cfe4ee";
      const fh = h * Math.min(1.08, cup.fill);
      c.fillStyle = col;
      c.beginPath();
      const bw = w * (0.72 + 0.2 * (1 - 1)),
        tw = w * (0.72 + 0.28 * Math.min(1, cup.fill));
      c.moveTo(x - bw / 2 * 0.82, y + h * 0.5);
      c.lineTo(x - tw / 2, y + h * 0.5 - fh);
      c.lineTo(x + tw / 2, y + h * 0.5 - fh);
      c.lineTo(x + bw / 2 * 0.82, y + h * 0.5);
      c.closePath(); c.fill();
      if (cup.fill > 1.02) { // overflow
        c.fillStyle = col; c.globalAlpha = 0.7;
        c.beginPath(); c.ellipse(x, y + h * 0.55, w * 0.7, 3.4 * s, 0, 0, 7); c.fill();
        c.globalAlpha = 1;
      }
    }
    c.strokeStyle = "rgba(200,214,222,0.95)"; c.lineWidth = 2 * s;
    c.beginPath();
    c.moveTo(x - w * 0.4, y + h * 0.5); c.lineTo(x - w * 0.5, y - h * 0.5);
    c.moveTo(x + w * 0.4, y + h * 0.5); c.lineTo(x + w * 0.5, y - h * 0.5);
    c.moveTo(x - w * 0.4, y + h * 0.5); c.lineTo(x + w * 0.4, y + h * 0.5);
    c.stroke();
    c.strokeStyle = "rgba(230,238,244,0.9)";
    c.beginPath(); c.ellipse(x, y - h * 0.5, w * 0.5, 2.6 * s, 0, 0, 7); c.stroke();
    if (cup.lid) {
      c.fillStyle = "#e8ecef";
      c.beginPath(); c.roundRect(x - w * 0.56, y - h * 0.56, w * 1.12, 5 * s, 2); c.fill();
      c.beginPath(); c.ellipse(x, y - h * 0.56, w * 0.3, 2.6 * s, 0, 3.14, 6.28); c.fill();
    }
    if (cup.straw) {
      c.strokeStyle = "#ee435b"; c.lineWidth = 2.4 * s; c.lineCap = "round";
      c.beginPath(); c.moveTo(x + 2 * s, y - h * 0.52); c.lineTo(x + 7 * s, y - h * 0.95); c.stroke();
    }
  }

  // ---- Sauce squeeze bottle ---------------------------------------------
  function drawSauceBottle(c, x, y, hh, id, fill) {
    const info = D().SAUCES[id] || { color: "#888", cap: "#666" };
    const w = hh * 0.42;
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.beginPath(); c.roundRect(x - w / 2, y - hh * 0.55, w, hh, w * 0.4); c.fill();
    c.fillStyle = info.color;
    const fh = hh * 0.94 * Math.max(0, Math.min(1, fill));
    c.beginPath(); c.roundRect(x - w / 2 + 1.5, y + hh * 0.42 - fh, w - 3, fh, w * 0.3); c.fill();
    c.strokeStyle = "rgba(255,255,255,0.4)"; c.lineWidth = 1.4;
    c.beginPath(); c.roundRect(x - w / 2, y - hh * 0.55, w, hh, w * 0.4); c.stroke();
    // cap and nozzle
    c.fillStyle = info.cap;
    c.beginPath(); c.roundRect(x - w * 0.32, y - hh * 0.68, w * 0.64, hh * 0.14, 2); c.fill();
    c.beginPath(); c.moveTo(x - 2, y - hh * 0.68); c.lineTo(x - 1, y - hh * 0.8); c.lineTo(x + 1, y - hh * 0.8); c.lineTo(x + 2, y - hh * 0.68); c.fill();
    // label band
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath(); c.roundRect(x - w / 2 + 1.5, y - hh * 0.16, w - 3, hh * 0.3, 2); c.fill();
  }

  // ---- Bag ---------------------------------------------------------------
  function drawBag(c, x, y, s, bag) {
    const w = 46 * s, h = 44 * s;
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.beginPath(); c.ellipse(x, y + h * 0.52, w * 0.55, 4 * s, 0, 0, 7); c.fill();
    c.fillStyle = "#c8a878";
    c.beginPath(); c.moveTo(x - w / 2, y - h * 0.34); c.lineTo(x - w * 0.42, y + h * 0.5);
    c.lineTo(x + w * 0.42, y + h * 0.5); c.lineTo(x + w / 2, y - h * 0.34); c.closePath(); c.fill();
    c.fillStyle = "#b8945f";
    c.beginPath(); c.moveTo(x - w / 2, y - h * 0.34); c.lineTo(x - w * 0.42, y + h * 0.5);
    c.lineTo(x - w * 0.28, y + h * 0.5); c.lineTo(x - w * 0.37, y - h * 0.34); c.closePath(); c.fill();
    // handles
    c.strokeStyle = "#a5824c"; c.lineWidth = 2.4 * s;
    c.beginPath(); c.arc(x - w * 0.16, y - h * 0.34, w * 0.13, 3.14, 6.28); c.stroke();
    c.beginPath(); c.arc(x + w * 0.16, y - h * 0.34, w * 0.13, 3.14, 6.28); c.stroke();
    // contents peeking over the top
    if (bag && bag.items.length) {
      let ox = x - (bag.items.length - 1) * 6 * s;
      for (const it of bag.items) {
        if (it.kind === "bowl") {
          c.fillStyle = "rgba(240,238,232,0.95)";
          c.beginPath(); c.ellipse(ox, y - h * 0.36, 10 * s, 4 * s, 0, 0, 7); c.fill();
        } else {
          c.fillStyle = it.color || "#d9a441";
          c.beginPath(); c.roundRect(ox - 5 * s, y - h * 0.46, 10 * s, 9 * s, 2); c.fill();
        }
        ox += 12 * s;
      }
    }
    if (bag && bag.label) {
      c.fillStyle = "#fff";
      c.beginPath(); c.roundRect(x - w * 0.3, y - h * 0.1, w * 0.6, h * 0.3, 2); c.fill();
      c.fillStyle = "#333"; c.font = "700 " + Math.round(8 * s) + "px system-ui, sans-serif"; c.textAlign = "center";
      c.fillText("#" + bag.label.num, x, y + h * 0.02);
      c.font = "600 " + Math.round(7 * s) + "px system-ui, sans-serif";
      c.fillText(bag.label.name, x, y + h * 0.14);
    }
  }

  // ---- Side packs --------------------------------------------------------
  function drawSidePack(c, x, y, s, sideId) {
    const info = D().SIDES[sideId] || { color: "#999", name: "?" };
    if (sideId === "mochi") {
      c.fillStyle = "#e8f4ec";
      c.beginPath(); c.roundRect(x - 11 * s, y - 8 * s, 22 * s, 16 * s, 4 * s); c.fill();
      c.fillStyle = info.color;
      c.beginPath(); c.arc(x, y, 5.5 * s, 0, 7); c.fill();
    } else if (sideId === "cookie") {
      c.fillStyle = info.color;
      c.beginPath(); c.arc(x, y, 8 * s, 0, 7); c.fill();
      c.fillStyle = "#6d4a2c";
      c.beginPath(); c.arc(x - 3 * s, y - 2 * s, 1.4 * s, 0, 7); c.fill();
      c.beginPath(); c.arc(x + 2 * s, y + 2 * s, 1.4 * s, 0, 7); c.fill();
      c.beginPath(); c.arc(x + 3 * s, y - 3 * s, 1.2 * s, 0, 7); c.fill();
    } else {
      // chip bag
      c.fillStyle = info.color;
      c.beginPath(); c.roundRect(x - 9 * s, y - 12 * s, 18 * s, 24 * s, 3 * s); c.fill();
      c.fillStyle = "rgba(255,255,255,0.3)";
      c.beginPath(); c.roundRect(x - 9 * s, y - 12 * s, 18 * s, 4 * s, 2 * s); c.fill();
      c.beginPath(); c.roundRect(x - 9 * s, y + 8 * s, 18 * s, 4 * s, 2 * s); c.fill();
      c.fillStyle = "rgba(255,255,255,0.85)";
      c.beginPath(); c.ellipse(x, y, 6.5 * s, 4.5 * s, 0, 0, 7); c.fill();
    }
  }

  // ---- Utensils ----------------------------------------------------------
  // kind: paddle | spoodle | tongs | spoon | towel. load: {ing|rice,type}
  function drawUtensil(c, kind, x, y, angle, s, load) {
    c.save(); c.translate(x, y); c.rotate(angle || 0);
    if (kind === "paddle") {
      c.fillStyle = "#e8e0d0";
      c.beginPath(); c.roundRect(-3.5 * s, -6 * s, 7 * s, 30 * s, 3 * s); c.fill();
      c.beginPath(); c.ellipse(0, -14 * s, 9 * s, 12 * s, 0, 0, 7); c.fill();
      c.fillStyle = "#d5cbb8";
      c.beginPath(); c.ellipse(0, -14 * s, 6.5 * s, 9 * s, 0, 0, 7); c.fill();
      if (load && load.rice) drawRiceMound(c, 0, -14 * s, 15 * s, 13 * s, load.rice, 5);
    } else if (kind === "spoodle") {
      c.strokeStyle = "#8d949c"; c.lineWidth = 3.4 * s; c.lineCap = "round";
      c.beginPath(); c.moveTo(0, 22 * s); c.lineTo(0, -6 * s); c.stroke();
      c.fillStyle = "#aeb5bc";
      c.beginPath(); c.arc(0, -13 * s, 8.5 * s, 0, 7); c.fill();
      c.fillStyle = "#7c848b";
      c.beginPath(); c.arc(0, -13 * s, 6.5 * s, 0, 7); c.fill();
      if (load && load.ing) {
        const r = rng(9);
        for (let i = 0; i < Math.round((load.amount || 1) * 3); i++) {
          const a = r() * 6.28, d = Math.sqrt(r()) * 4 * s;
          drawChunk(c, load.ing, Math.cos(a) * d, -13 * s + Math.sin(a) * d, 3.6 * s, r() * 6.28);
        }
      }
    } else if (kind === "tongs") {
      c.strokeStyle = "#aeb5bc"; c.lineWidth = 2.6 * s; c.lineCap = "round";
      c.beginPath(); c.moveTo(0, 16 * s); c.quadraticCurveTo(-6 * s, 0, -5 * s, -14 * s); c.stroke();
      c.beginPath(); c.moveTo(0, 16 * s); c.quadraticCurveTo(6 * s, 0, 5 * s, -14 * s); c.stroke();
      c.fillStyle = "#c8cfd5";
      c.beginPath(); c.ellipse(-5 * s, -15 * s, 3.4 * s, 5 * s, 0.3, 0, 7); c.fill();
      c.beginPath(); c.ellipse(5 * s, -15 * s, 3.4 * s, 5 * s, -0.3, 0, 7); c.fill();
      if (load && load.ing) drawChunk(c, load.ing, 0, -14 * s, 5 * s, 0.4);
    } else if (kind === "spoon") {
      c.strokeStyle = "#8d949c"; c.lineWidth = 3 * s; c.lineCap = "round";
      c.beginPath(); c.moveTo(0, 20 * s); c.lineTo(0, -6 * s); c.stroke();
      c.fillStyle = "#c8cfd5";
      c.beginPath(); c.ellipse(0, -12 * s, 6 * s, 8.5 * s, 0, 0, 7); c.fill();
      c.fillStyle = "#9ea6ad";
      c.beginPath(); c.ellipse(0, -12 * s, 4 * s, 6 * s, 0, 0, 7); c.fill();
    } else if (kind === "towel") {
      c.fillStyle = "#7fb4d9";
      c.beginPath(); c.roundRect(-10 * s, -8 * s, 20 * s, 16 * s, 3 * s); c.fill();
      c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-10 * s, -2 * s); c.lineTo(10 * s, -2 * s);
      c.moveTo(-10 * s, 3 * s); c.lineTo(10 * s, 3 * s); c.stroke();
    }
    c.restore();
  }

  // ---- People ------------------------------------------------------------
  // p: {shirt, walkPhase, mood: 'happy'|'flat'|'mad', scale}
  function drawPerson(c, x, y, p) {
    const s = p.scale || 1;
    const sw = Math.sin(p.walkPhase || 0) * (p.walking ? 6 : 0);
    c.save(); c.translate(x, y);
    c.strokeStyle = p.shirt; c.lineWidth = 5 * s; c.lineCap = "round";
    // legs
    c.strokeStyle = "#41535e";
    c.beginPath(); c.moveTo(0, -26 * s); c.lineTo(-6 * s + sw * 0.6, 0); c.stroke();
    c.beginPath(); c.moveTo(0, -26 * s); c.lineTo(6 * s - sw * 0.6, 0); c.stroke();
    // torso
    c.strokeStyle = p.shirt;
    c.beginPath(); c.moveTo(0, -52 * s); c.lineTo(0, -26 * s); c.stroke();
    // arms
    c.beginPath(); c.moveTo(0, -45 * s); c.lineTo(-9 * s - sw * 0.4, -32 * s); c.stroke();
    c.beginPath(); c.moveTo(0, -45 * s); c.lineTo(9 * s + sw * 0.4, -32 * s); c.stroke();
    // head
    c.fillStyle = p.skin || "#ffe0bd";
    c.strokeStyle = "#e0b98f"; c.lineWidth = 1.4;
    c.beginPath(); c.arc(0, -62 * s, 9.5 * s, 0, 7); c.fill(); c.stroke();
    c.fillStyle = "#333";
    c.beginPath(); c.arc(-3.2 * s, -63 * s, 1.4 * s, 0, 7); c.fill();
    c.beginPath(); c.arc(3.2 * s, -63 * s, 1.4 * s, 0, 7); c.fill();
    c.strokeStyle = "#7a4a2a"; c.lineWidth = 1.5 * s; c.lineCap = "round";
    c.beginPath();
    if (p.mood === "mad") { c.moveTo(-3 * s, -57 * s); c.quadraticCurveTo(0, -60 * s, 3 * s, -57 * s); }
    else if (p.mood === "flat") { c.moveTo(-3 * s, -58 * s); c.lineTo(3 * s, -58 * s); }
    else { c.moveTo(-3 * s, -59 * s); c.quadraticCurveTo(0, -55.5 * s, 3 * s, -59 * s); }
    c.stroke();
    c.restore();
  }

  window.ShiftFood = {
    rng: rng, drawChunk: drawChunk, drawRiceMound: drawRiceMound,
    drawHotelPan: drawHotelPan, drawRiceCooker: drawRiceCooker,
    drawServingBowl: drawServingBowl, drawMetalBowl: drawMetalBowl,
    drawCup: drawCup, drawSauceBottle: drawSauceBottle, drawBag: drawBag,
    drawSidePack: drawSidePack, drawUtensil: drawUtensil, drawPerson: drawPerson,
    riceFill: riceFill,
  };
})();
