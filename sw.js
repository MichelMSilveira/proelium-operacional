const CACHE = 'proelium-shell-v402';
const ASSETS = ['./','./index.html','./styles.css','./crm.css','./bi.css','./quotes.css','./danger.css','./app.js','./commercial-workflow.js','./technical-dimensioning.js','./technical-compatibility.js','./manifest.webmanifest','./icon.svg','./assets/proelium-logo-oficial.png','./assets/proelium-simbolo-oficial.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html'))));
});
