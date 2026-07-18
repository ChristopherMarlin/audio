const CACHE_NAME = 'marlin-mobile-v1';
const APP_SHELL = [
  '/mobile/',
  '/mobile/index.html',
  '/mobile/css/mobile.css',
  '/mobile/js/mobile.js',
  '/mobile/manifest.json',
  '/css/style.css',
  '/js/api.js',
  '/js/calendar.js',
  '/favicon.svg',
  '/images/logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Availability/booking data must always be live - never served from cache.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
