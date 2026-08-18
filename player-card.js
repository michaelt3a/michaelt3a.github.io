// The hub's player card. A compact strip shows who you are and how far along
// the achievement wall you've got; opening it reveals your personal best in
// every game alongside your global rank on that game's boards.
(function () {
  // Games each grew their own name key; the shared one is canonical now, with
  // Bowl Builder's older key kept in sync so it still prefills in-game.
  const NAME_KEY = "pokeworks-lb-name";
  const ALT_NAME_KEYS = ["pokeworks-bowl-lb-name"];

  function ls(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsNum(key) {
    const n = parseInt(ls(key), 10);
    return isNaN(n) ? 0 : n;
  }
  function lsJson(key) {
    try { return JSON.parse(ls(key)); } catch (e) { return null; }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function getName() {
    const n = (ls(NAME_KEY) || "").trim();
    if (n) return n;
    for (const k of ALT_NAME_KEYS) {
      const alt = (ls(k) || "").trim();
      if (alt) return alt;
    }
    return "";
  }
  function setName(name) {
    let n = name.trim().slice(0, 12);
    if (window.PokeFilter && !PokeFilter.ok(n)) n = ""; // blocked names just don't stick
    try {
      localStorage.setItem(NAME_KEY, n);
      for (const k of ALT_NAME_KEYS) localStorage.setItem(k, n);
    } catch (e) { /* ignore */ }
    return n;
  }

  // ------------------------------------------------- rename existing scores --
  // Changing your name carries your scores with you: every table gets a PATCH
  // moving rows from the old name (case-insensitive) to the new one, and the
  // per-browser mirrors are renamed the same way. Needs an update RLS policy
  // on each table; without one the PATCH silently matches nothing, which is a
  // safe no-op.
  const SB = window.POKEWORKS_SUPABASE || {};
  const canRemote =
    !!SB.url && !!SB.anonKey && !/YOUR_/.test(SB.url) && !/YOUR_/.test(SB.anonKey);
  const SCORE_TABLES = ["bowl_scores", "orderup_scores", "sigworks_speedruns", "daily_scores"];

  async function renameRemote(oldName, newName) {
    if (!canRemote) return;
    const headers = {
      apikey: SB.anonKey,
      Authorization: "Bearer " + SB.anonKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };
    await Promise.all(SCORE_TABLES.map(function (t) {
      return fetch(
        SB.url + "/rest/v1/" + t + "?name=ilike." + encodeURIComponent(oldName.trim()),
        { method: "PATCH", headers: headers, body: JSON.stringify({ name: newName }) }
      ).catch(function () { /* offline or blocked — mirrors still renamed */ });
    }));
  }

  function renameInList(list, oldKey, newName) {
    if (!Array.isArray(list)) return list;
    for (const e of list) {
      if (String(e.name).trim().toLowerCase() === oldKey) e.name = newName;
    }
    return list;
  }
  function renameLocalMirrors(oldName, newName) {
    const oldKey = oldName.trim().toLowerCase();
    try {
      const bowl = lsJson("pokeworks-bowl-leaderboard");
      if (bowl) {
        for (const k of Object.keys(bowl)) renameInList(bowl[k], oldKey, newName);
        localStorage.setItem("pokeworks-bowl-leaderboard", JSON.stringify(bowl));
      }
      const ou = lsJson("pokeworks-orderup-lb");
      if (ou) {
        for (const k of Object.keys(ou)) renameInList(ou[k], oldKey, newName);
        localStorage.setItem("pokeworks-orderup-lb", JSON.stringify(ou));
      }
      const sw = lsJson("sigworks_speedrun_lb");
      if (sw) localStorage.setItem("sigworks_speedrun_lb", JSON.stringify(renameInList(sw, oldKey, newName)));
      const daily = lsJson("pokeworks-daily-lb");
      if (daily) {
        for (const k of Object.keys(daily)) renameInList(daily[k], oldKey, newName);
        localStorage.setItem("pokeworks-daily-lb", JSON.stringify(daily));
      }
    } catch (e) { /* ignore */ }
  }

  async function renameEverywhere(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    renameLocalMirrors(oldName, newName);
    await renameRemote(oldName, newName);
    if (window.HubLeaderboard && HubLeaderboard.clearCache) HubLeaderboard.clearCache();
  }

  function fmtTime(ms) {
    if (window.HubLeaderboard && HubLeaderboard.fmtTime) return HubLeaderboard.fmtTime(ms);
    const t = Math.max(0, ms);
    return Math.floor(t / 60000) + ":" + String(Math.floor((t % 60000) / 1000)).padStart(2, "0");
  }

  // Each game's personal best, read from the same keys the games write.
  const STATS = [
    {
      id: "bowl",
      label: "Bowl Builder",
      color: "#ee435b",
      best() {
        const n = lsNum("pokeworks-high-score");
        return n ? { value: n + " blocks", n: n } : null;
      },
    },
    {
      id: "sw",
      label: "Signature Works",
      color: "#22b2b4",
      best() {
        const b = lsJson("sigworks_speedrun_best");
        if (!b || typeof b.perfect !== "number") return null;
        return { value: b.perfect + "/9 · " + fmtTime(b.ms), n: b.perfect };
      },
    },
    {
      id: "ou",
      label: "Order Up",
      color: "#fd9f27",
      best() {
        // one key per mode; the card shows the best shift across all four
        const n = Math.max(
          lsNum("pokeworks-orderup-best-v2"),
          lsNum("pokeworks-orderup-best-v2-hard"),
          lsNum("pokeworks-orderup-best-v2-normal-rush"),
          lsNum("pokeworks-orderup-best-v2-hard-rush")
        );
        return n ? { value: "$" + n.toLocaleString(), n: n } : null;
      },
    },
    {
      id: "wb",
      label: "Word Bowl",
      color: "#39a85b",
      // Word Bowl is once-a-day with no board, so no rank line.
      noRank: true,
      best() {
        const s = lsJson("pokeworks-wordbowl");
        const c = s && s.career;
        if (!c || !c.solved) return null;
        // The stored streak goes stale once a day is missed.
        const d = new Date();
        const day = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
        const t = day(d);
        d.setDate(d.getDate() - 1);
        const live = c.lastWin === t || c.lastWin === day(d);
        return {
          value: c.solved + " solved" + (live && c.streak > 1 ? " · 🔥 " + c.streak : ""),
          n: c.solved,
        };
      },
    },
    // The arcade three keep local bests only; no boards, so no rank line.
    {
      id: "td",
      label: "Topping Drop",
      color: "#f5c542",
      noRank: true,
      best() {
        const n = lsNum("pokeworks-topping-best");
        return n ? { value: n + " catches", n: n } : null;
      },
    },
    {
      id: "br",
      label: "Bowl Rush",
      color: "#8f6ef0",
      noRank: true,
      best() {
        const n = lsNum("pokeworks-rush-best");
        return n ? { value: n + " sorted", n: n } : null;
      },
    },
    {
      id: "ps",
      label: "Poke Slice",
      color: "#39a85b",
      noRank: true,
      best() {
        const n = lsNum("pokeworks-slice-best");
        return n ? { value: n + " slices", n: n } : null;
      },
    },
    {
      id: "ss",
      label: "Secret Shopper",
      color: "#7c5cff",
      // Secret Shopper has no leaderboard, so no rank line for it.
      noRank: true,
      best() {
        const n = lsNum("pokeworks-shopper-best");
        // Career rank, mirrored from secret-shopper.js's RANKS ladder.
        const SS_RANKS = ["🧢 Trainee", "🥄 Team Member", "⭐ Shift Lead", "📋 Asst. Manager", "🏬 Store Manager", "👑 District Legend"];
        const c = lsJson("pokeworks-shopper-career");
        const rank = c && SS_RANKS[c.rank] ? SS_RANKS[c.rank] : null;
        if (rank) return { value: rank + (n ? " · " + n + "%" : ""), n: n };
        return n ? { value: n + "%", n: n } : null;
      },
    },
  ];

  function streak() {
    return window.PokeStreak ? PokeStreak.get() : { count: 0, best: 0 };
  }
  function streakText(s) {
    if (!s.count) return s.best ? "Best streak " + s.best + " days" : "No streak yet";
    return s.count + " day" + (s.count === 1 ? "" : "s") + " in a row";
  }

  // This month at a glance: a dot per day, filled on days with a game played.
  function calendarBlock() {
    if (!window.PokeStreak || !PokeStreak.days) return "";
    const played = new Set(PokeStreak.days());
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const firstDow = new Date(y, m, 1).getDay(); // 0 = Sunday
    const todayD = now.getDate();
    const monthName = now.toLocaleString("default", { month: "long" });
    let cells = "";
    for (const w of ["S", "M", "T", "W", "T", "F", "S"]) {
      cells += '<span class="pc-cal-dow">' + w + "</span>";
    }
    for (let i = 0; i < firstDow; i++) cells += "<span></span>";
    for (let d = 1; d <= daysInMonth; d++) {
      const key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const cls =
        "pc-cal-day" + (played.has(key) ? " on" : "") + (d === todayD ? " today" : "");
      cells += '<span class="' + cls + '">' + d + "</span>";
    }
    return (
      '<div class="pc-cal"><span class="pc-cal-title">' + monthName + " " + y + "</span>" +
      '<div class="pc-cal-grid">' + cells + "</div></div>"
    );
  }

  // Rewards Shop wallet, when points.js is on the page (it is on the hub).
  function pointsBlock() {
    if (!window.PokePoints) return "";
    const p = PokePoints.data();
    const codes = p.redeemed.length;
    return (
      '<div class="pc-points"><span class="pc-streak-ico">🎁</span>' +
      '<span class="pc-id"><strong>' + p.balance.toLocaleString() + " points</strong>" +
      '<span class="pc-hint">' +
      (p.earned
        ? p.earned.toLocaleString() + " earned · " + codes + " code" + (codes === 1 ? "" : "s") + " redeemed · "
        : "Play a customer game to start earning. ") +
      '<a href="shop.html">Rewards Shop ›</a></span></span></div>'
    );
  }

  function achProgress() {
    const defs = (window.PokeAch && PokeAch.DEFS) || [];
    const map = lsJson("pokeworks-achievements") || {};
    const got = defs.filter((d) => map[d.id]).length;
    return { got: got, total: defs.length };
  }

  // Best placing across a game's boards, e.g. #3 on Medium.
  async function bestRank(gameId, name) {
    if (!name || !window.HubLeaderboard) return null;
    const game = (HubLeaderboard.GAMES || []).find((g) => g.id === gameId);
    if (!game) return null;
    const key = name.trim().toLowerCase();
    let best = null;
    for (const cat of game.cats) {
      let list;
      try { list = await HubLeaderboard.fetchBoard(cat.key); } catch (e) { continue; }
      const i = list.findIndex((e) => String(e.name).trim().toLowerCase() === key);
      if (i < 0) continue;
      if (!best || i + 1 < best.rank) best = { rank: i + 1, label: cat.label };
    }
    return best;
  }

  // ------------------------------------------------------------ the strip --
  let stripEl = null;

  function renderStrip() {
    if (!stripEl) return;
    const name = getName();
    const a = achProgress();
    const pct = a.total ? Math.round((a.got / a.total) * 100) : 0;
    const s = streak();
    stripEl.innerHTML =
      '<span class="pc-avatar">' + escapeHtml(name ? name[0].toUpperCase() : "?") + "</span>" +
      '<span class="pc-id">' +
      '<strong class="pc-name">' + escapeHtml(name || "Set your name") + "</strong>" +
      '<span class="pc-sub">' + a.got + " / " + a.total + " achievements</span>" +
      "</span>" +
      (s.count ? '<span class="pc-flame" title="' + streakText(s) + '">🔥 ' + s.count + "</span>" : "") +
      '<span class="pc-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
      '<span class="pc-go">View stats ›</span>';
  }

  // ------------------------------------------------------------ the sheet --
  function renderSheet(bodyEl) {
    const name = getName();
    const a = achProgress();
    const pct = a.total ? Math.round((a.got / a.total) * 100) : 0;
    const st = streak();

    const rows = STATS.map(function (s) {
      const b = s.best();
      return (
        '<div class="pc-stat" style="--g:' + s.color + '">' +
        '<span class="pc-stat-game">' + s.label + "</span>" +
        '<span class="pc-stat-val">' + (b ? escapeHtml(b.value) : "None") + "</span>" +
        '<span class="pc-stat-rank" data-rank="' + s.id + '">' +
        (s.noRank || !b ? "" : name ? '<span class="skel"></span>' : "Add a name to rank") +
        "</span></div>"
      );
    }).join("");

    bodyEl.innerHTML =
      '<div class="pc-head">' +
      '<span class="pc-avatar pc-avatar-lg">' + escapeHtml(name ? name[0].toUpperCase() : "?") + "</span>" +
      '<span class="pc-id">' +
      '<label class="pc-label" for="pc-name-input">Player name</label>' +
      '<input id="pc-name-input" class="pc-input" type="text" maxlength="12" placeholder="Your name" value="' +
      escapeHtml(name) + '" />' +
      '<span class="pc-hint">Used when you post a score.</span>' +
      "</span></div>" +
      '<div class="pc-ach"><span class="pc-ach-top"><strong>Achievements</strong><em>' +
      a.got + " / " + a.total + '</em></span><span class="pc-bar"><i style="width:' + pct + '%"></i></span></div>' +
      '<div class="pc-streak"><span class="pc-streak-ico">🔥</span>' +
      '<span class="pc-id"><strong>' + escapeHtml(streakText(st)) + "</strong>" +
      '<span class="pc-hint">' +
      (st.best ? "Longest run: " + st.best + " day" + (st.best === 1 ? "" : "s") : "Play on back-to-back days to build one.") +
      "</span></span></div>" +
      calendarBlock() +
      pointsBlock() +
      '<div class="pc-stats">' + rows + "</div>";

    const input = bodyEl.querySelector("#pc-name-input");
    const commit = function () {
      const prev = getName();
      const saved = setName(input.value);
      input.value = saved;
      bodyEl.querySelector(".pc-avatar").textContent = saved ? saved[0].toUpperCase() : "?";
      renderStrip();
      // A rename carries your existing leaderboard scores to the new name.
      const hint = bodyEl.querySelector(".pc-hint");
      if (prev && saved && prev !== saved) {
        if (hint) hint.textContent = "Moving your scores to " + saved + "…";
        renameEverywhere(prev, saved).then(function () {
          if (hint) hint.textContent = "✓ Your scores now show as " + saved + ".";
          fillRanks(bodyEl);
        });
      } else {
        fillRanks(bodyEl); // a new name means new placings
      }
    };
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    });

    fillRanks(bodyEl);
  }

  function fillRanks(bodyEl) {
    const name = getName();
    for (const s of STATS) {
      const el = bodyEl.querySelector('[data-rank="' + s.id + '"]');
      if (!el || s.noRank) continue;
      if (!s.best()) { el.textContent = ""; continue; }
      if (!name) { el.textContent = "Add a name to rank"; continue; }
      el.innerHTML = '<span class="skel"></span>';
      el.classList.remove("ranked");
      (function (el2, id) {
        bestRank(id, name).then(function (r) {
          if (getName() !== name) return; // renamed while we were fetching
          if (!r) { el2.textContent = "Unranked"; return; }
          el2.textContent = "#" + r.rank + " · " + r.label;
          el2.classList.add("ranked");
        }).catch(function () { el2.textContent = ""; });
      })(el, s.id);
    }
  }

  function init(el) {
    stripEl = el;
    renderStrip();
  }

  window.PlayerCard = { init, renderSheet, renderStrip, getName, setName };
})();
