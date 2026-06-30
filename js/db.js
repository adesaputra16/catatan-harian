/* Lapisan penyimpanan lokal menggunakan IndexedDB.
   Data tersimpan di perangkat (offline-first), lalu disinkronkan ke server
   oleh js/sync.js. Operasi "raw" menulis ke IndexedDB TANPA memicu sinkron
   (dipakai saat menarik data dari server agar tidak terjadi loop). */
const DB = (() => {
  const DB_NAME = 'catatan-harian';
  const VERSION = 2;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('notes')) {
          const s = db.createObjectStore('notes', { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('transactions')) {
          const s = db.createObjectStore('transactions', { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function storeOf(name, mode) {
    return open().then((db) => db.transaction(name, mode).objectStore(name));
  }

  /* ---------- operasi mentah (tanpa sinkron) ---------- */
  async function rawGetAll(store) {
    const s = await storeOf(store, 'readonly');
    return new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () =>
        resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }
  async function rawPut(store, item) {
    const s = await storeOf(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = s.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  }
  async function rawRemove(store, id) {
    const s = await storeOf(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = s.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  async function rawBulkPut(store, items) {
    const s = await storeOf(store, 'readwrite');
    return new Promise((resolve, reject) => {
      let pending = items.length;
      if (!pending) return resolve();
      items.forEach((item) => {
        const req = s.put(item);
        req.onsuccess = () => { if (--pending === 0) resolve(); };
        req.onerror = () => reject(req.error);
      });
    });
  }

  /* Beritahu lapisan sinkron bahwa ada perubahan lokal */
  function notify(store, op, payload) {
    if (window.Sync && typeof window.Sync.queueChange === 'function') {
      window.Sync.queueChange(store, op, payload);
    }
  }

  /* ---------- API publik (memicu sinkron) ---------- */
  function makeAPI(store) {
    return {
      getAll: () => rawGetAll(store),
      async put(item) {
        await rawPut(store, item);
        notify(store, 'put', item);
        return item;
      },
      async remove(id) {
        await rawRemove(store, id);
        notify(store, 'delete', id);
      },
      async bulkPut(items) {
        await rawBulkPut(store, items);
        items.forEach((i) => notify(store, 'put', i));
      },
    };
  }

  const notesAPI        = makeAPI('notes');
  const transactionsAPI = makeAPI('transactions');

  return {
    // API catatan (kompatibel dengan kode lama)
    getAll:  notesAPI.getAll,
    put:     notesAPI.put,
    remove:  notesAPI.remove,
    bulkPut: notesAPI.bulkPut,

    // API keuangan
    Transactions: transactionsAPI,

    // Akses mentah untuk lapisan sinkron (tanpa memicu sinkron balik)
    _raw: { getAll: rawGetAll, put: rawPut, remove: rawRemove, bulkPut: rawBulkPut },
  };
})();
