// Car Log service worker. Lives at /car-log/ and covers every home page under it,
// so the Car Log is a separate app from the maintenance form.
// Network-first: updates show straight away; the saved copy is used only when there is no signal.
// Webhook calls (n8n) are never cached.
const CACHE_VERSION = 'hhl-carlog-v2';
const HOMES = ['aurora', 'cygnus', 'leo', 'lynx', 'lyra', 'orion'];
const SHELL = ['./', './app.js', './app.css', './icon-192.png', './icon-512.png']
  .concat(HOMES.map(function (h) { return './' + h + '/'; }))
  .concat(HOMES.map(function (h) { return './' + h + '/manifest.json'; }));

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('hhl-carlog-') === 0 && k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(function (res) {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE_VERSION).then(function (c) { c.put(event.request, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        // Offline and not cached: fall back to this home's page if we can tell which one.
        const m = url.pathname.match(/\/car-log\/([a-z]+)\//);
        return caches.match(m ? './' + m[1] + '/' : './');
      });
    })
  );
});
