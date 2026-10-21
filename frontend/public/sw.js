const CACHE_NAME = 'arecasmart-cache-v3';
const CACHE_PREFIX = 'arecasmart-cache-';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install the new worker immediately and keep an offline entry point available.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)),
  );
  self.skipWaiting();
});

// Activate the new worker immediately and remove outdated app caches.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Always fetch app navigations from the deployment first so new builds use current hashes.
self.addEventListener('fetch', (event) => {
  const requestPath = new URL(event.request.url).pathname;
  if (event.request.mode === 'navigate' || requestPath === '/index.html') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/index.html', response.clone());
          }
          return response;
        } catch {
          const cachedEntryPoint = await caches.match('/index.html');
          return cachedEntryPoint || new Response(
            'The app is offline and no cached entry point is available.',
            { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
          );
        }
      })(),
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});