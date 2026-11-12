/*
 * Offline cache for the digital menus.
 *
 * Why: the TVs must keep working when the internet drops, including after a
 * power cut. Everything the page needs is stored on the Pi the first time it
 * loads online. After that:
 *   - code and data files: try the network first (so updates arrive), fall back
 *     to the stored copy when offline.
 *   - images and video: use the stored copy (they only change when renamed).
 * Prices from the Google Sheet are cached separately by app.js (localStorage).
 *
 * Bump CACHE when you change any file under assets/ so Pis fetch the new one.
 */
var CACHE = "slicks-menus-v4";
var SHELL = [
  "./", "index.html", "menu.css", "app.js", "config.js",
  "data/items.csv", "data/sections.csv", "data/specials.csv", "data/settings.csv", "data/seasons.csv",
  "assets/closed-racing.jpeg", "assets/logo-outline.png", "assets/condiments.png", "assets/welcome.png", "assets/facebook-laptop.png",
  "assets/specials/wed.jpg", "assets/specials/thu.jpg", "assets/specials/fri.jpg",
  "assets/videos/pepsi-pour.mp4"
];
// Seasonal videos and overlays are not listed here: the page fetches them ahead of time
// (see warmUp in app.js) and the cache-first rule below keeps them.

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // Add one by one so a single missing file does not block the rest.
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;              // Google Sheet requests go straight through

  var isAsset = url.pathname.indexOf("/assets/") >= 0;
  if (isAsset) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    }));
    return;
  }
  // Code and data: network first, stored copy when offline.
  e.respondWith(fetch(req).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true });
  }));
});
