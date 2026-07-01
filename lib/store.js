/* Penyimpanan notes/transactions untuk endpoint serverless (/api/*).
   Backend: Redis (Upstash REST atau REDIS_URL biasa, lihat redisClient.js).
   Setiap request membaca & menulis langsung ke Redis karena serverless
   function tidak punya memori yang bertahan antar invocation. */
const { isConfigured, kvGet, kvSet } = require('./redisClient');

const STORES = ['notes', 'transactions'];

async function loadDB() {
  if (!isConfigured()) {
    throw new Error('Redis belum terkonfigurasi — set env REDIS_URL (atau KV_REST_API_URL & KV_REST_API_TOKEN)');
  }
  const [notes, transactions] = await Promise.all([
    kvGet('db:notes'),
    kvGet('db:transactions'),
  ]);
  return {
    notes: Array.isArray(notes) ? notes : [],
    transactions: Array.isArray(transactions) ? transactions : [],
  };
}

async function saveDB(db) {
  await Promise.all([
    kvSet('db:notes', db.notes),
    kvSet('db:transactions', db.transactions),
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
