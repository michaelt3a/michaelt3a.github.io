// The owner's stats page. Reads the aggregate tallies track.js writes and
// draws the last 14 days. Chart colors are re-stepped versions of each
// game's brand hue, validated for the dark surface and colorblind-checked
// (Signature Works shifts teal -> blue so it can't be confused with Word
// Bowl's green).
(function () {
  const SB = window.POKEWORKS_SUPABASE || {};
  const DAYS = 14;
  // Fixed identity order: stacking, legend, and table columns all use it.
  const GAMES = [
    { id: "bowl", label: "Bowl Builder", color: "#e05264" },
    { id: "sw", label: "Signature Works", color: "#3a87c8" },
    { id: "ou", label: "Order Up", color: "#bd7f21" },
    { id: "ss", label: "Secret Shopper", color: "#8f6ef0" },
    { id: "wb", label: "Word Bowl", color: "#4a9e58" },
  ];

  const chartEl = document.getElementById("st-chart");
  const legendEl = document.getElementById("st-legend");
  const tipEl = document.getElementById("st-tip");
  const tableEl = document.getElementById("st-table");
  const emptyEl = document.getElementById("st-empty");

  function utcDay(offset) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  }
  function shortDay(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
  }

  async function fetchCounts() {
    const res = await fetch(
      SB.url + "/rest/v1/event_counts?select=day,kind,game,n&day=gte." + utcDay(DAYS - 1) + "&order=day.asc",
      { headers: { apikey: SB.anonKey, Authorization: "Bearer " + SB.anonKey } }
    );
    if (!res.ok) throw new Error("no table yet");
    return res.json();
  }

  function build(rows) {
    // days[iso] = { plays: {gameId: n}, daily: n, playsTotal: n }
    const days = {};
    for (let i = DAYS - 1; i >= 0; i--) days[utcDay(i)] = { plays: {}, daily: 0, playsTotal: 0 };
    let signups = 0;
    let redeems = 0;
    for (const r of rows) {
      const d = days[r.day];
      if (!d) continue;
      if (r.kind === "play" || r.kind === "daily") {
        d.plays[r.game] = (d.plays[r.game] || 0) + r.n;
        d.playsTotal += r.n;
        if (r.kind === "daily") d.daily += r.n;
      } else if (r.kind === "signup") signups += r.n;
      else if (r.kind === "redeem") redeems += r.n;
    }

    const today = days[utcDay(0)];
    document.getElementById("st-plays-today").textContent = today.playsTotal;
    document.getElementById("st-daily-today").textContent = today.daily;
    document.getElementById("st-signups").textContent = signups;
    document.getElementById("st-redeems").textContent = redeems;

    // Legend (fixed order, color chip + ink-colored text).
    legendEl.innerHTML = GAMES.map(function (g) {
      return '<span class="st-key"><i style="background:' + g.color + '"></i>' + g.label + "</span>";
    }).join("");

    // Chart: one column per day, stacked segments in fixed order, 2px gaps.
    const isoDays = Object.keys(days);
    const max = Math.max(1, ...isoDays.map(function (d) { return days[d].playsTotal; }));
    chartEl.innerHTML = "";
    isoDays.forEach(function (iso, i) {
      const col = document.createElement("div");
      col.className = "st-col";
      const bar = document.createElement("div");
      bar.className = "st-bar";
      // Build top-down so the first game in the fixed order sits at the base.
      for (let g = GAMES.length - 1; g >= 0; g--) {
        const n = days[iso].plays[GAMES[g].id] || 0;
        if (!n) continue;
        const seg = document.createElement("i");
        seg.style.height = (n / max) * 100 + "%";
        seg.style.background = GAMES[g].color;
        bar.appendChild(seg);
      }
      const lab = document.createElement("small");
      // Sparse labels: first, last, and every other day between.
      lab.textContent = i % 2 === 0 || i === isoDays.length - 1 ? shortDay(iso) : "";
      col.appendChild(bar);
      col.appendChild(lab);
      col.addEventListener("mousemove", function (e) { showTip(e, iso, days[iso]); });
      col.addEventListener("mouseleave", hideTip);
      chartEl.appendChild(col);
    });

    // Table view of the same numbers.
    let html = "<tr><th>Day</th>" + GAMES.map(function (g) { return "<th>" + g.label + "</th>"; }).join("") +
      "<th>Total</th><th>Daily runs</th></tr>";
    for (const iso of isoDays.slice().reverse()) {
      const d = days[iso];
      html += "<tr><td>" + shortDay(iso) + "</td>" +
        GAMES.map(function (g) { return "<td>" + (d.plays[g.id] || 0) + "</td>"; }).join("") +
        "<td><strong>" + d.playsTotal + "</strong></td><td>" + d.daily + "</td></tr>";
    }
    tableEl.innerHTML = html;

    if (!rows.length) emptyEl.hidden = false;
  }

  function showTip(e, iso, d) {
    const lines = GAMES
      .filter(function (g) { return d.plays[g.id]; })
      .map(function (g) {
        return '<span class="st-key"><i style="background:' + g.color + '"></i>' +
          g.label + " · <strong>" + d.plays[g.id] + "</strong></span>";
      });
    tipEl.innerHTML = "<strong>" + shortDay(iso) + "</strong> · " + d.playsTotal +
      " play" + (d.playsTotal === 1 ? "" : "s") +
      (d.daily ? " · " + d.daily + " daily" : "") +
      (lines.length ? "<br>" + lines.join("<br>") : "");
    tipEl.hidden = false;
    const pad = 14;
    const w = tipEl.offsetWidth;
    tipEl.style.left = Math.min(e.clientX + pad, window.innerWidth - w - pad) + "px";
    tipEl.style.top = e.clientY + pad + "px";
  }
  function hideTip() { tipEl.hidden = true; }

  fetchCounts()
    .then(build)
    .catch(function () {
      build([]);
      emptyEl.hidden = false;
    });
})();
