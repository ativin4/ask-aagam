const CACHE_NAME = 'ask-aagam-cache-v1';
const URLS_TO_CACHE = ["/"];

// --- Lifecycle Events ---

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(URLS_TO_CACHE);
      return self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      // Take control of all pages immediately
      return self.clients.claim();
    })()
  );
});

// --- Helper Functions ---

const putInCache = async (request, response) => {
  // Only cache successful or opaque (cross-origin) responses
  if (response.status === 200 || response.status === 0) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  }
};

const cacheFirst = async ({ request, fallbackUrl }) => {
  // 1. Try to find the resource in the cache
  const responseFromCache = await caches.match(request);
  if (responseFromCache) return responseFromCache;

  // 2. If not in cache, try the network
  try {
    const responseFromNetwork = await fetch(request);
    
    // 3. Save a clone of the network response to the cache
    // This covers your Next.js static files and general GET requests
    putInCache(request, responseFromNetwork.clone());
    
    return responseFromNetwork;
  } catch {
    // 4. If network fails and it's a page navigation, show the fallback (root)
    if (request.mode === 'navigate') {
      const fallbackResponse = await caches.match(fallbackUrl);
      if (fallbackResponse) return fallbackResponse;
    }

    // 5. Generic error response
    return new Response("Network error happened", {
      status: 408,
      headers: { "Content-Type": "text/plain" },
    });
  }
};

// --- Fetch Interceptor ---

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and API calls
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    cacheFirst({
      request,
      fallbackUrl: "/",
    })
  );
});