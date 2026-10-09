// Offline cache for the app shell. Bump VERSION on every release.
const VERSION = 'ccs-v1';
const SHELL = ['./', 'index.html', 'style.css', 'sudoku.js', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first for our own files so updates land; cache fallback when offline.
// Fonts are cache first.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.host.includes('fonts.g')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
