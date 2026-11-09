// Offline support: the app shell is cached; food database calls always go to
// the network (and fail gracefully when offline).
const CACHE = 'fuel-log-v14';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/store.js', 'js/sync.js', 'js/garmin.js', 'js/targets.js', 'js/trends.js', 'js/config.js', 'js/nutrients.js', 'js/scanner.js',
  'js/recipes.js', 'js/recipe-ui.js',
  'js/providers/index.js', 'js/providers/openfoodfacts.js', 'js/providers/usda.js',
  'js/providers/restaurants/index.js', 'js/providers/restaurants/provider.js', 'js/providers/restaurants/sample-menus.js',
  'js/providers/restaurants/dominos.js', 'js/providers/restaurants/jurassictacos.js', 'js/providers/restaurants/littlecaesars.js', 'js/providers/restaurants/mobettahs.js',
  'vendor/zxing.min.js', 'vendor/supabase.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first so updates show up, cache as fallback for offline.
  e.respondWith(
    // no-cache: always check with the server, so a phone never mixes a
    // fresh page with older scripts from the browser's HTTP cache.
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
