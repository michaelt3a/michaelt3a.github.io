// The Rewards Shop: points (earned in the customer games) buy discount codes.
//
// The codes below are FILLER — obvious placeholders until real single-use
// codes exist in the POS. Prices are deliberately steep: a dedicated daily
// player earns roughly 100–200 points a day, so even the cheapest code is a
// few days of loyalty, not one lucky run.
(function () {
  const ITEMS = [
    // Perks spend points without handing out a discount.
    { id: "shield", icon: "🛟", title: "Streak insurance", desc: "Covers one missed day of your play streak. Holds one at a time.", cost: 150, kind: "perk" },
    { id: "pct5", icon: "🏷️", title: "5% off a bowl", desc: "A little thank-you for playing.", cost: 400, code: "POKE-FILLER-5OFF" },
    { id: "topping", icon: "🥑", title: "Free topping upgrade", desc: "Add avocado or an extra topping to any bowl.", cost: 550, code: "POKE-FILLER-TOPPING" },
    { id: "drink", icon: "🥤", title: "Free drink", desc: "Any fountain drink with a bowl.", cost: 700, code: "POKE-FILLER-DRINK" },
    { id: "side", icon: "🥟", title: "Free side", desc: "Miso soup, seaweed salad, or chips.", cost: 1200, code: "POKE-FILLER-SIDE" },
    { id: "pct10", icon: "💸", title: "10% off a bowl", desc: "For the regulars.", cost: 1500, code: "POKE-FILLER-10OFF" },
    { id: "combo", icon: "🍱", title: "Combo deal", desc: "Bowl, drink, and a side for the price of the bowl.", cost: 2000, code: "POKE-FILLER-COMBO" },
    { id: "bogo", icon: "🍜", title: "BOGO bowl", desc: "Buy one bowl, get one free.", cost: 2500, code: "POKE-FILLER-BOGO" },
    { id: "cater", icon: "🎉", title: "10% off catering", desc: "10% off any catering order.", cost: 3200, code: "POKE-FILLER-CATER" },
    { id: "bowl", icon: "👑", title: "Free signature bowl", desc: "The big one. Any signature work, on us.", cost: 4000, code: "POKE-FILLER-BOWL" },
  ];

  const balEl = document.getElementById("shop-balance");
  const earnedEl = document.getElementById("shop-earned");
  const gridEl = document.getElementById("shop-grid");
  const ownedWrap = document.getElementById("shop-owned-wrap");
  const ownedEl = document.getElementById("shop-owned");

  // Two-tap redeem: first tap arms the button, second confirms.
  let armed = null; // item id
  let armedTimer = 0;
  let justRedeemed = false; // scroll-and-glow the new code on the next render

  function fmtDate(t) {
    const d = new Date(t);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function render() {
    const data = PokePoints.data();
    balEl.textContent = data.balance.toLocaleString();
    earnedEl.textContent = data.earned
      ? data.earned.toLocaleString() + " earned all-time"
      : "Play Bowl Builder or Order Up to start earning.";
    if (window.PokeBoost && PokeBoost.active()) {
      earnedEl.textContent += " · ⚡ " + PokeBoost.mult() + "x points on right now!";
    }

    // Catalog
    gridEl.innerHTML = "";
    for (const item of ITEMS) {
      const held = item.kind === "perk" && window.PokeChallenges && PokeChallenges.shieldCount() > 0;
      const afford = data.balance >= item.cost && !held;
      const card = document.createElement("div");
      card.className = "shop-item" + (afford ? "" : " locked");
      card.innerHTML =
        `<span class="shop-item-ico">${item.icon}</span>` +
        `<div class="shop-item-body"><strong>${item.title}</strong><small>${item.desc}</small></div>` +
        `<button class="shop-buy" type="button" ${afford ? "" : "disabled"}></button>`;
      const btn = card.querySelector(".shop-buy");
      btn.textContent = held ? "✓ Saved up"
        : armed === item.id ? "Sure? −" + item.cost
        : item.cost.toLocaleString() + " pts";
      if (armed === item.id) btn.classList.add("armed");
      btn.addEventListener("click", () => onBuy(item));
      gridEl.appendChild(card);
    }

    // Skins: buy once, keep forever, swap anytime. One slot each for bowls,
    // blades and belts; buying or equipping swaps that slot.
    const skinsEl = document.getElementById("shop-skins");
    if (skinsEl && window.PokeSkins) {
      skinsEl.innerHTML = "";
      const activeBySlot = {
        bowl: PokeSkins.active("bowl").id,
        blade: PokeSkins.active("blade").id,
        belt: PokeSkins.active("belt").id,
      };
      for (const sk of PokeSkins.SKINS) {
        const owned = PokeSkins.owned(sk.id);
        const isOn = owned && sk.id === activeBySlot[sk.slot];
        const afford = data.balance >= sk.cost;
        const swatch = sk.slot === "bowl"
          ? `background:${sk.body};box-shadow: inset 0 -8px 0 ${sk.inner}${sk.rim ? `, 0 0 0 3px ${sk.rim}` : ""}`
          : sk.slot === "blade"
            ? `background:linear-gradient(135deg, transparent 42%, rgb(${sk.trail}) 42% 58%, transparent 58%) #20262a`
            : `background:repeating-linear-gradient(90deg, ${sk.belt} 0 8px, rgba(0,0,0,0.2) 8px 10px)`;
        const card = document.createElement("div");
        card.className = "shop-item" + (owned || afford ? "" : " locked");
        card.innerHTML =
          `<span class="shop-item-ico shop-skin-swatch" style="${swatch}"></span>` +
          `<div class="shop-item-body"><strong>${sk.icon} ${sk.title}</strong><small>${sk.desc}</small></div>` +
          `<button class="shop-buy" type="button" ${owned || afford ? "" : "disabled"}></button>`;
        const btn = card.querySelector(".shop-buy");
        btn.textContent = isOn ? "✓ On"
          : owned ? "Equip"
          : armed === "skin-" + sk.id ? "Sure? −" + sk.cost
          : sk.cost.toLocaleString() + " pts";
        if (isOn) btn.disabled = true;
        if (armed === "skin-" + sk.id) btn.classList.add("armed");
        btn.addEventListener("click", () => onSkin(sk));
        skinsEl.appendChild(card);
      }
    }

    // Owned codes
    ownedWrap.hidden = !data.redeemed.length;
    ownedEl.innerHTML = "";
    for (const r of data.redeemed) {
      const row = document.createElement("div");
      row.className = "shop-code";
      row.innerHTML =
        `<div class="shop-code-txt"><strong>${r.title}</strong><code>${r.code}</code><small>${fmtDate(r.t)}</small></div>` +
        `<button class="shop-copy" type="button">Copy</button>`;
      row.querySelector(".shop-copy").addEventListener("click", (e) => {
        const b = e.currentTarget;
        const done = () => { b.textContent = "✓"; setTimeout(() => { b.textContent = "Copy"; }, 1200); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(r.code).then(done, done);
        } else done();
      });
      ownedEl.appendChild(row);
    }

    // A fresh redeem pulls the page down to the new code and glows it.
    if (justRedeemed) {
      justRedeemed = false;
      const first = ownedEl.querySelector(".shop-code");
      if (first) {
        first.classList.add("shop-code-new");
        first.addEventListener("animationend", () => first.classList.remove("shop-code-new"), { once: true });
        first.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  function onSkin(sk) {
    if (PokeSkins.owned(sk.id)) {
      PokeSkins.equip(sk.id);
      render();
      return;
    }
    // Same two-tap arm as the codes.
    if (armed !== "skin-" + sk.id) {
      armed = "skin-" + sk.id;
      clearTimeout(armedTimer);
      armedTimer = setTimeout(() => { armed = null; render(); }, 3500);
      render();
      return;
    }
    clearTimeout(armedTimer);
    armed = null;
    if (PokePoints.spend(sk.cost, "Bowl skin: " + sk.title)) {
      PokeSkins.own(sk.id);
      if (window.PokeTrack) PokeTrack.hit("redeem", "skin-" + sk.id);
    }
    render();
  }

  function onBuy(item) {
    if (armed !== item.id) {
      armed = item.id;
      clearTimeout(armedTimer);
      armedTimer = setTimeout(() => { armed = null; render(); }, 3500);
      render();
      return;
    }
    clearTimeout(armedTimer);
    armed = null;
    if (item.kind === "perk") {
      // Perks don't mint a code; they stash their effect and stay off My Codes.
      if (window.PokeChallenges && PokePoints.spend(item.cost, item.title)) {
        PokeChallenges.addShield();
        if (window.PokeTrack) PokeTrack.hit("redeem", item.id);
        if (window.PokeAch) PokeAch.unlock("meta-insured");
      }
    } else if (PokePoints.spend(item.cost, "Redeemed: " + item.title)) {
      PokePoints.recordRedeem(item);
      if (window.PokeTrack) PokeTrack.hit("redeem", item.id);
      justRedeemed = true;
    }
    render();
  }

  // --- Email updates opt-in ------------------------------------------------
  const mailInput = document.getElementById("shop-mail-input");
  const mailSave = document.getElementById("shop-mail-save");
  const mailNote = document.getElementById("shop-mail-note");
  // Signing up pays a one-time bonus. The claim flag lives outside the mail
  // state so toggling off and back on can't farm it.
  const MAIL_BONUS = 25;
  const MAIL_BONUS_KEY = "pokeworks-mail-bonus";

  function renderMail() {
    if (!window.PokeMail || !mailInput) return;
    const m = PokeMail.load();
    mailInput.value = m.email;
    mailInput.disabled = m.on;
    mailSave.textContent = m.on ? "Turn off" : "Sign up";
    mailNote.hidden = !m.on;
    mailNote.textContent = m.on ? "✓ You're signed up as " + m.email + "." : "";
  }
  if (window.PokeMail && mailSave) {
    mailSave.addEventListener("click", () => {
      const m = PokeMail.load();
      if (m.on) {
        PokeMail.set(m.email, false);
      } else {
        const email = mailInput.value.trim();
        // A loose shape check; the mailer is the real gatekeeper.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          mailNote.hidden = false;
          mailNote.textContent = "That doesn't look like an email address.";
          return;
        }
        PokeMail.set(email, true);
        if (window.PokeTrack) PokeTrack.hit("signup", "mail");
        let bonused = false;
        try {
          if (!localStorage.getItem(MAIL_BONUS_KEY)) {
            localStorage.setItem(MAIL_BONUS_KEY, "1");
            PokePoints.add(MAIL_BONUS, "Email signup bonus");
            bonused = true;
          }
        } catch (e) { /* ignore */ }
        renderMail();
        if (bonused) mailNote.textContent += " +" + MAIL_BONUS + " points added!";
        return;
      }
      renderMail();
    });
    renderMail();
  }

  // While codes are placeholders, points are play money; the test button
  // makes trying the shop (and the redeem animation) painless.
  const testBtn = document.getElementById("shop-test-pts");
  if (testBtn) {
    testBtn.addEventListener("click", () => PokePoints.add(500, "Test points"));
  }

  PokePoints.onChange(render);
  render();
})();
