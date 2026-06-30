/* Service Worker — membuat aplikasi bisa dibuka offline */
const CACHE = 'catatan-harian-v18';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/sync.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
];

// Pasang: simpan aset inti ke cache.
// - add() per-aset (bukan addAll) agar satu aset gagal tidak membatalkan semuanya.
// - { cache: 'reload' } memaksa ambil dari JARINGAN (bypass HTTP cache browser)
//   supaya tidak menyimpan versi file yang basi.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(
        ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
      ))
      .then((results) => {
        const gagal = results.filter((r) => r.status === 'rejected').length;
        if (gagal) console.warn(`SW: ${gagal} aset gagal di-cache`);
      })
      .then(() => self.skipWaiting())
  );
});

// Aktif: hapus cache versi lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Klik notifikasi → fokus ke jendela app yang terbuka, atau buka yang baru
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cl) => {
      for (const c of cl) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

// Ambil data
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Permintaan API (termasuk SSE /api/events): jangan diintervensi service worker
  // agar streaming & data selalu segar dari jaringan.
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  // Navigasi (membuka halaman): coba jaringan dulu, jika gagal pakai index.html dari cache.
  // Ini memastikan halaman SELALU bisa dibuka walau offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('./index.html').then((r) => r || caches.match('./'))
      )
    );
    return;
  }

  // Aset lain (CSS/JS/gambar): cache-first, lalu jaringan (sekaligus simpan salinan).
  // PENTING: jangan pernah fallback ke index.html di sini — mengembalikan HTML
  // untuk permintaan CSS/JS akan merusak halaman (gaya/skrip gagal diterapkan).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});
