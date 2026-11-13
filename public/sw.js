// Minimal service worker for the technician app: keeps the last loaded /tech screens and the
// static assets available when the device is offline. Data changes go through the offline queue.
const CACHE = 'aiec-tech-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isStatic = url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg' || url.pathname === '/manifest.webmanifest';
  const isTechPage = request.mode === 'navigate' && url.pathname.startsWith('/tech');
  if (isStatic) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
      return response;
    })));
  } else if (isTechPage) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && !response.redirected) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
      }
      return response;
    }).catch(() => caches.match(url.pathname).then((hit) => hit || caches.match('/tech'))));
  }
});
