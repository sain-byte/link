const CACHE = 'sainbyte-v1';
const CORE = ['./', './index.html', './page.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('script.google.com')) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return; }
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(cached => {
    const net = fetch(e.request).then(res => { if (res && res.status === 200) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); } return res; }).catch(() => cached);
    return cached || net;
  }));
});
