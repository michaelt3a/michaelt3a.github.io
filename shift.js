// The Shift — a full opening-shift simulation. One wide canvas world the
// player pans across; one held item at a time; no quest markers. The
// clipboard by the back door and the wall posters are the only guidance.
//
// Depends on shift-data.js (ShiftData) and shift-food.js (ShiftFood).
(function () {
  const SD = window.ShiftData, SF = window.ShiftFood;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const VW = 960, VH = 600, WORLD_W = 3560;
  const RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SFX = () => window.ArcadeSfx || {};
  const sfx = (n) => { const s = SFX(); if (s[n]) try { s[n](); } catch (e) {} };

  // Layout bands. The kitchen wall runs to FRONT_X; past it is the dining room.
  const FRONT_X = 3000;
  const COUNTER_TOP = 380, COUNTER_BOT = 505;

  // Game-minute length in real seconds. 10:30 arrival = minute 0.
  const OPEN_MIN = 30, CLOSE_MIN = 150, HARD_END = 168;

  // ---- persistent bits ---------------------------------------------------
  const shiftsPlayed = parseInt(localStorage.getItem("pokeworks-shift-count") || "0", 10) || 0;
  const storedBest = parseInt(localStorage.getItem("pokeworks-shift-best") || "0", 10) || 0;
  const MIN_SEC = shiftsPlayed === 0 ? 2.4 : 2.0;

  // ---- state -------------------------------------------------------------
  let state = null;
  function freshState() {
    const pans = [];
    // back row: five wide pans for proteins
    for (let i = 0; i < 5; i++) pans.push({ x: 912 + i * 152, y: 292, w: 138, h: 52, pan: null, row: 0, seed: 100 + i });
    // front row: nine narrow pans for mix-ins and toppings
    for (let i = 0; i < 9; i++) pans.push({ x: 912 + i * 99, y: 356, w: 88, h: 46, pan: null, row: 1, seed: 200 + i });
    const fridgeStock = {};
    for (const k of SD.PROTEINS) fridgeStock[k] = 2;
    for (const k of SD.MIXINS) fridgeStock[k] = 2;
    for (const k of SD.TOPPINGS) fridgeStock[k] = 2;
    return {
      running: false, over: false, paused: false,
      min: 0, cam: 0, camTarget: 0,
      lights: { kitchen: false, foh: false }, sign: false, signOnMin: null,
      hands: { level: "dirty", wet: false, soaped: false, scrub: 0, dirtyGloves: false },
      waterOn: false,
      held: null,
      cookers: [
        { type: "white", x: 618, y: 330, R: 56, on: false, open: false, cooked: false, cookLeft: 18, level: 14, capacity: 14 },
        { type: "brown", x: 772, y: 330, R: 50, on: false, open: false, cooked: false, cookLeft: 18, level: 10, capacity: 10 },
      ],
      linePans: pans,
      fridge: fridgeStock,
      fridgeBottles: ["ginger", "chili"],
      rack: { classic: 1, shoyu: 1, sriracha: 1, wasabi: 1, ginger: 0, chili: 0 },
      spots: [
        { id: "A", x: 1856, y: 336, item: null },
        { id: "B", x: 1948, y: 336, item: null },
        { id: "C", x: 2360, y: 336, item: null },
      ],
      metalStack: 2, dirtyMetal: 0,
      cupAtTray: null,
      shelf: [
        { x: 3196, y: 292, items: [] }, { x: 3286, y: 292, items: [] },
        { x: 3196, y: 374, items: [] }, { x: 3286, y: 374, items: [] },
      ],
      orders: [], customers: [], stickers: [],
      messes: [], steam: [], floats: [],
      score: 0, served: 0, lostCount: 0,
      bareFlag: false, feedback: [],
      nextWalkIn: 0, walkSpawned: 0,
      lastProgress: 0, thoughtAt: -99, clock: 0,
      mixing: null, scrubbing: false, holdFill: null, holdSauce: null,
      posFor: null, askFor: null, serviceFor: null,
    };
  }
  // Objects registered below read positions off a live state, so build one
  // now; startShift() rebuilds it fresh (all coordinates are constant).
  state = freshState();

  // ---- helpers -----------------------------------------------------------
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
  function float(x, y, txt, color) {
    state.floats.push({ x: x, y: y, txt: txt, color: color || "#f4ede3", t: 0 });
  }
  function isGloved() { return state.hands.level === "gloved" && !state.hands.dirtyGloves; }
  function touchFood() { if (!isGloved()) state.bareFlag = true; }
  function mess(x, y) { state.messes.push({ x: x, y: y }); }

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

  // ---- orders ------------------------------------------------------------
  function pushOrder(o, dueMin) {
    o.status = "pending";
    o.dueMin = dueMin;
    o.createdMin = state.min;
    o.delivered = { bowls: [], drink: null, side: null };
    o.sat = 100; o.greeted = false; o.thanked = false; o.askedFeedback = false;
    o.satNotes = [];
    if (o.type !== "walkin") {
      o.ticket = o; // pickups and catering come in printed
      printSticker(o);
      sfx("tick"); setTimeout(() => sfx("tick"), 120);
    } else {
      o.ticket = null;
    }
    state.orders.push(o);
    return o;
  }
  function printSticker(o) {
    state.stickers.push({ order: o });
  }
  function activeOrders() { return state.orders.filter((o) => o.status === "pending"); }

  // ---- scoring -----------------------------------------------------------
  function near(a, b, tol) { return Math.abs(a - b) <= tol; }
  function scoreBowl(b, spec) {
    const errs = [];
    if (!b) return ["a bowl was missing"];
    if (b.size !== spec.size) errs.push("wrong bowl size");
    const wantRice = spec.size === "large" ? 2 : 1;
    if (b.riceType && b.riceType !== spec.rice) errs.push("wrong rice");
    if (b.rice === 0) errs.push("no rice");
    else if (!near(b.rice, wantRice, 0.4)) errs.push(b.rice < wantRice ? "rice was short" : "too much rice");
    // gather protein and mixin amounts from base + pour
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
    const gotTops = {};
    for (const t of b.toppings) gotTops[t.ing] = (gotTops[t.ing] || 0) + t.amount;
    for (const t of spec.toppings) if ((gotTops[t] || 0) < 0.5) errs.push("missing " + SD.INGREDIENTS[t].name.toLowerCase());
    for (const k in gotTops) if (spec.toppings.indexOf(k) < 0 && gotTops[k] > 0.3) errs.push("extra " + SD.INGREDIENTS[k].name.toLowerCase());
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
    // pair each spec bowl with the delivered bowl that fits it best
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
      float(cust.x, cust.y - 110, "★".repeat(stars), stars >= 4 ? "#ffd15a" : stars >= 3 ? "#f4ede3" : "#ee435b");
      if (o.askedFeedback) float(cust.x, cust.y - 130, "“" + comment + "”", "#9fd6c0");
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
      x: WORLD_W + 40, y: 470, targetX: WORLD_W + 40,
      shirt: SD.pick(SHIRTS), skin: SD.pick(SKINS),
      walkPhase: Math.random() * 6, state: "entering",
      arrivedAt: state.min, stateAt: state.min,
      bubble: null, bubbleUntil: 0, mood: "happy",
      handedNote: false,
    };
    if (order) order.custId = c.id;
    if (!state.lights.foh) {
      // dark dining room: they hesitate at the door and most turn around
      if (kind === "walkin") {
        c.state = "balked"; c.bubble = "Are they open?"; c.bubbleUntil = state.min + 3; c.targetX = WORLD_W + 60;
        if (c.order) { c.order.status = "lost"; state.lostCount++; removeSticker(c.order); c.order = null; }
      }
      else { c.darkArrival = true; if (c.order) { c.order.sat -= 10; c.order.satNotes.push("dark store"); } }
    }
    state.customers.push(c);
    return c;
  }
  function registerQueue() {
    return state.customers.filter((c) => c.kind === "walkin" &&
      (c.state === "queue" || c.state === "greeted" || c.state === "asking" || c.state === "ordering"));
  }
  function updateCustomer(c, dt) {
    const gm = dt / MIN_SEC;
    // movement
    if (Math.abs(c.x - c.targetX) > 3) {
      const dir = c.targetX > c.x ? 1 : -1;
      c.x += dir * dt * 120;
      c.walkPhase += dt * 9;
      c.walking = true;
    } else c.walking = false;

    if (c.order) c.mood = c.order.sat > 72 ? "happy" : c.order.sat > 45 ? "flat" : "mad";

    switch (c.state) {
      case "balked":
        if (Math.abs(c.x - c.targetX) < 5) c.state = "leaving";
        break;
      case "entering": {
        if (c.kind === "walkin") {
          const q = registerQueue().filter((o) => o !== c && o.state !== "ordering").length;
          c.targetX = 3115 + Math.min(q, 3) * 72;
          if (Math.abs(c.x - c.targetX) < 5) { c.state = "queue"; c.stateAt = state.min; }
        } else {
          c.targetX = 3195 + (Math.random() * 20 - 10);
          if (Math.abs(c.x - c.targetX) < 5) {
            c.state = "atShelf"; c.stateAt = state.min;
            c.bubble = c.kind === "catering" ? "Catering for " + c.order.name + "." : "Pickup for " + c.order.name + "?";
            c.bubbleUntil = state.min + 4;
          }
        }
        break;
      }
      case "queue": {
        // shuffle up as the line moves
        const ahead = registerQueue().filter((o) => o !== c && o.x < c.x - 10 && o.state !== "ordering").length;
        c.targetX = 3115 + ahead * 72;
        const waited = state.min - c.stateAt;
        if (c.order && waited > 6) c.order.sat -= gm * 1.4;
        if (waited > 20) { // gave up
          c.state = "leaving"; c.bubble = "Forget it."; c.bubbleUntil = state.min + 3;
          if (c.order) { c.order.status = "lost"; state.lostCount++; }
          removeSticker(c.order);
        }
        break;
      }
      case "greeted": break;   // waiting on the register
      case "asking": break;    // waiting on an answer
      case "ordering": break;  // POS open
      case "waiting": {
        const waited = state.min - c.stateAt;
        const grace = 14;
        if (c.order && waited > grace) c.order.sat -= gm * 1.4;
        if (c.order && waited > 38) {
          c.state = "leaving"; c.bubble = "I don't have all day."; c.bubbleUntil = state.min + 3;
          c.order.status = "lost"; state.lostCount++;
          removeSticker(c.order);
        }
        break;
      }
      case "atShelf": {
        // look for their labeled bag on the shelf
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
          c.bubble = c.order.name + "? Order " + "#" + c.order.num + "?";
          c.bubbleUntil = state.min + 3;
        }
        break;
      }
      case "served": {
        if (state.min - c.stateAt > 2.2) { c.state = "leaving"; }
        break;
      }
      case "leaving": {
        c.targetX = WORLD_W + 80;
        if (c.x > WORLD_W + 50) c.gone = true;
        break;
      }
    }
  }
  function removeSticker(o) {
    if (!o) return;
    state.stickers = state.stickers.filter((s) => s.order !== o);
  }
  function orderNeedsMore(o) {
    const needBowls = o.spec.bowls.length - o.delivered.bowls.length;
    if (needBowls > 0) return needBowls + " bowl" + (needBowls > 1 ? "s" : "");
    if (o.spec.drink && !o.delivered.drink) return "the drink";
    if (o.spec.side && !o.delivered.side) return "the " + SD.SIDES[o.spec.side].name.toLowerCase();
    return null;
  }
  function acceptItem(c, o) {
    // player clicked this customer while holding something
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
      // handing a naked bowl across the counter: allowed, sloppy
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
      // take the bag plus any loose cup or side on the same slot;
      // someone else's bag stays put
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
        c.state = "atShelf"; // stays until handed the rest
      } else {
        completeHandoff(c, o);
      }
      return;
    }
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
    positionOver(wrap, s.cust.x, s.cust.y - 150);
  }
  document.getElementById("svc-thanks").addEventListener("click", () => {
    const s = state.serviceFor;
    if (!s) return;
    s.order.thanked = true;
    s.cust.bubble = "You're welcome."; s.cust.bubbleUntil = state.min + 2;
    document.getElementById("svc-thanks").disabled = true;
    recompute(s);
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
    recompute(s);
  });
  function recompute(s) {
    // thanks and feedback arrive after scoring, so patch the totals lightly
    const fb = state.feedback[state.feedback.length - 1];
    if (s.order.thanked && !s.order._thankApplied) { s.order._thankApplied = true; state.score += 6; }
    if (s.order.askedFeedback && !s.order._fbApplied) { s.order._fbApplied = true; state.score += 8; }
    if (fb && fb.name === s.order.name && fb.stars < 5 && (s.order.thanked || s.order.askedFeedback)) fb.stars = Math.min(5, fb.stars + 0);
    updateHud();
    markProgress();
  }

  // ---- world objects -----------------------------------------------------
  const objs = [];
  function add(o) { objs.push(o); return o; }
  function hitObj(wx, wy) {
    // two passes: real objects first, z:-1 catch-all zones (customers) last
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if ((o.z || 0) < 0) continue;
      if (wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h) return o;
    }
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if ((o.z || 0) >= 0) continue;
      if (wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h) return o;
    }
    return null;
  }
  function heldIsUtensil() {
    return state.held && ["paddle", "spoodle", "tongs", "spoon", "towel"].indexOf(state.held.kind) >= 0;
  }
  function dropHeldBlocked() { sfx("thunk"); }

  // -- back area
  add({ x: 30, y: 190, w: 62, h: 86, label: "opening checklist",
    tap: () => { openSheet("board-view"); markProgress(); } });
  add({ x: 108, y: 196, w: 46, h: 70, label: "light switches",
    tap: () => {
      // two rockers stacked: top = kitchen, bottom = front of house
      state.lights.kitchen = !state.lights.kitchen;
      sfx("pop"); markProgress();
    } });
  // split rocker: define two small zones layered above the panel
  objs.pop();
  add({ x: 108, y: 196, w: 46, h: 34, label: "kitchen lights",
    tap: () => { state.lights.kitchen = !state.lights.kitchen; sfx("pop"); markProgress(); } });
  add({ x: 108, y: 232, w: 46, h: 34, label: "dining lights",
    tap: () => { state.lights.foh = !state.lights.foh; sfx("pop"); markProgress(); } });

  // -- wash station
  add({ x: 246, y: 236, w: 118, h: 100, label: "hand sink",
    tap: () => {
      const h = state.hands;
      if (state.held && state.held.kind === "metal") {
        if (!state.waterOn) { thought("Water's off."); return; }
        state.held = null; state.metalStack++; sfx("swish"); float(300, 260, "rinsed", "#9fd6c0"); markProgress(); return;
      }
      if (state.held) { dropHeldBlocked(); return; }
      if (!state.waterOn) { thought("Water's off."); return; }
      if (h.soaped && h.scrub >= 1) {
        h.soaped = false; h.wet = true; h.rinsed = true; sfx("swish"); float(300, 250, "rinsed", "#9fd6c0");
      } else {
        h.wet = true;
      }
      markProgress();
    },
    holdStart: () => {
      // scrubbing happens by rubbing over the basin with soapy hands
      if (!state.held && state.hands.soaped) { state.scrubbing = true; return true; }
      return false;
    } });
  add({ x: 296, y: 196, w: 26, h: 42, label: "faucet",
    tap: () => { state.waterOn = !state.waterOn; sfx(state.waterOn ? "swish" : "pop"); markProgress(); } });
  add({ x: 372, y: 226, w: 34, h: 52, label: "soap",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      if (!state.hands.wet) { thought("Dry hands. Soap won't lather."); return; }
      state.hands.soaped = true; state.hands.scrub = 0; sfx("pop"); markProgress();
    } });
  add({ x: 424, y: 216, w: 44, h: 62, label: "paper towels",
    tap: () => {
      if (state.held && state.held.kind === "towel") { state.held = null; sfx("pop"); return; }
      if (state.held) { dropHeldBlocked(); return; }
      const h = state.hands;
      if (h.rinsed && h.wet) {
        h.wet = false; h.level = "clean"; h.rinsed = false;
        sfx("chime"); float(446, 230, "clean hands", "#9fd6c0");
      } else if (h.wet) {
        h.wet = false; // dried, but never actually washed
      } else {
        state.held = { kind: "towel" };
      }
      markProgress();
    } });
  add({ x: 480, y: 250, w: 52, h: 40, label: "gloves",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      const h = state.hands;
      h.dirtyGloves = h.level !== "clean";
      h.level = "gloved";
      sfx("pop"); float(506, 240, h.dirtyGloves ? "gloves on" : "gloves on ✓", h.dirtyGloves ? "#f4ede3" : "#9fd6c0");
      markProgress();
    } });
  add({ x: 196, y: 420, w: 58, h: 92, label: "trash",
    tap: () => {
      if (!state.held) return;
      const k = state.held.kind;
      if (["bowl", "cup", "bag", "side", "panBackup"].indexOf(k) >= 0 || (k === "metal")) {
        if (k === "metal") state.dirtyMetal = Math.max(0, state.dirtyMetal - 0); // metal bowls don't get trashed
        state.held = null;
        sfx("thunk"); markProgress();
        if (state.hands.level === "gloved") state.hands.dirtyGloves = true;
      } else dropHeldBlocked();
    } });

  // -- rice
  function cookerObj(i) {
    const ck = () => state.cookers[i];
    add({ x: state.cookers[i].x - 58, y: state.cookers[i].y - 92, w: 116, h: 96, label: () => (ck().type === "brown" ? "brown rice cooker" : "rice cooker"),
      tap: () => {
        const c = ck();
        const h = state.held;
        if (h && h.kind === "paddle") {
          if (!c.open) { c.open = true; sfx("pop"); return; }
          if (!c.cooked) { thought(c.on ? "Still cooking." : "This pot isn't even on."); return; }
          if (c.level <= 0) { thought("Pot's empty."); return; }
          if (h.load) { thought("Paddle's already loaded."); return; }
          h.load = { rice: c.type };
          c.level--; touchFood(); sfx("pop"); markProgress(); return;
        }
        if (h && ["spoodle", "tongs"].indexOf(h.kind) >= 0 && c.open && c.cooked) {
          // wrong tool: it works, badly
          if (c.level <= 0) return;
          h.load = { rice: c.type, half: true };
          c.level -= 1; touchFood(); mess(c.x + 30, c.y + 8); sfx("thunk"); markProgress(); return;
        }
        if (h) { dropHeldBlocked(); return; }
        c.open = !c.open;
        sfx("pop"); markProgress();
      } });
    add({ x: state.cookers[i].x - 22, y: state.cookers[i].y + 20, w: 44, h: 26, label: "cooker switch",
      tap: () => {
        const c = ck();
        c.on = !c.on;
        sfx(c.on ? "chime" : "pop"); markProgress();
      } });
  }
  cookerObj(0); cookerObj(1);
  add({ x: 668, y: 176, w: 40, h: 64, label: "rice paddle",
    tap: () => {
      if (state.held && state.held.kind === "paddle") { state.held = null; sfx("pop"); return; }
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "paddle", load: null };
      markProgress();
    } });
  add({ x: 545, y: 84, w: 250, h: 84, label: "portion guide",
    tap: () => { openSheet("portion-view"); markProgress(); } });

  // -- utensil rail
  const rail = [
    { kind: "spoodle", x: 946 }, { kind: "tongs", x: 1000 }, { kind: "tongs", x: 1054 }, { kind: "spoon", x: 1108 },
  ];
  rail.forEach((u, idx) => {
    u.taken = false;
    add({ x: u.x - 18, y: 176, w: 36, h: 64, label: u.kind === "spoodle" ? "spoodle" : u.kind,
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

  // -- line pans (objects registered dynamically against state)
  function panAt(wx, wy) {
    for (const slot of state.linePans) {
      if (wx >= slot.x && wx <= slot.x + slot.w && wy >= slot.y - 6 && wy <= slot.y + slot.h + 12) return slot;
    }
    return null;
  }
  add({ x: 900, y: 280, w: 900, h: 130, label: (wx, wy) => {
      const slot = panAt(wx, wy);
      if (!slot) return "cold line";
      return slot.pan ? SD.INGREDIENTS[slot.pan.ing].name.toLowerCase() : "empty well";
    },
    tap: (wx, wy) => {
      const slot = panAt(wx, wy);
      if (!slot) return;
      const h = state.held;
      if (h && h.kind === "panBackup") {
        if (!slot.pan || slot.pan.ing === h.ing || slot.pan.fill < 0.2) {
          slot.pan = { ing: h.ing, fill: 1 };
          state.held = null;
          sfx("chime"); markProgress();
        } else { thought("That pan spot is taken."); }
        return;
      }
      if (!slot.pan || slot.pan.fill <= 0.02) { if (!h) thought("Empty well. Backups are in the low boy."); return; }
      const ing = slot.pan.ing;
      const right = SD.INGREDIENTS[ing].utensil;
      if (h && (h.kind === "spoodle" || h.kind === "tongs")) {
        if (h.load) { thought("Already holding some " + (h.load.ing ? SD.INGREDIENTS[h.load.ing].name.toLowerCase() : "rice") + "."); return; }
        const amount = h.kind === right ? 1 : 0.5;
        h.load = { ing: ing, amount: amount };
        slot.pan.fill = Math.max(0, slot.pan.fill - amount * 0.16);
        touchFood();
        if (h.kind !== right) { mess(wx, slot.y + slot.h + 26); sfx("thunk"); } else sfx("pop");
        markProgress();
      } else if (h && h.kind === "paddle") {
        thought("Rice paddle stays with the rice.");
      } else if (!h) {
        touchFood();
        thought("Bare hands in the pans? Grab a utensil.");
        state.bareFlag = true;
      } else dropHeldBlocked();
    } });

  // -- low boy fridge
  add({ x: 950, y: 428, w: 400, h: 86, label: "low boy (backups)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      openFridge(); markProgress();
    } });

  // -- counter spots (A, B on prep counter; C at the pass)
  function spotTap(spot) {
    const h = state.held;
    if (h && h.kind === "bowl" && !spot.item) { spot.item = h; state.held = null; sfx("pop"); markProgress(); return; }
    if (h && h.kind === "metal" && !spot.item) { spot.item = h; state.held = null; sfx("pop"); markProgress(); return; }
    const it = spot.item;
    if (!it) return;
    if (!h) {
      spot.item = null;
      state.held = it;
      if (it.kind === "bowl" || it.kind === "metal") touchFood();
      markProgress();
      return;
    }
    // interactions between held thing and the item on the spot
    if (it.kind === "bowl") interactBowl(it.bowl || it, spot, h);
    else if (it.kind === "metal") interactMetal(it, spot, h);
  }
  function interactBowl(bowlWrap, spot, h) {
    doBowlInteract(spot.item.bowl, spot, h);
  }
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
      else if (bowl.riceType !== h.load.rice) bowl.riceType = h.load.rice; // last scoop shows
      h.load = null; sfx("pop"); markProgress(); return;
    }
    if ((h.kind === "spoodle" || h.kind === "tongs") && h.load) {
      if (bowl.lid) { thought("Lid's on."); return; }
      if (h.load.rice) { bowl.rice += 0.5; if (!bowl.riceType) bowl.riceType = h.load.rice; h.load = null; sfx("pop"); markProgress(); return; }
      const kind = SD.INGREDIENTS[h.load.ing].kind;
      if (kind === "topping") bowlAddTop(bowl, h.load.ing, h.load.amount);
      else bowlAddBase(bowl, h.load.ing, h.load.amount);
      if (!isGloved()) bowl.bare = true;
      h.load = null; sfx("pop"); markProgress(); return;
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
      if (!bowl.lid) { thought("No lid on that. It'll tip."); }
      if (h.items.length >= 3) { thought("Bag's full."); return; }
      h.items.push({ kind: "bowl", bowl: bowl });
      spot.item = null;
      sfx("pop"); markProgress(); return;
    }
    dropHeldBlocked();
  }
  function interactMetal(mWrap, spot, h) {
    const m = spot.item;
    if ((h.kind === "spoodle" || h.kind === "tongs") && h.load && h.load.ing) {
      metalAdd(m, h.load.ing, h.load.amount);
      if (!isGloved()) state.bareFlag = true;
      h.load = null; sfx("pop"); markProgress(); return;
    }
    if (h.kind === "paddle" && h.load) { thought("Rice goes in the serving bowl, not the mix."); return; }
    if (h.kind === "bowl") {
      // pouring the mix over a held serving bowl works too
      pourMetalIntoBowl(m, h.bowl);
      return;
    }
    if (h.kind === "spoon") return; // handled via holdStart mixing
    dropHeldBlocked();
  }
  // spot hit zones (registered once; they read live state)
  [0, 1, 2].forEach((i) => {
    add({
      x: [1810, 1902, 2320][i], y: 296, w: 88, h: 84,
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

  // -- metal bowls and spoon crock
  add({ x: 2014, y: 292, w: 66, h: 74, label: "mixing bowls",
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
  add({ x: 2096, y: 288, w: 44, h: 80, label: "mixing spoon",
    tap: () => {
      if (state.held && state.held.kind === "spoon" && state.held.fromCrock) { state.held = null; sfx("pop"); return; }
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "spoon", fromCrock: true };
      markProgress();
    } });

  // -- sauce rack
  const RACK_POS = [
    { id: "classic", x: 2196, y: 246 }, { id: "shoyu", x: 2246, y: 246 }, { id: "sriracha", x: 2296, y: 246 },
    { id: "wasabi", x: 2196, y: 330 }, { id: "ginger", x: 2246, y: 330 }, { id: "chili", x: 2296, y: 330 },
  ];
  RACK_POS.forEach((rp) => {
    add({ x: rp.x - 20, y: rp.y - 52, w: 40, h: 82, label: () => SD.SAUCES[rp.id].name,
      tap: () => {
        if (state.held && state.held.kind === "bottle") {
          if (state.held.sauce === rp.id || state.rack[rp.id] === 0) {
            state.rack[state.held.sauce] = 1;
            state.held = null; sfx("pop"); markProgress();
          } else dropHeldBlocked();
          return;
        }
        if (state.held) { dropHeldBlocked(); return; }
        if (!state.rack[rp.id]) { thought("That bottle isn't out yet. Check the low boy."); return; }
        state.rack[rp.id] = 0;
        state.held = { kind: "bottle", sauce: rp.id, fill: 0.55 + Math.random() * 0.4 };
        markProgress();
      } });
  });

  // -- pass: bowls, lids, bags, spot C is above
  add({ x: 2404, y: 292, w: 52, h: 76, label: "bowls (regular)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "bowl", bowl: newBowl("regular") };
      touchFood(); markProgress();
    } });
  add({ x: 2462, y: 284, w: 56, h: 84, label: "bowls (large)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "bowl", bowl: newBowl("large") };
      touchFood(); markProgress();
    } });
  add({ x: 2526, y: 300, w: 46, h: 68, label: "lids (regular)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "lid", size: "regular" };
      markProgress();
    } });
  add({ x: 2578, y: 294, w: 50, h: 74, label: "lids (large)",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "lid", size: "large" };
      markProgress();
    } });
  add({ x: 2634, y: 282, w: 56, h: 86, label: "bags",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "bag", items: [], label: null };
      markProgress();
    } });

  // -- ticket rail above the pass
  add({ x: 2330, y: 168, w: 370, h: 64, label: "ticket rail",
    tap: (wx) => {
      if (!state.stickers.length) return;
      const idx = Math.max(0, Math.min(state.stickers.length - 1, Math.floor((wx - 2340) / 74)));
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

  // -- KDS screen
  add({ x: 1200, y: 58, w: 380, h: 118, label: "order screen",
    tap: (wx, wy) => {
      const act = activeOrders();
      if (!act.length) return;
      const idx = Math.max(0, Math.min(act.length - 1, Math.floor((wx - 1208) / 92)));
      openTicket(act[idx]);
      markProgress();
    } });

  // -- drinks
  const VALVES = [
    { id: "greentea", x: 2688 }, { id: "lemonade", x: 2732 }, { id: "punch", x: 2776 }, { id: "water", x: 2820 },
  ];
  VALVES.forEach((v) => {
    add({ x: v.x - 18, y: 250, w: 36, h: 66, label: () => SD.DRINKS[v.id].name + " valve",
      holdStart: () => {
        if (state.cupAtTray) { state.holdFill = { valve: v.id }; return true; }
        thought("Nothing under the nozzle.");
        return false;
      },
      tap: () => { if (!state.cupAtTray) thought("Nothing under the nozzle."); } });
  });
  add({ x: 2666, y: 318, w: 176, h: 40, label: "drip tray",
    tap: () => {
      if (state.held && state.held.kind === "cup" && !state.cupAtTray) {
        state.cupAtTray = state.held.cup; state.held = null; sfx("pop"); markProgress(); return;
      }
      if (!state.held && state.cupAtTray) {
        state.held = { kind: "cup", cup: state.cupAtTray }; state.cupAtTray = null; markProgress(); return;
      }
      if (state.held) dropHeldBlocked();
    } });
  add({ x: 2856, y: 288, w: 40, h: 80, label: "cups",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      state.held = { kind: "cup", cup: { drink: null, fill: 0, lid: false, straw: false, mixedWrong: false } };
      markProgress();
    } });
  add({ x: 2902, y: 300, w: 34, h: 62, label: "cup lids",
    tap: () => {
      const h = state.held;
      if (h && h.kind === "cup") {
        if (h.cup.fill <= 0) { thought("Lid on an empty cup?"); return; }
        h.cup.lid = true; sfx("pop"); markProgress();
      } else if (!h) thought("Grab the cup first, then tap the lids.");
      else dropHeldBlocked();
    } });
  add({ x: 2940, y: 306, w: 26, h: 56, label: "straws",
    tap: () => {
      const h = state.held;
      if (h && h.kind === "cup" && h.cup.lid) { h.cup.straw = true; sfx("pop"); markProgress(); }
      else if (h && h.kind === "cup") thought("Lid first.");
      else if (!h) return;
      else dropHeldBlocked();
    } });

  // -- sides shelf and freezer
  const SHELF_SIDES = [
    { id: "taro", x: 2678 }, { id: "wchips", x: 2740 }, { id: "cookie", x: 2802 },
  ];
  SHELF_SIDES.forEach((sd) => {
    add({ x: sd.x - 24, y: 138, w: 48, h: 62, label: () => SD.SIDES[sd.id].name,
      tap: () => {
        const h = state.held;
        if (h && h.kind === "bag") {
          if (h.items.length >= 3) { thought("Bag's full."); return; }
          h.items.push({ kind: "side", side: sd.id, color: SD.SIDES[sd.id].color });
          sfx("pop"); markProgress(); return;
        }
        if (h) { dropHeldBlocked(); return; }
        state.held = { kind: "side", side: sd.id };
        markProgress();
      } });
  });
  add({ x: 2700, y: 428, w: 140, h: 86, label: "freezer (mochi)",
    tap: () => {
      const h = state.held;
      if (h && h.kind === "bag") {
        if (h.items.length >= 3) { thought("Bag's full."); return; }
        h.items.push({ kind: "side", side: "mochi", color: SD.SIDES.mochi.color });
        sfx("pop"); markProgress(); return;
      }
      if (h) { dropHeldBlocked(); return; }
      state.held = { kind: "side", side: "mochi" };
      markProgress();
    } });

  // -- front of house
  add({ x: 3050, y: 400, w: 110, h: 90, label: "register",
    tap: () => {
      if (state.held) { dropHeldBlocked(); return; }
      const front = registerQueue().find((c) => c.state === "greeted");
      const ungreeted = registerQueue().find((c) => c.state === "queue");
      if (front) { openPos(front); markProgress(); }
      else if (ungreeted) tapCustomer(ungreeted); // stepping up to the register is the hello
      else thought("Nobody's ordering right now.");
    } });
  add({ x: 3185, y: 96, w: 96, h: 120, label: "Mahalo poster",
    tap: () => { openSheet("mahalo-view"); markProgress(); } });
  // pickup shelf slots
  [0, 1, 2, 3].forEach((i) => {
    const px = [3270, 3362, 3270, 3362][i], py = [246, 246, 330, 330][i];
    add({ x: px, y: py, w: 84, h: 74, label: "pickup shelf",
      tap: () => {
        const slot = state.shelf[i];
        const h = state.held;
        if (h && ["bag", "cup", "side"].indexOf(h.kind) >= 0) {
          if (slot.items.length >= 3) { thought("That shelf spot is full."); return; }
          if (h.kind === "bag") slot.items.push({ kind: "bag", items: h.items, label: h.label });
          else if (h.kind === "cup") slot.items.push({ kind: "cup", cup: h.cup });
          else slot.items.push({ kind: "side", side: h.side, color: SD.SIDES[h.side].color });
          state.held = null;
          sfx("pop"); markProgress(); return;
        }
        if (!h && slot.items.length) {
          const it = slot.items.pop();
          if (it.kind === "bag") state.held = { kind: "bag", items: it.items, label: it.label };
          else if (it.kind === "cup") state.held = { kind: "cup", cup: it.cup };
          else state.held = { kind: "side", side: it.side };
          markProgress(); return;
        }
        if (h) dropHeldBlocked();
      } });
  });
  add({ x: 3390, y: 96, w: 66, h: 78, label: "open sign",
    tap: () => {
      state.sign = !state.sign;
      if (state.sign && state.signOnMin === null) state.signOnMin = state.min;
      sfx(state.sign ? "chime" : "pop");
      markProgress();
    } });

  // customers are clickable too (registered as one catch-all zone)
  add({ x: FRONT_X, y: 300, w: WORLD_W - FRONT_X, h: 180, label: () => "", z: -1,
    tap: (wx, wy) => {
      // find the nearest customer to the tap
      let best = null, bd = 60;
      for (const c of state.customers) {
        if (c.gone || c.state === "leaving" || c.state === "balked") continue;
        const d = Math.abs(c.x - wx);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best) return;
      tapCustomer(best);
    } });

  function tapCustomer(c) {
    const o = c.order;
    if (state.held && o && ["waiting", "atShelf", "queue", "greeted"].indexOf(c.state) >= 0) {
      if (acceptItem(c, o)) return;
    }
    if (c.kind === "walkin" && c.state === "queue") {
      // the greet — the M in Mahalo
      c.state = "greeted"; c.stateAt = state.min;
      const waited = state.min - c.arrivedAt;
      if (o) {
        o.greeted = true;
        if (waited < 4) { o.sat += 4; }
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
    if (c.state === "greeted" && !state.held) {
      thought("Ring it in at the register.");
    }
  }

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
    if (state && state.posFor) { // canceling the register mid-order
      const c = state.posFor;
      if (c.state === "ordering") { c.state = "greeted"; }
      state.posFor = null;
    }
    if (state) state.askFor = null;
  }
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheets));

  function openTicket(o) {
    openSheet("ticket-view");
    const t = o.ticket || o;
    document.getElementById("tv-head").textContent =
      "#" + o.num + "  " + o.name + "  ·  " + (o.type === "walkin" ? "here" : o.type) +
      (o.type !== "walkin" ? "  ·  due " + clockStr(o.dueMin) : "");
    const body = document.getElementById("tv-body");
    body.innerHTML = "";
    const src = o.type === "walkin" ? (o.ticket ? { bowls: o.ticket.bowls, drink: o.ticket.drink, side: o.ticket.side } : null) : o.spec;
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

  // ---- ask (customer question) ------------------------------------------
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
    state.posFor = cust;
    cust.state = "ordering";
    pos = {
      size: null, rice: null, protein: {}, mixins: [], sauce: null,
      mixed: null, toppings: [], drink: null, side: null,
    };
    document.getElementById("pos-said").textContent = "“" + SD.speakOrder(cust.order) + "”";
    renderPos();
    openSheet("pos");
    // openSheet closes everything first, then shows; restore posFor
    state.posFor = cust;
    document.getElementById("pos").hidden = false;
  }
  function chip(txt, on, fn, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pos-chip" + (on ? " on" : "") + (cls ? " " + cls : "");
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
    section("Mix-ins", SD.MIXINS.map((m) =>
      chip(SD.INGREDIENTS[m].name, pos.mixins.indexOf(m) >= 0, () => {
        const i = pos.mixins.indexOf(m);
        i >= 0 ? pos.mixins.splice(i, 1) : pos.mixins.push(m);
        renderPos();
      })));
    section("Sauce", Object.keys(SD.SAUCES).map((sc) =>
      chip(SD.SAUCES[sc].name, pos.sauce === sc, () => { pos.sauce = sc; renderPos(); })));
    section("Style", [chip("mixed", pos.mixed === true, () => { pos.mixed = true; renderPos(); }),
      chip("sauce on top", pos.mixed === false, () => { pos.mixed = false; renderPos(); })]);
    section("Toppings", SD.TOPPINGS.map((t) =>
      chip(SD.INGREDIENTS[t].name, pos.toppings.indexOf(t) >= 0, () => {
        const i = pos.toppings.indexOf(t);
        i >= 0 ? pos.toppings.splice(i, 1) : pos.toppings.push(t);
        renderPos();
      })));
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
        toppings: pos.toppings.slice(), mixed: pos.mixed !== false,
      }],
      drink: pos.drink, side: pos.side,
    };
    printSticker(o);
    sfx("tick"); setTimeout(() => sfx("tick"), 110);
    c.state = "waiting"; c.stateAt = state.min;
    c.targetX = 3225 + Math.random() * 30;
    c.bubble = null;
    state.posFor = null;
    document.getElementById("pos").hidden = true;
    markProgress();
  });
  document.getElementById("pos-cancel").addEventListener("click", () => {
    const c = state.posFor;
    if (c) { c.state = "greeted"; }
    state.posFor = null;
    document.getElementById("pos").hidden = true;
  });

  // ---- input -------------------------------------------------------------
  let ptr = { down: false, x: 0, y: 0, sx: 0, sy: 0, panned: false, camStart: 0 };
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (VW / r.width), y: (e.clientY - r.top) * (VH / r.height) };
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!state.running || state.paused || state.over) return;
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPos(e);
    ptr = { down: true, x: p.x, y: p.y, sx: p.x, sy: p.y, panned: false, camStart: state.cam };
    // hold-interactions claim the pointer immediately
    const wx = p.x + state.cam, wy = p.y;
    const o = hitObj(wx, wy);
    if (o && o.holdStart && o.holdStart(wx, wy)) { ptr.holding = true; ptr.holdMoved = 0; }
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = canvasPos(e);
    ptr.x = p.x; ptr.y = p.y;
    if (!ptr.down) return;
    if (ptr.holding) {
      ptr.holdMoved = (ptr.holdMoved || 0) + Math.abs(p.x - ptr.x) + Math.abs(p.y - ptr.y) + Math.abs(e.movementX || 0);
      if (state.mixing) {
        const spot = state.mixing.spot;
        const cx = spot.x - state.cam, cy = 352;
        const ang = Math.atan2(p.y - cy, p.x - cx);
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
      if (state.scrubbing) {
        const dx = Math.abs(p.x - ptr.x) + Math.abs(e.movementX || 2);
        state.hands.scrub = Math.min(1.2, state.hands.scrub + 0.035);
      }
      return;
    }
    const dx = p.x - ptr.sx;
    if (Math.abs(dx) > 10) ptr.panned = true;
    if (ptr.panned) {
      state.cam = Math.max(0, Math.min(WORLD_W - VW, ptr.camStart - dx));
      state.camTarget = state.cam;
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!ptr.down) return;
    ptr.down = false;
    const wasHolding = ptr.holding;
    ptr.holding = false;
    state.mixing = null; state.holdFill = null; state.holdSauce = null; state.scrubbing = false;
    // a press with no rubbing was really a tap (e.g. tapping the sink to
    // rinse while your hands are still soapy) — let it fall through
    if (wasHolding && (ptr.holdMoved || 0) >= 12) { markProgress(); return; }
    if (ptr.panned) return;
    if (!state.running || state.paused || state.over) return;
    const p = canvasPos(e);
    // edge arrows step the camera a station over
    if (p.x < 46) { state.camTarget = Math.max(0, state.cam - 560); return; }
    if (p.x > VW - 46) { state.camTarget = Math.min(WORLD_W - VW, state.cam + 560); return; }
    const wx = p.x + state.cam, wy = p.y;
    // a held towel wipes up the nearest splat before anything else
    if (state.held && state.held.kind === "towel") {
      const mi = state.messes.findIndex((m) => Math.abs(m.x - wx) < 30 && Math.abs(m.y - wy) < 26);
      if (mi >= 0) { state.messes.splice(mi, 1); sfx("swish"); markProgress(); return; }
    }
    const o = hitObj(wx, wy);
    if (o && o.tap) o.tap(wx, wy);
  });
  canvas.addEventListener("wheel", (e) => {
    if (!state.running || state.paused) return;
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    state.cam = Math.max(0, Math.min(WORLD_W - VW, state.cam + d));
    state.camTarget = state.cam;
  }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const anyOpen = ["board-view", "portion-view", "mahalo-view", "ticket-view", "fridge-view", "pos", "ask"]
        .some((id) => { const el = document.getElementById(id); return el && !el.hidden; });
      if (anyOpen) { closeSheets(); return; }
      if (state.running && !state.over) togglePause();
      return;
    }
    if (!state.running || state.paused || state.over) return;
    if (e.key === "ArrowLeft" || e.key === "a") state.camTarget = Math.max(0, state.camTarget - 300);
    if (e.key === "ArrowRight" || e.key === "d") state.camTarget = Math.min(WORLD_W - VW, state.camTarget + 300);
  });

  // ---- schedule ----------------------------------------------------------
  function setupShift() {
    state = freshState();
    // pre-open tickets: one catering job and early pickups
    const cat = SD.genCatering();
    cat.spec = { bowls: cat.bowls, drink: cat.drink, side: cat.side };
    pushOrder(cat, 50);
    const nPick = 2 + Math.min(3, shiftsPlayed);
    const dues = [38, 58, 82, 104, 122];
    state.pickupPlan = [];
    for (let i = 0; i < nPick; i++) {
      const po = SD.genOrder("pickup");
      po.spec = { bowls: po.bowls, drink: po.drink, side: po.side };
      pushOrder(po, dues[i]);
      state.pickupPlan.push(po);
    }
    state.walkInEvery = Math.max(7, 13 - shiftsPlayed * 1.5);
    updateHud();
  }

  function updateSchedule(dt) {
    const m = state.min;
    // pickup customers arrive around their due time
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
    // walk-ins start once the sign is on (and it's around opening time)
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
    // camera easing toward target (keyboard / edge steps)
    if (Math.abs(state.camTarget - state.cam) > 1) {
      state.cam += (state.camTarget - state.cam) * Math.min(1, dt * 8);
    }
    // rice cookers
    for (const c of state.cookers) {
      if (c.on && !c.cooked) {
        c.cookLeft -= dt / MIN_SEC;
        if (c.cookLeft <= 0) { c.cooked = true; sfx("chime"); }
      }
      if (!RM && c.open && c.cooked && Math.random() < dt * 3) {
        state.steam.push({ x: c.x + (Math.random() * 40 - 20), y: c.y - 40, t: 0 });
      }
    }
    for (const s of state.steam) { s.t += dt; s.y -= dt * 26; }
    state.steam = state.steam.filter((s) => s.t < 1.6);
    for (const f of state.floats) f.t += dt;
    state.floats = state.floats.filter((f) => f.t < 2.4);
    // finished scrubbing?
    if (state.hands.soaped && state.hands.scrub >= 1 && !state._scrubDing) {
      state._scrubDing = true;
      float(300, 235, "scrubbed, now rinse", "#9fd6c0");
    }
    if (!state.hands.soaped) state._scrubDing = false;
    // fountain fill
    if (state.holdFill && state.cupAtTray) {
      const cup = state.cupAtTray;
      if (cup.drink && cup.drink !== state.holdFill.valve) cup.mixedWrong = true;
      if (!cup.drink) cup.drink = state.holdFill.valve;
      cup.fill = Math.min(1.25, cup.fill + dt * 0.55);
      if (cup.fill > 1.05 && !cup._spill) { cup._spill = true; mess(2750, 360); sfx("thunk"); }
    }
    // sauce squeeze
    if (state.holdSauce && state.held && state.held.kind === "bottle") {
      const t = state.holdSauce.target;
      const add = dt * 0.5;
      state.held.fill = Math.max(0, state.held.fill - add * 0.12);
      if (state.holdSauce.isMetal) {
        if (!t.sauce) t.sauce = { id: state.held.sauce, amount: 0 };
        if (t.sauce.id !== state.held.sauce) { t.sauce = { id: state.held.sauce, amount: t.sauce.amount }; }
        t.sauce.amount += add;
        t.mix = Math.min(t.mix, 0.3);
      } else {
        if (!t.sauce) t.sauce = { id: state.held.sauce, amount: 0 };
        if (t.sauce.id !== state.held.sauce) t.sauce.id = state.held.sauce;
        t.sauce.amount += add;
        if (t.sauce.amount > 1.7 && !t._pool) { t._pool = true; }
      }
    }
    // customers
    for (const c of state.customers) updateCustomer(c, dt);
    state.customers = state.customers.filter((c) => !c.gone);
    updateSchedule(dt);
    renderServiceButtons();
    // idle thoughts — the only nudge the game gives
    if (state.clock - state.lastProgress > 34 && state.clock - state.thoughtAt > 26) {
      idleThought();
    }
    // end of shift
    if (state.min >= CLOSE_MIN && state.sign) { state.sign = false; }
    if (state.min >= CLOSE_MIN) {
      const busy = state.customers.some((c) => !c.gone && c.state !== "leaving" && c.state !== "balked");
      if ((!busy && !activeOrders().some((o) => o.type !== "walkin" && o.custArrived)) || state.min >= HARD_END) endShift();
    }
    document.getElementById("shift-clock").textContent = clockStr(state.min);
  }
  function idleThought() {
    const m = state.min;
    if (!state.lights.kitchen) return thought("Dark in here. There's a panel by the back door.");
    if (state.hands.level === "dirty") return thought("Should wash in before touching anything.");
    if (!state.cookers[0].on && !state.cookers[0].cooked) return thought("Rice takes a while. Better get the pots going.");
    if (!state.linePans.some((s) => s.pan)) return thought("The line is bare. Backups live in the low boy.");
    if (m < OPEN_MIN && !state.lights.foh) return thought("Dining room's still dark.");
    if (m >= OPEN_MIN - 4 && !state.sign) return thought("Almost 11. The sign's still off.");
    if (activeOrders().length) return thought("Those tickets won't make themselves.");
    return thought("Breathe. Check the screen. Keep the station clean.");
  }

  // ---- drawing -----------------------------------------------------------
  function draw() {
    const cam = state.cam;
    ctx.clearRect(0, 0, VW, VH);
    ctx.save();
    ctx.translate(-cam, 0);
    drawBackdrop(cam);
    drawWallStuff();
    drawCustomers();
    drawStations();
    drawMesses();
    drawBubbles();
    drawLighting(cam);
    drawSteamAndFloats();
    ctx.restore();
    drawCursorAndHeld();
    drawEdges(cam);
  }

  function drawBackdrop(cam) {
    // kitchen wall
    ctx.fillStyle = "#37454d";
    ctx.fillRect(0, 0, FRONT_X, 380);
    ctx.fillStyle = "#3f5058";
    for (let x = 0; x < FRONT_X; x += 60) ctx.fillRect(x, 0, 2, 380);
    ctx.fillStyle = "#2f3b42";
    ctx.fillRect(0, 350, FRONT_X, 30);
    // kitchen floor
    ctx.fillStyle = "#57646c";
    ctx.fillRect(0, 505, FRONT_X, VH - 505);
    ctx.fillStyle = "#4d5a62";
    for (let x = 0; x < FRONT_X; x += 80) ctx.fillRect(x + 20, 505, 40, VH - 505);
    // kitchen counter band
    ctx.fillStyle = "#8d979e";
    ctx.fillRect(0, COUNTER_TOP, FRONT_X, 14);
    ctx.fillStyle = "#78838b";
    ctx.fillRect(0, COUNTER_TOP + 14, FRONT_X, COUNTER_BOT - COUNTER_TOP - 14);
    ctx.fillStyle = "#6a747c";
    ctx.fillRect(0, COUNTER_BOT - 8, FRONT_X, 8);

    // dining room
    ctx.fillStyle = "#43555e";
    ctx.fillRect(FRONT_X, 0, WORLD_W - FRONT_X, 460);
    // windows
    for (let i = 0; i < 1; i++) {
      const wx = FRONT_X + 40 + i * 170;
      ctx.fillStyle = "#9fc4d8";
      ctx.beginPath(); ctx.roundRect(wx, 60, 120, 150, 8); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.moveTo(wx + 10, 210); ctx.lineTo(wx + 50, 60); ctx.lineTo(wx + 76, 60); ctx.lineTo(wx + 36, 210); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#37454d"; ctx.lineWidth = 5;
      ctx.strokeRect(wx, 60, 120, 150);
    }
    // dining floor
    ctx.fillStyle = "#7c6a52";
    ctx.fillRect(FRONT_X, 460, WORLD_W - FRONT_X, VH - 460);
    ctx.fillStyle = "#71604a";
    for (let x = FRONT_X; x < WORLD_W; x += 46) ctx.fillRect(x, 460, 23, VH - 460);
    // front door
    ctx.fillStyle = "#5b4a36";
    ctx.beginPath(); ctx.roundRect(WORLD_W - 96, 210, 72, 250, 6); ctx.fill();
    ctx.fillStyle = "#9fc4d8";
    ctx.beginPath(); ctx.roundRect(WORLD_W - 86, 230, 52, 130, 4); ctx.fill();
    ctx.fillStyle = "#c9a144";
    ctx.beginPath(); ctx.arc(WORLD_W - 84, 350, 4, 0, 7); ctx.fill();
  }

  function drawWallStuff() {
    const F = SF;
    // wall clock
    ctx.fillStyle = "#e8e4dc";
    ctx.beginPath(); ctx.arc(140, 96, 30, 0, 7); ctx.fill();
    ctx.strokeStyle = "#41535e"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(140, 96, 30, 0, 7); ctx.stroke();
    const totMin = 630 + state.min; // 10:30
    const hA = ((totMin / 60) % 12) / 12 * Math.PI * 2 - Math.PI / 2;
    const mA = (totMin % 60) / 60 * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = "#333"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(140, 96); ctx.lineTo(140 + Math.cos(hA) * 14, 96 + Math.sin(hA) * 14); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(140, 96); ctx.lineTo(140 + Math.cos(mA) * 22, 96 + Math.sin(mA) * 22); ctx.stroke();

    // back door
    ctx.fillStyle = "#4a5a64";
    ctx.beginPath(); ctx.roundRect(8, 150, 0, 0, 0); ctx.fill();
    // clipboard
    ctx.fillStyle = "#8a6a42";
    ctx.beginPath(); ctx.roundRect(30, 190, 62, 86, 4); ctx.fill();
    ctx.fillStyle = "#f4ede3";
    ctx.beginPath(); ctx.roundRect(36, 202, 50, 68, 2); ctx.fill();
    ctx.fillStyle = "#b6bdc4";
    ctx.beginPath(); ctx.roundRect(50, 184, 22, 12, 3); ctx.fill();
    ctx.fillStyle = "#41535e"; ctx.font = "700 9px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("OPENING", 61, 214);
    ctx.strokeStyle = "#c9ced2"; ctx.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(42, 224 + i * 9); ctx.lineTo(80, 224 + i * 9); ctx.stroke(); }

    // light switch panel
    ctx.fillStyle = "#d7dce0";
    ctx.beginPath(); ctx.roundRect(108, 196, 46, 70, 5); ctx.fill();
    for (let i = 0; i < 2; i++) {
      const on = i === 0 ? state.lights.kitchen : state.lights.foh;
      ctx.fillStyle = on ? "#39a85b" : "#8d949c";
      ctx.beginPath(); ctx.roundRect(118, 204 + i * 34, 26, 26, 4); ctx.fill();
      ctx.fillStyle = "#f4ede3";
      ctx.beginPath(); ctx.roundRect(122, on ? 207 + i * 34 : 216 + i * 34, 18, 11, 2); ctx.fill();
    }
    ctx.fillStyle = "#c9ced2"; ctx.font = "600 8px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("KITCHEN", 131, 200);
    ctx.fillText("DINING", 131, 272);

    // wash station
    ctx.fillStyle = "#c8cfd5"; // basin
    ctx.beginPath(); ctx.roundRect(246, 262, 118, 40, 8); ctx.fill();
    ctx.fillStyle = "#9aa2a8";
    ctx.beginPath(); ctx.roundRect(254, 268, 102, 28, 6); ctx.fill();
    ctx.strokeStyle = "#b6bdc4"; ctx.lineWidth = 8; ctx.lineCap = "round"; // faucet
    ctx.beginPath(); ctx.moveTo(305, 262); ctx.lineTo(305, 222); ctx.quadraticCurveTo(305, 208, 320, 208); ctx.stroke();
    ctx.fillStyle = state.waterOn ? "#4be07a" : "#d7dce0";
    ctx.beginPath(); ctx.roundRect(292, 200, 26, 10, 4); ctx.fill();
    if (state.waterOn) {
      ctx.fillStyle = "rgba(160,210,240,0.75)";
      ctx.fillRect(316, 214, 6, 52);
    }
    ctx.fillStyle = "#f4ede3"; ctx.font = "700 8px system-ui, sans-serif";
    ctx.fillText("WASH HANDS", 305, 320);
    // soap
    ctx.fillStyle = "#e8ecef";
    ctx.beginPath(); ctx.roundRect(372, 230, 34, 46, 5); ctx.fill();
    ctx.fillStyle = "#4aa8ff";
    ctx.beginPath(); ctx.roundRect(378, 240, 22, 28, 3); ctx.fill();
    ctx.fillStyle = "#e8ecef";
    ctx.beginPath(); ctx.roundRect(384, 222, 10, 12, 2); ctx.fill();
    // towels
    ctx.fillStyle = "#8d979e";
    ctx.beginPath(); ctx.roundRect(424, 216, 44, 34, 4); ctx.fill();
    ctx.fillStyle = "#f4ede3";
    ctx.beginPath(); ctx.roundRect(432, 250, 28, 22, 1); ctx.fill();
    // glove box
    ctx.fillStyle = "#4aa8ff";
    ctx.beginPath(); ctx.roundRect(480, 254, 52, 34, 4); ctx.fill();
    ctx.fillStyle = "#e8ecef";
    ctx.beginPath(); ctx.ellipse(506, 271, 14, 7, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "700 8px system-ui, sans-serif";
    ctx.fillText("GLOVES", 506, 296);
    // trash
    ctx.fillStyle = "#41535e";
    ctx.beginPath(); ctx.roundRect(196, 428, 58, 84, 6); ctx.fill();
    ctx.fillStyle = "#37454d";
    ctx.beginPath(); ctx.roundRect(192, 420, 66, 12, 4); ctx.fill();

    // portion guide poster
    ctx.fillStyle = "#f4ede3";
    ctx.beginPath(); ctx.roundRect(545, 84, 250, 84, 6); ctx.fill();
    ctx.fillStyle = "#ee435b"; ctx.font = "800 13px system-ui, sans-serif";
    ctx.fillText("PORTION GUIDE", 670, 104);
    ctx.fillStyle = "#41535e"; ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText("Regular:  1 rice scoop · 2 protein scoops", 670, 126);
    ctx.fillText("Large:  2 rice scoops · 3 protein scoops", 670, 144);
    ctx.font = "600 9px system-ui, sans-serif";
    ctx.fillText("right tool for the job. lids on everything.", 670, 160);

    // paddle hook
    ctx.fillStyle = "#41535e";
    ctx.beginPath(); ctx.arc(688, 182, 4, 0, 7); ctx.fill();
    if (!(state.held && state.held.kind === "paddle")) SF.drawUtensil(ctx, "paddle", 688, 218, 0.15, 1, null);

    // utensil rail
    ctx.fillStyle = "#41535e";
    ctx.fillRect(920, 178, 220, 5);
    rail.forEach((u) => {
      ctx.fillStyle = "#2f3b42";
      ctx.beginPath(); ctx.arc(u.x, 184, 3.4, 0, 7); ctx.fill();
      if (!u.taken) SF.drawUtensil(ctx, u.kind, u.x, 218, 0.1, 1, null);
    });

    // KDS
    ctx.fillStyle = "#1c2429";
    ctx.beginPath(); ctx.roundRect(1200, 58, 380, 118, 8); ctx.fill();
    ctx.strokeStyle = "#41535e"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(1200, 58, 380, 118, 8); ctx.stroke();
    const act = activeOrders();
    ctx.textAlign = "left";
    if (!act.length) {
      ctx.fillStyle = "#4d6a58"; ctx.font = "700 12px ui-monospace, monospace";
      ctx.fillText("NO ACTIVE ORDERS", 1224, 122);
    }
    act.slice(0, 4).forEach((o, i) => {
      const x = 1208 + i * 92;
      const late = state.min > o.dueMin;
      const soon = state.min > o.dueMin - 8;
      ctx.fillStyle = late ? "#5e2a30" : soon ? "#5e522a" : "#2a4234";
      ctx.beginPath(); ctx.roundRect(x, 66, 86, 102, 4); ctx.fill();
      ctx.fillStyle = "#e8ecef"; ctx.font = "700 11px ui-monospace, monospace";
      ctx.fillText("#" + o.num, x + 6, 82);
      ctx.font = "600 10px ui-monospace, monospace";
      ctx.fillText(o.name.slice(0, 9), x + 6, 96);
      ctx.fillStyle = "#9fb6c4";
      ctx.fillText(o.type === "walkin" ? "here" : o.type, x + 6, 110);
      ctx.fillText(o.type === "walkin" ? "" : "due " + clockStr(o.dueMin), x + 6, 124);
      ctx.fillText(o.spec.bowls.length + " bowl" + (o.spec.bowls.length > 1 ? "s" : ""), x + 6, 138);
      if (o.spec.drink) ctx.fillText("+ drink", x + 6, 150);
      if (o.spec.side) ctx.fillText("+ side", x + 6, 162);
    });
    if (act.length > 4) {
      ctx.fillStyle = "#9fb6c4"; ctx.font = "700 11px ui-monospace, monospace";
      ctx.fillText("+" + (act.length - 4), 1552, 122);
    }
    ctx.textAlign = "center";

    // ticket rail
    ctx.fillStyle = "#b6bdc4";
    ctx.fillRect(2330, 168, 370, 8);
    state.stickers.slice(0, 5).forEach((st, i) => {
      const x = 2340 + i * 74;
      ctx.fillStyle = "#f4ede3";
      ctx.beginPath(); ctx.roundRect(x, 176, 66, 52, 2); ctx.fill();
      ctx.fillStyle = "#333"; ctx.font = "700 11px ui-monospace, monospace";
      ctx.fillText("#" + st.order.num, x + 33, 194);
      ctx.font = "600 9px ui-monospace, monospace";
      ctx.fillText(st.order.name.slice(0, 9), x + 33, 208);
      ctx.fillText(st.order.type === "walkin" ? "here" : st.order.type, x + 33, 220);
    });

    // sides shelf
    ctx.fillStyle = "#5b4a36";
    ctx.fillRect(2648, 196, 190, 8);
    SHELF_SIDES.forEach((sd) => SF.drawSidePack(ctx, sd.x, 172, 1, sd.id));
    ctx.fillStyle = "#c9ced2"; ctx.font = "600 8px system-ui, sans-serif";
    ctx.fillText("SIDES", 2740, 216);

    // MAHALO poster (dining wall)
    ctx.fillStyle = "#f4ede3";
    ctx.beginPath(); ctx.roundRect(3185, 96, 96, 120, 6); ctx.fill();
    ctx.fillStyle = "#22b2b4"; ctx.font = "800 14px system-ui, sans-serif";
    ctx.fillText("MAHALO", 3233, 118);
    ctx.fillStyle = "#41535e"; ctx.font = "600 8px system-ui, sans-serif";
    ["Meet + greet", "Assist + educate", "Handle with care", "Add value", "Leave thanks", "Obtain feedback"].forEach((l, i) => {
      ctx.fillText(l, 3233, 136 + i * 13);
    });

    // open sign in the window by the door
    ctx.fillStyle = "#2f3b42";
    ctx.beginPath(); ctx.roundRect(3392, 106, 60, 34, 6); ctx.fill();
    ctx.fillStyle = state.sign ? "#ff5a76" : "#5e6b73";
    ctx.font = "800 15px system-ui, sans-serif";
    ctx.fillText("OPEN", 3422, 129);
    if (state.sign) {
      ctx.strokeStyle = "rgba(255,90,118,0.5)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(3388, 102, 68, 42, 8); ctx.stroke();
    }
  }

  function drawStations() {
    const F = SF;
    // rice cookers
    for (const c of state.cookers) F.drawRiceCooker(ctx, c.x, c.y, c.R, c);
    // cold table + sneeze guard
    ctx.fillStyle = "#aeb5bc";
    ctx.beginPath(); ctx.roundRect(900, 276, 900, 136, 6); ctx.fill();
    ctx.fillStyle = "#98a0a7";
    ctx.fillRect(900, 404, 900, 10);
    // pans
    for (const slot of state.linePans) {
      if (slot.pan) {
        F.drawHotelPan(ctx, slot.x, slot.y, slot.w, slot.h, slot.pan.ing, slot.pan.fill, slot.seed, SD.INGREDIENTS[slot.pan.ing].name);
      } else {
        ctx.fillStyle = "#6f767d";
        ctx.beginPath(); ctx.roundRect(slot.x, slot.y, slot.w, slot.h, 4); ctx.fill();
        ctx.strokeStyle = "#5b6167"; ctx.lineWidth = 2;
        ctx.strokeRect(slot.x + 3, slot.y + 3, slot.w - 6, slot.h - 6);
      }
    }
    // sneeze guard glass
    ctx.fillStyle = "rgba(200,230,244,0.14)";
    ctx.fillRect(900, 214, 900, 62);
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
    ctx.strokeRect(900, 214, 900, 62);

    // low boy
    ctx.fillStyle = "#8d979e";
    ctx.beginPath(); ctx.roundRect(950, 428, 400, 86, 6); ctx.fill();
    ctx.fillStyle = "#78838b";
    ctx.beginPath(); ctx.roundRect(958, 436, 188, 70, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(1154, 436, 188, 70, 4); ctx.fill();
    ctx.fillStyle = "#c9ced2";
    ctx.fillRect(1040, 466, 30, 6); ctx.fillRect(1236, 466, 30, 6);
    ctx.fillStyle = "#e8ecef"; ctx.font = "700 9px system-ui, sans-serif";
    ctx.fillText("LOW BOY · BACKUPS", 1150, 424);

    // prep counter spots A/B (subtle mat so they read as work spots)
    [[1810, "A"], [1902, "B"], [2320, "C"]].forEach((sp) => {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath(); ctx.roundRect(sp[0], 344, 88, 40, 6); ctx.fill();
    });
    state.spots.forEach((spot, i) => {
      const sx = [1854, 1946, 2364][i];
      const it = spot.item;
      if (it) {
        if (it.kind === "bowl") F.drawServingBowl(ctx, sx, 352, 1, it.bowl);
        else if (it.kind === "metal") F.drawMetalBowl(ctx, sx, 352, 1, it);
      }
    });

    // metal bowl stack
    for (let i = 0; i < state.metalStack; i++) {
      F.drawMetalBowl(ctx, 2046, 350 - i * 8, 0.9, { items: [], sauce: null, mix: 0 });
    }
    // spoon crock
    ctx.fillStyle = "#e8e4dc";
    ctx.beginPath(); ctx.roundRect(2100, 330, 36, 40, 6); ctx.fill();
    if (!(state.held && state.held.kind === "spoon")) F.drawUtensil(ctx, "spoon", 2118, 330, 0.25, 1, null);

    // sauce rack
    ctx.fillStyle = "#5b4a36";
    ctx.fillRect(2168, 258, 156, 8); ctx.fillRect(2168, 342, 156, 8);
    RACK_POS.forEach((rp) => {
      if (state.rack[rp.id]) F.drawSauceBottle(ctx, rp.x, rp.y - 10, 62, rp.id, 0.75);
    });
    ctx.fillStyle = "#c9ced2"; ctx.font = "600 8px system-ui, sans-serif";
    ctx.fillText("SAUCES", 2246, 368);

    // pass stacks
    function stack(x, y, n, big) {
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 ? "#f7f4ee" : "#e8e4dc";
        ctx.beginPath(); ctx.ellipse(x, y - i * 5, big ? 30 : 25, 8, 0, 0, 7); ctx.fill();
      }
    }
    stack(2430, 362, 7, false);
    stack(2490, 362, 7, true);
    // lids
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = "rgba(230,238,244,0.8)";
      ctx.beginPath(); ctx.ellipse(2549, 360 - i * 4, 23, 6, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2603, 358 - i * 4, 27, 6, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#c9ced2"; ctx.font = "600 8px system-ui, sans-serif";
    ctx.fillText("REG", 2430, 382); ctx.fillText("LG", 2490, 382);
    ctx.fillText("LIDS", 2576, 382);
    // bags
    SF.drawBag(ctx, 2662, 330, 1, { items: [], label: null });
    SF.drawBag(ctx, 2670, 336, 1, { items: [], label: null });

    // fountain machine
    ctx.fillStyle = "#41535e";
    ctx.beginPath(); ctx.roundRect(2664, 216, 180, 108, 8); ctx.fill();
    ctx.fillStyle = "#2f3b42";
    ctx.beginPath(); ctx.roundRect(2664, 216, 180, 30, 8); ctx.fill();
    ctx.fillStyle = "#e8ecef"; ctx.font = "700 10px system-ui, sans-serif";
    ctx.fillText("FOUNTAIN", 2754, 236);
    VALVES.forEach((v) => {
      ctx.fillStyle = SD.DRINKS[v.id].color;
      ctx.beginPath(); ctx.roundRect(v.x - 14, 252, 28, 30, 4); ctx.fill();
      ctx.fillStyle = "#1c2429";
      ctx.beginPath(); ctx.roundRect(v.x - 4, 284, 8, 16, 2); ctx.fill();
      ctx.fillStyle = "#e8ecef"; ctx.font = "600 6.5px system-ui, sans-serif";
      const nm = SD.DRINKS[v.id].name.toUpperCase().split(" ");
      nm.forEach((w, i) => ctx.fillText(w, v.x, 262 + i * 8));
    });
    // drip tray
    ctx.fillStyle = "#8d979e";
    ctx.beginPath(); ctx.roundRect(2666, 328, 176, 22, 4); ctx.fill();
    ctx.fillStyle = "#6a747c";
    for (let x = 2674; x < 2836; x += 12) ctx.fillRect(x, 334, 7, 3);
    if (state.cupAtTray) SF.drawCup(ctx, 2754, 312, 1, state.cupAtTray);
    if (state.holdFill && state.cupAtTray) {
      const v = VALVES.find((vv) => vv.id === state.holdFill.valve);
      if (v) { ctx.fillStyle = SD.DRINKS[v.id].color; ctx.fillRect(v.x - 2, 300, 4, 16); }
    }
    // cups, cup lids, straws
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = "rgba(220,230,238,0.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(2862, 362 - i * 9); ctx.lineTo(2858, 336 - i * 9);
      ctx.lineTo(2890, 336 - i * 9); ctx.lineTo(2886, 362 - i * 9); ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = "#e8ecef";
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(2919, 356 - i * 6, 15, 5, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#ee435b";
    for (let i = 0; i < 4; i++) ctx.fillRect(2946 + i * 5, 310, 2.6, 50);
    ctx.fillStyle = "#c9ced2"; ctx.font = "600 7px system-ui, sans-serif";
    ctx.fillText("CUPS", 2874, 380); ctx.fillText("LIDS", 2919, 380); ctx.fillText("STRAWS", 2954, 380);

    // freezer
    ctx.fillStyle = "#9fc4d8";
    ctx.beginPath(); ctx.roundRect(2700, 428, 140, 86, 6); ctx.fill();
    ctx.fillStyle = "#7ea8bc";
    ctx.beginPath(); ctx.roundRect(2708, 436, 124, 44, 4); ctx.fill();
    ctx.fillStyle = "#e8f4fa"; ctx.font = "700 9px system-ui, sans-serif";
    ctx.fillText("MOCHI ❄", 2770, 500);

    // ---- front counter (drawn over customers) ----
    ctx.fillStyle = "#c89a62";
    ctx.fillRect(FRONT_X + 20, 458, 230, 16);
    ctx.fillStyle = "#f4ede3";
    ctx.fillRect(FRONT_X + 20, 474, 230, 126);
    // scallops on the front face
    ctx.fillStyle = "#fd9f27";
    for (let x = FRONT_X + 34; x < FRONT_X + 244; x += 34) {
      ctx.beginPath(); ctx.arc(x, 506, 15, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#f7b95e";
    for (let x = FRONT_X + 51; x < FRONT_X + 244; x += 34) {
      ctx.beginPath(); ctx.arc(x, 536, 15, 0, 7); ctx.fill();
    }
    // register on the counter
    ctx.fillStyle = "#2f3b42";
    ctx.beginPath(); ctx.roundRect(3056, 402, 96, 62, 6); ctx.fill();
    ctx.fillStyle = state.lights.foh ? "#9fd6c0" : "#4d5a62";
    ctx.beginPath(); ctx.roundRect(3064, 410, 80, 36, 4); ctx.fill();
    ctx.fillStyle = "#1c2429"; ctx.font = "700 9px system-ui, sans-serif";
    if (state.lights.foh) ctx.fillText("POKEWORKS POS", 3104, 431);
    ctx.fillStyle = "#41535e";
    ctx.beginPath(); ctx.roundRect(3072, 448, 64, 10, 2); ctx.fill();

    // pickup shelf rack
    ctx.fillStyle = "#5b4a36";
    ctx.fillRect(3260, 236, 8, 260); ctx.fillRect(3444, 236, 8, 260);
    ctx.fillRect(3260, 314, 192, 8); ctx.fillRect(3260, 398, 192, 8); ctx.fillRect(3260, 236, 192, 8);
    ctx.fillStyle = "#f4ede3"; ctx.font = "700 9px system-ui, sans-serif";
    ctx.fillText("PICKUP", 3356, 230);
    state.shelf.forEach((slot, i) => {
      const px = [3312, 3404, 3312, 3404][i], py = [312, 312, 396, 396][i];
      let ox = px - (slot.items.length - 1) * 14;
      for (const it of slot.items) {
        if (it.kind === "bag") SF.drawBag(ctx, ox, py - 22, 0.82, it);
        else if (it.kind === "cup") SF.drawCup(ctx, ox, py - 18, 0.85, it.cup);
        else SF.drawSidePack(ctx, ox, py - 16, 0.8, it.side);
        ox += 28;
      }
    });
  }

  function drawCustomers() {
    for (const c of state.customers) {
      if (c.gone) continue;
      SF.drawPerson(ctx, c.x, c.y, { shirt: c.shirt, skin: c.skin, walkPhase: c.walkPhase, walking: c.walking, mood: c.mood, scale: 1 });
    }
  }

  function drawBubbles() {
    ctx.textAlign = "center";
    for (const c of state.customers) {
      if (!c.bubble || state.min > c.bubbleUntil) continue;
      const words = c.bubble.split(" ");
      const lines = [];
      let cur = "";
      for (const w of words) {
        if ((cur + " " + w).length > 30) { lines.push(cur); cur = w; }
        else cur = cur ? cur + " " + w : w;
      }
      if (cur) lines.push(cur);
      const lw = Math.min(232, Math.max(60, Math.max.apply(null, lines.map((l) => l.length)) * 6.4 + 18));
      const lh = lines.length * 13 + 14;
      let bx = c.x, by = c.y - 118 - lh;
      bx = Math.max(state.cam + lw / 2 + 6, Math.min(state.cam + VW - lw / 2 - 6, bx));
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.beginPath(); ctx.roundRect(bx - lw / 2, by, lw, lh, 9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(c.x - 6, by + lh); ctx.lineTo(c.x + 8, by + lh); ctx.lineTo(c.x, by + lh + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#26333b"; ctx.font = "600 10.5px system-ui, sans-serif";
      lines.forEach((l, i) => ctx.fillText(l, bx, by + 16 + i * 13));
    }
  }

  function drawMesses() {
    for (const m of state.messes) {
      ctx.fillStyle = "rgba(150,110,60,0.5)";
      ctx.beginPath(); ctx.ellipse(m.x, m.y, 14, 6, 0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(m.x + 10, m.y + 4, 6, 3, 0, 0, 7); ctx.fill();
    }
  }

  function drawLighting(cam) {
    if (!state.lights.kitchen) {
      ctx.fillStyle = "rgba(6,12,18,0.78)";
      ctx.fillRect(0, 0, FRONT_X, VH);
      // faint glow so the switch panel is findable in the dark
      const g = ctx.createRadialGradient(131, 231, 4, 131, 231, 90);
      g.addColorStop(0, "rgba(255,220,150,0.28)");
      g.addColorStop(1, "rgba(255,220,150,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(131, 231, 90, 0, 7); ctx.fill();
      // daylight bleeding in from the dining room
      const g2 = ctx.createLinearGradient(FRONT_X - 200, 0, FRONT_X, 0);
      g2.addColorStop(0, "rgba(160,190,210,0)");
      g2.addColorStop(1, "rgba(160,190,210,0.12)");
      ctx.fillStyle = g2;
      ctx.fillRect(FRONT_X - 200, 0, 200, VH);
    }
    if (!state.lights.foh) {
      ctx.fillStyle = "rgba(6,12,18,0.55)";
      ctx.fillRect(FRONT_X, 0, WORLD_W - FRONT_X, VH);
      // windows still glow with daylight
      for (let i = 0; i < 1; i++) {
        const wx = FRONT_X + 40 + i * 170;
        ctx.fillStyle = "rgba(159,196,216,0.35)";
        ctx.fillRect(wx, 60, 120, 150);
      }
    }
  }

  function drawSteamAndFloats() {
    if (!RM) {
      for (const s of state.steam) {
        ctx.fillStyle = "rgba(255,255,255," + (0.35 * (1 - s.t / 1.6)) + ")";
        ctx.beginPath(); ctx.arc(s.x + Math.sin(s.t * 5) * 4, s.y, 5 + s.t * 6, 0, 7); ctx.fill();
      }
    }
    ctx.textAlign = "center";
    for (const f of state.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 2.4);
      ctx.fillStyle = f.color; ctx.font = "700 13px system-ui, sans-serif";
      ctx.fillText(f.txt, f.x, f.y - f.t * 18);
      ctx.globalAlpha = 1;
    }
  }

  function drawCursorAndHeld() {
    const h = state.held;
    // hover label: quiet discoverability, like reading what you're looking at
    const wx = ptr.x + state.cam, wy = ptr.y;
    const o = hitObj(wx, wy);
    if (o && !ptr.down) {
      const label = typeof o.label === "function" ? o.label(wx, wy) : o.label;
      if (label) {
        ctx.fillStyle = "rgba(10,18,24,0.82)";
        ctx.font = "600 11px system-ui, sans-serif";
        const w = ctx.measureText(label).width + 14;
        let lx = Math.min(VW - w - 4, Math.max(4, ptr.x - w / 2));
        ctx.beginPath(); ctx.roundRect(lx, ptr.y + 18, w, 20, 6); ctx.fill();
        ctx.fillStyle = "#f4ede3"; ctx.textAlign = "center";
        ctx.fillText(label, lx + w / 2, ptr.y + 32);
      }
    }
    // held item follows the pointer
    if (h) {
      const x = ptr.x, y = ptr.y;
      if (h.kind === "paddle") SF.drawUtensil(ctx, "paddle", x, y, 0.5, 1, h.load);
      else if (h.kind === "spoodle") SF.drawUtensil(ctx, "spoodle", x, y, 0.5, 1, h.load);
      else if (h.kind === "tongs") SF.drawUtensil(ctx, "tongs", x, y, 0.5, 1, h.load);
      else if (h.kind === "spoon") SF.drawUtensil(ctx, "spoon", x, y, 0.5, 1, null);
      else if (h.kind === "towel") SF.drawUtensil(ctx, "towel", x, y, 0.2, 1, null);
      else if (h.kind === "bottle") SF.drawSauceBottle(ctx, x, y, 58, h.sauce, h.fill);
      else if (h.kind === "bowl") SF.drawServingBowl(ctx, x, y, 0.95, h.bowl);
      else if (h.kind === "metal") SF.drawMetalBowl(ctx, x, y, 0.95, h);
      else if (h.kind === "lid") {
        ctx.fillStyle = "rgba(230,238,244,0.85)";
        ctx.beginPath(); ctx.ellipse(x, y, h.size === "large" ? 30 : 25, 8, 0, 0, 7); ctx.fill();
      }
      else if (h.kind === "cup") SF.drawCup(ctx, x, y, 1, h.cup);
      else if (h.kind === "bag") SF.drawBag(ctx, x, y, 0.95, h);
      else if (h.kind === "side") SF.drawSidePack(ctx, x, y, 1, h.side);
      else if (h.kind === "panBackup") SF.drawHotelPan(ctx, x - 46, y - 20, 92, 40, h.ing, 1, 999, null);
    }
    // glove state chip near the cursor
    const lv = state.hands.level;
    ctx.beginPath(); ctx.arc(ptr.x + 20, ptr.y - 16, 6, 0, 7);
    ctx.fillStyle = lv === "gloved" ? (state.hands.dirtyGloves ? "#b8a05a" : "#4aa8ff")
      : lv === "clean" ? "#9fd6c0" : "#8a6a4a";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function drawEdges(cam) {
    ctx.textAlign = "center"; ctx.font = "800 26px system-ui, sans-serif";
    if (cam > 4) {
      ctx.fillStyle = "rgba(10,18,24,0.35)";
      ctx.beginPath(); ctx.roundRect(6, VH / 2 - 34, 34, 68, 10); ctx.fill();
      ctx.fillStyle = "#f4ede3"; ctx.fillText("‹", 23, VH / 2 + 10);
    }
    if (cam < WORLD_W - VW - 4) {
      ctx.fillStyle = "rgba(10,18,24,0.35)";
      ctx.beginPath(); ctx.roundRect(VW - 40, VH / 2 - 34, 34, 68, 10); ctx.fill();
      ctx.fillStyle = "#f4ede3"; ctx.fillText("›", VW - 23, VH / 2 + 10);
    }
  }

  // ---- floating DOM positioning -----------------------------------------
  function positionOver(el, wx, wy) {
    const r = canvas.getBoundingClientRect();
    const sx = (wx - state.cam) * (r.width / VW);
    const sy = wy * (r.height / VH);
    const stage = canvas.parentElement.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(stage.width - 150, sx + (r.left - stage.left) - 70)) + "px";
    el.style.top = Math.max(8, sy + (r.top - stage.top)) + "px";
  }

  // ---- HUD / shell -------------------------------------------------------
  function updateHud() {
    document.getElementById("score").textContent = state.score;
    document.getElementById("high-score").textContent = Math.max(storedBest, state.score);
  }

  // ---- shift lifecycle ---------------------------------------------------
  let last = 0, rafId = 0;
  function loop(t) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    if (!state.running || state.paused || state.over) { draw(); return; }
    const sheetOpen = !document.getElementById("pos").hidden || !document.getElementById("ask").hidden;
    if (!sheetOpen) update(dt);
    else { state.clock += dt; } // ringing an order still costs real focus, not shift time
    draw();
  }

  function startShift() {
    setupShift();
    state.running = true;
    document.getElementById("screen-start").classList.add("hidden");
    document.getElementById("overlay").classList.add("hidden");
    document.getElementById("pause-btn").style.display = "";
    if (window.PokeTrack) PokeTrack.hit("play", "shift");
    if (window.PokeStreak) PokeStreak.mark();
    markProgress();
    state.lastProgress = 6; // give them a quiet half minute before the first nudge
  }

  function togglePause() {
    if (!state.running || state.over) return;
    state.paused = !state.paused;
    document.getElementById("overlay").classList.toggle("hidden", !state.paused);
    document.getElementById("screen-paused").classList.toggle("hidden", !state.paused);
    document.getElementById("pause-btn").textContent = state.paused ? "▶" : "⏸";
  }
  document.getElementById("pause-btn").addEventListener("click", togglePause);
  document.getElementById("resume-btn").addEventListener("click", togglePause);

  function endShift() {
    if (state.over) return;
    state.over = true;
    closeSheets();
    // anything still pending is lost
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
  state = freshState();
  document.getElementById("high-score").textContent = storedBest;
  document.getElementById("start-subtitle").textContent = shiftsPlayed === 0
    ? "Saturday. You open at 11. Nobody is coming to show you around."
    : "Shift " + (shiftsPlayed + 1) + ". You know the drill by now. Doors at 11.";
  requestAnimationFrame(loop);

  window.Shift = {
    state: () => state,
    endShift: endShift,
    // advance the simulation by hand (testing, demo hooks)
    tick: (secs) => { for (let t = 0; t < secs; t += 0.05) update(0.05); },
    frame: () => draw(),
  };
})();
