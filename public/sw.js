const CACHE_NAME = 'ask-aagam-cache-v1';

// 1. Install Event: Cache your static app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Add the core URLs you want to be available offline immediately
      return cache.addAll([
        '/',
        '/manifest.json',
        '/ask-aagam.png',
        // Add offline fallback page if you create one
        // '/offline' 
      ]);
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// 2. Activate Event: Clean up old caches when you update your app
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName!== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache');
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Ensure the service worker takes control of the page immediately
  self.clients.claim();
});

// 3. Fetch Event: Intercept network requests
self.addEventListener('fetch', (event) => {
  // We only want to handle GET requests for our Cache API
  if (event.request.method!== 'GET') return;

  event.respondWith(
    // Cache-First Strategy: Check if it's in the cache first
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not in cache, try fetching from the network
      return fetch(event.request).then((networkResponse) => {
        // Optional: Dynamically cache new static assets as the user browses
        // (Be careful not to dynamically cache massive API JSON responses here; use IndexedDB for that)
        return networkResponse;
      }).catch(() => {
        // If the network fails and it's not in the cache, you can return a custom offline page
        if (event.request.mode === 'navigate') {
          return caches.match('/'); // Or caches.match('/offline')
        }
      });
    })
  );
});