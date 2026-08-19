// Tiny shared synth for the arcade games (Topping Drop, Poke IQ, Poke
// Slice). Everything is generated — no audio files — and the context runs
// through sound.js's master-gain patch like every other game's audio.
// First call must come after a user gesture, which the Start tap provides.
(function () {
  let ctx = null;

  function ac() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) { /* ignore */ } }
    return ctx;
  }

  // One oscillator note with a quick attack and exponential tail.
  function tone(freq, dur, type, vol, slideTo, delay) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // A burst of filtered noise (swishes and booms).
  function noise(dur, vol, filterType, freqFrom, freqTo, delay) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = filterType || "bandpass";
    f.frequency.setValueAtTime(freqFrom, t0);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t0 + dur);
    f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(t0);
  }

  window.ArcadeSfx = {
    // caught / sorted something good
    pop: function () { tone(620, 0.1, "sine", 0.22, 880); },
    // streak bonus, heart pickup
    chime: function () { tone(880, 0.09, "sine", 0.18); tone(1318, 0.14, "sine", 0.18, null, 0.07); },
    // wrong tub, bad catch, dropped food
    thunk: function () { tone(150, 0.14, "square", 0.2, 82); },
    // blade through a fish
    swish: function () { noise(0.13, 0.22, "bandpass", 1600, 5200); },
    // dynamite
    boom: function () {
      noise(0.5, 0.45, "lowpass", 900, 90);
      tone(95, 0.42, "sine", 0.42, 38);
    },
    // countdown
    tick: function () { tone(540, 0.06, "square", 0.12); },
    go: function () { tone(1080, 0.18, "square", 0.16); },
    // run over
    over: function () {
      tone(392, 0.14, "triangle", 0.2);
      tone(311, 0.14, "triangle", 0.2, null, 0.13);
      tone(262, 0.24, "triangle", 0.2, null, 0.26);
    },
    // a new personal best: rising major arpeggio
    best: function () {
      tone(523, 0.1, "triangle", 0.2);
      tone(659, 0.1, "triangle", 0.2, null, 0.09);
      tone(784, 0.22, "triangle", 0.22, null, 0.18);
      tone(1046, 0.3, "sine", 0.16, null, 0.28);
    },
    // daily challenge finished: a short settled jingle
    jingle: function () {
      tone(659, 0.12, "sine", 0.18);
      tone(784, 0.12, "sine", 0.18, null, 0.11);
      tone(659, 0.1, "sine", 0.14, null, 0.22);
      tone(880, 0.32, "sine", 0.18, null, 0.32);
    },
  };
})();
