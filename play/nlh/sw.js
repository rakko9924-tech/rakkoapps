/* sw.js — オフライン用 Service Worker。
   初回アクセス時に必要ファイルをキャッシュし、以後はネットワーク無しでも起動可能にする。 */
const CACHE = 'nlh-headsup-v17';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './poker.js',
  './sound.js',
  './ads.js',
  './game.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/ui/trophy.png',
  './icons/ui/rakko.png',
  './sfx/click.m4a',
  './sfx/flip.m4a',
  './sfx/deal.m4a',
  './sfx/check.m4a',
  './sfx/chip.m4a',
  './sfx/chips.m4a',
  './sfx/allin.m4a',
  './sfx/fold.m4a',
  './sfx/win.m4a',
  './sfx/lose.m4a',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// cache-first（オフライン優先）。無ければネットワーク、取得できたらキャッシュ更新。
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // 自分のオリジン以外（広告など）は素通し。キャッシュに載せると広告が固定化し、
  // オフライン時のフォールバックで index.html を返してしまう。
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
