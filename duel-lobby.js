// Duel lobby: make (or join) a room, wait for the second player over
// Supabase Realtime presence, then send both browsers into Bowl Builder with
// the room code as the shared seed. The game side lives in duel.js.
(function () {
  const SB = window.POKEWORKS_SUPABASE || {};
  const NAME_KEY = "pokeworks-lb-name";
  const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

  const nameInput = document.getElementById("duel-name");
  const actionsEl = document.getElementById("duel-actions");
  const createBtn = document.getElementById("duel-create");
  const roomEl = document.getElementById("duel-room");
  const linkInput = document.getElementById("duel-link");
  const copyBtn = document.getElementById("duel-copy");
  const statusEl = document.getElementById("duel-status");

  try { nameInput.value = localStorage.getItem(NAME_KEY) || ""; } catch (e) { /* ignore */ }

  function myName() {
    let n = (nameInput.value || "").trim().slice(0, 12);
    if (window.PokeFilter) n = PokeFilter.clean(n);
    return n || "Player";
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

  // No presence on this project's realtime, so the handshake is broadcast
  // pings: both sides say hello until they hear each other, then launch.
  let launched = false;
  async function openRoom(code) {
    statusEl.textContent = "Connecting…";
    roomEl.hidden = false;
    actionsEl.hidden = true;
    nameInput.disabled = true;
    linkInput.value = location.origin + location.pathname + "?room=" + code;
    try {
      await lib();
    } catch (e) {
      statusEl.textContent = "Couldn't reach the duel service. Check your connection and reload.";
      return;
    }
    const client = window.supabase.createClient(SB.url, SB.anonKey);
    const myId = Math.floor(Math.random() * 1e9);
    const ch = client.channel("duel-" + code);
    let pinger = 0;
    function launch(oppName) {
      if (launched) return;
      launched = true;
      clearInterval(pinger);
      statusEl.textContent = "Opponent found: " + oppName + ". Starting…";
      setTimeout(function () {
        location.href = "bowl-builder.html?duel=" + code + "&dn=" + encodeURIComponent(myName());
      }, 1500);
    }
    ch.on("broadcast", { event: "hello" }, function (m) {
      if (!m.payload || m.payload.id === myId) return;
      // Answer once so the other side hears us even if our ping just missed.
      ch.send({ type: "broadcast", event: "hello", payload: { id: myId, name: myName() } });
      launch(m.payload.name || "Player");
    });
    ch.subscribe(function (status) {
      if (status === "SUBSCRIBED") {
        statusEl.textContent = "Waiting for an opponent… the link above gets them here.";
        pinger = setInterval(function () {
          ch.send({ type: "broadcast", event: "hello", payload: { id: myId, name: myName() } });
        }, 900);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        statusEl.textContent = "Connection hiccup. Reload to try again.";
      }
    });
  }

  createBtn.addEventListener("click", function () {
    try { localStorage.setItem(NAME_KEY, myName() === "Player" ? "" : myName()); } catch (e) { /* ignore */ }
    openRoom(makeCode());
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
