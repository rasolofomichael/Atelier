// Service worker : l'app entière est mise en cache pour fonctionner hors ligne.
// VERSION est remplacée à chaque publication (voir .github/workflows/publier.yml),
// ce qui déclenche l'installation de la nouvelle version.
const VERSION = '__VERSION__';
const CACHE = `atelier-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/app.js',
  'src/store.js',
  'src/format.js',
  'src/kinds.js',
  'src/zip.js',
  'fonts/bricolage-grotesque-normal-latin-3b58e8.woff2',
  'fonts/bricolage-grotesque-normal-latin-ext-10d6a5.woff2',
  'fonts/fonts.css',
  'fonts/jetbrains-mono-normal-latin-b87346.woff2',
  'fonts/jetbrains-mono-normal-latin-ext-9326b4.woff2',
  'fonts/literata-italic-latin-75abf9.woff2',
  'fonts/literata-italic-latin-ext-fbe38f.woff2',
  'fonts/literata-normal-latin-87bf06.woff2',
  'fonts/literata-normal-latin-ext-a94ca9.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('atelier-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// L'app demande d'activer la nouvelle version quand l'utilisateur l'accepte.
self.addEventListener('message', event => {
  if (event.data === 'activer') self.skipWaiting();
});

// Cache d'abord : l'app démarre instantanément, avec ou sans réseau.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = req.mode === 'navigate'
      ? await cache.match('index.html')
      : await cache.match(req, { ignoreSearch: true });
    return hit ?? fetch(req);
  })());
});
