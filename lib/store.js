/* Penyimpanan notes/transactions untuk endpoint serverless (/api/*).
   Backend: Upstash Redis (via Vercel Marketplace / KV). Setiap request
   membaca & menulis langsung ke Redis karena serverless function tidak
   punya memori yang bertahan antar invocation. */
const { Redis } = require('@upstash/redis');

const STORES = ['notes', 'transactions'];

let redis = null;
function getRedis() {
  if (!redis) {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('Redis belum terkonfigurasi — set env KV_REST_API_URL & KV_REST_API_TOKEN (Vercel Marketplace: Upstash Redis)');
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

async function loadDB() {
  const kv = getRedis();
  const [notes, transactions] = await Promise.all([
    kv.get('db:notes'),
    kv.get('db:transactions'),
  ]);
  return {
    notes: Array.isArray(notes) ? notes : [],
    transactions: Array.isArray(transactions) ? transactions : [],
  };
}

async function saveDB(db) {
  const kv = getRedis();
  await Promise.all([
    kv.set('db:notes', db.notes),
    kv.set('db:transactions', db.transactions),
  ]);
}

/* Upsert dengan last-write-wins berdasarkan updatedAt */
function upsert(db, store, item) {
  if (!item || !item.id) return false;
  const arr = db[store];
  const idx = arr.findIndex((i) => i.id === item.id);
  if (idx === -1) { arr.push(item); return true; }
  const existing = arr[idx];
  if ((item.updatedAt || 0) >= (existing.updatedAt || 0)) { arr[idx] = item; return true; }
  return false;
}

function removeItem(db, store, id) {
  const arr = db[store];
  const idx = arr.findIndex((i) => i.id === id);
  if (idx !== -1) { arr.splice(idx, 1); return true; }
  return false;
}

module.exports = { STORES, loadDB, saveDB, upsert, removeItem };
