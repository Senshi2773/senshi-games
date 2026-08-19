/* Service Worker: macht das Spiel offline spielbar */
var CACHE = "geisslein-v4";
var DATEIEN = [
  ".",
  "index.html",
  "css/spiel.css",
  "js/spiel.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", function (ereignis) {
  ereignis.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(DATEIEN);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (ereignis) {
  ereignis.waitUntil(
    caches.keys().then(function (namen) {
      return Promise.all(
        namen.filter(function (name) { return name !== CACHE; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (ereignis) {
  if (ereignis.request.method !== "GET") return;
  ereignis.respondWith(
    caches.match(ereignis.request, { ignoreSearch: true }).then(function (antwort) {
      return antwort || fetch(ereignis.request).then(function (netzAntwort) {
        var kopie = netzAntwort.clone();
        caches.open(CACHE).then(function (cache) {
          cache.put(ereignis.request, kopie);
        });
        return netzAntwort;
      });
    })
  );
});
