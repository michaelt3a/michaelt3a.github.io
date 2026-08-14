// Leaderboard name filter. Names go on public boards under the Pokeworks
// name, so anything on the blocklist quietly becomes "Anon" at submit time.
// Leetspeak is normalized first (0 -> o, 3 -> e, and so on), then each term
// is checked as a substring. Terms are chosen long/specific enough that
// innocent names don't trip them.
(function () {
  // Base64 so the words themselves don't sit in the source in plain text.
  const BANNED = [
    "ZnVjaw==", "c2hpdA==", "Yml0Y2g=", "Y3VudA==", "bmlnZ2Vy", "bmlnZ2E=",
    "ZmFnZ290", "cmV0YXJk", "d2hvcmU=", "c2x1dA==", "cGVuaXM=", "dmFnaW5h",
    "Y29jaw==", "ZGlsZG8=", "cmFwaXN0", "aGl0bGVy", "bmF6aQ==", "a3lz",
    "cG9ybg==", "aGVudGFp", "Ym9vYnM=", "dGl0cw==", "Y2hpbms=", "c3BpYw==",
    "a2lrZQ==", "dHJhbm55", "ZHlrZQ==", "amlnYWJvbw==",
  ].map(function (b) { try { return atob(b); } catch (e) { return ""; } });

  const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i" };

  function normalize(s) {
    return String(s).toLowerCase().replace(/[013457 8@$!]/g, function (c) { return LEET[c] || ""; })
      .replace(/[^a-z]/g, "");
  }

  // True when the name is fine to show on a board.
  function ok(name) {
    const n = normalize(name);
    if (!n && String(name).trim()) return true; // all symbols/numbers is harmless
    for (const w of BANNED) {
      if (w && n.indexOf(w) !== -1) return false;
    }
    return true;
  }

  // The one call sites use: pass anything through, get a board-safe name back.
  function clean(name) {
    return ok(name) ? name : "Anon";
  }

  window.PokeFilter = { ok, clean };
})();
