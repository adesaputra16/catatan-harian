/* Server backend sederhana untuk Catatan Harian.
   - Menyajikan file statis PWA (index.html, css, js, dll.)
   - Menyediakan REST API yang menyimpan SEMUA data ke data/db.json
   Tanpa dependensi eksternal — cukup Node.js bawaan. */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const pushStore = require('./lib/pushStore');
const { sendPush, getPublicKey } = require('./lib/webpush');
const { computeDueNotifications } = require('./lib/dueReminders');

const PORT     = process.env.PORT || 8080;
const ROOT     = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');
const STORES   = ['notes', 'transactions'];

/* ---------- Penyimpanan JSON ---------- */
let db = { notes: [], transactions: [] };
let writeChain = Promise.resolve();   // serialisasi penulisan agar tidak bentrok

/* ---------- Klien SSE (untuk push server → browser) ---------- */
const clients = new Set();
let selfWriteUntil = 0;   // menandai penulisan oleh server sendiri (hindari broadcast ganda)

function broadcast() {
  const msg = `data: ${JSON.stringify({ t: Date.now() })}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch { /* koneksi tertutup */ }
  }
}

function loadDB() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db.notes        = Array.isArray(raw.notes) ? raw.notes : [];
      db.transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
    } else {
      persist();
    }
  } catch (e) {
    console.error('Gagal memuat db.json, memakai data kosong:', e.message);
  }
}

function persist() {
  selfWriteUntil = Date.now() + 800;  // tandai: perubahan file berikutnya berasal dari kita
  // Tulis berurutan (atomic via file sementara) agar aman dari penulisan bersamaan
  writeChain = writeChain.then(() => new Promise((resolve) => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db, null, 2), (err) => {
      if (err) { console.error('Gagal menyimpan db.json:', err.message); return resolve(); }
      fs.rename(tmp, DB_FILE, (err2) => {
        if (err2) console.error('Gagal rename db.json:', err2.message);
        resolve();
      });
    });
  }));
  return writeChain;
}

/* Upsert dengan last-write-wins berdasarkan updatedAt */
function upsert(store, item) {
  if (!item || !item.id) return false;
  const arr = db[store];
  const idx = arr.findIndex((i) => i.id === item.id);
  if (idx === -1) { arr.push(item); return true; }
  const existing = arr[idx];
  if ((item.updatedAt || 0) >= (existing.updatedAt || 0)) { arr[idx] = item; return true; }
  return false; // versi server lebih baru — pertahankan
}

function removeItem(store, id) {
  const arr = db[store];
  const idx = arr.findIndex((i) => i.id === id);
  if (idx !== -1) { arr.splice(idx, 1); return true; }
  return false;
}

/* ---------- File statis ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Cegah path traversal
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback → index.html
      fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------- Body JSON ---------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 8 * 1024 * 1024) reject(new Error('Payload terlalu besar')); // 8MB
    });
    req.on('end', () => {
      if (!body) return resolve(null);
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/* ---------- Proksi API eksternal (muslim-api tidak mengirim header CORS,
   sehingga fetch langsung dari browser diblokir; server yang mengambilkannya) ---------- */
let dzikirCache   = null;
let dzikirCacheAt = 0;
const DZIKIR_TTL  = 6 * 60 * 60 * 1000; // 6 jam — isi dzikir statis, jarang berubah

function fetchDzikirUpstream() {
  return new Promise((resolve, reject) => {
    https.get('https://muslim-api-three.vercel.app/v1/dzikir', (upstream) => {
      let body = '';
      upstream.on('data', (c) => { body += c; });
      upstream.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function handleDzikirProxy(res) {
  if (dzikirCache && (Date.now() - dzikirCacheAt < DZIKIR_TTL)) {
    return sendJSON(res, 200, dzikirCache);
  }
  try {
    dzikirCache = await fetchDzikirUpstream();
    dzikirCacheAt = Date.now();
    return sendJSON(res, 200, dzikirCache);
  } catch (e) {
    if (dzikirCache) return sendJSON(res, 200, dzikirCache); // stale, tapi lebih baik daripada error
    return sendJSON(res, 502, { error: 'Gagal mengambil data dzikir: ' + e.message });
  }
}

/* ---------- API ---------- */
async function handleAPI(req, res, parts) {
  // parts: ['api', store?, id?]
  const store = parts[1];
  const id    = parts[2] ? decodeURIComponent(parts[2]) : null;

  // GET /api/data → seluruh data
  if (req.method === 'GET' && store === 'data') {
    return sendJSON(res, 200, { notes: db.notes, transactions: db.transactions });
  }

  // GET /api/dzikir → proksi ke muslim-api (hindari blokir CORS di browser)
  if (req.method === 'GET' && store === 'dzikir') {
    return handleDzikirProxy(res);
  }

  // ---- Web Push ----
  if (store === 'push') {
    const action = parts[2];

    if (req.method === 'GET' && action === 'vapid-public-key') {
      const publicKey = getPublicKey();
      if (!publicKey) return sendJSON(res, 500, { error: 'VAPID_PUBLIC_KEY belum diset' });
      return sendJSON(res, 200, { publicKey });
    }

    if (req.method === 'POST' && action === 'subscribe') {
      let body;
      try { body = await readBody(req); } catch { return sendJSON(res, 400, { error: 'JSON tidak valid' }); }
      const { subscription, provinsi, kabkota } = body || {};
      if (!subscription || !subscription.endpoint || !subscription.keys) {
        return sendJSON(res, 400, { error: 'subscription tidak valid' });
      }
      const record = await pushStore.saveSubscription({ endpoint: subscription.endpoint, keys: subscription.keys, provinsi, kabkota });
      return sendJSON(res, 200, { ok: true, id: record.id });
    }

    if (req.method === 'POST' && action === 'unsubscribe') {
      let body;
      try { body = await readBody(req); } catch { return sendJSON(res, 400, { error: 'JSON tidak valid' }); }
      if (!body || !body.endpoint) return sendJSON(res, 400, { error: 'endpoint wajib diisi' });
      await pushStore.removeSubscription(body.endpoint);
      return sendJSON(res, 200, { ok: true });
    }

    return sendJSON(res, 404, { error: 'rute push tidak dikenal' });
  }

  // GET /api/events → kanal SSE (server mendorong notifikasi perubahan)
  if (req.method === 'GET' && store === 'events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* */ } }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return; // koneksi dibiarkan terbuka
  }

  if (!STORES.includes(store)) return sendJSON(res, 404, { error: 'store tidak dikenal' });

  // GET /api/:store
  if (req.method === 'GET' && !id) {
    return sendJSON(res, 200, db[store]);
  }

  // PUT /api/:store/:id  (upsert satu item)
  if (req.method === 'PUT' && id) {
    let item;
    try { item = await readBody(req); } catch { return sendJSON(res, 400, { error: 'JSON tidak valid' }); }
    if (!item || item.id !== id) return sendJSON(res, 400, { error: 'id tidak cocok' });
    upsert(store, item);
    await persist();
    broadcast();
    return sendJSON(res, 200, { ok: true });
  }

  // POST /api/:store  (upsert banyak item sekaligus)
  if (req.method === 'POST' && !id) {
    let items;
    try { items = await readBody(req); } catch { return sendJSON(res, 400, { error: 'JSON tidak valid' }); }
    if (!Array.isArray(items)) return sendJSON(res, 400, { error: 'harus berupa array' });
    items.forEach((it) => upsert(store, it));
    await persist();
    broadcast();
    return sendJSON(res, 200, { ok: true, count: items.length });
  }

  // DELETE /api/:store/:id
  if (req.method === 'DELETE' && id) {
    removeItem(store, id);
    await persist();
    broadcast();
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 405, { error: 'metode tidak diizinkan' });
}

/* ---------- Pantau perubahan file db.json (edit langsung dari luar) ---------- */
function watchDataFile() {
  let timer = null;
  try {
    fs.watch(DATA_DIR, (event, filename) => {
      if (filename && filename !== 'db.json') return;
      // Lewati jika perubahan ini berasal dari penulisan server sendiri
      if (Date.now() < selfWriteUntil) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        loadDB();      // muat ulang dari disk
        broadcast();   // beri tahu semua browser
        console.log('  🔄 db.json berubah dari luar — broadcast ke', clients.size, 'klien');
      }, 150);
    });
  } catch (e) {
    console.warn('Tidak bisa memantau db.json:', e.message);
  }
}

/* ---------- Reminder terjadwal (simulasi cron untuk pengembangan lokal) ---------- */
async function checkDueRemindersLocal() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return; // belum dikonfigurasi
  try {
    const subs = await pushStore.listSubscriptions();
    if (!subs.length) return;
    const scheduleCache = new Map();
    for (const sub of subs) {
      const notifs = await computeDueNotifications(sub, db, scheduleCache);
      for (const n of notifs) {
        const dedupKey = `${sub.id}:${n.tag}`;
        if (await pushStore.wasSent(dedupKey)) continue;
        const ok = await sendPush(sub, { title: n.title, body: n.body, tag: n.tag });
        if (ok) await pushStore.markSent(dedupKey);
      }
    }
  } catch (e) {
    console.error('Gagal cek reminder lokal:', e.message);
  }
}
setInterval(checkDueRemindersLocal, 5 * 60 * 1000);

/* ---------- Server ---------- */
loadDB();
watchDataFile();

const server = http.createServer((req, res) => {
  // CORS (memudahkan jika diakses dari origin berbeda)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const pathname = req.url.split('?')[0];
  const parts = pathname.split('/').filter(Boolean); // hapus string kosong

  if (parts[0] === 'api') {
    handleAPI(req, res, parts).catch((e) => sendJSON(res, 500, { error: e.message }));
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`\n  📔 Catatan Harian berjalan di:  http://localhost:${PORT}`);
  console.log(`  💾 Data tersimpan di:          ${DB_FILE}\n`);
});
