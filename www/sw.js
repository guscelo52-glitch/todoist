// Rede primeiro; cache só quando estiver offline.
const C = 'pauta-v1';
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'style.css', 'bundle.js', 'icon.png', 'manifest.webmanifest']))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
