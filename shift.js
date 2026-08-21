// The Shift — first-person 3D shift simulation. The store is modeled on the
// real Union Sq layout: the line runs down the RIGHT side, you work behind
// it, dining and the pickup shelf are out front. Rendering is Shift3D
// (software quads + billboards); food art comes from ShiftFood.
//
// Files: shift-data.js (menu/orders), shift-food.js (2D food art),
// shift-3d.js (renderer), this file (world + game logic).
(function () {
  const SD = window.ShiftData, SF = window.ShiftFood, S3 = window.Shift3D;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let VW = 960, VH = 600;
  const RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileUI = () => window.matchMedia && matchMedia("(max-width: 760px)").matches;
  const SFX = () => window.ArcadeSfx || {};
  const sfx = (n) => { const s = SFX(); if (s[n]) try { s[n](); } catch (e) {} };
  const R = new S3.Renderer(ctx, VW, VH, 66);

  // The canvas resolution tracks the stage so the game fills phone screens
  // at native-ish sharpness instead of stretching a tiny letterboxed view.
  function fitCanvas() {
    const stage = canvas.parentElement;
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    const scale = Math.min(1.5, window.devicePixelRatio || 1);
    let cw = Math.round(Math.min(1152, w * scale));
    let chh = Math.round(cw * (h / w));
    if (chh > 900) { chh = 900; cw = Math.round(chh * (w / h)); }
    if (cw !== VW || chh !== VH) {
      VW = cw; VH = chh;
      canvas.width = VW; canvas.height = VH;
      const f = (Math.min(VH, VW * 0.85) / 2) / Math.tan((33 * Math.PI) / 180);
      R.resize(VW, VH, f);
    }
  }
  window.addEventListener("resize", () => setTimeout(fitCanvas, 50));

  const OPEN_MIN = 30, CLOSE_MIN = 150, HARD_END = 168;
  const REACH = 2.35;         // how far the worker can reach, in meters
  const EYE = 1.55;

  const shiftsPlayed = parseInt(localStorage.getItem("pokeworks-shift-count") || "0", 10) || 0;
  const storedBest = parseInt(localStorage.getItem("pokeworks-shift-best") || "0", 10) || 0;
  const MIN_SEC = shiftsPlayed === 0 ? 2.4 : 2.0;

  // ---- store layout (meters; x -5..5, z 0 door .. 14 back wall) ----------
  const CT = 0.95;            // counter height
  // line counter (right side), worker aisle behind it, back counter on wall
  const LINE = { x0: 2.6, x1: 3.6, z0: 2.5, z1: 10.6 };
  const BACK = { x0: 4.55, x1: 5.0, z0: 2.5, z1: 10.6 };
  const DRINK = { x0: 0.2, x1: 2.4, z0: 13.25, z1: 14 };
  const SHELF = { x0: -3.4, x1: -1.6, z0: 13.4, z1: 14 };
  const DOOR = { x0: -2.6, x1: -1.4 };

  // pans: row A (customer side) proteins + toppings, row B (worker side)
  // mix-ins + sprinkle tins
  function panRow(x0, x1, zs, len) {
    return zs.map((z, i) => ({ x0: x0, x1: x1, z0: z, z1: z + len, pan: null, seed: 100 + x0 * 10 + i }));
  }
  const PROT_Z = [2.95, 3.55, 4.15, 4.75, 5.35];
  const TOP_Z = [6.15, 6.75, 7.35, 7.95];
  const MIX_Z = [2.95, 3.55, 4.15, 4.75, 5.35];
  const SPR_Z = [6.15, 6.62, 7.09, 7.56];

  // ---- state -------------------------------------------------------------
  let state = null;
  function freshState() {
    const pans = []
      .concat(panRow(2.7, 3.04, PROT_Z, 0.5))
      .concat(panRow(2.7, 3.04, TOP_Z, 0.5))
      .concat(panRow(3.18, 3.52, MIX_Z, 0.5))
      .concat(panRow(3.18, 3.52, SPR_Z, 0.38));
    // sprinkle tins come stocked (tiny amounts used per pinch)
    SD.SPRINKLES.forEach((ing, i) => { pans[14 + i].pan = { ing: ing, fill: 1 }; pans[14 + i].tin = true; });
    const fridgeStock = {};
    for (const k of SD.PROTEINS) fridgeStock[k] = 2;
    for (const k of SD.MIXINS) fridgeStock[k] = 2;
    for (const k of SD.TOPPINGS) fridgeStock[k] = 2;
    return {
      running: false, over: false, paused: false,
      min: 0, clock: 0,
      px: -2.0, pz: 1.1, yaw: 0.35, pitch: -0.06,
      lights: { kitchen: false, foh: false }, sign: false, signOnMin: null,
      hands: { level: "dirty", wet: false, soaped: false, scrub: 0, dirtyGloves: false },
      waterOn: false,
      held: null,
      cookers: [
        { type: "white", z: 3.95, on: false, open: false, cooked: false, cookLeft: 18, level: 14, capacity: 14 },
        { type: "brown", z: 4.85, on: false, open: false, cooked: false, cookLeft: 18, level: 10, capacity: 10 },
      ],
      linePans: pans,
      fridge: fridgeStock,
      fridgeBottles: ["ginger", "chili"],
      rack: { classic: 1, shoyu: 1, sriracha: 1, wasabi: 1, ginger: 0, chili: 0 },
      spots: [
        { id: "A", x: 2.87, z: 8.5, item: null },
        { id: "B", x: 2.87, z: 9.15, item: null },
        { id: "C", x: 2.87, z: 9.8, item: null },
      ],
      metalStack: 2,
      cupAtTray: null,
      shelf: [
        { x: -3.0, y: 1.45, z: 13.7, items: [] }, { x: -2.0, y: 1.45, z: 13.7, items: [] },
        { x: -3.0, y: 0.95, z: 13.7, items: [] }, { x: -2.0, y: 0.95, z: 13.7, items: [] },
      ],
      orders: [], customers: [], stickers: [],
      messes: [], steam: [], floats: [],
      score: 0, served: 0, lostCount: 0,
      bareFlag: false, feedback: [],
      nextWalkIn: 0,
      lastProgress: 0, thoughtAt: -99,
      mixing: null, scrubbing: false, holdFill: null, holdSauce: null,
      posFor: null, askFor: null, serviceFor: null,
    };
  }
  state = freshState();

  // ---- misc helpers ------------------------------------------------------
  function clockStr(min) {
    let h = 10, m = 30 + Math.floor(min);
    h += Math.floor(m / 60); m = m % 60;
    const ap = h >= 12 ? "pm" : "am";
    const hh = h > 12 ? h - 12 : h;
    return hh + ":" + String(m).padStart(2, "0") + ap;
  }
  function markProgress() { state.lastProgress = state.clock; hideThought(); }
  function thought(txt) {
    const el = document.getElementById("thought");
    el.textContent = "💭 " + txt;
    el.hidden = false;
    state.thoughtAt = state.clock;
  }
  function hideThought() { document.getElementById("thought").hidden = true; }
  function float(x, y, z, txt, color) {
    state.floats.push({ x: x, y: y, z: z, txt: txt, color: color || "#f4ede3", t: 0 });
  }
  function isGloved() { return state.hands.level === "gloved" && !state.hands.dirtyGloves; }
  function mess(x, y, z) { state.messes.push({ x: x, y: y, z: z }); }
  // which light zone a point belongs to; returns current darkness 0..1
  function dimAt(x, z) {
    const kitchen = x > 2.45 || z > 12.9;
    if (kitchen) return state.lights.kitchen ? 0 : 0.72;
    return state.lights.foh ? 0 : 0.55;
  }

  function newBowl(size) {
    return { kind: "bowl", size: size, riceType: null, rice: 0, base: [], pour: null, sauce: null, toppings: [], lid: false, bare: false };
  }
  function bowlAddBase(b, ing, amount) {
    const ex = b.base.find((i) => i.ing === ing);
    if (ex) ex.amount += amount; else b.base.push({ ing: ing, amount: amount });
  }
  function bowlAddTop(b, ing, amount) {
    const ex = b.toppings.find((i) => i.ing === ing);
    if (ex) ex.amount += amount; else b.toppings.push({ ing: ing, amount: amount });
  }
  function newMetal() { return { kind: "metal", items: [], sauce: null, mix: 0 }; }
  function metalAdd(m, ing, amount) {
    const ex = m.items.find((i) => i.ing === ing);
    if (ex) ex.amount += amount; else m.items.push({ ing: ing, amount: amount });
    m.mix = Math.min(m.mix, 0.2);
  }

  // ---- texture factory ---------------------------------------------------
  // Small offscreen canvases mapped onto quads. Static ones build once;
  // dynamic ones (pans, KDS, rail, cooker tops, switches, sign) rebuild on a
  // short throttle.
  function makeTex(w, h, draw) {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    return cv;
  }
  const TEX = {};
  TEX.wood = makeTex(256, 256, (c, w, h) => {
    c.fillStyle = "#b98d5e"; c.fillRect(0, 0, w, h);
    for (let i = -8; i < 16; i++) {
      c.strokeStyle = i % 2 ? "#a97e50" : "#c49a6a";
      c.lineWidth = 18;
      c.beginPath(); c.moveTo(i * 32, h); c.lineTo(i * 32 + h, 0); c.stroke();
    }
    c.strokeStyle = "rgba(90,60,30,0.35)"; c.lineWidth = 2;
    for (let i = -8; i < 16; i++) {
      c.beginPath(); c.moveTo(i * 32 + 9, h); c.lineTo(i * 32 + 9 + h, 0); c.stroke();
    }
  });
  TEX.union = makeTex(256, 256, (c, w, h) => {
    c.drawImage(TEX.wood, 0, 0);
    c.save();
    c.translate(128, 128); c.rotate(-0.5);
    c.fillStyle = "#1c2429"; c.font = "800 46px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("UNION", 0, 0);
    c.font = "800 20px system-ui, sans-serif";
    c.fillText("SQ", 86, 24);
    c.restore();
  });
  TEX.tile = makeTex(256, 128, (c, w, h) => {
    c.fillStyle = "#f2efe9"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#c9c6bd"; c.lineWidth = 4;
    for (let y = 0; y < h; y += 22) {
      for (let x = -22; x < w; x += 44) {
        c.strokeRect(x + (y % 44 ? 22 : 0), y, 44, 22);
      }
    }
  });
  TEX.mahalo = makeTex(160, 224, (c, w, h) => {
    c.fillStyle = "#f4ede3"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#22b2b4"; c.font = "800 26px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("MAHALO", w / 2, 38);
    c.fillStyle = "#41535e"; c.font = "600 13px system-ui, sans-serif";
    ["Meet + greet", "Assist + educate", "Handle with care", "Add value", "Leave thanks", "Obtain feedback"].forEach((l, i) => {
      c.fillText(l, w / 2, 70 + i * 26);
    });
  });
  TEX.portion = makeTex(256, 160, (c, w, h) => {
    c.fillStyle = "#f4ede3"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#ee435b"; c.font = "800 20px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("PORTION GUIDE", w / 2, 30);
    c.fillStyle = "#41535e"; c.font = "600 14px system-ui, sans-serif";
    c.fillText("Regular: 1 rice · 2 protein scoops", w / 2, 62);
    c.fillText("Large: 2 rice · 3 protein scoops", w / 2, 86);
    c.font = "600 11px system-ui, sans-serif";
    c.fillText("right tool for the job", w / 2, 116);
    c.fillText("lids on everything", w / 2, 134);
  });
  TEX.sop = makeTex(288, 256, (c, w, h) => {
    c.fillStyle = "#f4ede3"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#e0a32d"; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = "#26333b"; c.font = "800 18px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("TOPPINGS SOP", w / 2, 34);
    c.font = "600 11px system-ui, sans-serif";
    c.fillText("10:00 avocado · 11:00 surimi", w / 2, 60);
    c.fillText("12:00 seaweed · center masago", w / 2, 78);
    // the bowl
    c.fillStyle = "#e8e0d0"; c.beginPath(); c.arc(w / 2, 140, 44, 0, 7); c.fill();
    SF.drawRiceMound(c, w / 2, 140, 70, 54, "white", 5);
    SF.drawChunk(c, "avocado", w / 2 - 26, 118, 8, 0.4);
    SF.drawChunk(c, "surimi", w / 2 - 6, 110, 8, 0);
    SF.drawChunk(c, "seaweed", w / 2 + 16, 114, 8, 0.2);
    SF.drawChunk(c, "masago", w / 2, 140, 7, 0);
    SF.drawChunk(c, "tuna", w / 2 - 14, 152, 7, 0.3);
    SF.drawChunk(c, "tuna", w / 2 + 12, 150, 7, 1.1);
    c.fillStyle = "#26333b"; c.font = "700 11px system-ui, sans-serif";
    c.fillText("SPRINKLED ON TOP OF PROTEIN:", w / 2, 208);
    c.font = "600 10px system-ui, sans-serif";
    c.fillText("green onion · sesame · crispy onion", w / 2, 226);
    c.fillText("wontons · furikake · thai chili", w / 2, 242);
  });
  TEX.pickupSign = makeTex(256, 56, (c, w, h) => {
    c.fillStyle = "#e8a33d"; c.beginPath(); c.roundRect(4, 8, 40, 40, 6); c.fill();
    c.fillStyle = "#1c2429"; c.font = "800 22px system-ui, sans-serif"; c.textAlign = "left";
    c.fillText("ORDER PICK-UP", 56, 38);
    c.fillStyle = "#f4ede3";
    c.font = "800 22px system-ui, sans-serif";
    c.fillText("⤴", 14, 38);
  });
  // The lobby sign shows a bowl the store can actually make: ahi tuna,
  // cucumber, avocado, masago, classic sauce.
  TEX.promo = makeTex(144, 240, (c, w, h) => {
    c.fillStyle = "#16232b"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#f4ede3"; c.font = "800 24px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("POKE", w / 2, 42);
    c.fillText("YOUR", w / 2, 70);
    c.fillText("WAY", w / 2, 98);
    SF.drawServingBowl(c, w / 2, 158, 1.5, {
      kind: "bowl", size: "regular", riceType: "white", rice: 1,
      base: [{ ing: "tuna", amount: 2 }, { ing: "cucumber", amount: 1 }],
      toppings: [{ ing: "avocado", amount: 1 }, { ing: "masago", amount: 1 }],
      sauce: { id: "classic", amount: 1 }, pour: null, lid: false, bare: false,
    });
    c.fillStyle = "#9fb6c4"; c.font = "600 11px system-ui, sans-serif";
    c.fillText("signature or build your own", w / 2, 220);
  });
  // simple facades for the street outside
  TEX.building = makeTex(256, 128, (c, w, h) => {
    c.fillStyle = "#8a5a48"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#7c503f";
    for (let y2 = 0; y2 < h; y2 += 10) c.fillRect(0, y2, w, 2);
    for (let ry = 14; ry < h - 20; ry += 34) {
      for (let rx = 14; rx < w - 20; rx += 32) {
        c.fillStyle = "#b9d2e4";
        c.fillRect(rx, ry, 18, 22);
        c.fillStyle = "rgba(255,255,255,0.35)";
        c.beginPath(); c.moveTo(rx, ry + 22); c.lineTo(rx + 8, ry); c.lineTo(rx + 12, ry); c.lineTo(rx + 4, ry + 22); c.closePath(); c.fill();
      }
    }
    c.fillStyle = "#5e4234"; c.fillRect(0, h - 8, w, 8);
  });
  TEX.building2 = makeTex(256, 128, (c, w, h) => {
    c.fillStyle = "#7d8288"; c.fillRect(0, 0, w, h);
    for (let ry = 10; ry < h - 34; ry += 30) {
      for (let rx = 10; rx < w - 16; rx += 26) {
        c.fillStyle = "#aac4d4";
        c.fillRect(rx, ry, 16, 18);
      }
    }
    // storefront band at street level
    c.fillStyle = "#3f4a52"; c.fillRect(0, h - 34, w, 34);
    c.fillStyle = "#c9dae4"; c.fillRect(8, h - 28, 70, 22);
    c.fillRect(104, h - 28, 70, 22);
    c.fillRect(200, h - 28, 48, 22);
    c.fillStyle = "#e8a33d"; c.fillRect(88, h - 30, 8, 26);
  });
  // fountain header panel with labeled flavors
  TEX.fountain = makeTex(280, 90, (c, w, h) => {
    c.fillStyle = "#2f3b42"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#f4ede3"; c.font = "800 16px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("FOUNTAIN DRINKS", w / 2, 24);
    const ids = ["greentea", "lemonade", "punch", "water"];
    ids.forEach((id, i) => {
      const x = 10 + i * 66;
      c.fillStyle = SD.DRINKS[id].color;
      c.beginPath(); c.roundRect(x, 36, 60, 42, 5); c.fill();
      c.fillStyle = "#1c2429"; c.font = "700 10px system-ui, sans-serif";
      const words = SD.DRINKS[id].name.toUpperCase().split(" ");
      words.forEach((wd, j) => c.fillText(wd, x + 30, 54 + j * 12));
    });
  });
  TEX.menu = makeTex(384, 96, (c, w, h) => {
    c.fillStyle = "#1c2429"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#f4ede3"; c.font = "800 17px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("CHOOSE YOUR FLAVOR", w / 2, 28);
    c.font = "600 12px system-ui, sans-serif";
    c.fillStyle = "#c9d2d2";
    c.fillText("signature works · poke your way", w / 2, 52);
    c.fillText("regular 2 scoops · large 3 scoops", w / 2, 72);
  });

  // dynamic textures, rebuilt on a throttle
  const dyn = { at: -1 };
  function panTex(slot) {
    if (!slot._tex) { slot._tex = document.createElement("canvas"); slot._tex.width = 72; slot._tex.height = 104; }
    const c = slot._tex.getContext("2d");
    c.clearRect(0, 0, 72, 104);
    if (slot.pan) SF.drawHotelPan(c, 4, 4, 64, 96, slot.pan.ing, slot.pan.fill, slot.seed, null);
    else {
      c.fillStyle = "#6f767d"; c.beginPath(); c.roundRect(2, 2, 68, 100, 4); c.fill();
      c.strokeStyle = "#5b6167"; c.lineWidth = 3; c.strokeRect(6, 6, 60, 92);
    }
    return slot._tex;
  }
  function cookerTopTex(ck) {
    if (!ck._tex) { ck._tex = document.createElement("canvas"); ck._tex.width = 96; ck._tex.height = 96; }
    const c = ck._tex.getContext("2d");
    c.clearRect(0, 0, 96, 96);
    c.fillStyle = "#5c6268"; c.beginPath(); c.arc(48, 48, 46, 0, 7); c.fill();
    if (!ck.open) {
      c.fillStyle = "#d7dce0"; c.beginPath(); c.arc(48, 48, 44, 0, 7); c.fill();
      c.fillStyle = "#b6bdc4"; c.beginPath(); c.arc(48, 48, 12, 0, 7); c.fill();
    } else if (ck.level > 0 && ck.cooked) {
      SF.drawRiceMound(c, 48, 48, 80 * Math.max(0.5, ck.level / ck.capacity), 74 * Math.max(0.5, ck.level / ck.capacity), ck.type, 11);
    } else if (ck.level > 0) {
      c.fillStyle = ck.type === "brown" ? "#a8916c" : "#dcd6c6";
      c.beginPath(); c.arc(48, 48, 30, 0, 7); c.fill();
    }
    return ck._tex;
  }
  TEX.kds = makeTex(384, 160, () => {});
  function kdsTex() {
    const c = TEX.kds.getContext("2d");
    const w = 384, h = 160;
    c.fillStyle = "#141b20"; c.fillRect(0, 0, w, h);
    const act = state.orders.filter((o) => o.status === "pending");
    c.textAlign = "left";
    if (!act.length) {
      c.fillStyle = "#4d6a58"; c.font = "700 16px ui-monospace, monospace";
      c.fillText("NO ACTIVE ORDERS", 24, 86);
    }
    act.slice(0, 4).forEach((o, i) => {
      const x = 8 + i * 94;
      const late = state.min > o.dueMin, soon = state.min > o.dueMin - 8;
      c.fillStyle = late ? "#5e2a30" : soon ? "#5e522a" : "#2a4234";
      c.beginPath(); c.roundRect(x, 8, 88, 144, 5); c.fill();
      c.fillStyle = "#e8ecef"; c.font = "700 15px ui-monospace, monospace";
      c.fillText("#" + o.num, x + 7, 28);
      c.font = "600 13px ui-monospace, monospace";
      c.fillText(o.name.slice(0, 9), x + 7, 46);
      c.fillStyle = "#9fb6c4";
      c.fillText(o.type === "walkin" ? "here" : o.type, x + 7, 64);
      if (o.type !== "walkin") c.fillText("due " + clockStr(o.dueMin), x + 7, 82);
      c.fillText(o.spec.bowls.length + " bowl" + (o.spec.bowls.length > 1 ? "s" : ""), x + 7, 102);
      if (o.spec.drink) c.fillText("+ drink", x + 7, 120);
      if (o.spec.side) c.fillText("+ side", x + 7, 138);
    });
    if (act.length > 4) {
      c.fillStyle = "#9fb6c4"; c.font = "700 15px ui-monospace, monospace";
      c.fillText("+" + (act.length - 4), 356, 86);
    }
  }
  TEX.rail = makeTex(384, 88, () => {});
  function railTex() {
    const c = TEX.rail.getContext("2d");
    c.clearRect(0, 0, 384, 88);
    c.fillStyle = "#b6bdc4"; c.fillRect(0, 0, 384, 10);
    c.textAlign = "center";
    state.stickers.slice(0, 5).forEach((st, i) => {
      const x = 6 + i * 76;
      c.fillStyle = "#f4ede3"; c.beginPath(); c.roundRect(x, 10, 70, 70, 3); c.fill();
      c.fillStyle = "#333"; c.font = "700 16px ui-monospace, monospace";
      c.fillText("#" + st.order.num, x + 35, 34);
      c.font = "600 12px ui-monospace, monospace";
      c.fillText(st.order.name.slice(0, 9), x + 35, 52);
      c.fillText(st.order.type === "walkin" ? "here" : st.order.type, x + 35, 68);
    });
  }
  TEX.switches = makeTex(72, 112, () => {});
  function switchTex() {
    const c = TEX.switches.getContext("2d");
    c.fillStyle = "#d7dce0"; c.fillRect(0, 0, 72, 112);
    [state.lights.kitchen, state.lights.foh].forEach((on, i) => {
      c.fillStyle = on ? "#39a85b" : "#8d949c";
      c.beginPath(); c.roundRect(16, 10 + i * 52, 40, 40, 6); c.fill();
      c.fillStyle = "#f4ede3";
      c.beginPath(); c.roundRect(22, (on ? 14 : 28) + i * 52, 28, 18, 3); c.fill();
    });
    c.fillStyle = "#41535e"; c.font = "700 9px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("KITCHEN", 36, 8);
    c.fillText("DINING", 36, 110);
  }
  TEX.open = makeTex(160, 80, () => {});
  function openTex() {
    const c = TEX.open.getContext("2d");
    c.fillStyle = "#1c2a33"; c.beginPath(); c.roundRect(0, 0, 160, 80, 14); c.fill();
    c.fillStyle = state.sign ? "#ff5a76" : "#5e6b73";
    c.font = "800 42px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("OPEN", 80, 56);
    if (state.sign) {
      c.strokeStyle = "rgba(255,90,118,0.6)"; c.lineWidth = 6;
      c.beginPath(); c.roundRect(6, 6, 148, 68, 12); c.stroke();
    }
  }
  TEX.board = makeTex(96, 128, () => {});
  function boardTex() {
    const c = TEX.board.getContext("2d");
    c.fillStyle = "#8a6a42"; c.fillRect(0, 0, 96, 128);
    c.fillStyle = "#f4ede3"; c.beginPath(); c.roundRect(8, 14, 80, 104, 3); c.fill();
    c.fillStyle = "#b6bdc4"; c.beginPath(); c.roundRect(32, 4, 32, 16, 4); c.fill();
    c.fillStyle = "#41535e"; c.font = "700 12px system-ui, sans-serif"; c.textAlign = "center";
    c.fillText("OPENING", 48, 34);
    c.strokeStyle = "#c9ced2"; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(18, 46 + i * 12); c.lineTo(78, 46 + i * 12); c.stroke(); }
  }
  function refreshDynamicTex() {
    if (state.clock - dyn.at < 0.15) return;
    dyn.at = state.clock;
    kdsTex(); railTex(); switchTex(); openTex(); boardTex();
    for (const ck of state.cookers) cookerTopTex(ck);
    for (const slot of state.linePans) panTex(slot);
  }

  // ---- orders ------------------------------------------------------------
  function pushOrder(o, dueMin) {
    o.status = "pending";
    o.dueMin = dueMin;
    o.createdMin = state.min;
    o.delivered = { bowls: [], drink: null, side: null };
    o.sat = 100; o.greeted = false; o.thanked = false; o.askedFeedback = false;
    o.satNotes = [];
    if (o.type !== "walkin") {
      o.ticket = o;
      printSticker(o);
      sfx("tick"); setTimeout(() => sfx("tick"), 120);
    } else {
      o.ticket = null;
    }
    state.orders.push(o);
    return o;
  }
  function printSticker(o) { state.stickers.push({ order: o }); }
  function activeOrders() { return state.orders.filter((o) => o.status === "pending"); }
  function removeSticker(o) {
    if (!o) return;
    state.stickers = state.stickers.filter((s) => s.order !== o);
  }

  // ---- scoring -----------------------------------------------------------
  function near2(a, b, tol) { return Math.abs(a - b) <= tol; }
  function scoreBowl(b, spec) {
    const errs = [];
    if (!b) return ["a bowl was missing"];
    if (b.size !== spec.size) errs.push("wrong bowl size");
    const wantRice = spec.size === "large" ? 2 : 1;
    if (b.riceType && b.riceType !== spec.rice) errs.push("wrong rice");
    if (b.rice === 0) errs.push("no rice");
    else if (!near2(b.rice, wantRice, 0.4)) errs.push(b.rice < wantRice ? "rice was short" : "too much rice");
    const got = {};
    for (const it of b.base) got[it.ing] = (got[it.ing] || 0) + it.amount;
    let gotSauce = b.sauce ? { id: b.sauce.id, amount: b.sauce.amount } : null;
    let mixLevel = 0;
    if (b.pour) {
      for (const k in b.pour.contents.items) got[k] = (got[k] || 0) + b.pour.contents.items[k];
      if (b.pour.contents.sauceId) gotSauce = { id: b.pour.contents.sauceId, amount: b.pour.contents.sauceAmt };
      mixLevel = b.pour.contents.mix;
    }
    for (const p in spec.protein) {
      const g = got[p] || 0;
      if (g < spec.protein[p] - 0.4) errs.push((g === 0 ? "no " : "light on ") + SD.INGREDIENTS[p].name.toLowerCase());
      else if (g > spec.protein[p] + 0.6) errs.push("heavy on " + SD.INGREDIENTS[p].name.toLowerCase());
    }
    for (const k in got) {
      if (SD.INGREDIENTS[k] && SD.INGREDIENTS[k].kind === "protein" && !(k in spec.protein) && got[k] > 0.3)
        errs.push(SD.INGREDIENTS[k].name.toLowerCase() + " wasn't ordered");
    }
    for (const m of spec.mixins) if ((got[m] || 0) < 0.5) errs.push("missing " + SD.INGREDIENTS[m].name.toLowerCase());
    for (const k in got) {
      if (SD.INGREDIENTS[k] && SD.INGREDIENTS[k].kind === "mixin" && spec.mixins.indexOf(k) < 0 && got[k] > 0.3)
        errs.push("extra " + SD.INGREDIENTS[k].name.toLowerCase());
    }
    const wantTop = spec.toppings.concat(spec.sprinkles || []);
    const gotTops = {};
    for (const t of b.toppings) gotTops[t.ing] = (gotTops[t.ing] || 0) + t.amount;
    for (const t of wantTop) if ((gotTops[t] || 0) < 0.5) errs.push("missing " + SD.INGREDIENTS[t].name.toLowerCase());
    for (const k in gotTops) if (wantTop.indexOf(k) < 0 && gotTops[k] > 0.3) errs.push("extra " + SD.INGREDIENTS[k].name.toLowerCase());
    if (!gotSauce || gotSauce.amount <= 0.1) errs.push("no sauce");
    else {
      if (gotSauce.id !== spec.sauce) errs.push("wrong sauce");
      if (gotSauce.amount > 1.6) errs.push("drowned in sauce");
    }
    if (spec.mixed && mixLevel < 0.75) errs.push(b.pour ? "barely mixed" : "wasn't mixed");
    if (!spec.mixed && b.pour) errs.push("was mixed, asked for sauce on top");
    if (!b.lid) errs.push("no lid");
    if (b.bare) errs.push("handled without gloves");
    return errs;
  }
  function scoreOrder(o) {
    const errs = [];
    const specBowls = o.spec.bowls.slice();
    const del = o.delivered.bowls.slice();
    if (del.length < specBowls.length) errs.push((specBowls.length - del.length) + " bowl(s) missing");
    for (const sb of specBowls) {
      if (!del.length) break;
      let bi = 0, bestErrs = null;
      for (let i = 0; i < del.length; i++) {
        const e = scoreBowl(del[i], sb);
        if (bestErrs === null || e.length < bestErrs.length) { bestErrs = e; bi = i; }
      }
      del.splice(bi, 1);
      errs.push.apply(errs, bestErrs);
    }
    if (o.spec.drink) {
      const c = o.delivered.drink;
      if (!c) errs.push("no drink");
      else {
        if (c.drink !== o.spec.drink || c.mixedWrong) errs.push("wrong drink");
        if (c.fill < 0.85) errs.push("drink half full");
        if (c.fill > 1.02) errs.push("drink overflowed");
        if (!c.lid) errs.push("no drink lid");
      }
    }
    if (o.spec.side) {
      if (!o.delivered.side) errs.push("missing " + SD.SIDES[o.spec.side].name.toLowerCase());
      else if (o.delivered.side !== o.spec.side) errs.push("wrong side");
    }
    return errs;
  }
  function finalizeOrder(o, cust) {
    const errs = scoreOrder(o);
    let sat = o.sat - errs.length * 12;
    if (state.messes.length >= 3) { sat -= 6; o.satNotes.push("messy counter"); }
    if (o.thanked) sat += 4;
    if (o.askedFeedback) sat += 5;
    sat = Math.max(5, Math.min(105, sat));
    const stars = Math.max(1, Math.min(5, Math.ceil(sat / 21)));
    const pts = Math.round(40 + sat * 0.9 - errs.length * 8);
    state.score += Math.max(10, pts);
    state.served++;
    o.status = "delivered";
    o.errors = errs;
    o.stars = stars;
    let comment;
    if (errs.length && stars <= 3) comment = errs[0].charAt(0).toUpperCase() + errs[0].slice(1) + ".";
    else comment = SD.pick(SD.COMMENTS[stars]);
    state.feedback.push({ name: o.name, stars: stars, comment: comment, revealed: o.askedFeedback });
    updateHud();
    if (cust) {
      float(cust.x, 2.05, cust.z, "★".repeat(stars), stars >= 4 ? "#ffd15a" : stars >= 3 ? "#f4ede3" : "#ee435b");
      if (o.askedFeedback) float(cust.x, 2.3, cust.z, "“" + comment + "”", "#9fd6c0");
    }
    sfx(stars >= 4 ? "chime" : errs.length > 2 ? "thunk" : "pop");
    if (stars === 5) sfx("jingle");
  }

  // ---- customers ---------------------------------------------------------
  const SHIRTS = ["#22b2b4", "#fd9f27", "#8f6ef0", "#39a85b", "#ee435b", "#4aa8ff", "#c76a9e"];
  const SKINS = ["#ffe0bd", "#e8b98a", "#c68a5c", "#8a5a3a", "#f2d0b0"];
  let custSeq = 0;
  function spawnCustomer(kind, order) {
    custSeq++;
    const c = {
      id: "c" + custSeq, kind: kind, order: order || null,
      x: -2.0, z: 0.4, tx: -2.0, tz: 0.4,
      shirt: SD.pick(SHIRTS), skin: SD.pick(SKINS),
      walkPhase: Math.random() * 6, state: "entering",
      arrivedAt: state.min, stateAt: state.min,
      bubble: null, bubbleUntil: 0, mood: "happy",
    };
    if (order) order.custId = c.id;
    if (!state.lights.foh) {
      if (kind === "walkin") {
        c.state = "balked"; c.bubble = "Are they open?"; c.bubbleUntil = state.min + 3;
        c.tx = -2.0; c.tz = -1;
        if (c.order) { c.order.status = "lost"; state.lostCount++; removeSticker(c.order); c.order = null; }
      } else {
        c.darkArrival = true;
        if (c.order) { c.order.sat -= 10; c.order.satNotes.push("dark store"); }
      }
    }
    state.customers.push(c);
    return c;
  }
  function registerQueue() {
    return state.customers.filter((c) => c.kind === "walkin" &&
      (c.state === "queue" || c.state === "greeted" || c.state === "asking" || c.state === "ordering"));
  }
  function custDist(c) { return Math.hypot(c.x - c.tx, c.z - c.tz); }
  function updateCustomer(c, dt) {
    const gm = dt / MIN_SEC;
    if (custDist(c) > 0.08) {
      const d = custDist(c);
      const step = Math.min(d, dt * 1.35);
      c.x += ((c.tx - c.x) / d) * step;
      c.z += ((c.tz - c.z) / d) * step;
      c.walkPhase += dt * 9;
      c.walking = true;
    } else c.walking = false;

    if (c.order) c.mood = c.order.sat > 72 ? "happy" : c.order.sat > 45 ? "flat" : "mad";

    switch (c.state) {
      case "balked":
        if (c.z < 0.1) c.gone = true;
        break;
      case "entering": {
        if (c.kind === "walkin") {
          const q = registerQueue().filter((o) => o !== c && o.state !== "ordering").length;
          c.tx = 1.95; c.tz = 10.25 - Math.min(q, 3) * 0.8;
          if (custDist(c) < 0.12) { c.state = "queue"; c.stateAt = state.min; }
        } else {
          c.tx = -2.5 + Math.random() * 0.8; c.tz = 12.65;
          if (custDist(c) < 0.15) {
            c.state = "atShelf"; c.stateAt = state.min;
            c.bubble = c.kind === "catering" ? "Catering for " + c.order.name + "." : "Pickup for " + c.order.name + "?";
            c.bubbleUntil = state.min + 4;
          }
        }
        break;
      }
      case "queue": {
        const ahead = registerQueue().filter((o) => o !== c && o.z > c.z + 0.1 && o.state !== "ordering").length;
        c.tx = 1.95; c.tz = 10.25 - ahead * 0.8;
        const waited = state.min - c.stateAt;
        if (c.order && waited > 6) c.order.sat -= gm * 1.4;
        if (waited > 20) {
          c.state = "leaving"; c.bubble = "Forget it."; c.bubbleUntil = state.min + 3;
          if (c.order) { c.order.status = "lost"; state.lostCount++; removeSticker(c.order); }
        }
        break;
      }
      case "greeted": break;
      case "asking": break;
      case "ordering": break;
      case "waiting": {
        const waited = state.min - c.stateAt;
        if (c.order && waited > 14) c.order.sat -= gm * 1.4;
        if (c.order && waited > 38) {
          c.state = "leaving"; c.bubble = "I don't have all day."; c.bubbleUntil = state.min + 3;
          c.order.status = "lost"; state.lostCount++;
          removeSticker(c.order);
        }
        break;
      }
      case "atShelf": {
        if (state.min - (c.lastScan || 0) > 1.2) {
          c.lastScan = state.min;
          tryShelfPickup(c);
        }
        const late = state.min - Math.max(c.order.dueMin, c.stateAt);
        if (c.order && late > 4) c.order.sat -= gm * 1.6;
        if (c.order && late > 30) {
          c.state = "leaving"; c.bubble = "Unbelievable."; c.bubbleUntil = state.min + 3;
          c.order.status = "lost"; state.lostCount++;
          removeSticker(c.order);
        }
        if (state.min - c.stateAt > 5 && state.min - (c.reAsk || 0) > 8) {
          c.reAsk = state.min;
          c.bubble = c.order.name + "? Order #" + c.order.num + "?";
          c.bubbleUntil = state.min + 3;
        }
        break;
      }
      case "served": {
        if (state.min - c.stateAt > 2.2) c.state = "leaving";
        break;
      }
      case "leaving": {
        c.tx = -2.0; c.tz = -0.6;
        if (c.z < 0.1) c.gone = true;
        break;
      }
    }
  }
  function orderNeedsMore(o) {
    const needBowls = o.spec.bowls.length - o.delivered.bowls.length;
    if (needBowls > 0) return needBowls + " bowl" + (needBowls > 1 ? "s" : "");
    if (o.spec.drink && !o.delivered.drink) return "the drink";
    if (o.spec.side && !o.delivered.side) return "the " + SD.SIDES[o.spec.side].name.toLowerCase();
    return null;
  }
  function acceptItem(c, o) {
    const h = state.held;
    if (!h) return false;
    if (h.kind === "bag") {
      if (c.kind !== "walkin" && (!h.label || h.label.orderId !== o.id)) {
        c.bubble = h.label ? "That's not my order." : "Is that mine? There's no label.";
        c.bubbleUntil = state.min + 3;
        if (!h.label) { o.sat -= 5; o.satNotes.push("unlabeled bag"); } else { sfx("thunk"); return true; }
      }
      for (const it of h.items) {
        if (it.kind === "bowl") o.delivered.bowls.push(it.bowl);
        else if (it.kind === "side") o.delivered.side = it.side;
        else if (it.kind === "cup") o.delivered.drink = it.cup;
      }
      state.held = null;
    } else if (h.kind === "cup") {
      o.delivered.drink = h.cup; state.held = null;
    } else if (h.kind === "side") {
      o.delivered.side = h.side; state.held = null;
    } else if (h.kind === "bowl") {
      o.delivered.bowls.push(h.bowl); o.sat -= 4; o.satNotes.push("no bag");
      state.held = null;
    } else return false;
    markProgress();
    sfx("pop");
    const more = orderNeedsMore(o);
    if (more) {
      c.bubble = "And " + more + "?";
      c.bubbleUntil = state.min + 4;
    } else {
      completeHandoff(c, o);
    }
    return true;
  }
  function completeHandoff(c, o) {
    removeSticker(o);
    finalizeOrder(o, c);
    c.state = "served"; c.stateAt = state.min;
    c.bubble = o.stars >= 4 ? "Thanks!" : o.stars >= 3 ? "Alright, thanks." : "Hm. Okay.";
    c.bubbleUntil = state.min + 2.5;
    showServiceButtons(c, o);
  }
  function tryShelfPickup(c) {
    const o = c.order;
    for (const slot of state.shelf) {
      const bag = slot.items.find((it) => it.kind === "bag" && it.label && it.label.orderId === o.id);
      if (!bag) continue;
      const keep = [];
      for (const it of slot.items) {
        if (it === bag) {
          for (const inner of bag.items) {
            if (inner.kind === "bowl") o.delivered.bowls.push(inner.bowl);
            else if (inner.kind === "side") o.delivered.side = inner.side;
            else if (inner.kind === "cup") o.delivered.drink = inner.cup;
          }
        } else if (it.kind === "cup" && !o.delivered.drink) o.delivered.drink = it.cup;
        else if (it.kind === "side" && !o.delivered.side) o.delivered.side = it.side;
        else keep.push(it);
      }
      slot.items = keep;
      const more = orderNeedsMore(o);
      if (more) {
        c.bubble = "This is missing " + more + ".";
        c.bubbleUntil = state.min + 4;
        o.sat -= 8; o.satNotes.push("incomplete on shelf");
      } else {
        completeHandoff(c, o);
      }
      return;
    }
  }
  function tapCustomer(c) {
    const o = c.order;
    if (state.held && o && ["waiting", "atShelf", "queue", "greeted"].indexOf(c.state) >= 0) {
      if (acceptItem(c, o)) return;
    }
    if (c.kind === "walkin" && c.state === "queue") {
      c.state = "greeted"; c.stateAt = state.min;
      const waited = state.min - c.arrivedAt;
      if (o) {
        o.greeted = true;
        if (waited < 4) o.sat += 4;
      }
      if (!o) { c.state = "leaving"; return; }
      if (Math.random() < 0.3 && SD.QUESTIONS.length) {
        c.state = "asking";
        c.question = SD.pick(SD.QUESTIONS);
        c.bubble = c.question.q; c.bubbleUntil = state.min + 99;
        openAsk(c);
      } else {
        c.bubble = SD.speakOrder(o); c.bubbleUntil = state.min + 99;
      }
      sfx("pop"); markProgress();
      return;
    }
    if (c.state === "greeted" && !state.held) thought("Ring it in at the register.");
  }

  // ---- Mahalo service buttons -------------------------------------------
  function showServiceButtons(c, o) {
    state.serviceFor = { cust: c, order: o, until: state.min + 3.4 };
    document.getElementById("svc-thanks").disabled = false;
    document.getElementById("svc-feedback").disabled = false;
    renderServiceButtons();
  }
  function renderServiceButtons() {
    const wrap = document.getElementById("service-btns");
    const s = state.serviceFor;
    if (!s || state.min > s.until || s.cust.gone) { wrap.hidden = true; state.serviceFor = null; return; }
    wrap.hidden = false;
    positionOver(wrap, s.cust.x, 2.15, s.cust.z);
  }
  document.getElementById("svc-thanks").addEventListener("click", () => {
    const s = state.serviceFor;
    if (!s) return;
    s.order.thanked = true;
    s.cust.bubble = "You're welcome."; s.cust.bubbleUntil = state.min + 2;
    document.getElementById("svc-thanks").disabled = true;
    applyService(s);
  });
  document.getElementById("svc-feedback").addEventListener("click", () => {
    const s = state.serviceFor;
    if (!s) return;
    s.order.askedFeedback = true;
    const fb = state.feedback[state.feedback.length - 1];
    if (fb && fb.name === s.order.name) fb.revealed = true;
    s.cust.bubble = fb ? "“" + fb.comment + "”" : "It was fine.";
    s.cust.bubbleUntil = state.min + 4;
    document.getElementById("svc-feedback").disabled = true;
    applyService(s);
  });
  function applyService(s) {
    if (s.order.thanked && !s.order._thankApplied) { s.order._thankApplied = true; state.score += 6; }
    if (s.order.askedFeedback && !s.order._fbApplied) { s.order._fbApplied = true; state.score += 8; }
    updateHud();
    markProgress();
  }

  // ---- interactables -----------------------------------------------------
  const objs = [];
  function add(o) { objs.push(o); return o; }
  function dropHeldBlocked() { sfx("thunk"); }

  // switches, clipboard and posters on the right wall, behind the line
  add({ box: { x0: 4.86, y0: 1.46, z0: 2.86, x1: 5.0, y1: 1.74, z1: 3.18 }, label: "kitchen lights",
    tap: () => { state.lights.kitchen = !state.lights.kitchen; sfx("pop"); markProgress(); } });
  add({ box: { x0: 4.86, y0: 1.16, z0: 2.86, x1: 5.0, y1: 1.46, z1: 3.18 }, label: "dining lights",
    tap: () => { state.lights.foh = !state.lights.foh; sfx("pop"); markProgress(); } });
  add({ box: { x0: 4.88, y0: 1.28, z0: 3.4, x1: 5.0, y1: 1.78, z1: 3.78 }, label: "opening checklist",
    tap: () => { openSheet("board-view"); markProgress(); } });
  add({ box: { x0: 4.9, y0: 1.3, z0: 3.9, x1: 5.0, y1: 2.15, z1: 4.98 }, label: "portion guide",
    tap: () => { openSheet("portion-view"); markProgress(); } });
  add({ box: { x0: 4.9, y0: 1.3, z0: 5.1, x1: 5.0, y1: 2.2, z1: 6.34 }, label: "toppings SOP",
    tap: () => { openSheet("portion-view"); markProgress(); } });

  // rice cookers
  [0, 1].forEach((i) => {
    const ck = () => state.cookers[i];
    const z = state.cookers[i].z;
    add({ box: { x0: 4.56, y0: CT, z0: z - 0.22, x1: 5.0, y1: CT + 0.52, z1: z + 0.22 },
      label: () => (ck().type === "brown" ? "brown rice cooker" : "rice cooker"),
      tap: () => {
        const c = ck();
        const h = state.held;
        if (h && h.kind === "paddle") {
          if (!c.open) { c.open = true; sfx("pop"); return; }
          if (!c.cooked) { thought(c.on ? "Still cooking." : "This pot isn't even on."); return; }
          if (c.level <= 0) { thought("Pot's empty."); return; }
          if (h.load) { thought("Paddle's already loaded."); return; }
          h.load = { rice: c.type };
          c.level--;
          if (!isGloved()) state.bareFlag = true;
          sfx("pop"); markProgress(); return;
        }
        if (h && ["spoodle", "tongs"].indexOf(h.kind) >= 0 && c.open && c.cooked) {
          if (c.level <= 0) return;
          h.load = { rice: c.type, half: true };
          c.level -= 1; mess(4.65, CT + 0.02, z + 0.3); sfx("thunk"); markProgress(); return;
        }
        if (h) { dropHeldBlocked(); return; }
        c.open = !c.open;
        sfx("pop"); markProgress();
      } });
    add({ box: { x0: 4.5, y0: CT + 0.08, z0: z - 0.12, x1: 4.62, y1: CT + 0.34, z1: z + 0.12 }, label: "cooker switch",
      tap: () => {
        const c = ck();
        c.on = !c.on;
        sfx(c.on ? "chime" : "pop"); markProgress();
      } });
  });
  add({ box: { x0: 4.86, y0: 1.3, z0: 4.2, x1: 5.0, y1: 1.8, z1: 4.46 }, label: "rice paddle",
    tap: () => {
      if (state.held && state.held.kind === "paddle") {
        if (state.held.load) { thought("Still rice on it."); return; }
        state.held = null; sfx("pop"); return;
      }
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "paddle", load: null };
      markProgress();
    } });

  // hand sink station
  add({ box: { x0: 4.58, y0: 0.78, z0: 6.15, x1: 5.0, y1: 1.06, z1: 6.95 }, label: "hand sink",
    tap: () => {
      const h = state.hands;
      if (state.held && state.held.kind === "metal") {
        if (!state.waterOn) { thought("Water's off."); return; }
        state.held = null; state.metalStack++; sfx("swish");
        float(4.8, 1.3, 6.5, "rinsed", "#9fd6c0"); markProgress(); return;
      }
      if (state.held) { dropHeldBlocked(); return; }
      if (!state.waterOn) { thought("Water's off."); return; }
      if (h.soaped && h.scrub >= 1) {
        h.soaped = false; h.wet = true; h.rinsed = true; sfx("swish");
        float(4.8, 1.3, 6.5, "rinsed", "#9fd6c0");
      } else {
        h.wet = true;
      }
      markProgress();
    },
    holdStart: () => {
      if (!state.held && state.hands.soaped) { state.scrubbing = true; return true; }
      return false;
    } });
  add({ box: { x0: 4.82, y0: 1.22, z0: 6.38, x1: 5.0, y1: 1.58, z1: 6.72 }, label: "faucet",
    tap: () => { state.waterOn = !state.waterOn; sfx(state.waterOn ? "swish" : "pop"); markProgress(); } });
  add({ box: { x0: 4.88, y0: 1.22, z0: 5.92, x1: 5.0, y1: 1.58, z1: 6.14 }, label: "soap",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      if (!state.hands.wet) { thought("Dry hands. Soap won't lather."); return; }
      state.hands.soaped = true; state.hands.scrub = 0; sfx("pop"); markProgress();
    } });
  add({ box: { x0: 4.86, y0: 1.22, z0: 7.02, x1: 5.0, y1: 1.66, z1: 7.34 }, label: "paper towels",
    tap: () => {
      if (state.held && state.held.kind === "towel") { state.held = null; sfx("pop"); return; }
      if (state.held) { dropHeldBlocked(); return; }
      const h = state.hands;
      if (h.rinsed && h.wet) {
        h.wet = false; h.level = "clean"; h.rinsed = false;
        sfx("chime"); float(4.85, 1.5, 7.15, "clean hands", "#9fd6c0");
      } else if (h.wet) {
        h.wet = false;
      } else {
        state.held = { kind: "towel" };
      }
      markProgress();
    } });
  add({ box: { x0: 4.6, y0: CT, z0: 7.44, x1: 4.94, y1: CT + 0.2, z1: 7.82 }, label: "gloves",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      const h = state.hands;
      h.dirtyGloves = h.level !== "clean";
      h.level = "gloved";
      sfx("pop");
      float(4.77, 1.25, 7.6, h.dirtyGloves ? "gloves on" : "gloves on ✓", h.dirtyGloves ? "#f4ede3" : "#9fd6c0");
      markProgress();
    } });
  add({ box: { x0: 4.5, y0: 0, z0: 10.72, x1: 4.96, y1: 0.78, z1: 11.18 }, label: "trash",
    tap: () => {
      if (!state.held) return;
      const k = state.held.kind;
      if (["bowl", "cup", "bag", "side", "panBackup", "pinch"].indexOf(k) >= 0) {
        state.held = null;
        sfx("thunk"); markProgress();
        if (state.hands.level === "gloved") state.hands.dirtyGloves = true;
      } else dropHeldBlocked();
    } });

  // ---- the line: hotel pans ---------------------------------------------
  function panHandler(slot) {
    const h = state.held;
    if (h && h.kind === "panBackup") {
      if (slot.tin) { thought("Sprinkle tins stay put."); return; }
      if (!slot.pan || slot.pan.ing === h.ing || slot.pan.fill < 0.2) {
        slot.pan = { ing: h.ing, fill: 1 };
        state.held = null;
        sfx("chime"); markProgress();
      } else thought("That well is taken.");
      return;
    }
    if (!slot.pan || slot.pan.fill <= 0.02) { if (!h) thought("Empty well. Backups are in the low boy."); return; }
    const ing = slot.pan.ing;
    const right = SD.INGREDIENTS[ing].utensil;
    if (right === "pinch" && !h) {
      // sprinkles are pinched by (hopefully gloved) hand
      state.held = { kind: "pinch", ing: ing, bare: !isGloved() };
      if (!isGloved()) state.bareFlag = true;
      slot.pan.fill = Math.max(0, slot.pan.fill - 0.03);
      sfx("pop"); markProgress();
      return;
    }
    if (h && (h.kind === "spoodle" || h.kind === "tongs")) {
      if (h.load) { thought("Already holding some " + (h.load.ing ? SD.INGREDIENTS[h.load.ing].name.toLowerCase() : "rice") + "."); return; }
      const amount = h.kind === right ? 1 : 0.5;
      h.load = { ing: ing, amount: amount };
      slot.pan.fill = Math.max(0, slot.pan.fill - amount * (slot.tin ? 0.05 : 0.16));
      if (!isGloved()) state.bareFlag = true;
      if (h.kind !== right && right !== "pinch") { mess((slot.x0 + slot.x1) / 2, CT + 0.02, slot.z1 + 0.15); sfx("thunk"); }
      else sfx("pop");
      markProgress();
    } else if (h && h.kind === "paddle") {
      thought("Rice paddle stays with the rice.");
    } else if (!h) {
      state.bareFlag = true;
      thought("Bare hands in the pans? Grab a utensil.");
    } else dropHeldBlocked();
  }
  // registered by index: startShift rebuilds state, so closures must not
  // capture the boot-time slot objects
  state.linePans.forEach((slot, idx) => {
    add({ box: { x0: slot.x0, y0: CT - 0.08, z0: slot.z0, x1: slot.x1, y1: CT + 0.1, z1: slot.z1 },
      label: () => {
        const s = state.linePans[idx];
        return s.pan ? SD.INGREDIENTS[s.pan.ing].name.toLowerCase() : "empty well";
      },
      tap: () => panHandler(state.linePans[idx]) });
  });

  // low boy under the line, worker side
  add({ box: { x0: 3.5, y0: 0.12, z0: 3.0, x1: 3.64, y1: 0.85, z1: 5.6 }, label: "low boy (backups)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      openFridge(); markProgress();
    } });

  // utensil rail above the line
  const rail = [
    { kind: "spoodle", z: 3.1 }, { kind: "tongs", z: 3.42 }, { kind: "tongs", z: 3.74 }, { kind: "spoon", z: 4.06 },
  ];
  rail.forEach((u, idx) => {
    u.taken = false;
    add({ box: { x0: 3.22, y0: 1.32, z0: u.z - 0.13, x1: 3.44, y1: 1.75, z1: u.z + 0.13 },
      label: u.kind === "spoodle" ? "spoodle" : u.kind,
      tap: () => {
        if (state.held && state.held.kind === u.kind && state.held.railIdx === idx) {
          if (state.held.load) { thought("Still food on it."); return; }
          u.taken = false; state.held = null; sfx("pop"); return;
        }
        if (state.held) { dropHeldBlocked(); return; }
        if (u.taken) return;
        u.taken = true;
        state.held = { kind: u.kind, load: null, railIdx: idx };
        markProgress();
      } });
  });

  // ---- prep spots and bowl building -------------------------------------
  function pourMetalIntoBowl(m, bowl) {
    const total = m.items.reduce((a, i) => a + i.amount, 0);
    if (total <= 0) { thought("Nothing in the mixing bowl."); return false; }
    bowl.pour = {
      bits: m.items.map((i) => i.ing),
      color: m.sauce ? (SD.SAUCES[m.sauce.id] || {}).color : "#b0b6a4",
      amount: total,
      contents: {
        items: m.items.reduce((o, i) => { o[i.ing] = i.amount; return o; }, {}),
        sauceId: m.sauce ? m.sauce.id : null,
        sauceAmt: m.sauce ? m.sauce.amount : 0,
        mix: m.mix,
      },
    };
    if (!isGloved()) bowl.bare = true;
    m.items = []; m.sauce = null; m.mix = 0; m.dirty = true;
    sfx("swish"); markProgress();
    return true;
  }
  function doBowlInteract(bowl, spot, h) {
    if (h.kind === "paddle" && h.load) {
      if (bowl.lid) { thought("Lid's on."); return; }
      bowl.rice += h.load.half ? 0.5 : 1;
      if (!bowl.riceType) bowl.riceType = h.load.rice;
      else if (bowl.riceType !== h.load.rice) bowl.riceType = h.load.rice;
      h.load = null; sfx("pop"); markProgress(); return;
    }
    if ((h.kind === "spoodle" || h.kind === "tongs") && h.load) {
      if (bowl.lid) { thought("Lid's on."); return; }
      if (h.load.rice) { bowl.rice += 0.5; if (!bowl.riceType) bowl.riceType = h.load.rice; h.load = null; sfx("pop"); markProgress(); return; }
      const kind = SD.INGREDIENTS[h.load.ing].kind;
      if (kind === "topping" || kind === "sprinkle") bowlAddTop(bowl, h.load.ing, h.load.amount);
      else bowlAddBase(bowl, h.load.ing, h.load.amount);
      if (!isGloved()) bowl.bare = true;
      h.load = null; sfx("pop"); markProgress(); return;
    }
    if (h.kind === "pinch") {
      if (bowl.lid) { thought("Lid's on."); return; }
      bowlAddTop(bowl, h.ing, 1);
      if (h.bare) bowl.bare = true;
      state.held = null; sfx("pop"); markProgress(); return;
    }
    if (h.kind === "lid") {
      if (h.size !== bowl.size) { thought("This lid doesn't fit that bowl."); sfx("thunk"); return; }
      bowl.lid = true; state.held = null; sfx("pop"); markProgress(); return;
    }
    if (h.kind === "metal") {
      if (bowl.lid) { thought("Lid's on."); return; }
      pourMetalIntoBowl(h, bowl);
      return;
    }
    if (h.kind === "bag") {
      if (!bowl.lid) thought("No lid on that. It'll tip.");
      if (h.items.length >= (h.cap || 3)) { thought(h.box ? "Box is full." : "Bag's full."); return; }
      h.items.push({ kind: "bowl", bowl: bowl });
      spot.item = null;
      sfx("pop"); markProgress(); return;
    }
    dropHeldBlocked();
  }
  function interactMetal(m, spot, h) {
    if ((h.kind === "spoodle" || h.kind === "tongs") && h.load && h.load.ing) {
      metalAdd(m, h.load.ing, h.load.amount);
      if (!isGloved()) state.bareFlag = true;
      h.load = null; sfx("pop"); markProgress(); return;
    }
    if (h.kind === "pinch") {
      metalAdd(m, h.ing, 1);
      state.held = null; sfx("pop"); markProgress(); return;
    }
    if (h.kind === "paddle" && h.load) { thought("Rice goes in the serving bowl, not the mix."); return; }
    if (h.kind === "bowl") {
      pourMetalIntoBowl(m, h.bowl);
      return;
    }
    if (h.kind === "spoon") return; // mixing runs through holdStart
    dropHeldBlocked();
  }
  function spotTap(spot) {
    const h = state.held;
    if (h && h.kind === "bowl" && !spot.item) { spot.item = h; state.held = null; sfx("pop"); markProgress(); return; }
    if (h && h.kind === "metal" && !spot.item) {
      if (h.dirty) { thought("That one needs a rinse first."); }
      spot.item = h; state.held = null; sfx("pop"); markProgress(); return;
    }
    const it = spot.item;
    if (!it) return;
    if (!h) {
      spot.item = null;
      state.held = it;
      markProgress();
      return;
    }
    if (it.kind === "bowl") doBowlInteract(it.bowl, spot, h);
    else if (it.kind === "metal") interactMetal(it, spot, h);
  }
  state.spots.forEach((_, i) => {
    add({
      box: { x0: 2.7, y0: CT, z0: state.spots[i].z - 0.22, x1: 3.06, y1: CT + 0.34, z1: state.spots[i].z + 0.22 },
      label: () => {
        const it = state.spots[i].item;
        return it ? (it.kind === "metal" ? "mixing bowl" : "bowl") : "counter space";
      },
      tap: () => spotTap(state.spots[i]),
      holdStart: () => {
        const spot = state.spots[i];
        if (state.held && state.held.kind === "spoon" && spot.item && spot.item.kind === "metal") {
          state.mixing = { spot: spot, lastAng: null };
          return true;
        }
        if (state.held && state.held.kind === "bottle" && spot.item && spot.item.kind === "bowl") {
          state.holdSauce = { target: spot.item.bowl, isMetal: false };
          return true;
        }
        if (state.held && state.held.kind === "bottle" && spot.item && spot.item.kind === "metal") {
          state.holdSauce = { target: spot.item, isMetal: true };
          return true;
        }
        return false;
      },
    });
  });

  // metal bowls and the mixing spoon
  add({ box: { x0: 3.2, y0: CT, z0: 9.5, x1: 3.5, y1: CT + 0.3, z1: 9.82 }, label: "mixing bowls",
    tap: () => {
      if (state.held && state.held.kind === "metal") {
        if (state.held.dirty) { thought("It's dirty. Rinse it at the sink first."); sfx("thunk"); return; }
        state.metalStack++; state.held = null; sfx("pop"); return;
      }
      if (state.held) { dropHeldBlocked(); return; }
      if (state.metalStack <= 0) { thought("Out of clean mixing bowls."); return; }
      state.metalStack--;
      state.held = newMetal();
      markProgress();
    } });
  add({ box: { x0: 3.2, y0: CT, z0: 9.94, x1: 3.5, y1: CT + 0.34, z1: 10.2 }, label: "mixing spoon",
    tap: () => {
      if (state.held && state.held.kind === "spoon" && state.held.fromCrock) { state.held = null; sfx("pop"); return; }
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "spoon", fromCrock: true };
      markProgress();
    } });

  // sauce rack on the line counter
  const RACK_Z = [8.55, 8.73, 8.91, 9.09, 9.27, 9.45];
  const RACK_IDS = ["classic", "shoyu", "sriracha", "wasabi", "ginger", "chili"];
  RACK_IDS.forEach((id, i) => {
    add({ box: { x0: 3.26, y0: CT, z0: RACK_Z[i] - 0.085, x1: 3.46, y1: CT + 0.34, z1: RACK_Z[i] + 0.085 },
      label: () => SD.SAUCES[id].name,
      tap: () => {
        if (state.held && state.held.kind === "bottle") {
          if (state.held.sauce === id || state.rack[id] === 0) {
            state.rack[state.held.sauce] = 1;
            state.held = null; sfx("pop"); markProgress();
          } else dropHeldBlocked();
          return;
        }
        if (state.held) { dropHeldBlocked(); return; }
        if (!state.rack[id]) { thought("That bottle isn't out yet. Check the low boy."); return; }
        state.rack[id] = 0;
        state.held = { kind: "bottle", sauce: id, fill: 0.55 + Math.random() * 0.4 };
        markProgress();
      } });
  });

  // register at the end of the counter
  add({ box: { x0: 2.86, y0: CT, z0: 10.02, x1: 3.34, y1: CT + 0.48, z1: 10.52 }, label: "register",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      const front = registerQueue().find((c) => c.state === "greeted");
      const ungreeted = registerQueue().find((c) => c.state === "queue");
      if (front) { openPos(front); markProgress(); }
      else if (ungreeted) tapCustomer(ungreeted);
      else thought("Nobody's ordering right now.");
    } });

  // KDS screen hanging over the line
  add({ box: { x0: 3.02, y0: 1.9, z0: 5.0, x1: 3.14, y1: 2.5, z1: 6.44 }, label: "order screen",
    tap: (pt) => {
      const act = activeOrders();
      if (!act.length) return;
      const idx = Math.max(0, Math.min(act.length - 1, Math.floor(((pt.z - 5.0) / 1.44) * 4)));
      openTicket(act[idx]);
      markProgress();
    } });

  // ticket rail on the wall over the pass
  add({ box: { x0: 4.92, y0: 1.72, z0: 8.3, x1: 5.0, y1: 2.16, z1: 9.94 }, label: "ticket rail",
    tap: (pt) => {
      if (!state.stickers.length) return;
      const idx = Math.max(0, Math.min(state.stickers.length - 1, Math.floor(((pt.z - 8.3) / 1.64) * 5)));
      const st = state.stickers[idx];
      if (!st) return;
      if (state.held && state.held.kind === "bag") {
        state.held.label = { num: st.order.num, name: st.order.name, orderId: st.order.id };
        sfx("pop"); markProgress();
      } else if (!state.held) {
        openTicket(st.order);
        markProgress();
      } else dropHeldBlocked();
    } });

  // pass supplies on the back counter
  add({ box: { x0: 4.6, y0: CT, z0: 8.12, x1: 4.94, y1: CT + 0.34, z1: 8.44 }, label: "bowls (regular)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "bowl", bowl: newBowl("regular") };
      markProgress();
    } });
  add({ box: { x0: 4.6, y0: CT, z0: 8.5, x1: 4.94, y1: CT + 0.38, z1: 8.82 }, label: "bowls (large)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "bowl", bowl: newBowl("large") };
      markProgress();
    } });
  add({ box: { x0: 4.6, y0: CT, z0: 8.88, x1: 4.94, y1: CT + 0.26, z1: 9.12 }, label: "lids (regular)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "lid", size: "regular" };
      markProgress();
    } });
  add({ box: { x0: 4.6, y0: CT, z0: 9.18, x1: 4.94, y1: CT + 0.26, z1: 9.42 }, label: "lids (large)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "lid", size: "large" };
      markProgress();
    } });
  add({ box: { x0: 4.6, y0: CT, z0: 9.5, x1: 4.94, y1: CT + 0.44, z1: 9.9 }, label: "bags",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "bag", items: [], label: null };
      markProgress();
    } });

  // ---- drinks + sides against the back wall -----------------------------
  const VALVES = [
    { id: "greentea", x: 0.58 }, { id: "lemonade", x: 0.94 }, { id: "punch", x: 1.3 }, { id: "water", x: 1.66 },
  ];
  VALVES.forEach((v) => {
    add({ box: { x0: v.x - 0.13, y0: 1.18, z0: 13.36, x1: v.x + 0.13, y1: 1.5, z1: 13.58 },
      label: () => SD.DRINKS[v.id].name + " valve",
      holdStart: () => {
        if (state.cupAtTray) { state.holdFill = { valve: v.id }; return true; }
        thought("Nothing under the nozzle.");
        return false;
      },
      tap: () => { if (!state.cupAtTray) thought("Nothing under the nozzle."); } });
  });
  add({ box: { x0: 0.4, y0: CT, z0: 13.28, x1: 1.8, y1: CT + 0.16, z1: 13.62 }, label: "drip tray",
    tap: () => {
      if (state.held && state.held.kind === "cup" && !state.cupAtTray) {
        state.cupAtTray = state.held.cup; state.held = null; sfx("pop"); markProgress(); return;
      }
      if (!state.held && state.cupAtTray) {
        state.held = { kind: "cup", cup: state.cupAtTray }; state.cupAtTray = null; markProgress(); return;
      }
      if (state.held) dropHeldBlocked();
    } });
  add({ box: { x0: 1.86, y0: CT, z0: 13.34, x1: 2.08, y1: CT + 0.4, z1: 13.6 }, label: "cups",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "cup", cup: { drink: null, fill: 0, lid: false, straw: false, mixedWrong: false } };
      markProgress();
    } });
  add({ box: { x0: 2.12, y0: CT, z0: 13.36, x1: 2.28, y1: CT + 0.28, z1: 13.58 }, label: "cup lids",
    tap: () => {
      const h = state.held;
      if (h && h.kind === "cup") {
        if (h.cup.fill <= 0) { thought("Lid on an empty cup?"); return; }
        h.cup.lid = true; sfx("pop"); markProgress();
      } else if (!h) thought("Grab the cup first, then tap the lids.");
      else dropHeldBlocked();
    } });
  add({ box: { x0: 2.3, y0: CT, z0: 13.38, x1: 2.4, y1: CT + 0.32, z1: 13.56 }, label: "straws",
    tap: () => {
      const h = state.held;
      if (h && h.kind === "cup" && h.cup.lid) { h.cup.straw = true; sfx("pop"); markProgress(); }
      else if (h && h.kind === "cup") thought("Lid first.");
      else if (!h) return;
      else dropHeldBlocked();
    } });
  const SIDE_SHELF = [
    { id: "miso", x0: 1.9, x1: 2.1 }, { id: "mac", x0: 2.14, x1: 2.32 }, { id: "edas", x0: 2.36, x1: 2.52 },
  ];
  SIDE_SHELF.forEach((sd) => {
    add({ box: { x0: sd.x0, y0: 1.68, z0: 13.8, x1: sd.x1, y1: 1.98, z1: 14.0 },
      label: () => SD.SIDES[sd.id].name,
      tap: () => {
        const h = state.held;
        if (h && h.kind === "bag") {
          if (h.items.length >= (h.cap || 3)) { thought(h.box ? "Box is full." : "Bag's full."); return; }
          h.items.push({ kind: "side", side: sd.id, color: SD.SIDES[sd.id].color });
          sfx("pop"); markProgress(); return;
        }
        if (h) { dropHeldBlocked(); return; }
        state.held = { kind: "side", side: sd.id };
        markProgress();
      } });
  });
  add({ box: { x0: 0.3, y0: 0.15, z0: 13.2, x1: 1.2, y1: 0.8, z1: 13.32 }, label: "freezer (mochi)",
    tap: () => {
      const h = state.held;
      if (h && h.kind === "bag") {
        if (h.items.length >= (h.cap || 3)) { thought(h.box ? "Box is full." : "Bag's full."); return; }
        h.items.push({ kind: "side", side: "mochi", color: SD.SIDES.mochi.color });
        sfx("pop"); markProgress(); return;
      }
      if (h) { dropHeldBlocked(); return; }
      state.held = { kind: "side", side: "mochi" };
      markProgress();
    } });

  // pickup shelf slots (back-left)
  state.shelf.forEach((_, i) => {
    add({ box: {
        x0: state.shelf[i].x - 0.42, y0: state.shelf[i].y, z0: 13.45,
        x1: state.shelf[i].x + 0.42, y1: state.shelf[i].y + 0.46, z1: 13.95,
      }, label: "pickup shelf",
      tap: () => {
        const slot = state.shelf[i];
        const h = state.held;
        if (h && ["bag", "cup", "side"].indexOf(h.kind) >= 0) {
          if (slot.items.length >= 3) { thought("That shelf spot is full."); return; }
          if (h.kind === "bag") slot.items.push({ kind: "bag", items: h.items, label: h.label, box: h.box, cap: h.cap });
          else if (h.kind === "cup") slot.items.push({ kind: "cup", cup: h.cup });
          else slot.items.push({ kind: "side", side: h.side, color: SD.SIDES[h.side].color });
          state.held = null;
          sfx("pop"); markProgress(); return;
        }
        if (!h && slot.items.length) {
          const it = slot.items.pop();
          if (it.kind === "bag") state.held = { kind: "bag", items: it.items, label: it.label, box: it.box, cap: it.cap };
          else if (it.kind === "cup") state.held = { kind: "cup", cup: it.cup };
          else state.held = { kind: "side", side: it.side };
          markProgress(); return;
        }
        if (h) dropHeldBlocked();
      } });
  });

  // open sign inside the front door
  add({ box: { x0: -2.45, y0: 2.05, z0: 0.0, x1: -1.55, y1: 2.6, z1: 0.1 }, label: "open sign",
    tap: () => {
      state.sign = !state.sign;
      if (state.sign && state.signOnMin === null) state.signOnMin = state.min;
      sfx(state.sign ? "chime" : "pop");
      markProgress();
    } });
  // mahalo poster on the left wall
  add({ box: { x0: -5.0, y0: 1.3, z0: 7.0, x1: -4.9, y1: 2.15, z1: 8.0 }, label: "Mahalo poster",
    tap: () => { openSheet("mahalo-view"); markProgress(); } });

  // ---- back of house ----
  add({ box: { x0: 3.1, y0: 0, z0: 16.7, x1: 3.24, y1: 2.4, z1: 18.0 }, label: "walk-in (backups)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      openFridge(); markProgress();
    } });
  add({ box: { x0: -1.45, y0: 1.0, z0: 15.7, x1: -0.85, y1: 1.55, z1: 16.55 }, label: "catering boxes",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "bag", box: true, cap: 5, items: [], label: null };
      markProgress();
    } });
  add({ box: { x0: 0.6, y0: 0.6, z0: 17.5, x1: 1.7, y1: 1.35, z1: 18.0 }, label: "prep sink",
    tap: () => {
      if (state.held && state.held.kind === "metal") {
        state.held = null; state.metalStack++; sfx("swish");
        float(1.15, 1.2, 17.7, "rinsed", "#9fd6c0"); markProgress(); return;
      }
      thought("Dish sink. Wash in at the hand sink on the line.");
    } });
  add({ box: { x0: -0.2, y0: 0.7, z0: 15.1, x1: 2.2, y1: 1.0, z1: 16.0 }, label: "prep table",
    tap: () => { if (state.held) dropHeldBlocked(); } });

  // ---- DOM sheets --------------------------------------------------------
  function openSheet(id) {
    closeSheets();
    document.getElementById(id).hidden = false;
  }
  function closeSheets() {
    for (const id of ["board-view", "portion-view", "mahalo-view", "ticket-view", "fridge-view", "pos", "ask"]) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    }
    if (state && state.posFor) {
      const c = state.posFor;
      if (c.state === "ordering") c.state = "greeted";
      state.posFor = null;
    }
    if (state) state.askFor = null;
  }
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheets));

  function openTicket(o) {
    openSheet("ticket-view");
    document.getElementById("tv-head").textContent =
      "#" + o.num + "  " + o.name + "  ·  " + (o.type === "walkin" ? "here" : o.type) +
      (o.type !== "walkin" ? "  ·  due " + clockStr(o.dueMin) : "");
    const body = document.getElementById("tv-body");
    body.innerHTML = "";
    const src = o.type === "walkin"
      ? (o.ticket ? { bowls: o.ticket.bowls, drink: o.ticket.drink, side: o.ticket.side } : null)
      : o.spec;
    if (!src) { body.textContent = "Not rung in yet."; return; }
    for (const line of SD.ticketLines({ bowls: src.bowls, drink: src.drink, side: src.side })) {
      const div = document.createElement("div");
      div.textContent = line;
      if (!line.startsWith("  ")) div.className = "tv-item";
      body.appendChild(div);
    }
  }

  function openFridge() {
    openSheet("fridge-view");
    const wrap = document.getElementById("fv-grid");
    wrap.innerHTML = "";
    const all = [].concat(SD.PROTEINS, SD.MIXINS, SD.TOPPINGS);
    for (const ing of all) {
      const n = state.fridge[ing] || 0;
      const b = document.createElement("button");
      b.type = "button"; b.className = "fv-item" + (n ? "" : " out");
      b.innerHTML = "<b>" + SD.INGREDIENTS[ing].name + "</b><span>" + (n ? "x" + n : "out") + "</span>";
      b.addEventListener("click", () => {
        if (!state.fridge[ing]) return;
        state.fridge[ing]--;
        state.held = { kind: "panBackup", ing: ing };
        closeSheets();
        sfx("pop"); markProgress();
      });
      wrap.appendChild(b);
    }
    for (const sid of state.fridgeBottles.slice()) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "fv-item fv-sauce";
      b.innerHTML = "<b>" + SD.SAUCES[sid].name + "</b><span>bottle</span>";
      b.addEventListener("click", () => {
        state.fridgeBottles = state.fridgeBottles.filter((x) => x !== sid);
        state.held = { kind: "bottle", sauce: sid, fill: 0.9 };
        closeSheets();
        sfx("pop"); markProgress();
      });
      wrap.appendChild(b);
    }
  }

  function openAsk(c) {
    state.askFor = c;
    const el = document.getElementById("ask");
    el.hidden = false;
    document.getElementById("ask-q").textContent = "“" + c.question.q + "”";
    const wrap = document.getElementById("ask-opts");
    wrap.innerHTML = "";
    const opts = [{ t: c.question.right, ok: true }]
      .concat(c.question.wrong.map((w) => ({ t: w, ok: false })));
    opts.sort(() => Math.random() - 0.5);
    for (const op of opts) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn ask-opt";
      b.textContent = op.t;
      b.addEventListener("click", () => {
        const o = c.order;
        if (op.ok) { o.sat += 8; c.bubble = "Good to know, thanks."; }
        else { o.sat -= 10; o.satNotes.push("wrong info"); c.bubble = "Hm, that doesn't sound right."; }
        c.bubbleUntil = state.min + 2.5;
        document.getElementById("ask").hidden = true;
        state.askFor = null;
        setTimeout(() => {
          if (c.state === "asking") {
            c.state = "greeted";
            c.bubble = SD.speakOrder(o); c.bubbleUntil = state.min + 99;
          }
        }, 900);
        markProgress();
      });
      wrap.appendChild(b);
    }
  }

  // ---- POS ---------------------------------------------------------------
  let pos = null;
  function openPos(cust) {
    pos = {
      size: null, rice: null, protein: {}, mixins: [], sauce: null,
      mixed: null, toppings: [], sprinkles: [], drink: null, side: null,
    };
    document.getElementById("pos-said").textContent = "“" + SD.speakOrder(cust.order) + "”";
    renderPos();
    openSheet("pos");
    state.posFor = cust;
    cust.state = "ordering";
    document.getElementById("pos").hidden = false;
  }
  function chip(txt, on, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pos-chip" + (on ? " on" : "");
    b.textContent = txt;
    b.addEventListener("click", fn);
    return b;
  }
  function renderPos() {
    const grid = document.getElementById("pos-grid");
    grid.innerHTML = "";
    function section(title, nodes) {
      const s = document.createElement("div");
      s.className = "pos-sec";
      const h = document.createElement("div");
      h.className = "pos-sec-h"; h.textContent = title;
      s.appendChild(h);
      const row = document.createElement("div");
      row.className = "pos-row";
      nodes.forEach((n) => row.appendChild(n));
      s.appendChild(row);
      grid.appendChild(s);
    }
    function multi(list, arr) {
      return list.map((m) =>
        chip(SD.INGREDIENTS[m].name, arr.indexOf(m) >= 0, () => {
          const i = arr.indexOf(m);
          if (i >= 0) arr.splice(i, 1); else arr.push(m);
          renderPos();
        }));
    }
    section("Size", ["regular", "large"].map((v) =>
      chip(v, pos.size === v, () => { pos.size = v; renderPos(); })));
    section("Rice", ["white", "brown"].map((v) =>
      chip(v, pos.rice === v, () => { pos.rice = v; renderPos(); })));
    section("Protein (tap to add scoops)", SD.PROTEINS.map((p) =>
      chip(SD.INGREDIENTS[p].name + (pos.protein[p] ? " x" + pos.protein[p] : ""), !!pos.protein[p], () => {
        pos.protein[p] = ((pos.protein[p] || 0) + 1) % 4;
        if (!pos.protein[p]) delete pos.protein[p];
        renderPos();
      })));
    section("Mix-ins", multi(SD.MIXINS, pos.mixins));
    section("Sauce", Object.keys(SD.SAUCES).map((sc) =>
      chip(SD.SAUCES[sc].name, pos.sauce === sc, () => { pos.sauce = sc; renderPos(); })));
    section("Style", [chip("mixed", pos.mixed === true, () => { pos.mixed = true; renderPos(); }),
      chip("sauce on top", pos.mixed === false, () => { pos.mixed = false; renderPos(); })]);
    section("Toppings", multi(SD.TOPPINGS, pos.toppings));
    section("Sprinkles", multi(SD.SPRINKLES, pos.sprinkles));
    section("Drink", [chip("none", pos.drink === null, () => { pos.drink = null; renderPos(); })]
      .concat(Object.keys(SD.DRINKS).map((d) =>
        chip(SD.DRINKS[d].name, pos.drink === d, () => { pos.drink = d; renderPos(); }))));
    section("Side", [chip("none", pos.side === null, () => { pos.side = null; renderPos(); })]
      .concat(Object.keys(SD.SIDES).map((sd) =>
        chip(SD.SIDES[sd].name, pos.side === sd, () => { pos.side = sd; renderPos(); }))));
  }
  document.getElementById("pos-send").addEventListener("click", () => {
    const c = state.posFor;
    if (!c) return;
    const o = c.order;
    o.ticket = {
      bowls: [{
        size: pos.size || "regular", rice: pos.rice || "white",
        protein: Object.assign({}, pos.protein),
        mixins: pos.mixins.slice(), sauce: pos.sauce || "classic",
        toppings: pos.toppings.slice(), sprinkles: pos.sprinkles.slice(),
        mixed: pos.mixed !== false,
      }],
      drink: pos.drink, side: pos.side,
    };
    printSticker(o);
    sfx("tick"); setTimeout(() => sfx("tick"), 110);
    c.state = "waiting"; c.stateAt = state.min;
    c.tx = 0.3 + Math.random() * 0.9; c.tz = 11.2 + Math.random() * 0.9;
    c.bubble = null;
    state.posFor = null;
    document.getElementById("pos").hidden = true;
    markProgress();
  });
  document.getElementById("pos-cancel").addEventListener("click", () => {
    const c = state.posFor;
    if (c) c.state = "greeted";
    state.posFor = null;
    document.getElementById("pos").hidden = true;
  });

  // ---- picking -----------------------------------------------------------
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (VW / r.width), y: (e.clientY - r.top) * (VH / r.height) };
  }
  function pick(mx, my) {
    const ray = R.ray(mx, my);
    let best = null, bt = REACH;
    for (const o of objs) {
      const t = S3.rayBox(ray, o.box);
      if (t !== null && t < bt) { bt = t; best = { obj: o, t: t }; }
    }
    // customers: a soft cylinder around each body, reachable across the counter
    let bc = null, bct = 3.1;
    for (const c of state.customers) {
      if (c.gone || c.state === "leaving" || c.state === "balked") continue;
      const t = S3.rayBox(ray, { x0: c.x - 0.32, y0: 0, z0: c.z - 0.32, x1: c.x + 0.32, y1: 1.9, z1: c.z + 0.32 });
      if (t !== null && t < bct) { bct = t; bc = c; }
    }
    if (bc && (!best || bct < best.t)) return { cust: bc, t: bct };
    if (best) {
      best.pt = { x: ray.ox + ray.dx * best.t, y: ray.oy + ray.dy * best.t, z: ray.oz + ray.dz * best.t };
      return best;
    }
    return null;
  }

  // ---- input -------------------------------------------------------------
  const keys = {};
  let ptr = { down: false, x: VW / 2, y: VH / 2, sx: 0, sy: 0, moved: 0, holding: false };
  canvas.addEventListener("pointerdown", (e) => {
    if (!state.running || state.paused || state.over) return;
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPos(e);
    ptr = { down: true, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: 0, holding: false };
    const hit = pick(p.x, p.y);
    if (hit && hit.obj && hit.obj.holdStart && hit.obj.holdStart()) ptr.holding = true;
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = canvasPos(e);
    const dx = p.x - ptr.x, dy = p.y - ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    if (!ptr.down) return;
    ptr.moved += Math.abs(dx) + Math.abs(dy);
    if (ptr.holding) {
      if (state.mixing) {
        const spot = state.mixing.spot;
        const v = R.toView([2.87, CT + 0.08, spot.z]);
        if (v[2] > 0.2) {
          const s = R.project(v);
          const ang = Math.atan2(p.y - s[1], p.x - s[0]);
          if (state.mixing.lastAng !== null) {
            let d = ang - state.mixing.lastAng;
            if (d > Math.PI) d -= Math.PI * 2;
            if (d < -Math.PI) d += Math.PI * 2;
            const m = spot.item;
            if (m) {
              m.mix = Math.min(1, m.mix + Math.abs(d) / (Math.PI * 2 * 3));
              if (Math.random() < Math.abs(d) * 0.1) sfx("swish");
            }
          }
          state.mixing.lastAng = ang;
        }
      }
      if (state.scrubbing) {
        state.hands.scrub = Math.min(1.2, state.hands.scrub + (Math.abs(dx) + Math.abs(dy)) * 0.004);
      }
      return;
    }
    // free look
    state.yaw += dx * 0.0042;
    state.pitch = Math.max(-0.95, Math.min(0.5, state.pitch - dy * 0.0034));
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!ptr.down) return;
    ptr.down = false;
    const wasHolding = ptr.holding;
    ptr.holding = false;
    state.mixing = null; state.holdFill = null; state.holdSauce = null; state.scrubbing = false;
    if (wasHolding && ptr.moved >= 14) { markProgress(); return; }
    if (!wasHolding && ptr.moved >= 14) return; // that was a look, not a tap
    if (!state.running || state.paused || state.over) return;
    const p = canvasPos(e);
    // a held towel wipes the nearest splat first
    if (state.held && state.held.kind === "towel") {
      const ray = R.ray(p.x, p.y);
      for (let i = 0; i < state.messes.length; i++) {
        const m = state.messes[i];
        const t = S3.rayBox(ray, { x0: m.x - 0.2, y0: m.y - 0.08, z0: m.z - 0.2, x1: m.x + 0.2, y1: m.y + 0.12, z1: m.z + 0.2 });
        if (t !== null && t < REACH) { state.messes.splice(i, 1); sfx("swish"); markProgress(); return; }
      }
    }
    const hit = pick(p.x, p.y);
    if (!hit) return;
    if (hit.cust) { tapCustomer(hit.cust); return; }
    if (hit.obj.tap) hit.obj.tap(hit.pt);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const anyOpen = ["board-view", "portion-view", "mahalo-view", "ticket-view", "fridge-view", "pos", "ask"]
        .some((id) => { const el = document.getElementById(id); return el && !el.hidden; });
      if (anyOpen) { closeSheets(); return; }
      if (state.running && !state.over) togglePause();
      return;
    }
    keys[e.key.toLowerCase()] = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  // simple touch joystick (shows on coarse pointers via CSS)
  const joyEl = document.getElementById("joy");
  const joyKnob = document.getElementById("joy-knob");
  let joy = { x: 0, y: 0, id: null };
  if (joyEl) {
    joyEl.addEventListener("pointerdown", (e) => {
      joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId);
      moveJoy(e);
    });
    joyEl.addEventListener("pointermove", (e) => { if (e.pointerId === joy.id) moveJoy(e); });
    const end = (e) => {
      if (e.pointerId !== joy.id) return;
      joy = { x: 0, y: 0, id: null };
      joyKnob.style.transform = "translate(0px, 0px)";
    };
    joyEl.addEventListener("pointerup", end);
    joyEl.addEventListener("pointercancel", end);
    function moveJoy(e) {
      const r = joyEl.getBoundingClientRect();
      let jx = ((e.clientX - r.left) / r.width) * 2 - 1;
      let jy = ((e.clientY - r.top) / r.height) * 2 - 1;
      const m = Math.hypot(jx, jy);
      if (m > 1) { jx /= m; jy /= m; }
      joy.x = jx; joy.y = jy;
      joyKnob.style.transform = "translate(" + (jx * 26) + "px, " + (jy * 26) + "px)";
    }
  }

  // ---- movement ----------------------------------------------------------
  const BLOCKERS = [
    LINE, BACK, DRINK, SHELF,
    { x0: -4.95, z0: 2.7, x1: -3.95, z1: 4.3 },   // table 1
    { x0: -4.95, z0: 5.2, x1: -3.95, z1: 6.8 },   // table 2
    { x0: -4.35, z0: 1.4, x1: -3.85, z1: 1.9 },   // promo sign
    { x0: -4.95, z0: 0.5, x1: -4.35, z1: 1.15 },  // plant
    { x0: 4.5, z0: 10.72, x1: 4.96, z1: 11.18 },  // trash
    // back of house
    { x0: 3.2, z0: 16.7, x1: 5.0, z1: 18.0 },     // walk-in
    { x0: -0.2, z0: 15.1, x1: 2.2, z1: 16.0 },    // prep table
    { x0: -1.5, z0: 14.4, x1: -0.85, z1: 16.6 },  // shelving
    { x0: 0.6, z0: 17.5, x1: 1.7, z1: 18.0 },     // prep sink
    { x0: 2.4, z0: 17.5, x1: 2.8, z1: 17.9 },     // mop bucket
    { x0: 4.3, z0: 14.3, x1: 4.9, z1: 14.9 },     // boh trash
    { x0: -0.6, z0: 17.3, x1: 0.2, z1: 17.95 },   // stacked boxes
  ];
  function blocked(x, z) {
    const r = 0.28;
    const inFOH = x > -4.72 && x < 4.72 && z > 0.34 && z < 13.66;
    const inDoor = x > 3.56 && x < 4.34 && z >= 13.0 && z <= 15.0;
    const inBOH = x > -1.22 && x < 4.72 && z > 14.34 && z < 17.7;
    if (!inFOH && !inDoor && !inBOH) return true;
    for (const b of BLOCKERS) {
      if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    }
    return false;
  }
  function movePlayer(dt) {
    const sp = 2.6;
    const fw = { x: Math.sin(state.yaw), z: Math.cos(state.yaw) };
    const rt = { x: Math.cos(state.yaw), z: -Math.sin(state.yaw) };
    let mx = 0, mz = 0;
    if (keys.w || keys.arrowup) { mx += fw.x; mz += fw.z; }
    if (keys.s || keys.arrowdown) { mx -= fw.x; mz -= fw.z; }
    if (keys.a) { mx -= rt.x; mz -= rt.z; }
    if (keys.d) { mx += rt.x; mz += rt.z; }
    if (keys.arrowleft) state.yaw -= dt * 2.1;
    if (keys.arrowright) state.yaw += dt * 2.1;
    if (joy.id !== null) {
      mx += fw.x * -joy.y + rt.x * joy.x;
      mz += fw.z * -joy.y + rt.z * joy.x;
    }
    const m = Math.hypot(mx, mz);
    if (m > 0.01) {
      mx = (mx / m) * sp * dt; mz = (mz / m) * sp * dt;
      if (!blocked(state.px + mx, state.pz)) state.px += mx;
      if (!blocked(state.px, state.pz + mz)) state.pz += mz;
      markWalk(dt);
    }
  }
  let bobT = 0, walking = false;
  function markWalk(dt) { bobT += dt * 7; walking = true; }

  // ---- schedule ----------------------------------------------------------
  function setupShift() {
    state = freshState();
    const cat = SD.genCatering();
    cat.spec = { bowls: cat.bowls, drink: cat.drink, side: cat.side };
    pushOrder(cat, 50);
    const nPick = 2 + Math.min(3, shiftsPlayed);
    const dues = [38, 58, 82, 104, 122];
    for (let i = 0; i < nPick; i++) {
      const po = SD.genOrder("pickup");
      po.spec = { bowls: po.bowls, drink: po.drink, side: po.side };
      pushOrder(po, dues[i]);
    }
    state.walkInEvery = Math.max(7, 13 - shiftsPlayed * 1.5);
    updateHud();
  }
  function updateSchedule() {
    const m = state.min;
    for (const o of state.orders) {
      if (o.type === "pickup" && !o.custArrived && m >= o.dueMin - 1) {
        o.custArrived = true;
        spawnCustomer("pickup", o);
      }
      if (o.type === "catering" && !o.custArrived && m >= o.dueMin) {
        o.custArrived = true;
        const c = spawnCustomer("catering", o);
        c.shirt = "#41535e";
      }
    }
    const walkStart = state.signOnMin !== null ? Math.max(state.signOnMin, 26) : null;
    if (walkStart !== null && m > walkStart && m < CLOSE_MIN && state.sign) {
      if (state.nextWalkIn === 0) state.nextWalkIn = m + 1.5;
      if (m >= state.nextWalkIn && registerQueue().length < 4) {
        state.nextWalkIn = m + state.walkInEvery * (0.7 + Math.random() * 0.7);
        const o = SD.genOrder("walkin");
        o.bowls = [o.bowls[0]];
        o.spec = { bowls: o.bowls, drink: o.drink, side: o.side };
        pushOrder(o, m + 18);
        spawnCustomer("walkin", o);
      }
    }
  }

  // ---- update ------------------------------------------------------------
  function update(dt) {
    state.clock += dt;
    state.min += dt / MIN_SEC;
    walking = false;
    movePlayer(dt);
    for (const c of state.cookers) {
      if (c.on && !c.cooked) {
        c.cookLeft -= dt / MIN_SEC;
        if (c.cookLeft <= 0) { c.cooked = true; sfx("chime"); }
      }
      if (!RM && c.open && c.cooked && Math.random() < dt * 3) {
        state.steam.push({ x: 4.78 + (Math.random() * 0.3 - 0.15), y: CT + 0.55, z: c.z + (Math.random() * 0.3 - 0.15), t: 0 });
      }
    }
    for (const s of state.steam) { s.t += dt; s.y += dt * 0.35; }
    state.steam = state.steam.filter((s) => s.t < 1.6);
    for (const f of state.floats) f.t += dt;
    state.floats = state.floats.filter((f) => f.t < 2.4);
    if (state.hands.soaped && state.hands.scrub >= 1 && !state._scrubDing) {
      state._scrubDing = true;
      float(4.8, 1.35, 6.55, "scrubbed, now rinse", "#9fd6c0");
    }
    if (!state.hands.soaped) state._scrubDing = false;
    if (state.holdFill && state.cupAtTray) {
      const cup = state.cupAtTray;
      if (cup.drink && cup.drink !== state.holdFill.valve) cup.mixedWrong = true;
      if (!cup.drink) cup.drink = state.holdFill.valve;
      cup.fill = Math.min(1.25, cup.fill + dt * 0.55);
      if (cup.fill > 1.05 && !cup._spill) { cup._spill = true; mess(1.1, CT + 0.02, 13.42); sfx("thunk"); }
    }
    if (state.holdSauce && state.held && state.held.kind === "bottle") {
      const t = state.holdSauce.target;
      const addAmt = dt * 0.5;
      state.held.fill = Math.max(0, state.held.fill - addAmt * 0.12);
      if (!t.sauce) t.sauce = { id: state.held.sauce, amount: 0 };
      if (t.sauce.id !== state.held.sauce) t.sauce.id = state.held.sauce;
      t.sauce.amount += addAmt;
      if (state.holdSauce.isMetal) t.mix = Math.min(t.mix, 0.3);
    }
    for (const c of state.customers) updateCustomer(c, dt);
    state.customers = state.customers.filter((c) => !c.gone);
    updateSchedule();
    renderServiceButtons();
    renderTasks();
    updateTut();
    if (state.clock - state.lastProgress > 34 && state.clock - state.thoughtAt > 26) idleThought();
    if (state.min >= CLOSE_MIN && state.sign) state.sign = false;
    if (state.min >= CLOSE_MIN) {
      const busy = state.customers.some((c) => !c.gone && c.state !== "leaving" && c.state !== "balked");
      if ((!busy && !activeOrders().some((o) => o.type !== "walkin" && o.custArrived)) || state.min >= HARD_END) endShift();
    }
    document.getElementById("shift-clock").textContent = clockStr(state.min);
  }
  function idleThought() {
    const m = state.min;
    if (!state.lights.kitchen) return thought("Dark in here. There's a panel on the wall behind the line.");
    if (state.hands.level === "dirty") return thought("Should wash in before touching anything.");
    if (!state.cookers[0].on && !state.cookers[0].cooked) return thought("Rice takes a while. Better get the pots going.");
    if (!state.linePans.some((s) => s.pan && !s.tin)) return thought("The line is bare. Backups live in the low boy.");
    if (m < OPEN_MIN && !state.lights.foh) return thought("Dining room's still dark.");
    if (m >= OPEN_MIN - 4 && !state.sign) return thought("Almost 11. The sign by the door is still off.");
    if (activeOrders().length) return thought("Those tickets won't make themselves.");
    return thought("Breathe. Check the screen. Keep the station clean.");
  }

  // ---- scene -------------------------------------------------------------
  function bbFood(x, y, z, artPx, meters, drawFn, dim) {
    R.billboard(x, y, z, (c, sx, sy, scale) => {
      drawFn(c, sx, sy, (meters * scale) / artPx);
    }, -0.06, dim);
  }
  function drawScene() {
    const cam = R.cam;
    cam.x = state.px; cam.z = state.pz;
    cam.y = EYE + (walking && !RM ? Math.sin(bobT) * 0.03 : 0);
    cam.yaw = state.yaw; cam.pitch = state.pitch;
    R.begin();
    const dimK = state.lights.kitchen ? 0 : 0.78;
    const dimF = state.lights.foh ? 0 : 0.7;
    ctx.fillStyle = "#23282e";
    ctx.fillRect(0, 0, VW, VH);

    // The outside world always paints first; everything indoors sorts by
    // true per-tile depth (walls and floors are auto-subdivided), with tiny
    // relative biases so wall art sits on its wall and glass paints late.
    const L_OUT = 500, L_ROOM = 0, L_TRIM = -0.02, L_WALLART = -0.05;

    // ================= outside =================
    R.quad([[-40, 16, -30], [40, 16, -30], [40, 5, -30], [-40, 5, -30]], "#9ec7e4", { bias: L_OUT + 60, noSub: true });
    R.quad([[-40, 5, -30], [40, 5, -30], [40, 0, -30], [-40, 0, -30]], "#cfe0ee", { bias: L_OUT + 58, noSub: true });
    R.quad([[-30, 14, 20], [-30, 14, -20], [-30, 0, -20], [-30, 0, 20]], "#aacfe8", { bias: L_OUT + 56, noSub: true });
    // buildings across the street, plus the neighbor past the left window
    R.texWall("pz", -11, -16, 0, 2, 8, TEX.building, { bias: L_OUT + 30, noSub: true });
    R.texWall("pz", -11.5, 2, 0, 18, 6.4, TEX.building2, { bias: L_OUT + 30, noSub: true });
    R.texWall("px", -9.5, -8, 0, 14, 5.6, TEX.building2, { bias: L_OUT + 28, noSub: true });
    // road, lane dashes, curb, sidewalk
    R.quad([[-20, 0, -9], [20, 0, -9], [20, 0, -2.4], [-20, 0, -2.4]], "#55585c", { bias: L_OUT + 20, noSub: true });
    for (let rx = -18; rx < 20; rx += 4) {
      R.quad([[rx, 0.005, -5.8], [rx + 1.6, 0.005, -5.8], [rx + 1.6, 0.005, -5.55], [rx, 0.005, -5.55]], "#d9c04a", { bias: L_OUT + 12, noSub: true });
    }
    R.quad([[-20, 0.14, -2.4], [20, 0.14, -2.4], [20, 0, -2.4], [-20, 0, -2.4]], "#8f9296", { bias: L_OUT + 16, noSub: true });
    R.quad([[-20, 0.02, -2.4], [20, 0.02, -2.4], [20, 0.02, 0], [-20, 0.02, 0]], "#b4b7bc", { bias: L_OUT + 18, noSub: true });
    // a parked car
    R.box(4.6, 0.3, -5.2, 9.2, 1.05, -3.2, { all: "#3a6ea5", top: "#4a7eb5" }, { bias: L_OUT + 8, noSub: true });
    R.box(5.6, 1.05, -4.9, 8.2, 1.55, -3.5, { all: "#2c567e", top: "#3a6ea5" }, { bias: L_OUT + 6, noSub: true });
    R.quad([[5.0, 0.6, -3.19], [5.9, 0.6, -3.19], [5.9, 0, -3.19], [5.0, 0, -3.19]], "#1c2024", { bias: L_OUT + 4, noSub: true });
    R.quad([[7.6, 0.6, -3.19], [8.5, 0.6, -3.19], [8.5, 0, -3.19], [7.6, 0, -3.19]], "#1c2024", { bias: L_OUT + 4, noSub: true });
    // streetlight and a tree on the sidewalk
    R.box(-3.6, 0, -2.0, -3.45, 4.2, -1.85, "#4a5258", { bias: L_OUT + 8, noSub: true });
    R.box(-3.45, 4.0, -1.98, -2.6, 4.15, -1.87, "#4a5258", { bias: L_OUT + 7, noSub: true });
    R.box(2.7, 0, -1.8, 3.0, 1.5, -1.5, "#6a4a30", { bias: L_OUT + 8, noSub: true });
    R.billboard(2.85, 1.35, -1.65, (c, sx, sy, scale) => {
      c.fillStyle = "#4a7a4a";
      c.beginPath(); c.ellipse(sx, sy - 0.9 * scale, 0.95 * scale, 1.0 * scale, 0, 0, 7); c.fill();
      c.fillStyle = "#5b8f54";
      c.beginPath(); c.ellipse(sx - 0.35 * scale, sy - 1.1 * scale, 0.55 * scale, 0.55 * scale, 0, 0, 7); c.fill();
    }, L_OUT + 5);

    // ================= room shell =================
    // floors + ceilings (front of house, kitchen strip, back of house)
    R.quad([[-5, 0, 0], [2.45, 0, 0], [2.45, 0, 12.9], [-5, 0, 12.9]], "#8a7f6a", { dim: dimF, bias: L_ROOM });
    R.quad([[-5, 0.004, 0.0], [-0.4, 0.004, 0.0], [-0.4, 0.004, 3.4], [-5, 0.004, 3.4]], "#b7bac0", { dim: dimF, bias: -0.01 });
    R.quad([[2.45, 0, 0], [5, 0, 0], [5, 0, 14], [2.45, 0, 14]], "#8f8676", { dim: dimK, bias: L_ROOM });
    R.quad([[-5, 0, 12.9], [2.45, 0, 12.9], [2.45, 0, 14], [-5, 0, 14]], "#8f8676", { dim: dimK, bias: L_ROOM });
    R.quad([[-1.5, 0, 14], [5, 0, 14], [5, 0, 18], [-1.5, 0, 18]], "#7d766a", { dim: dimK, bias: L_ROOM });
    R.quad([[-5, 3.2, 14], [5, 3.2, 14], [5, 3.2, 0], [-5, 3.2, 0]], "#3a3f45", { dim: Math.min(dimK, dimF) ? 0.5 : 0, bias: L_ROOM });
    R.quad([[-1.5, 3.0, 18], [5, 3.0, 18], [5, 3.0, 14], [-1.5, 3.0, 14]], "#33383e", { dim: dimK ? 0.5 : 0, bias: L_ROOM });

    const LW = "#e2ded6";
    // left wall, with a real window opening (z 1.2..5.6, y 0.7..2.4)
    R.quad([[-5, 3.2, 0], [-5, 3.2, 1.2], [-5, 0, 1.2], [-5, 0, 0]], LW, { dim: dimF, bias: L_ROOM });
    R.quad([[-5, 3.2, 5.6], [-5, 3.2, 14], [-5, 0, 14], [-5, 0, 5.6]], LW, { dim: dimF, bias: L_ROOM });
    R.quad([[-5, 0.7, 1.2], [-5, 0.7, 5.6], [-5, 0, 5.6], [-5, 0, 1.2]], LW, { dim: dimF, bias: L_ROOM });
    R.quad([[-5, 3.2, 1.2], [-5, 3.2, 5.6], [-5, 2.4, 5.6], [-5, 2.4, 1.2]], LW, { dim: dimF, bias: L_ROOM });
    // front wall, with door (x -2.6..-1.4) and window (x -0.6..2.0) openings
    R.quad([[-5, 3.2, 0], [5, 3.2, 0], [5, 2.35, 0], [-5, 2.35, 0]], LW, { dim: dimF, bias: L_ROOM });
    R.quad([[-5, 2.35, 0], [-2.6, 2.35, 0], [-2.6, 0, 0], [-5, 0, 0]], LW, { dim: dimF, bias: L_ROOM });
    R.quad([[-1.4, 2.35, 0], [-0.6, 2.35, 0], [-0.6, 0, 0], [-1.4, 0, 0]], LW, { dim: dimF, bias: L_ROOM });
    R.quad([[2.0, 2.35, 0], [5, 2.35, 0], [5, 0, 0], [2.0, 0, 0]], LW, { dim: dimF, bias: L_ROOM });
    R.quad([[-0.6, 0.75, 0], [2.0, 0.75, 0], [2.0, 0, 0], [-0.6, 0, 0]], LW, { dim: dimF, bias: L_ROOM });
    // right wall + wood band
    R.quad([[5, 3.2, 14], [5, 3.2, 0], [5, 0, 0], [5, 0, 14]], "#e8e4dc", { dim: dimK, bias: L_ROOM });
    R.texWall("nx", 4.995, 0, 2.25, 14, 3.2, TEX.wood, { dim: dimK, bias: L_TRIM });
    // FOH back wall with the doorway to the back room (x 3.5..4.4)
    if (cam.z < 14) {
      R.texWall("nz", 13.995, -5, 0, 3.5, 3.2, TEX.wood, { dim: dimK, bias: L_TRIM });
      R.texWall("nz", 13.995, 4.4, 0, 5, 3.2, TEX.wood, { dim: dimK, bias: L_TRIM });
      R.texWall("nz", 13.995, 3.5, 2.1, 4.4, 3.2, TEX.wood, { dim: dimK, bias: L_TRIM });
      R.texWall("nz", 13.99, -0.9, 1.7, 1.9, 3.05, TEX.union, { dim: dimK, bias: L_WALLART });
      R.texWall("nz", 13.98, -3.35, 2.05, -1.55, 2.5, TEX.pickupSign, { dim: dimK, bias: L_WALLART });
    } else {
      const BW2 = "#d8d4cc";
      R.quad([[-1.5, 3.0, 14.005], [3.5, 3.0, 14.005], [3.5, 0, 14.005], [-1.5, 0, 14.005]], BW2, { dim: dimK, bias: L_ROOM - 2 });
      R.quad([[4.4, 3.0, 14.005], [5, 3.0, 14.005], [5, 0, 14.005], [4.4, 0, 14.005]], BW2, { dim: dimK, bias: L_ROOM - 2 });
      R.quad([[3.5, 3.0, 14.005], [4.4, 3.0, 14.005], [4.4, 2.1, 14.005], [3.5, 2.1, 14.005]], BW2, { dim: dimK, bias: L_ROOM - 2 });
    }
    // glass panes over the openings
    R.quad([[-4.995, 2.4, 1.2], [-4.995, 2.4, 5.6], [-4.995, 0.7, 5.6], [-4.995, 0.7, 1.2]], "#cfe2ec", { alpha: 0.18, bias: L_TRIM, noSub: true });
    R.quad([[DOOR.x0, 2.3, 0.005], [DOOR.x1, 2.3, 0.005], [DOOR.x1, 0.1, 0.005], [DOOR.x0, 0.1, 0.005]], "#c4dae8", { alpha: 0.22, bias: L_TRIM, noSub: true });
    R.quad([[-0.6, 2.35, 0.005], [2.0, 2.35, 0.005], [2.0, 0.75, 0.005], [-0.6, 0.75, 0.005]], "#cfe2ec", { alpha: 0.18, bias: L_TRIM, noSub: true });
    // door frame
    R.box(DOOR.x0 - 0.08, 0, -0.02, DOOR.x0, 2.4, 0.06, "#3a3f45", { dim: dimF, noSub: true });
    R.box(DOOR.x1, 0, -0.02, DOOR.x1 + 0.08, 2.4, 0.06, "#3a3f45", { dim: dimF, noSub: true });
    R.box(DOOR.x0 - 0.08, 2.32, -0.02, DOOR.x1 + 0.08, 2.42, 0.06, "#3a3f45", { dim: dimF, noSub: true });
    R.texWall("pz", 0.01, -2.45, 2.05, -1.55, 2.6, TEX.open, { bias: L_WALLART });

    // ================= ceiling lights =================
    const PENDANTS = [
      { x: 3.1, z: 4.0, k: true }, { x: 3.1, z: 6.6, k: true }, { x: 3.1, z: 9.2, k: true },
      { x: -1.6, z: 3.4, k: false }, { x: -1.6, z: 7.2, k: false }, { x: -1.6, z: 10.8, k: false },
      { x: 1.6, z: 16.0, k: true, boh: true }, { x: 1.1, z: 13.6, k: true },
    ];
    for (const p of PENDANTS) {
      const on = p.k ? state.lights.kitchen : state.lights.foh;
      const dd = p.k ? dimK : dimF;
      const cy = p.boh ? 3.0 : 3.2;
      R.box(p.x - 0.015, cy - 0.5, p.z - 0.015, p.x + 0.015, cy, p.z + 0.015, "#26292c", { dim: dd, noSub: true });
      R.box(p.x - 0.16, cy - 0.62, p.z - 0.16, p.x + 0.16, cy - 0.5, p.z + 0.16, "#2f3b42", { dim: dd, noSub: true });
      R.quad([[p.x - 0.13, cy - 0.625, p.z - 0.13], [p.x + 0.13, cy - 0.625, p.z - 0.13], [p.x + 0.13, cy - 0.625, p.z + 0.13], [p.x - 0.13, cy - 0.625, p.z + 0.13]],
        on ? "#ffe9c0" : "#5e6b73", { noSub: true, bias: -0.02 });
      if (on && !RM) {
        R.billboard(p.x, cy - 0.68, p.z, (c, sx, sy, scale) => {
          const g = c.createRadialGradient(sx, sy, 1, sx, sy, 0.5 * scale);
          g.addColorStop(0, "rgba(255,236,190,0.45)");
          g.addColorStop(1, "rgba(255,236,190,0)");
          c.fillStyle = g;
          c.beginPath(); c.arc(sx, sy, 0.5 * scale, 0, 7); c.fill();
        }, -0.4);
      }
    }

    // ================= dining flavor =================
    R.texWall("pz", 1.9, -4.3, 0.6, -3.85, 2.0, TEX.promo, { dim: dimF, bias: -0.03 });
    R.box(-4.32, 0, 1.42, -3.83, 0.6, 1.88, "#26292c", { dim: dimF });
    R.box(-4.9, 0, 0.6, -4.4, 0.5, 1.1, "#41535e", { dim: dimF });
    bbFood(-4.65, 0.5, 0.85, 40, 1.1, (c, sx, sy, s) => {
      c.fillStyle = "#39704a";
      c.beginPath(); c.ellipse(sx, sy - 22 * s, 14 * s, 22 * s, 0, 0, 7); c.fill();
    }, dimF);
    for (const tz of [2.9, 5.4]) {
      R.box(-4.9, 0.9, tz, -4.0, 1.02, tz + 1.3, { all: "#c49a6a", bot: "#8a6a42" }, { dim: dimF });
      R.box(-4.5, 0, tz + 0.5, -4.4, 0.9, tz + 0.6, "#8a6a42", { dim: dimF });
      R.box(-4.15, 0, tz + 0.15, -3.95, 0.72, tz + 0.35, "#e8e4dc", { dim: dimF });
      R.box(-4.15, 0, tz + 0.95, -3.95, 0.72, tz + 1.15, "#e8e4dc", { dim: dimF });
    }
    R.texWall("px", -4.99, 7.0, 1.3, 8.0, 2.15, TEX.mahalo, { dim: dimF, bias: L_WALLART });

    // ================= the line =================
    R.box(LINE.x0, 0.12, LINE.z0, LINE.x1, CT, LINE.z1, { nx: null, all: "#d8d5ce", top: "#aeb5bc" }, { dim: dimK });
    // the tiled front repeats per segment so the bricks stay brick-sized
    for (let tz = LINE.z0; tz < LINE.z1 - 0.05; tz += 1.35) {
      R.texWall("nx", LINE.x0, tz, 0.12, Math.min(LINE.z1, tz + 1.35), CT, TEX.tile, { dim: dimF, noSub: true });
    }
    R.box(LINE.x0, 0, LINE.z0, LINE.x1, 0.12, LINE.z1, "#26292c", { dim: dimF });
    R.quad([[3.601, 0.82, 3.0], [3.601, 0.82, 5.6], [3.601, 0.14, 5.6], [3.601, 0.14, 3.0]], "#9aa2a8", { dim: dimK, bias: -0.04 });
    R.quad([[3.602, 0.55, 4.1], [3.602, 0.55, 4.5], [3.602, 0.49, 4.5], [3.602, 0.49, 4.1]], "#d7dce0", { dim: dimK, bias: -0.05 });
    for (const slot of state.linePans) {
      // steel rim, then the pan interior texture set just below counter level
      R.quad([[slot.x0 - 0.015, CT + 0.016, slot.z0 - 0.015], [slot.x1 + 0.015, CT + 0.016, slot.z0 - 0.015], [slot.x1 + 0.015, CT + 0.016, slot.z1 + 0.015], [slot.x0 - 0.015, CT + 0.016, slot.z1 + 0.015]],
        "#c8cfd5", { dim: dimK, bias: -0.015, noSub: true });
      R.texTop(slot.x0, slot.z0, slot.x1, slot.z1, CT + 0.018, slot._tex || panTex(slot), { dim: dimK, bias: -0.02 });
    }
    R.quad([[2.62, 1.78, 2.9], [2.62, 1.78, 8.2], [2.62, 1.22, 8.2], [2.62, 1.22, 2.9]], "#cfe4ee", { alpha: 0.16, bias: -2, noSub: true });
    R.quad([[2.62, 1.8, 2.9], [3.1, 1.62, 2.9], [3.1, 1.62, 8.2], [2.62, 1.8, 8.2]], "#cfe4ee", { alpha: 0.12, bias: -2, noSub: true });
    // guard posts
    R.box(2.6, 0.95, 2.88, 2.66, 1.8, 2.94, "#b6bdc4", { dim: dimK, noSub: true });
    R.box(2.6, 0.95, 8.16, 2.66, 1.8, 8.22, "#b6bdc4", { dim: dimK, noSub: true });
    state.spots.forEach((spot) => {
      R.quad([[2.7, CT + 0.008, spot.z - 0.2], [3.04, CT + 0.008, spot.z - 0.2], [3.04, CT + 0.008, spot.z + 0.2], [2.7, CT + 0.008, spot.z + 0.2]],
        "#ffffff", { alpha: 0.16, bias: -0.02, noSub: true });
      if (spot.item) {
        if (spot.item.kind === "bowl") bbFood(2.87, CT + 0.01, spot.z, 54, 0.24, (c, sx, sy, s) => SF.drawServingBowl(c, sx, sy - 6 * s, s, spot.item.bowl), dimK);
        else bbFood(2.87, CT + 0.01, spot.z, 56, 0.26, (c, sx, sy, s) => SF.drawMetalBowl(c, sx, sy - 5 * s, s, spot.item), dimK);
      }
    });
    RACK_IDS.forEach((id, i) => {
      if (state.rack[id]) bbFood(3.36, CT, RACK_Z[i], 62, 0.24, (c, sx, sy, s) => SF.drawSauceBottle(c, sx, sy - 28 * s, s * 62, id, 0.75), dimK);
    });
    for (let i = 0; i < Math.min(state.metalStack, 3); i++) {
      bbFood(3.35, CT + i * 0.05, 9.66, 56, 0.26, (c, sx, sy, s) => SF.drawMetalBowl(c, sx, sy - 5 * s, s, { items: [], sauce: null, mix: 0 }), dimK);
    }
    R.box(3.24, CT, 10.0, 3.46, CT + 0.16, 10.18, "#e8e4dc", { dim: dimK });
    bbFood(3.35, CT + 0.14, 10.09, 44, 0.3, (c, sx, sy, s) => SF.drawUtensil(c, "spoon", sx, sy - 12 * s, 0.25, s * 1.1), dimK);
    R.box(3.28, 1.72, 3.0, 3.36, 1.76, 4.2, "#41535e", { dim: dimK, noSub: true });
    rail.forEach((u) => {
      if (!u.taken) bbFood(3.32, 1.32, u.z, 44, 0.4, (c, sx, sy, s) => SF.drawUtensil(c, u.kind, sx, sy - 20 * s, 0.08, s * 1.2), dimK);
    });
    // register
    R.box(2.9, CT, 10.06, 3.3, CT + 0.34, 10.48, "#2f3b42", { dim: dimK });
    R.quad([[3.29, CT + 0.42, 10.1], [3.29, CT + 0.42, 10.44], [3.3, CT + 0.1, 10.44], [3.3, CT + 0.1, 10.1]], state.lights.foh ? "#9fd6c0" : "#4d5a62", { dim: dimK, noSub: true });
    // KDS + menu board
    R.box(3.02, 1.9, 5.0, 3.1, 2.5, 6.44, "#1c2429", { dim: 0 });
    R.texWall("px", 3.104, 5.0, 1.9, 6.44, 2.5, TEX.kds, { bias: -0.05 });
    R.box(3.04, 2.5, 5.6, 3.08, 3.2, 5.8, "#41535e", { dim: dimK, noSub: true });
    R.box(2.98, 2.3, 6.7, 3.06, 2.85, 8.3, "#1c2429", { dim: dimF });
    R.texWall("nx", 2.976, 6.7, 2.3, 8.3, 2.85, TEX.menu, { dim: dimF, bias: -0.05 });

    // ================= back counter =================
    R.box(BACK.x0, 0.12, BACK.z0, BACK.x1, CT, BACK.z1, { all: "#9aa2a8", top: "#b6bdc4" }, { dim: dimK });
    R.box(BACK.x0, 0, BACK.z0, BACK.x1, 0.12, BACK.z1, "#26292c", { dim: dimK });
    R.texWall("nx", 4.985, 2.86, 1.16, 3.18, 1.74, TEX.switches, { bias: L_WALLART });
    R.texWall("nx", 4.985, 3.4, 1.28, 3.78, 1.78, TEX.board, { dim: dimK, bias: L_WALLART });
    R.texWall("nx", 4.985, 3.9, 1.3, 4.98, 2.15, TEX.portion, { dim: dimK, bias: L_WALLART });
    R.texWall("nx", 4.985, 5.1, 1.3, 6.34, 2.2, TEX.sop, { dim: dimK, bias: L_WALLART });
    R.texWall("nx", 4.985, 8.3, 1.72, 9.94, 2.16, TEX.rail, { dim: dimK, bias: L_WALLART });
    for (const ck of state.cookers) {
      const body = ck.type === "brown" ? "#7d6a58" : "#8d949c";
      R.box(4.58, CT, ck.z - 0.23, 5.0, CT + 0.1, ck.z + 0.23, "#5e666d", { dim: dimK, noSub: true });
      R.box(4.6, CT + 0.1, ck.z - 0.21, 4.98, CT + 0.42, ck.z + 0.21, body, { dim: dimK, noSub: true });
      R.texTop(4.6, ck.z - 0.21, 4.98, ck.z + 0.21, CT + 0.425, ck._tex || cookerTopTex(ck), { dim: dimK, bias: -0.02 });
      R.quad([[4.585, CT + 0.3, ck.z - 0.1], [4.585, CT + 0.3, ck.z + 0.1], [4.585, CT + 0.12, ck.z + 0.1], [4.585, CT + 0.12, ck.z - 0.1]], "#3a3f45", { dim: dimK, noSub: true, bias: -0.03 });
      R.quad([[4.583, CT + 0.26, ck.z - 0.06], [4.583, CT + 0.26, ck.z - 0.01], [4.583, CT + 0.18, ck.z - 0.01], [4.583, CT + 0.18, ck.z - 0.06]],
        ck.on ? (ck.cooked ? "#4be07a" : "#ffd15a") : "#61686e", { noSub: true, bias: -0.04 });
    }
    if (!(state.held && state.held.kind === "paddle")) {
      bbFood(4.9, 1.32, 4.33, 44, 0.45, (c, sx, sy, s) => SF.drawUtensil(c, "paddle", sx, sy - 18 * s, 0.12, s * 1.3), dimK);
    }
    // hand sink
    R.box(4.6, CT - 0.16, 6.15, 4.98, CT - 0.14, 6.95, "#6f767d", { dim: dimK, noSub: true });
    R.box(4.88, CT, 6.44, 4.98, CT + 0.42, 6.66, "#b6bdc4", { dim: dimK, noSub: true });
    R.quad([[4.86, CT + 0.44, 6.42], [4.86, CT + 0.44, 6.68], [4.7, CT + 0.4, 6.68], [4.7, CT + 0.4, 6.42]], state.waterOn ? "#4be07a" : "#d7dce0", { dim: dimK, noSub: true });
    if (state.waterOn) {
      R.quad([[4.77, CT + 0.4, 6.53], [4.79, CT + 0.4, 6.57], [4.79, CT - 0.14, 6.57], [4.77, CT - 0.14, 6.53]], "#a8d2f0", { alpha: 0.7, noSub: true, bias: -0.06 });
    }
    R.box(4.9, 1.24, 5.94, 4.98, 1.56, 6.12, "#e8ecef", { dim: dimK, noSub: true });
    R.box(4.88, 1.24, 7.04, 4.98, 1.62, 7.32, "#8d979e", { dim: dimK, noSub: true });
    R.box(4.62, CT, 7.46, 4.92, CT + 0.16, 7.8, "#4aa8ff", { dim: dimK, noSub: true });
    for (let i = 0; i < 5; i++) {
      R.box(4.66, CT + i * 0.045, 8.16, 4.9, CT + 0.04 + i * 0.045, 8.4, i % 2 ? "#f7f4ee" : "#e8e4dc", { dim: dimK, noSub: true });
      R.box(4.64, CT + i * 0.05, 8.52, 4.92, CT + 0.045 + i * 0.05, 8.8, i % 2 ? "#f7f4ee" : "#e8e4dc", { dim: dimK, noSub: true });
    }
    R.box(4.66, CT, 8.9, 4.9, CT + 0.14, 9.1, "#e6ecf0", { dim: dimK, noSub: true });
    R.box(4.64, CT, 9.2, 4.92, CT + 0.16, 9.4, "#e6ecf0", { dim: dimK, noSub: true });
    bbFood(4.78, CT, 9.7, 46, 0.34, (c, sx, sy, s) => SF.drawBag(c, sx, sy - 20 * s, s * 1.1, { items: [], label: null }), dimK);
    R.box(4.52, 0, 10.74, 4.94, 0.72, 11.16, "#41535e", { dim: dimK });

    // ================= drinks + sides =================
    R.box(DRINK.x0, 0.12, DRINK.z0, DRINK.x1, CT, DRINK.z1, { all: "#d8d5ce", top: "#aeb5bc" }, { dim: dimK });
    R.box(DRINK.x0, 0, DRINK.z0, DRINK.x1, 0.12, DRINK.z1, "#26292c", { dim: dimK });
    R.box(0.4, CT, 13.5, 1.8, 1.95, 14.0, { all: "#41535e", top: "#37454d" }, { dim: dimK });
    R.texWall("nz", 13.495, 0.4, 1.5, 1.8, 1.95, TEX.fountain, { dim: dimK, bias: -0.04 });
    VALVES.forEach((v) => {
      R.box(v.x - 0.055, 1.3, 13.4, v.x + 0.055, 1.46, 13.52, "#c8cfd5", { dim: dimK, noSub: true });
      R.box(v.x - 0.02, 1.14, 13.43, v.x + 0.02, 1.3, 13.48, "#1c2429", { dim: dimK, noSub: true });
      R.box(v.x - 0.012, 1.2, 13.48, v.x + 0.012, 1.32, 13.55, "#e8ecef", { dim: dimK, noSub: true });
      R.quad([[v.x - 0.05, 1.44, 13.395], [v.x + 0.05, 1.44, 13.395], [v.x + 0.05, 1.32, 13.395], [v.x - 0.05, 1.32, 13.395]], SD.DRINKS[v.id].color, { dim: dimK, noSub: true, bias: -0.03 });
      if (state.holdFill && state.holdFill.valve === v.id) {
        R.quad([[v.x - 0.012, 1.14, 13.455], [v.x + 0.012, 1.14, 13.455], [v.x + 0.012, CT + 0.08, 13.455], [v.x - 0.012, CT + 0.08, 13.455]], SD.DRINKS[v.id].color, { noSub: true, bias: -0.1 });
      }
    });
    R.box(0.42, CT, 13.3, 1.78, CT + 0.05, 13.6, "#8d979e", { dim: dimK, noSub: true });
    if (state.cupAtTray) bbFood(1.1, CT + 0.05, 13.45, 34, 0.24, (c, sx, sy, s) => SF.drawCup(c, sx, sy - 16 * s, s * 0.9, state.cupAtTray), dimK);
    R.box(1.88, CT, 13.36, 2.06, CT + 0.36, 13.58, "#dde5ea", { dim: dimK, noSub: true });
    R.box(2.12, CT, 13.38, 2.28, CT + 0.22, 13.56, "#e8ecef", { dim: dimK, noSub: true });
    R.box(2.3, CT, 13.4, 2.4, CT + 0.28, 13.54, "#ee435b", { dim: dimK, noSub: true });
    R.box(1.86, 1.62, 13.8, 2.56, 1.68, 14.0, "#8a6a42", { dim: dimK, noSub: true });
    SIDE_SHELF.forEach((sd) => {
      bbFood((sd.x0 + sd.x1) / 2, 1.68, 13.9, 24, 0.26, (c, sx, sy, s) => SF.drawSidePack(c, sx, sy - 12 * s, s, sd.id), dimK);
    });
    R.box(0.3, 0.15, 13.18, 1.2, 0.8, 13.26, "#9fc4d8", { dim: dimK, noSub: true });

    // ================= pickup shelf =================
    for (const px of [-3.35, -1.65]) R.box(px - 0.04, 0, 13.5, px + 0.04, 2.0, 13.58, "#5b4a36", { dim: dimF, noSub: true });
    for (const py of [0.9, 1.4, 1.9]) R.box(-3.39, py, 13.44, -1.61, py + 0.06, 13.96, "#8a6a42", { dim: dimF, noSub: true });
    state.shelf.forEach((slot) => {
      let ox = slot.x - (slot.items.length - 1) * 0.16;
      for (const it of slot.items) {
        if (it.kind === "bag" && it.box) bbFood(ox, slot.y + 0.01, 13.7, 64, 0.42, (c, sx, sy, s) => SF.drawCateringBox(c, sx, sy - 12 * s, s, it), dimF);
        else if (it.kind === "bag") bbFood(ox, slot.y + 0.01, 13.7, 46, 0.3, (c, sx, sy, s) => SF.drawBag(c, sx, sy - 18 * s, s * 0.95, it), dimF);
        else if (it.kind === "cup") bbFood(ox, slot.y + 0.01, 13.7, 34, 0.22, (c, sx, sy, s) => SF.drawCup(c, sx, sy - 14 * s, s * 0.85, it.cup), dimF);
        else bbFood(ox, slot.y + 0.03, 13.7, 24, 0.18, (c, sx, sy, s) => SF.drawSidePack(c, sx, sy - 6 * s, s * 0.8, it.side), dimF);
        ox += 0.32;
      }
    });

    // ================= back of house =================
    const BW = "#d8d4cc";
    R.quad([[-1.5, 3.0, 14], [-1.5, 3.0, 18], [-1.5, 0, 18], [-1.5, 0, 14]], BW, { dim: dimK, bias: L_ROOM });
    R.quad([[5, 3.0, 18], [5, 3.0, 14], [5, 0, 14], [5, 0, 18]], BW, { dim: dimK, bias: L_ROOM });
    R.quad([[-1.5, 3.0, 18], [5, 3.0, 18], [5, 0, 18], [-1.5, 0, 18]], BW, { dim: dimK, bias: L_ROOM });
    // walk-in cooler
    R.box(3.2, 0, 16.7, 5, 2.4, 18, { all: "#b6bdc4", top: "#c8cfd5" }, { dim: dimK });
    R.quad([[3.19, 2.15, 16.85], [3.19, 2.15, 17.9], [3.19, 0.08, 17.9], [3.19, 0.08, 16.85]], "#9aa2a8", { dim: dimK, bias: -0.04, noSub: true });
    R.box(3.13, 1.0, 17.55, 3.2, 1.3, 17.65, "#5e666d", { dim: dimK, noSub: true });
    // prep table with legs and undershelf
    R.box(-0.2, 0.86, 15.1, 2.2, 0.92, 16.0, { all: "#aeb5bc", top: "#c8cfd5" }, { dim: dimK, noSub: true });
    R.box(-0.2, 0.3, 15.1, 2.2, 0.34, 16.0, "#9aa2a8", { dim: dimK, noSub: true });
    for (const lp of [[-0.18, 15.12], [2.12, 15.12], [-0.18, 15.92], [2.12, 15.92]]) {
      R.box(lp[0], 0, lp[1], lp[0] + 0.06, 0.86, lp[1] + 0.06, "#7c848b", { dim: dimK, noSub: true });
    }
    bbFood(0.5, 0.92, 15.5, 56, 0.26, (c, sx, sy, s) => SF.drawMetalBowl(c, sx, sy - 5 * s, s, { items: [], sauce: null, mix: 0 }), dimK);
    R.box(1.2, 0.92, 15.3, 1.8, 0.945, 15.8, "#e8dcc0", { dim: dimK, noSub: true });
    // dry storage shelving
    for (const sy of [0.35, 0.95, 1.55]) R.box(-1.45, sy, 14.4, -0.85, sy + 0.05, 16.6, "#8a8f96", { dim: dimK, noSub: true });
    for (const pz2 of [14.42, 16.5]) {
      R.box(-1.44, 0, pz2, -1.38, 1.95, pz2 + 0.06, "#5b6167", { dim: dimK, noSub: true });
      R.box(-0.92, 0, pz2, -0.86, 1.95, pz2 + 0.06, "#5b6167", { dim: dimK, noSub: true });
    }
    R.box(-1.4, 0.4, 14.6, -0.95, 0.82, 15.2, "#b8935e", { dim: dimK, noSub: true });
    R.box(-1.42, 0.4, 15.4, -1.0, 0.74, 15.9, "#a5824c", { dim: dimK, noSub: true });
    R.box(-1.38, 1.0, 14.5, -0.98, 1.4, 15.0, "#b8935e", { dim: dimK, noSub: true });
    R.box(-1.4, 1.6, 14.9, -1.02, 1.92, 15.5, "#c8a878", { dim: dimK, noSub: true });
    // rice sacks
    bbFood(-1.15, 1.0, 15.6, 40, 0.42, (c, sx, sy, s) => {
      c.fillStyle = "#f0ece0";
      c.beginPath(); c.roundRect(sx - 14 * s, sy - 34 * s, 28 * s, 34 * s, 6 * s); c.fill();
      c.fillStyle = "#c8502e"; c.font = "700 " + Math.max(4, Math.round(9 * s)) + "px system-ui, sans-serif"; c.textAlign = "center";
      c.fillText("RICE", sx, sy - 14 * s);
    }, dimK);
    // catering boxes on the middle shelf
    bbFood(-1.15, 1.06, 16.0, 64, 0.4, (c, sx, sy, s) => SF.drawCateringBox(c, sx, sy - 12 * s, s, { items: [], label: null }), dimK);
    // prep sink
    R.box(0.6, 0.12, 17.5, 1.7, 0.9, 18, { all: "#9aa2a8", top: "#b6bdc4" }, { dim: dimK, noSub: true });
    R.box(0.75, 0.78, 17.6, 1.55, 0.82, 17.95, "#6f767d", { dim: dimK, noSub: true });
    R.box(1.05, 0.9, 17.9, 1.15, 1.32, 18, "#b6bdc4", { dim: dimK, noSub: true });
    // mop bucket, trash, stacked boxes
    R.box(2.4, 0, 17.5, 2.8, 0.4, 17.9, "#d9c04a", { dim: dimK, noSub: true });
    R.box(2.55, 0.4, 17.65, 2.65, 1.4, 17.75, "#8a6a42", { dim: dimK, noSub: true });
    R.box(4.3, 0, 14.3, 4.9, 0.7, 14.9, "#41535e", { dim: dimK, noSub: true });
    R.box(-0.6, 0, 17.3, 0.2, 0.5, 17.95, "#b8935e", { dim: dimK, noSub: true });
    R.box(-0.5, 0.5, 17.4, 0.1, 0.95, 17.9, "#a5824c", { dim: dimK, noSub: true });

    // ================= dynamics =================
    for (const m of state.messes) {
      R.quad([[m.x - 0.11, m.y, m.z - 0.07], [m.x + 0.11, m.y, m.z - 0.07], [m.x + 0.11, m.y, m.z + 0.07], [m.x - 0.11, m.y, m.z + 0.07]],
        "rgba(120,86,44,0.6)", { bias: -0.03, noSub: true });
    }
    if (!RM) {
      for (const s of state.steam) {
        R.billboard(s.x, s.y, s.z, (c, sx, sy, scale) => {
          c.fillStyle = "rgba(255,255,255," + (0.3 * (1 - s.t / 1.6)) + ")";
          c.beginPath(); c.arc(sx, sy, (0.05 + s.t * 0.06) * scale, 0, 7); c.fill();
        });
      }
    }
    for (const c of state.customers) {
      if (c.gone) continue;
      const cc = c;
      R.billboard(cc.x, 0, cc.z, (g, sx, sy, scale) => {
        SF.drawPerson(g, sx, sy, { shirt: cc.shirt, skin: cc.skin, walkPhase: cc.walkPhase, walking: cc.walking, mood: cc.mood, scale: (scale * 1.78) / 72 });
      }, 0, dimAt(cc.x, cc.z) ? 0.6 : 0);
    }
    if (!state.lights.kitchen) {
      R.billboard(4.9, 1.45, 3.02, (c, sx, sy, scale) => {
        const g = c.createRadialGradient(sx, sy, 2, sx, sy, 0.5 * scale);
        g.addColorStop(0, "rgba(255,220,150,0.4)");
        g.addColorStop(1, "rgba(255,220,150,0)");
        c.fillStyle = g;
        c.beginPath(); c.arc(sx, sy, 0.5 * scale, 0, 7); c.fill();
      }, -0.5);
    }
    R.flush();
  }

  // ---- 2D overlays -------------------------------------------------------
  function worldToScreen(x, y, z) {
    const v = R.toView([x, y, z]);
    if (v[2] <= S3.NEAR) return null;
    const s = R.project(v);
    return { x: s[0], y: s[1], z: v[2] };
  }
  function drawOverlays() {
    // speech bubbles
    ctx.textAlign = "center";
    for (const c of state.customers) {
      if (!c.bubble || state.min > c.bubbleUntil || c.gone) continue;
      const s = worldToScreen(c.x, 2.0, c.z);
      if (!s || s.z > 9) continue;
      const words = c.bubble.split(" ");
      const lines = [];
      let cur = "";
      for (const w of words) {
        if ((cur + " " + w).length > 30) { lines.push(cur); cur = w; }
        else cur = cur ? cur + " " + w : w;
      }
      if (cur) lines.push(cur);
      const lw = Math.min(240, Math.max(64, Math.max.apply(null, lines.map((l) => l.length)) * 6.6 + 18));
      const lh = lines.length * 13 + 14;
      let bx = Math.max(lw / 2 + 6, Math.min(VW - lw / 2 - 6, s.x));
      const by = Math.max(8, s.y - lh - 14);
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.beginPath(); ctx.roundRect(bx - lw / 2, by, lw, lh, 9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s.x - 6, by + lh); ctx.lineTo(s.x + 8, by + lh); ctx.lineTo(s.x, by + lh + 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#26333b"; ctx.font = "600 10.5px system-ui, sans-serif";
      lines.forEach((l, i) => ctx.fillText(l, bx, by + 16 + i * 13));
    }
    // floats
    for (const f of state.floats) {
      const s = worldToScreen(f.x, f.y + f.t * 0.25, f.z);
      if (!s) continue;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 2.4);
      ctx.fillStyle = f.color; ctx.font = "700 13px system-ui, sans-serif";
      ctx.fillText(f.txt, s.x, s.y);
      ctx.globalAlpha = 1;
    }
    // hover label
    const hit = state.running && !state.paused && !state.over ? pick(ptr.x, ptr.y) : null;
    if (hit && !ptr.down) {
      const label = hit.cust ? (hit.cust.kind === "walkin" ? "guest" : hit.cust.kind) :
        (typeof hit.obj.label === "function" ? hit.obj.label() : hit.obj.label);
      if (label) {
        ctx.font = "600 11px system-ui, sans-serif";
        const w = ctx.measureText(label).width + 14;
        const lx = Math.min(VW - w - 4, Math.max(4, ptr.x - w / 2));
        ctx.fillStyle = "rgba(10,18,24,0.82)";
        ctx.beginPath(); ctx.roundRect(lx, ptr.y + 18, w, 20, 6); ctx.fill();
        ctx.fillStyle = "#f4ede3"; ctx.textAlign = "center";
        ctx.fillText(label, lx + w / 2, ptr.y + 32);
      }
    }
    // held item, first-person style
    const h = state.held;
    if (h) {
      const x = VW - 150, y = VH - 60;
      if (h.kind === "paddle") SF.drawUtensil(ctx, "paddle", x, y, 0.45, 2.2, h.load);
      else if (h.kind === "spoodle") SF.drawUtensil(ctx, "spoodle", x, y, 0.45, 2.2, h.load);
      else if (h.kind === "tongs") SF.drawUtensil(ctx, "tongs", x, y, 0.45, 2.2, h.load);
      else if (h.kind === "spoon") SF.drawUtensil(ctx, "spoon", x, y, 0.45, 2.2, null);
      else if (h.kind === "towel") SF.drawUtensil(ctx, "towel", x, y - 20, 0.2, 2.2, null);
      else if (h.kind === "bottle") SF.drawSauceBottle(ctx, x, y - 40, 110, h.sauce, h.fill);
      else if (h.kind === "bowl") SF.drawServingBowl(ctx, x, y - 30, 1.7, h.bowl);
      else if (h.kind === "metal") SF.drawMetalBowl(ctx, x, y - 30, 1.7, h);
      else if (h.kind === "lid") {
        ctx.fillStyle = "rgba(230,238,244,0.85)";
        ctx.beginPath(); ctx.ellipse(x, y - 30, h.size === "large" ? 52 : 44, 15, 0, 0, 7); ctx.fill();
      }
      else if (h.kind === "cup") SF.drawCup(ctx, x, y - 45, 1.8, h.cup);
      else if (h.kind === "bag" && h.box) SF.drawCateringBox(ctx, x, y - 45, 1.6, h);
      else if (h.kind === "bag") SF.drawBag(ctx, x, y - 45, 1.7, h);
      else if (h.kind === "side") SF.drawSidePack(ctx, x, y - 35, 1.8, h.side);
      else if (h.kind === "pinch") {
        SF.drawChunk(ctx, h.ing, x, y - 35, 12, 0.3);
        SF.drawChunk(ctx, h.ing, x + 16, y - 28, 10, 1.2);
      }
      else if (h.kind === "panBackup") SF.drawHotelPan(ctx, x - 60, y - 60, 120, 52, h.ing, 1, 999, SD.INGREDIENTS[h.ing].name);
    }
    // hygiene chip
    const lv = state.hands.level;
    ctx.beginPath(); ctx.arc(VW - 24, VH - 24, 8, 0, 7);
    ctx.fillStyle = lv === "gloved" ? (state.hands.dirtyGloves ? "#b8a05a" : "#4aa8ff")
      : lv === "clean" ? "#9fd6c0" : "#8a6a4a";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();
    // on phones the DOM header is hidden, so the clock and score live here
    if (mobileUI() && state.running) {
      const txt = clockStr(state.min) + "   ·   " + state.score + " pts";
      ctx.font = "700 15px system-ui, sans-serif";
      const w = ctx.measureText(txt).width + 26;
      ctx.fillStyle = "rgba(10,18,24,0.72)";
      ctx.beginPath(); ctx.roundRect(VW / 2 - w / 2, 10, w, 30, 15); ctx.fill();
      ctx.fillStyle = "#f4ede3"; ctx.textAlign = "center";
      ctx.fillText(txt, VW / 2, 31);
    }
  }

  // ---- floating DOM positioning -----------------------------------------
  function positionOver(el, wx, wy, wz) {
    const s = worldToScreen(wx, wy, wz);
    const stage = canvas.parentElement.getBoundingClientRect();
    const r = canvas.getBoundingClientRect();
    if (!s) { el.hidden = true; return; }
    const sx = s.x * (r.width / VW), sy = s.y * (r.height / VH);
    el.style.left = Math.max(8, Math.min(stage.width - 160, sx + (r.left - stage.left) - 70)) + "px";
    el.style.top = Math.max(8, sy + (r.top - stage.top)) + "px";
  }

  // ---- shift tasks + first-shift hints -----------------------------------
  // High level only: what a manager would expect, never step-by-step clicks.
  const TASKS = [
    { t: "Get yourself ready", done: () => state.hands.level === "gloved" && !state.hands.dirtyGloves },
    { t: "Rice pots on", done: () => state.cookers.every((c) => c.on || c.cooked) },
    { t: "Stock the line", done: () => state.linePans.filter((s) => s.pan && !s.tin).length >= 6 },
    { t: "Lights and sign on", done: () => state.lights.kitchen && state.lights.foh && state.sign },
    { t: "Clear the tickets", done: () => state.min > OPEN_MIN && activeOrders().length === 0,
      note: () => (activeOrders().length ? activeOrders().length + " open" : "") },
    { t: "Hold it down till close", done: () => state.min >= CLOSE_MIN },
  ];
  let tasksAt = -9;
  function renderTasks() {
    if (state.clock - tasksAt < 1) return;
    tasksAt = state.clock;
    const list = document.getElementById("tasks-list");
    if (!list || list.hidden) return;
    list.innerHTML = TASKS.map((tk) => {
      const d = tk.done();
      const note = tk.note ? tk.note() : "";
      return '<div class="task' + (d ? " done" : "") + '">' + (d ? "✓ " : "· ") + tk.t +
        (note && !d ? " <span>" + note + "</span>" : "") + "</div>";
    }).join("");
  }
  document.getElementById("tasks-toggle").addEventListener("click", () => {
    const list = document.getElementById("tasks-list");
    list.hidden = !list.hidden;
    tasksAt = -9;
    renderTasks();
  });

  // First shift only: a few quiet hints, then the game goes quiet.
  const TUT = shiftsPlayed === 0 ? [
    "You're opening today. Look around and get the store ready.",
    "Drag to look. WASD, arrows, or the stick to walk.",
    "Click things to use them. You hold one thing at a time.",
    "The clipboard on the wall behind the line has the opening routine.",
  ] : [];
  let tutIdx = -1, tutAt = 0;
  function stepTut() {
    tutIdx++;
    const el = document.getElementById("tut");
    if (tutIdx >= TUT.length) { el.hidden = true; return; }
    el.textContent = TUT[tutIdx];
    el.hidden = false;
    tutAt = state.clock;
  }
  document.getElementById("tut").addEventListener("click", stepTut);
  function updateTut() {
    if (tutIdx >= TUT.length || tutIdx < 0) return;
    if (state.clock - tutAt > 7) stepTut();
  }

  // ---- music -------------------------------------------------------------
  // A quiet generative loop: warm pad chords, a soft bass, sparse pentatonic
  // plucks and a brushed hat. All synthesized, and the patched AudioContext
  // keeps it behind the site's sound switch.
  const music = (function () {
    let ctx = null, master = null, timer = null;
    let nextTime = 0, beat = 0;
    const BEAT = 0.72; // ~83 bpm
    const CHORDS = [
      [48, 55, 60, 64],  // Cmaj7-ish
      [45, 52, 60, 64],  // Am7
      [41, 48, 57, 60],  // Fmaj7
      [43, 50, 59, 62],  // G7
    ];
    const PENTA = [60, 62, 64, 67, 69, 72, 74, 76];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function padNote(t, midi, dur) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = "triangle";
      o.frequency.value = hz(midi);
      f.type = "lowpass"; f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.5);
      g.gain.setValueAtTime(0.05, t + dur - 0.7);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.1);
    }
    function bass(t, midi) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = hz(midi - 24);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 1.6);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + BEAT * 1.7);
    }
    function pluck(t, midi) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = "triangle";
      o.frequency.value = hz(midi);
      f.type = "lowpass"; f.frequency.value = 2200;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.065, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.75);
    }
    function hat(t) {
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = 6500;
      const g = ctx.createGain();
      g.gain.value = 0.035;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t);
    }
    function schedule() {
      if (!ctx) return;
      while (nextTime < ctx.currentTime + 0.3) {
        const bar = Math.floor(beat / 4);
        const chord = CHORDS[bar % CHORDS.length];
        const inBar = beat % 4;
        if (inBar === 0) {
          const dur = BEAT * 4 + 0.4;
          for (const m of chord) padNote(nextTime, m, dur);
        }
        if (inBar === 0 || inBar === 2) bass(nextTime, chord[0]);
        if (inBar >= 1) hat(nextTime + BEAT / 2);
        if (Math.random() < 0.4) pluck(nextTime + (Math.random() < 0.5 ? 0 : BEAT / 2), PENTA[Math.floor(Math.random() * PENTA.length)]);
        nextTime += BEAT;
        beat++;
      }
    }
    return {
      start: function () {
        if (ctx) return;
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.9;
          master.connect(ctx.destination);
          nextTime = ctx.currentTime + 0.1;
          beat = 0;
          timer = setInterval(schedule, 80);
        } catch (e) { ctx = null; }
      },
      pause: function () { if (ctx) try { ctx.suspend(); } catch (e) {} },
      resume: function () { if (ctx) try { ctx.resume(); } catch (e) {} },
      stop: function () {
        if (!ctx) return;
        clearInterval(timer);
        const c = ctx, m = master;
        ctx = null; master = null;
        try {
          m.gain.setValueAtTime(m.gain.value, c.currentTime);
          m.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1.2);
          setTimeout(() => { try { c.close(); } catch (e) {} }, 1500);
        } catch (e) { try { c.close(); } catch (e2) {} }
      },
    };
  })();

  // ---- HUD / lifecycle ---------------------------------------------------
  function updateHud() {
    document.getElementById("score").textContent = state.score;
    document.getElementById("high-score").textContent = Math.max(storedBest, state.score);
  }

  let last = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    ctx.clearRect(0, 0, VW, VH);
    if (state.running && !state.paused && !state.over) {
      const sheetOpen = !document.getElementById("pos").hidden || !document.getElementById("ask").hidden;
      if (!sheetOpen) update(dt);
      else state.clock += dt;
    }
    refreshDynamicTex();
    drawScene();
    drawOverlays();
  }

  function startShift() {
    setupShift();
    state.running = true;
    document.getElementById("screen-start").classList.add("hidden");
    document.getElementById("overlay").classList.add("hidden");
    document.getElementById("pause-btn").style.display = "";
    if (window.PokeTrack) PokeTrack.hit("play", "shift");
    if (window.PokeStreak) PokeStreak.mark();
    music.start();
    fitCanvas();
    document.getElementById("tasks").hidden = false;
    document.getElementById("tasks-list").hidden = shiftsPlayed !== 0;
    if (TUT.length) stepTut();
    markProgress();
    state.lastProgress = 6;
  }
  function togglePause() {
    if (!state.running || state.over) return;
    state.paused = !state.paused;
    if (state.paused) music.pause(); else music.resume();
    document.getElementById("overlay").classList.toggle("hidden", !state.paused);
    document.getElementById("screen-paused").classList.toggle("hidden", !state.paused);
    document.getElementById("pause-btn").textContent = state.paused ? "▶" : "⏸";
  }
  document.getElementById("pause-btn").addEventListener("click", togglePause);
  document.getElementById("resume-btn").addEventListener("click", togglePause);

  function endShift() {
    if (state.over) return;
    state.over = true;
    music.stop();
    closeSheets();
    document.getElementById("tasks").hidden = true;
    document.getElementById("tut").hidden = true;
    for (const o of activeOrders()) { o.status = "lost"; state.lostCount++; }
    const total = state.served + state.lostCount;
    const avg = state.feedback.length
      ? state.feedback.reduce((a, f) => a + f.stars, 0) / state.feedback.length : 0;
    localStorage.setItem("pokeworks-shift-count", String(shiftsPlayed + 1));
    const isBest = state.score > storedBest;
    if (isBest) localStorage.setItem("pokeworks-shift-best", String(state.score));
    sfx("over");
    if (isBest && storedBest > 0) setTimeout(() => sfx("best"), 700);
    document.getElementById("sum-score").textContent = state.score;
    document.getElementById("sum-line").textContent =
      state.served + " of " + total + " orders made it out · " +
      (avg ? avg.toFixed(1) + "★ average" : "no reviews");
    document.getElementById("sum-best").textContent = isBest
      ? (storedBest ? "New best. Old best was " + storedBest + "." : "First shift on the books.")
      : "Best: " + storedBest;
    const notes = [];
    if (state.bareFlag) notes.push("Food got handled without gloves.");
    if (state.messes.length >= 3) notes.push("The station was a mess by close.");
    if (!state.cookers[1].on && !state.cookers[1].cooked) notes.push("Brown rice never got cooked.");
    if (state.lostCount) notes.push(state.lostCount + " customer" + (state.lostCount > 1 ? "s" : "") + " walked.");
    document.getElementById("sum-notes").innerHTML = notes.length
      ? notes.map((n) => "<div>• " + n + "</div>").join("") : "";
    const fbWrap = document.getElementById("sum-feedback");
    fbWrap.innerHTML = "";
    for (const f of state.feedback.slice(-8)) {
      const div = document.createElement("div");
      div.className = "sum-fb";
      div.innerHTML = "<b>" + f.name + "</b> <span class=\"fb-stars\">" +
        "★".repeat(f.stars) + "<i>" + "★".repeat(5 - f.stars) + "</i></span><br>" +
        "“" + f.comment.replace(/</g, "&lt;") + "”";
      fbWrap.appendChild(div);
    }
    document.getElementById("overlay").classList.remove("hidden");
    document.getElementById("screen-paused").classList.add("hidden");
    document.getElementById("screen-gameover").classList.remove("hidden");
    document.getElementById("pause-btn").style.display = "none";
    updateHud();
  }

  document.getElementById("start-btn").addEventListener("click", startShift);
  document.getElementById("play-again-btn").addEventListener("click", () => location.reload());

  // ---- boot --------------------------------------------------------------
  fitCanvas();
  document.getElementById("high-score").textContent = storedBest;
  document.getElementById("start-subtitle").textContent = shiftsPlayed === 0
    ? "Saturday. You open at 11. Nobody is coming to show you around."
    : "Shift " + (shiftsPlayed + 1) + ". You know the drill by now. Doors at 11.";
  requestAnimationFrame(loop);

  window.Shift = {
    state: () => state,
    endShift: endShift,
    tick: (secs) => { for (let t = 0; t < secs; t += 0.05) update(0.05); },
    frame: () => { refreshDynamicTex(); ctx.clearRect(0, 0, VW, VH); drawScene(); drawOverlays(); },
    pick: pick,
    objs: () => objs,
    tapCustomer: tapCustomer,
  };
})();
