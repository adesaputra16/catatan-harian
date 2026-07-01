/* Lapisan sinkronisasi DUA ARAH antara IndexedDB lokal dan server backend.

   Model: SERVER adalah sumber kebenaran. IndexedDB lokal = cache dari server
   + perubahan lokal yang belum terkirim (tersimpan di antrian/queue).

   - Tulis lokal (oleh db.js) → diantrikan → di-push ke server. Offline? tetap
     diantrikan, dikirim otomatis saat online.
   - pull(): buat data lokal SAMA PERSIS dengan server (tambah/ubah/HAPUS),
     KECUALI item yang masih menunggu sinkron (dilindungi agar tidak hilang).
   - listen(): kanal SSE — server memberi tahu saat data berubah (dari perangkat
     lain ATAU edit langsung db.json) → browser otomatis pull + render ulang. */
const Sync = (() => {
  const STORES     = ['notes', 'transactions'];
  const API_BASE   = '';                 // origin yang sama dengan server
  const QUEUE_KEY  = 'syncQueue_v1';
  const MIGRATE_KEY = 'syncMigrated_v1';

  let flushing = false;

  /* ---------- antrian offline (localStorage) ---------- */
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  function enqueue(change) {
    const q = loadQueue();
    const filtered = q.filter((c) => !(c.store === change.store && c.id === change.id));
    filtered.push(change);
    saveQueue(filtered);
  }
  function pendingKeys() {
    return new Set(loadQueue().map((c) => c.store + ':' + c.id));
  }

  /* Bandingkan isi dua item secara kanonik (urutan kunci tidak berpengaruh).
     Dipakai agar edit manual di db.json (yang mungkin tak mengubah updatedAt)
     tetap terdeteksi, sementara gema perubahan sendiri (isi sama) diabaikan. */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort()
        .map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }
  function sameItem(a, b) { return canon(a) === canon(b); }

  /* ---------- panggilan HTTP ---------- */
  async function sendPut(store, item) {
    const res = await fetch(`${API_BASE}/api/${store}/${encodeURIComponent(item.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error('PUT gagal: ' + res.status);
  }
  async function sendDelete(store, id) {
    const res = await fetch(`${API_BASE}/api/${store}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('DELETE gagal: ' + res.status);
  }
  function sendChange(change) {
    return change.op === 'delete'
      ? sendDelete(change.store, change.id)
      : sendPut(change.store, change.payload);
  }

  /* ---------- API publik ---------- */

  // Dipanggil db.js setiap ada perubahan lokal
  function queueChange(store, op, payload) {
    enqueue({
      store, op,
      id: op === 'delete' ? payload : payload.id,
      payload: op === 'delete' ? null : payload,
    });
    flush(); // coba kirim segera (fire-and-forget)
  }

  // Kirim semua perubahan tertunda; berhenti jika offline/gagal
  async function flush() {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    try {
      let q = loadQueue();
      while (q.length) {
        try { await sendChange(q[0]); }
        catch { break; } // kemungkinan offline — coba lagi nanti
        q = loadQueue();
        q.shift();
        saveQueue(q);
      }
    } finally {
      flushing = false;
    }
  }

  // Saat pertama pakai server: dorong semua data lokal lama ke antrian sekali saja,
  // agar tidak terhapus oleh pull (yang membuat lokal sama dengan server).
  async function migrateIfNeeded() {
    if (localStorage.getItem(MIGRATE_KEY)) return;
    for (const store of STORES) {
      const items = await DB._raw.getAll(store);
      items.forEach((item) => enqueue({ store, op: 'put', id: item.id, payload: item }));
    }
    localStorage.setItem(MIGRATE_KEY, '1');
  }

  // Tarik data server → buat lokal sama persis (dua arah, termasuk hapus).
  // Mengembalikan daftar perubahan: [{ store, op:'add'|'update'|'delete', item }]
  async function pull() {
    const res = await fetch(`${API_BASE}/api/data`);
    if (!res.ok) throw new Error('pull gagal: ' + res.status);
    const server = await res.json();
    const pending = pendingKeys();
    const changes = [];

    for (const store of STORES) {
      const serverItems = Array.isArray(server[store]) ? server[store] : [];
      const serverMap = new Map(serverItems.map((i) => [i.id, i]));
      const localItems = await DB._raw.getAll(store);
      const localMap = new Map(localItems.map((i) => [i.id, i]));

      // 1) Tambah / perbarui dari server bila ISI berbeda (server = sumber kebenaran).
      //    Bandingkan isi, bukan updatedAt, agar edit manual db.json tetap terdeteksi.
      for (const sItem of serverItems) {
        if (!sItem || !sItem.id) continue;
        if (pending.has(store + ':' + sItem.id)) continue; // ada perubahan lokal tertunda
        const local = localMap.get(sItem.id);
        if (!local || !sameItem(local, sItem)) {
          await DB._raw.put(store, sItem);
          changes.push({ store, op: local ? 'update' : 'add', item: sItem });
        }
      }

      // 2) Hapus item lokal yang sudah tidak ada di server (kecuali yang menunggu sinkron)
      for (const local of localItems) {
        if (serverMap.has(local.id)) continue;
        if (pending.has(store + ':' + local.id)) continue;
        await DB._raw.remove(store, local.id);
        changes.push({ store, op: 'delete', item: local });
      }
    }
    return changes;
  }

  // Sinkron penuh saat mulai: migrasi → kirim antrian → tarik & samakan.
  // Mengembalikan true bila ada perubahan dari server (tanpa memunculkan notifikasi).
  async function init() {
    if (!navigator.onLine) return false;
    try {
      await migrateIfNeeded();
      await flush();
      const changes = await pull();
      return changes.length > 0;
    } catch {
      return false; // server mati/offline — aplikasi tetap jalan dari data lokal
    }
  }

  /* ---------- SSE: server → browser real-time ---------- */
  // Hanya berfungsi di server lokal (server.js). Di Vercel serverless,
  // /api/events tidak ada — EventSource akan gagal berulang, setelah
  // beberapa kali gagal beruntun kita alihkan ke polling biasa.
  let es = null;
  function listen(onChange) {
    const handle = async () => {
      try {
        await flush();                 // kirim dulu yang tertunda
        const changes = await pull();
        if (changes.length && typeof onChange === 'function') onChange(changes);
      } catch { /* abaikan */ }
    };

    let pollTimer = null;
    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(handle, 15000);
    }

    if (typeof EventSource !== 'undefined') {
      try {
        let failures = 0;
        es = new EventSource(`${API_BASE}/api/events`);
        es.onmessage = () => { failures = 0; handle(); };
        es.onerror = () => {
          failures++;
          if (failures >= 3) { es.close(); startPolling(); }
        };
        return;
      } catch { /* jatuh ke polling */ }
    }
    // Fallback bila SSE tak didukung / gagal terus: polling
    startPolling();
  }

  // Sinkron ulang saat koneksi kembali
  window.addEventListener('online', () => { flush(); });

  return { queueChange, flush, pull, init, listen };
})();
window.Sync = Sync;
