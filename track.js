// Anonymous play counters for the owner's stats page. One tally per
// (day, kind, game) in Supabase; no player ids, no PII, nothing to opt out
// of because nothing identifies anyone. Fire-and-forget: if the table isn't
// set up or the player is offline, the count is simply missed.
(function () {
  const SB = window.POKEWORKS_SUPABASE || {};
  const ok = !!SB.url && !!SB.anonKey && !/YOUR_/.test(SB.url) && !/YOUR_/.test(SB.anonKey);

  function hit(kind, game) {
    if (!ok) return;
    fetch(SB.url + "/rest/v1/rpc/bump_event", {
      method: "POST",
      headers: {
        apikey: SB.anonKey,
        Authorization: "Bearer " + SB.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_kind: String(kind), p_game: String(game || "") }),
    }).catch(function () { /* offline or not set up; skip the tally */ });
  }

  window.PokeTrack = { hit };
})();
