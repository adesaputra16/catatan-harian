/* Penyimpanan push subscription + penanda "sudah terkirim" (dedup).
   Dua backend: Upstash Redis di produksi (Vercel), file JSON lokal saat
   dikembangkan di localhost — supaya push bisa ditest tanpa perlu akun cloud. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const useKV = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);

let redis = null;
function getRedis() {
  if (!redis) {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

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
  if (useKV) {
    await getRedis().hset('push:subs', { [id]: JSON.stringify(record) });
  } else {
    const subs = localReadSubs();
    subs[id] = record;
    localWriteSubs(subs);
  }
  return record;
}

async function removeSubscription(endpoint) {
  const id = subId(endpoint);
  if (useKV) {
    await getRedis().hdel('push:subs', id);
  } else {
    const subs = localReadSubs();
    delete subs[id];
    localWriteSubs(subs);
  }
}

async function listSubscriptions() {
  if (useKV) {
    const all = await getRedis().hgetall('push:subs');
    if (!all) return [];
    return Object.values(all).map((v) => (typeof v === 'string' ? JSON.parse(v) : v));
  }
  return Object.values(localReadSubs());
}

// Dedup: satu reminder (kunci = subscription id + tanggal + jenis) hanya boleh
// terkirim sekali. TTL 26 jam di Redis supaya penanda lama otomatis terhapus.
async function wasSent(key) {
  if (useKV) return !!(await getRedis().get(`push:sent:${key}`));
  return sentMemory.has(key);
}

async function markSent(key) {
  if (useKV) {
    await getRedis().set(`push:sent:${key}`, '1', { ex: 26 * 60 * 60 });
  } else {
    sentMemory.set(key, Date.now());
  }
}

module.exports = { saveSubscription, removeSubscription, listSubscriptions, wasSent, markSent, subId };
