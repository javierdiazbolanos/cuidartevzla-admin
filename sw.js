// Cuídarte Venezuela - Self-Destructive Service Worker
// This instantly deletes all existing caches, clears registration, and loads live code.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // Force all open tabs to reload immediately to get the latest update
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          if (client.url && 'navigate' in client) {
            client.navigate(client.url);
          }
        });
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Always fetch directly from network, bypassing any interception
  event.respondWith(fetch(event.request));
});
