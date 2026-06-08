// Killer Service Worker to clear stale caches and unregister
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // Unregister self
      self.registration.unregister();
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Pass-through without caching anything
  return;
});
