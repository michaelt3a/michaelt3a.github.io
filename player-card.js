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
    const n = name.trim().slice(0, 12);
    try {
      localStorage.setItem(NAME_KEY, n);
      for (const k of ALT_NAME_KEYS) localStorage.setItem(k, n);
    } catch (e) { /* ignore */ }
    return n;
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
        // one key per mode; the card shows the best across all three
        const n = Math.max(
          lsNum("pokeworks-orderup-best"),
          lsNum("pokeworks-orderup-best-baby"),
          lsNum("pokeworks-orderup-best-hard")
        );
        return n ? { value: n.toLocaleString() + " pts", n: n } : null;
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
        return n ? { value: n + "%", n: n } : null;
      },
    },
  ];

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
    stripEl.innerHTML =
      '<span class="pc-avatar">' + escapeHtml(name ? name[0].toUpperCase() : "?") + "</span>" +
      '<span class="pc-id">' +
      '<strong class="pc-name">' + escapeHtml(name || "Set your name") + "</strong>" +
      '<span class="pc-sub">' + a.got + " / " + a.total + " achievements</span>" +
      "</span>" +
      '<span class="pc-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
      '<span class="pc-go">View stats ›</span>';
  }

  // ------------------------------------------------------------ the sheet --
  function renderSheet(bodyEl) {
    const name = getName();
    const a = achProgress();
    const pct = a.total ? Math.round((a.got / a.total) * 100) : 0;

    const rows = STATS.map(function (s) {
      const b = s.best();
      return (
        '<div class="pc-stat" style="--g:' + s.color + '">' +
        '<span class="pc-stat-game">' + s.label + "</span>" +
        '<span class="pc-stat-val">' + (b ? escapeHtml(b.value) : "—") + "</span>" +
        '<span class="pc-stat-rank" data-rank="' + s.id + '">' +
        (s.noRank || !b ? "" : name ? "Checking rank…" : "Add a name to rank") +
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
      '<div class="pc-stats">' + rows + "</div>";

    const input = bodyEl.querySelector("#pc-name-input");
    const commit = function () {
      const saved = setName(input.value);
      input.value = saved;
      bodyEl.querySelector(".pc-avatar").textContent = saved ? saved[0].toUpperCase() : "?";
      renderStrip();
      fillRanks(bodyEl); // a new name means new placings
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
      el.textContent = "Checking rank…";
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
