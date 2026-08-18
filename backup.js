// Site-wide backup codes: everything a player owns (points, streak, skins,
// achievements, bests, Order Up saves, Word Bowl history) lives in
// localStorage, so switching phones or clearing the browser wipes it all.
// One copyable code moves the lot. Lives in the profile sheet on the hub.
(function () {
  const backupBtn = document.getElementById("pc-backup-btn");
  const restoreBtn = document.getElementById("pc-restore-btn");
  const wrapEl = document.getElementById("pc-backup-wrap");
  const codeEl = document.getElementById("pc-backup-code");
  const msgEl = document.getElementById("pc-backup-msg");
  if (!backupBtn || !restoreBtn || !wrapEl || !codeEl || !msgEl) return;

  // Every key the site writes starts with one of these (see the KEY consts
  // across the games). New keys with the same prefixes ride along for free.
  const PREFIXES = ["pokeworks-", "sigworks-", "sigworks_", "season-"];
  const MAGIC = "PKWBK1."; // format marker + version, so bad pastes fail loudly

  function ours(key) {
    return PREFIXES.some((p) => key.indexOf(p) === 0);
  }

  function exportCode() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (ours(k)) data[k] = localStorage.getItem(k);
    }
    const json = JSON.stringify({ v: 1, t: Date.now(), data: data });
    // Unicode-safe base64 (names and emoji survive the round trip).
    return MAGIC + btoa(unescape(encodeURIComponent(json)));
  }

  function importCode(raw) {
    const s = String(raw || "").trim();
    if (s.indexOf(MAGIC) !== 0) return false;
    let obj;
    try {
      obj = JSON.parse(decodeURIComponent(escape(atob(s.slice(MAGIC.length)))));
    } catch (e) {
      return false;
    }
    if (!obj || obj.v !== 1 || !obj.data || typeof obj.data !== "object") return false;
    let wrote = 0;
    for (const k of Object.keys(obj.data)) {
      if (!ours(k) || typeof obj.data[k] !== "string") continue; // never write foreign keys
      try { localStorage.setItem(k, obj.data[k]); wrote++; } catch (e) { /* quota; keep going */ }
    }
    return wrote > 0;
  }

  backupBtn.addEventListener("click", () => {
    const code = exportCode();
    wrapEl.hidden = false;
    codeEl.readOnly = true;
    codeEl.value = code;
    codeEl.focus();
    codeEl.select();
    const done = () => { msgEl.textContent = "✓ Backup code copied. Keep it somewhere safe."; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, () => {
        msgEl.textContent = "Select the code above and copy it (Ctrl/Cmd+C).";
      });
    } else {
      try { document.execCommand("copy"); done(); }
      catch (e) { msgEl.textContent = "Select the code above and copy it."; }
    }
  });

  restoreBtn.addEventListener("click", () => {
    // First tap reveals an empty box; second tap (with a code) restores.
    if (wrapEl.hidden || codeEl.readOnly || !codeEl.value.trim()) {
      wrapEl.hidden = false;
      codeEl.readOnly = false;
      codeEl.value = "";
      codeEl.focus();
      msgEl.textContent = "Paste your backup code above, then tap Restore again.";
      return;
    }
    if (importCode(codeEl.value)) {
      msgEl.textContent = "✓ Restored. Reloading…";
      setTimeout(() => location.reload(), 700);
    } else {
      msgEl.textContent = "That code didn't work. Check you copied all of it.";
    }
  });
})();
