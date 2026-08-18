// The hub's Daily Challenge banner: which game is today's, a way in, and once
// you've played, your score and where it placed.
(function () {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // "$12" and "85%" hug the number; other units trail it ("31 blocks").
  function fmtScore(score, unit) {
    if (unit === "$") return "$" + score;
    if (unit === "%") return score + "%";
    return score + " " + unit;
  }

  // Hours and minutes until the next local midnight.
  function untilTomorrow() {
    const now = new Date();
    const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.max(1, Math.round((mid - now) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? h + "h " + m + "m" : m + "m";
  }

  function render(el) {
    const c = Daily.challenge();
    const done = Daily.result();
    const st = Daily.streak();
    const flame = st.count ? '<span class="dc-streak">🔥 ' + st.count + "</span>" : "";

    el.style.setProperty("--g", c.game.color);
    el.innerHTML =
      '<div class="dc-top"><span class="dc-tag">Daily Challenge</span>' + flame + "</div>" +
      '<div class="dc-main">' +
      '<span class="dc-game">' + escapeHtml(c.game.label) + "</span>" +
      '<span class="dc-note">' +
      (done
        ? "Played: " + fmtScore(done.score, c.game.unit) +
          " · new challenge in " + untilTomorrow()
        : "Same run for everyone. One attempt." +
          // Customer-game days pay Rewards Shop points.
          (c.game.customer && window.PokeChallenges ? " Earns +" + PokeChallenges.DAILY_PTS + " pts." : "")) +
      "</span></div>" +
      (done
        ? '<div class="dc-rank" id="dc-rank"><span class="skel"></span></div>' +
          '<div class="dc-podium" id="dc-podium"></div>'
        : '<a class="dc-play" href="' + c.game.file + '?daily=1">Play ›</a>');

    if (done) {
      fillRank(el, c);
      fillPodium(el);
    }
  }

  // Yesterday's top 3, so there's always someone to gun for.
  async function fillPodium(el) {
    const slot = el.querySelector("#dc-podium");
    if (!slot) return;
    const yd = Daily.yesterday();
    const game = Daily.gameFor(yd);
    let list = [];
    try { list = await Daily.board(yd, game.id); } catch (e) { list = []; }
    if (!list.length) { slot.remove(); return; }
    const medals = ["🥇", "🥈", "🥉"];
    slot.innerHTML =
      '<span class="dc-podium-tag">Yesterday (' + escapeHtml(game.label) + ")</span>" +
      list.slice(0, 3).map((e, i) =>
        '<span class="dc-podium-row">' + medals[i] + " " + escapeHtml(e.name) +
        " · " + fmtScore(e.score, game.unit) + "</span>"
      ).join("");
  }

  // Where today's score sits on the day's board.
  async function fillRank(el, c) {
    const slot = el.querySelector("#dc-rank");
    if (!slot) return;
    const name = (window.PlayerCard && PlayerCard.getName()) || "";
    let list = [];
    try { list = await Daily.board(c.date, c.game.id); } catch (e) { list = []; }
    if (!list.length) { slot.textContent = "No scores posted yet today."; return; }
    const key = name.trim().toLowerCase();
    const i = name ? list.findIndex((e) => String(e.name).trim().toLowerCase() === key) : -1;
    const players = list.length + " player" + (list.length === 1 ? "" : "s");
    slot.textContent = i >= 0
      ? "#" + (i + 1) + " of " + players + " today"
      : players + " so far today";
  }

  window.DailyCard = { render };
})();
