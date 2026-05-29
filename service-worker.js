// Minimal service worker for the HAHL Maintenance form PWA.
// Cache-first for the shell, network-first for the webhook POST (which is never cached).
// Version bump invalidates the cache on next deploy.

const CACHE_VERSION = 'hahl-maintenance-v1';
const SHELL = [
  './',
  './maintenance-form-prototype.html',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);
  // Never cache the webhook POSTs; let them go straight to the network.
  if (event.request.method !== 'GET') return;
  if (url.hostname.endsWith('n8n.cloud') || url.hostname.endsWith('ruthbloch.app.n8n.cloud')) return;
  // Cache-first for the shell.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(event.request, responseClone); });
        }
        return response;
      }).catch(function () { return cached; });
    })
  );
});
