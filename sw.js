// Service worker for offline play.
//
// Deliberately conservative about staleness: page loads go to the network
// first so a deploy always lands, and assets are served from cache but
// refreshed in the background. Bump VERSION on release to drop old caches.
const VERSION = "v102";
const CACHE = "pokeworks-" + VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./bowl-builder.html",
  "./placeholder-1.html",
  "./order-up.html",
  "./secret-shopper.html",
  "./shop.html",
  "./word-bowl.html",
  "./menu.css",
  "./styles.css",
  "./theme.css",
  "./order-up.css",
  "./secret-shopper.css",
  "./placeholder-1.css",
  "./theme.js",
  "./sound.js",
  "./streak.js",
  "./transitions.js",
  "./achievements.js",
  "./hub-leaderboard.js",
  "./player-card.js",
  "./backup.js",
  "./facts.js",
  "./share-card.js",
  "./demo.js",
  "./daily.js",
  "./daily-card.js",
  "./points.js",
  "./wordfilter.js",
  "./mail-sync.js",
  "./challenges.js",
  "./boost.js",
  "./track.js",
  "./tour.js",
  "./shop.js",
  "./word-bowl.js",
  "./word-bowl.css",
  "./word-bowl-dict.js",
  "./poke-slice.html",
  "./poke-slice.js",
  "./skins.js",
  "./arcade-sfx.js",
  "./duel.js",
  "./duel-lobby.js",
  "./duel.html",
  "./topping-drop.html",
  "./topping-drop.js",
  "./poke-iq.html",
  "./poke-iq.css",
  "./poke-iq.js",
  "./shift.html",
  "./shift.css",
  "./shift-data.js",
  "./shift-food.js",
  "./shift-3d.js",
  "./shift.js",
  "./back-guard.js",
  "./supabase-config.js",
  "./script.js",
  "./bowl-render.js",
  "./placeholder-1.js",
  "./order-up.js",
  "./secret-shopper.js",
  "./bg-pattern.svg",
  "./sig-bowl-1.avif",
  "./sig-bowl-2.avif",
  "./sig-bowl-3.avif",
  "./sig-bowl-4.avif",
  "./sig-bowl-5.avif",
  "./sig-bowl-6.avif",
  "./sig-bowl-7.avif",
  "./sig-bowl-8.avif",
  "./sig-bowl-9.avif",
  "./pokeworks-logo.png",
  "./pokeworks-logo-circle-1.png",
  "./pokeworks-player-42.webp",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // One bad URL shouldn't fail the whole install.
      Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Leave Supabase (and anything else off-origin) alone — leaderboards should
  // never be served from a stale cache.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
