/*
 * Momentum's service worker.
 *
 * Two jobs, and one thing it must never do.
 *
 * It makes the app work offline once installed, and it makes updates
 * visible instead of silent — a stale installed PWA that the user cannot
 * tell is stale is the failure mode this file exists to prevent.
 *
 * What it must never do is touch user data. Everything the user owns lives
 * in IndexedDB, which the worker does not read, write or clear. Activating a
 * new version replaces cached *code*, never a single answer or session.
 */

const REVISION = __REVISION__;
const CACHE = `momentum-${REVISION}`;
const PRECACHE = __PRECACHE__;
const SHELL = __SHELL__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      // Deliberately no skipWaiting: a new version waits until the user
      // accepts it, so a reload never lands mid-interaction.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // One cache per build, so old and new assets can never be mixed.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('momentum-') && name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /*
   * Navigations are served from the cached shell first. Trying the network
   * first would make every offline launch wait for a timeout, and the app is
   * local-first: it has everything it needs without a request succeeding.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(SHELL, { ignoreSearch: true });
        if (cached) return cached;
        try {
          return await fetch(request);
        } catch {
          return new Response('<h1>Momentum</h1><p>Offline.</p>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
