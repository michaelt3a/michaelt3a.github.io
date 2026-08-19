// A shareable result card: the daily score drawn onto a small image and
// handed to the share sheet as a picture. Falls back to plain text when the
// device can't share files.
(function () {
  const LOGO_SRC = "pokeworks-logo-circle-1.png";

  function draw(opts, logo) {
    const W = 800, H = 420;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    // night sky with a fixed scatter of stars
    ctx.fillStyle = "#0a1010";
    ctx.fillRect(0, 0, W, H);
    let s = 12345;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = 0.25 + rnd() * 0.6;
      ctx.fillStyle = rnd() < 0.3 ? "#ffd15a" : "#f4ede3";
      ctx.beginPath();
      ctx.arc(rnd() * W, rnd() * H, rnd() < 0.85 ? 1.3 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (logo) ctx.drawImage(logo, W / 2 - 44, 34, 88, 88);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f4ede3";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillText("Daily Challenge", W / 2, 168);
    ctx.font = "800 40px system-ui, sans-serif";
    ctx.fillText(opts.game, W / 2, 216);
    ctx.fillStyle = "#ffd15a";
    ctx.font = "800 76px system-ui, sans-serif";
    ctx.fillText(opts.score, W / 2, 302);
    ctx.fillStyle = "#8a9a9a";
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillText(opts.date + " · michaelt3a.github.io", W / 2, 368);
    return cv;
  }

  // Old-school copy for browsers that block the async clipboard.
  function legacyCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  // Resolves true when a share sheet opened, "copied" when the text fell
  // back to the clipboard, false when nothing worked.
  function share(opts) {
    const text = "Pokeworks Daily · " + opts.game + " · " + opts.score + " · " + (opts.url || location.origin);
    const tryImage = (cv) => new Promise((resolve) => {
      if (!cv) { resolve(false); return; }
      cv.toBlob((blob) => {
        if (!blob) { resolve(false); return; }
        const file = new File([blob], "pokeworks-daily.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: text }).then(() => resolve(true), () => resolve(true));
        } else {
          resolve(false);
        }
      }, "image/png");
    });
    return new Promise((resolve) => {
      const go = (logo) => {
        tryImage(draw(opts, logo)).then((ok) => {
          if (ok) { resolve(true); return; }
          if (navigator.share) {
            navigator.share({ text: text }).then(() => resolve(true), () => resolve(true));
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
              () => resolve("copied"),
              () => resolve(legacyCopy(text) ? "copied" : false)
            );
          } else {
            resolve(legacyCopy(text) ? "copied" : false);
          }
        });
      };
      const img = new Image();
      img.onload = () => go(img);
      img.onerror = () => go(null);
      img.src = LOGO_SRC;
    });
  }

  window.PokeShareCard = { share: share };
})();
