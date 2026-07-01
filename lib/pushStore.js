/* Penyimpanan push subscription + penanda "sudah terkirim" (dedup).
   Dua backend: Redis di produksi (Vercel — lihat redisClient.js), file JSON
   lokal saat dikembangkan di localhost — supaya push bisa ditest tanpa
   perlu akun cloud. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isConfigured, kvGet, kvSet, kvHset, kvHdel, kvHgetall } = require('./redisClient');

function subId(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);
}

/* ---------- backend lokal (file JSON) ---------- */
const SUBS_FILE = path.join(__dirname, '..', 'data', 'push-subs.json');
const sentMemory = new Map(); // dedup notifikasi mode lokal — cukup in-memory

function localReadSubs() {
  try { return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); } catch { return {}; }
}
function localWriteSubs(subs) {
  const dir = path.dirname(SUBS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

/* ---------- API publik ---------- */
async function saveSubscription(sub) {
  const id = subId(sub.endpoint);
  const record = {
    id, endpoint: sub.endpoint, keys: sub.keys,
    provinsi: sub.provinsi || '', kabkota: sub.kabkota || '',
    updatedAt: Date.now(),
  };
  if (isConfigured()) {
    await kvHset('push:subs', id, record);
  } else {
    const subs = localReadSubs();
    subs[id] = record;
    localWriteSubs(subs);
  }
  return record;
}

async function removeSubscription(endpoint) {
  const id = subId(endpoint);
  if (isConfigured()) {
    await kvHdel('push:subs', id);
  } else {
    const subs = localReadSubs();
    delete subs[id];
    localWriteSubs(subs);
  }
}

async function listSubscriptions() {
  if (isConfigured()) {
    const all = await kvHgetall('push:subs');
    return Object.values(all);
  }
  return Object.values(localReadSubs());
}

// Dedup: satu reminder (kunci = subscription id + tanggal + jenis) hanya boleh
// terkirim sekali. TTL 26 jam di Redis supaya penanda lama otomatis terhapus.
async function wasSent(key) {
  if (isConfigured()) return !!(await kvGet(`push:sent:${key}`));
  return sentMemory.has(key);
}

async function markSent(key) {
  if (isConfigured()) {
    await kvSet(`push:sent:${key}`, '1', { ex: 26 * 60 * 60 });
  } else {
    sentMemory.set(key, Date.now());
  }
}

module.exports = { saveSubscription, removeSubscription, listSubscriptions, wasSent, markSent, subId };
