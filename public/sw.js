const CACHE_VERSION = 'v5';
const APP_CACHE = `ask-aagam-app-${CACHE_VERSION}`;
const STATIC_CACHE = `ask-aagam-static-${CACHE_VERSION}`;

const APP_SHELL = ['/', '/offline.html'];

// ── Install: precache app shell + offline fallback ────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches, claim clients ─────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.status === 200 || response.status === 0) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);

  // Fire network request regardless — update cache in background
  const networkPromise = fetch(request).then((response) => {
    if (response.status === 200) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) {
    networkPromise.catch(() => {}); // suppress unhandled rejection
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;

  // Navigate requests get the offline page; other requests get plain 503
  if (request.mode === 'navigate') {
    const offline = await cache.match('/offline.html');
    if (offline) return offline;
  }

  return new Response('You are offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

// Network-first for navigation — page HTML always fresh, fallback to cache when offline
async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.status === 200) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await cache.match('/offline.html');
    if (offline) return offline;
    return new Response('You are offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

// ── Fetch: route by request type ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // API — always network, never cache
  if (url.pathname.startsWith('/api/')) return;

  // Next.js static chunks — immutable (content-hashed), cache forever
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Next.js image optimizer — cache first
  if (url.pathname.startsWith('/_next/image')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // External resources (fonts, CDN) — cache first
  if (url.origin !== self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Page navigations — network-first so HTML is always up to date
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Public assets (icons, manifest) — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ── Background Sync: retry failed non-chat requests ──────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'retry-failed') {
    event.waitUntil(
      // Clients handle their own retry logic; SW just notifies them
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SYNC_RETRY' }));
      })
    );
  }
});

// ── Message: skip waiting on demand (triggered by update banner) ──────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
