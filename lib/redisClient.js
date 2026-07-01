/* Abstraksi kecil di atas dua kemungkinan backend Redis yang bisa muncul
   dari integrasi Vercel Storage:
   - Upstash REST API (env: KV_REST_API_URL/TOKEN atau UPSTASH_REDIS_REST_URL/TOKEN)
   - Redis biasa via connection string (env: REDIS_URL) — dipakai lewat ioredis
   lib/store.js & lib/pushStore.js tidak perlu peduli mana yang aktif. */

let client = null;
let kind = null; // 'upstash' | 'ioredis'

function getClient() {
  if (client) return client;

  const restUrl   = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl  = process.env.REDIS_URL;

  if (restUrl && restToken) {
    const { Redis } = require('@upstash/redis');
    client = new Redis({ url: restUrl, token: restToken });
    kind = 'upstash';
  } else if (redisUrl) {
    const IORedis = require('ioredis');
    client = new IORedis(redisUrl, { maxRetriesPerRequest: 3 });
    kind = 'ioredis';
  } else {
    throw new Error('Redis belum terkonfigurasi — set env REDIS_URL (atau KV_REST_API_URL & KV_REST_API_TOKEN)');
  }
  return client;
}

function isConfigured() {
  return !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL);
}

// Selalu simpan/baca sebagai JSON string sendiri (tidak bergantung pada
// auto-serialisasi bawaan salah satu klien) agar perilaku kedua backend identik.
async function kvGet(key) {
  const c = getClient();
  const val = await c.get(key);
  if (val == null) return null;
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return val; }
}

async function kvSet(key, value, opts) {
  const c = getClient();
  const payload = JSON.stringify(value);
  if (opts && opts.ex) {
    if (kind === 'ioredis') return c.set(key, payload, 'EX', opts.ex);
    return c.set(key, payload, { ex: opts.ex });
  }
  return c.set(key, payload);
}

async function kvHset(key, field, value) {
  const c = getClient();
  const payload = JSON.stringify(value);
  if (kind === 'ioredis') return c.hset(key, field, payload);
  return c.hset(key, { [field]: payload });
}

async function kvHdel(key, field) {
  return getClient().hdel(key, field);
}

async function kvHgetall(key) {
  const all = await getClient().hgetall(key);
  if (!all) return {};
  const result = {};
  for (const [k, v] of Object.entries(all)) {
    try { result[k] = typeof v === 'string' ? JSON.parse(v) : v; } catch { result[k] = v; }
  }
  return result;
}

module.exports = { isConfigured, kvGet, kvSet, kvHset, kvHdel, kvHgetall };
