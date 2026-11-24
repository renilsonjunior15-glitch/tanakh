// Service worker: deixa o app funcionando offline.
const VERSION = 'tanakh-v3';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'daily.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];
const DATA = 'tanakh-data'; // textos bíblicos e léxico (não mudam)
const FONTS = 'tanakh-fonts';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('tanakh-v') && k !== VERSION).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function shellFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'bolls.life') {
    if (url.pathname.startsWith('/v2/find')) return; // busca sempre online
    e.respondWith(cacheFirst(req, DATA));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONTS));
  } else if (url.origin === self.location.origin) {
    e.respondWith(shellFirst(req));
  }
});
