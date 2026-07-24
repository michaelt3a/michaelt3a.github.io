// The hub's Daily Challenge banner: which game is today's, a way in, and once
// you've played, your score and where it placed.
(function () {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function render(el) {
    const c = Daily.challenge();
    const done = Daily.result();
    const st = Daily.streak();
    const flame = st.count ? '<span class="dc-streak">🔥 ' + st.count + "</span>" : "";

    el.style.setProperty("--g", c.game.color);
    el.innerHTML =
      '<div class="dc-top"><span class="dc-tag">🗓 Daily Challenge</span>' + flame + "</div>" +
      '<div class="dc-main">' +
      '<span class="dc-game">' + escapeHtml(c.game.label) + "</span>" +
      '<span class="dc-note">' +
      (done
        ? "Played — " + done.score + " " + c.game.unit
        : "Same run for everyone. One attempt.") +
      "</span></div>" +
      (done
        ? '<div class="dc-rank" id="dc-rank">Checking today\'s board…</div>'
        : '<a class="dc-play" href="' + c.game.file + '?daily=1">Play ›</a>');

    if (done) fillRank(el, c);
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
