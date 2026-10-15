const RELEASE = '__BUILD_ID__';
const ASSETS = []; // __ASSETS__
const scope = new URL('./', self.location.href);
const prefix = `compasso-shell:${scope.pathname}:`;
const cacheName = `${prefix}${RELEASE}`;
const urls = ASSETS.map(path => new URL(path, scope).href);

self.addEventListener('install', event => {
  // Installation is atomic: a new worker never takes over with a partial shell.
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(urls)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Ignore search parameters only for known shell files, never arbitrary requests.
  const shellURL = new URL(url.pathname, scope.origin).href;
  if (request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(new URL('index.html', scope).href)).then(response => response || fetch(request)));
  } else if (urls.includes(shellURL)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(shellURL)).then(response => response || fetch(request)));
  }
});
