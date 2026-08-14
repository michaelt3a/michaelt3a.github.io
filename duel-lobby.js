// Duel lobby: make a room, join one by code or link, wait for the second
// player over Supabase Realtime broadcast, then send both browsers into Bowl
// Builder with the room code as the shared seed. The game side is duel.js.
//
// Phones background this page the moment you switch to Messages to send the
// link, which kills the websocket. So the connection rebuilds itself every
// time the page comes back into view (or back online) until launch.
(function () {
  const SB = window.POKEWORKS_SUPABASE || {};
  const NAME_KEY = "pokeworks-lb-name";
  const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

  const nameInput = document.getElementById("duel-name");
  const actionsEl = document.getElementById("duel-actions");
  const createBtn = document.getElementById("duel-create");
  const joinBtn = document.getElementById("duel-join");
  const codeInput = document.getElementById("duel-code-in");
  const roomEl = document.getElementById("duel-room");
  const codeBig = document.getElementById("duel-code-big");
  const linkInput = document.getElementById("duel-link");
  const shareBtn = document.getElementById("duel-share");
  const copyBtn = document.getElementById("duel-copy");
  const statusEl = document.getElementById("duel-status");

  // The hub name prefills as a convenience, but this input is its own thing:
  // edits stay in the duel, never write back, and skip the board name filter
  // (duel names are only ever seen by the person you invited).
  try { nameInput.value = localStorage.getItem(NAME_KEY) || ""; } catch (e) { /* ignore */ }

  function myName() {
    return (nameInput.value || "").trim().slice(0, 12) || "Player";
  }

  // The realtime client library loads on demand; nobody else pays for it.
  let libPromise = null;
  function lib() {
    if (window.supabase) return Promise.resolve();
    if (!libPromise) {
      libPromise = new Promise(function (resolve, reject) {
        const s = document.createElement("script");
        s.src = CDN;
        s.onload = resolve;
        s.onerror = function () { reject(new Error("couldn't load the realtime library")); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  function makeCode() {
    const A = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no lookalike characters
    let c = "";
    const buf = new Uint32Array(4);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 4; i++) c += A[buf[i] % A.length];
    return c;
  }

  // --- Room connection (rebuildable) ---------------------------------------
  let launched = false;
  let currentCode = null;
  let client = null;
  let ch = null;
  const myId = Math.floor(Math.random() * 1e9);

  function launch(oppName) {
    if (launched) return;
    launched = true;
    statusEl.textContent = "Opponent found: " + oppName + ". Starting…";
    setTimeout(function () {
      location.href = "bowl-builder.html?duel=" + currentCode + "&dn=" + encodeURIComponent(myName());
    }, 1500);
  }

  async function connectRoom() {
    if (launched || !currentCode) return;
    try {
      await lib();
    } catch (e) {
      statusEl.textContent = "Couldn't reach the duel service. Check your connection.";
      return;
    }
    if (!client) client = window.supabase.createClient(SB.url, SB.anonKey);
    if (ch) {
      try { client.removeChannel(ch); } catch (e) { /* ignore */ }
      ch = null;
    }
    statusEl.textContent = "Connecting…";
    const mine = client.channel("duel-" + currentCode);
    ch = mine;
    let pinger = 0;
    mine.on("broadcast", { event: "hello" }, function (m) {
      if (!m.payload || m.payload.id === myId) return;
      mine.send({ type: "broadcast", event: "hello", payload: { id: myId, name: myName() } });
      launch(m.payload.name || "Player");
    });
    mine.subscribe(function (status) {
      if (mine !== ch) return; // a newer rebuild took over
      if (status === "SUBSCRIBED") {
        statusEl.textContent = "Waiting for an opponent… code " + currentCode + " gets them in.";
        clearInterval(pinger);
        pinger = setInterval(function () {
          if (launched || mine !== ch) { clearInterval(pinger); return; }
          mine.send({ type: "broadcast", event: "hello", payload: { id: myId, name: myName() } });
        }, 900);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearInterval(pinger);
        statusEl.textContent = "Connection dropped. Reconnecting…";
        // A quiet retry; coming back to the tab also triggers one.
        setTimeout(function () { if (mine === ch) connectRoom(); }, 2000);
      }
    });
  }

  function openRoom(code) {
    currentCode = code;
    roomEl.hidden = false;
    actionsEl.hidden = true;
    nameInput.disabled = true;
    codeBig.textContent = code;
    linkInput.value = location.origin + location.pathname + "?room=" + code;
    connectRoom();
  }

  // The fix for "I went to Messages and it died": rebuild on return.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && currentCode && !launched) connectRoom();
  });
  window.addEventListener("online", function () {
    if (currentCode && !launched) connectRoom();
  });

  // --- Buttons -------------------------------------------------------------
  createBtn.addEventListener("click", function () {
    openRoom(makeCode());
  });

  joinBtn.addEventListener("click", function () {
    const code = (codeInput.value || "").trim().toUpperCase();
    if (!/^[A-Z2-9]{4}$/.test(code)) {
      codeInput.value = "";
      codeInput.placeholder = "4 letters";
      return;
    }
    openRoom(code);
  });
  codeInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); joinBtn.click(); }
  });

  shareBtn.addEventListener("click", function () {
    const text = "Duel me in Bowl Builder! Same blocks, highest stack wins: " + linkInput.value;
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () { /* backed out, fine */ });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        shareBtn.textContent = "✓";
        setTimeout(function () { shareBtn.textContent = "Share"; }, 1200);
      });
    }
  });

  copyBtn.addEventListener("click", function () {
    const done = function () {
      copyBtn.textContent = "✓";
      setTimeout(function () { copyBtn.textContent = "Copy"; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(linkInput.value).then(done, done);
    } else done();
  });

  // Arriving through a shared link joins that room straight away.
  const room = new URLSearchParams(location.search).get("room");
  if (room && /^[A-Z2-9]{4}$/i.test(room)) {
    openRoom(room.toUpperCase());
  }
})();
