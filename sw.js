// Service worker for offline play.
//
// Deliberately conservative about staleness: page loads go to the network
// first so a deploy always lands, and assets are served from cache but
// refreshed in the background. Bump VERSION on release to drop old caches.
const VERSION = "v28";
const CACHE = "pokeworks-" + VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./bowl-builder.html",
  "./placeholder-1.html",
  "./order-up.html",
  "./secret-shopper.html",
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
  "./daily.js",
  "./daily-card.js",
  "./back-guard.js",
  "./supabase-config.js",
  "./script.js",
  "./bowl-render.js",
  "./placeholder-1.js",
  "./order-up.js",
  "./secret-shopper.js",
  "./bg-pattern.svg",
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
