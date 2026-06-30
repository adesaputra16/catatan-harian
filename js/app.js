/* Logika aplikasi Catatan Harian */
(() => {
  'use strict';

  // ---- Elemen ----
  const $ = (id) => document.getElementById(id);
  const notesList = $('notesList');
  const emptyState = $('emptyState');
  const searchInput = $('searchInput');
  const editor = $('editor');
  const titleInput = $('titleInput');
  const bodyInput = $('bodyInput');
  const editorDate = $('editorDate');
  const moodPicker = $('moodPicker');
  const deleteBtn = $('deleteBtn');
  const toast = $('toast');

  // ---- State ----
  let notes = [];
  let editingId = null;
  let selectedMood = '';
  let searchTerm = '';
  let editingImages = [];   // base64[] foto di sesi edit aktif
  let btDevice = null;       // perangkat Bluetooth yang sedang terhubung

  // ---- State: Keuangan ----
  let transactions = [];
  let finEditingId = null;
  let finSelectedType = 'expense';
  let finSelectedCategory = '';
  let finPeriod = 'month';

  const FIN_CATS = {
    income: [
      { key: 'salary',       label: '💼 Gaji' },
      { key: 'freelance',    label: '💻 Freelance' },
      { key: 'business',     label: '🏪 Bisnis' },
      { key: 'bonus',        label: '🎁 Bonus' },
      { key: 'transfer-in',  label: '📲 Transfer Masuk' },
      { key: 'investment',   label: '📈 Investasi' },
      { key: 'other',        label: '✨ Lainnya' },
    ],
    expense: [
      { key: 'food',          label: '🍜 Makan & Minum' },
      { key: 'transport',     label: '🚗 Transport' },
      { key: 'shopping',      label: '🛍 Belanja' },
      { key: 'bills',         label: '📱 Tagihan' },
      { key: 'entertainment', label: '🎮 Hiburan' },
      { key: 'health',        label: '❤️ Kesehatan' },
      { key: 'education',     label: '📚 Pendidikan' },
      { key: 'transfer-out',  label: '💸 Transfer Keluar' },
      { key: 'other',         label: '✨ Lainnya' },
    ],
  };

  // ---- Util ----
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Warna aksen berdasarkan mood
  const MOOD_COLORS = {
    '😀': '#f5a623', '🙂': '#5bbd6a', '😐': '#9aa3ab',
    '😔': '#5c6bc0', '😡': '#ef5350', '😴': '#7e57c2', '🥳': '#ec407a',
  };

  const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function fmtDateLong(ts) {
    const d = new Date(ts);
    return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  function fmtDateKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }
  function fmtGroupLabel(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    if (fmtDateKey(ts) === fmtDateKey(today)) return 'Hari ini';
    if (fmtDateKey(ts) === fmtDateKey(yest)) return 'Kemarin';
    return fmtDateLong(ts);
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
  }

  // ---- Render ----
  function render() {
    const term = searchTerm.trim().toLowerCase();
    const filtered = term
      ? notes.filter((n) =>
          (n.title || '').toLowerCase().includes(term) ||
          (n.body || '').toLowerCase().includes(term))
      : notes;

    notesList.innerHTML = '';

    if (!filtered.length) {
      emptyState.hidden = false;
      if (term) {
        emptyState.querySelector('.empty__title').textContent = 'Tidak ditemukan';
        emptyState.querySelector('.empty__sub').textContent = `Tidak ada catatan yang cocok dengan "${searchTerm}".`;
        emptyState.querySelector('.empty__art').textContent = '🔍';
      } else {
        emptyState.querySelector('.empty__title').textContent = 'Belum ada catatan';
        emptyState.querySelector('.empty__sub').textContent = 'Ketuk tombol + untuk menulis catatan pertamamu hari ini.';
        emptyState.querySelector('.empty__art').textContent = '🪶';
      }
      return;
    }
    emptyState.hidden = true;

    // Kelompokkan per tanggal
    const groups = new Map();
    for (const n of filtered) {
      const key = fmtDateKey(n.createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    }

    for (const [, items] of groups) {
      const group = document.createElement('section');
      group.className = 'date-group';

      const label = document.createElement('div');
      label.className = 'date-group__label';
      label.textContent = fmtGroupLabel(items[0].createdAt);
      group.appendChild(label);

      const wrap = document.createElement('div');
      wrap.className = 'date-group__notes';

      for (const n of items) {
        wrap.appendChild(noteCard(n));
      }
      group.appendChild(wrap);
      notesList.appendChild(group);
    }
  }

  function noteCard(n) {
    const card = document.createElement('article');
    card.className = 'note-card';
    if (n.mood && MOOD_COLORS[n.mood]) card.style.setProperty('--accent', MOOD_COLORS[n.mood]);

    const head = document.createElement('div');
    head.className = 'note-card__head';

    if (n.mood) {
      const mood = document.createElement('span');
      mood.className = 'note-card__mood';
      mood.textContent = n.mood;
      head.appendChild(mood);
    }

    const title = document.createElement('span');
    title.className = 'note-card__title';
    title.textContent = n.title || '(Tanpa judul)';
    head.appendChild(title);

    const time = document.createElement('span');
    time.className = 'note-card__time';
    time.textContent = fmtTime(n.createdAt);
    head.appendChild(time);

    card.appendChild(head);

    if (n.body) {
      const body = document.createElement('p');
      body.className = 'note-card__body';
      body.textContent = n.body;
      card.appendChild(body);
    }

    if (n.images && n.images.length) {
      const strip = document.createElement('div');
      strip.className = 'note-card__images';
      n.images.forEach((src) => {
        const img = document.createElement('img');
        img.className = 'note-card__img';
        img.src = src; img.alt = '';
        strip.appendChild(img);
      });
      card.appendChild(strip);
    }

    card.addEventListener('click', () => openEditor(n));
    return card;
  }

  // ---- Editor ----
  function openEditor(note) {
    editingId = note ? note.id : null;
    selectedMood = note ? (note.mood || '') : '';
    titleInput.value = note ? (note.title || '') : '';
    bodyInput.value = note ? (note.body || '') : '';
    editorDate.textContent = fmtDateLong(note ? note.createdAt : Date.now());
    deleteBtn.hidden = !note;
    editingImages = note ? [...(note.images || [])] : [];

    [...moodPicker.children].forEach((b) =>
      b.classList.toggle('selected', b.dataset.mood === selectedMood));

    renderImagePreview();
    editor.hidden = false;
    setTimeout(() => bodyInput.focus(), 100);
  }

  function closeEditor() {
    editor.hidden = true;
    editingId = null;
    editingImages = [];
  }

  async function saveNote() {
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();

    if (!title && !body && !selectedMood && !editingImages.length) {
      closeEditor();
      return;
    }

    if (editingId) {
      const existing = notes.find((n) => n.id === editingId);
      const updated = { ...existing, title, body, mood: selectedMood, images: editingImages, updatedAt: Date.now() };
      await DB.put(updated);
    } else {
      const now = Date.now();
      await DB.put({ id: uid(), title, body, mood: selectedMood, images: editingImages, createdAt: now, updatedAt: now });
    }

    await reload();
    closeEditor();
    showToast(editingId ? 'Catatan diperbarui ✏️' : 'Catatan tersimpan ✓');
  }

  async function deleteNote() {
    if (!editingId) return;
    if (!confirm('Hapus catatan ini? Tindakan ini tidak bisa dibatalkan.')) return;
    await DB.remove(editingId);
    await reload();
    closeEditor();
    showToast('Catatan dihapus 🗑️');
  }

  // ---- Data ----
  async function reload() {
    notes = await DB.getAll();
    render();
  }

  // ---- Kamera & Foto ----
  function compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 960;
          let { width: w, height: h } = img;
          if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
          else if (h >= w && h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderImagePreview() {
    const container = $('imagePreview');
    container.innerHTML = '';
    editingImages.forEach((src, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'img-thumb';
      const img = document.createElement('img');
      img.src = src; img.alt = '';
      const rm = document.createElement('button');
      rm.className = 'img-thumb__rm';
      rm.textContent = '✕';
      rm.type = 'button';
      rm.title = 'Hapus foto';
      rm.addEventListener('click', () => { editingImages.splice(i, 1); renderImagePreview(); });
      wrap.appendChild(img);
      wrap.appendChild(rm);
      container.appendChild(wrap);
    });
    const cameraBtn = $('cameraBtn');
    if (cameraBtn) cameraBtn.classList.toggle('limit', editingImages.length >= 3);
  }

  // ---- Ekspor / Impor (catatan + keuangan) ----
  async function exportData() {
    const allNotes = await DB.getAll();
    const allTrx   = await DB.Transactions.getAll();
    if (!allNotes.length && !allTrx.length) {
      showToast('Belum ada data untuk diekspor'); return;
    }
    const payload = {
      app: 'catatan-harian',
      version: 2,
      exportedAt: Date.now(),
      notes: allNotes,
      transactions: allTrx,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `catatan-harian-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data diekspor 📤');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);

        let importedNotes = [];
        let importedTrx   = [];
        if (Array.isArray(data)) {
          // Format lama: hanya array catatan
          importedNotes = data;
        } else if (data && typeof data === 'object') {
          importedNotes = Array.isArray(data.notes) ? data.notes : [];
          importedTrx   = Array.isArray(data.transactions) ? data.transactions : [];
        } else {
          throw new Error('Format tidak valid');
        }

        const validNotes = importedNotes.filter((n) => n && n.id && n.createdAt);
        const validTrx   = importedTrx.filter((t) =>
          t && t.id && t.createdAt &&
          (t.type === 'income' || t.type === 'expense') &&
          typeof t.amount === 'number');

        if (!validNotes.length && !validTrx.length) {
          showToast('Tidak ada data yang bisa diimpor'); return;
        }

        await DB.bulkPut(validNotes);
        await DB.Transactions.bulkPut(validTrx);
        await reload();
        await reloadTransactions();

        const parts = [];
        if (validNotes.length) parts.push(`${validNotes.length} catatan`);
        if (validTrx.length)   parts.push(`${validTrx.length} transaksi`);
        showToast(`${parts.join(' & ')} diimpor 📥`);
      } catch (e) {
        showToast('Gagal mengimpor: file tidak valid');
      }
    };
    reader.readAsText(file);
  }

  // ---- Tema ----
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#100e16' : '#6d4ec7');
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // ---- Status online/offline ----
  function updateOnline() {
    const bar = $('offlineBar');
    if (bar) bar.hidden = navigator.onLine;
  }

  // ---- Jadwal Shalat ----
  const SHALAT_API = 'https://equran.id/api/v2/shalat';
  const SHALAT_CACHE = 'shalat_cache_v1';

  const PRAYER_ICONS  = { imsak:'🌅', subuh:'🌄', dzuhur:'☀️', ashar:'🌤️', maghrib:'🌇', isya:'🌙' };
  const PRAYER_LABELS = { imsak:'Imsak', subuh:'Subuh', dzuhur:'Dzuhur', ashar:'Ashar', maghrib:'Maghrib', isya:'Isya' };
  const PRAYER_KEYS   = ['imsak', 'subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];

  let shalatProvinsiList   = [];
  let shalatData           = null;
  let shalatSelProvinsi    = '';
  let shalatSelKabkota     = '';
  let shalatBulan          = new Date().getMonth() + 1;
  let shalatTahun          = new Date().getFullYear();
  let shalatCountdownTimer = null;
  let shalatGpsRunning     = false;

  /* ---- GPS reverse-geocoding ---- */

  // Tabel fallback nama provinsi Bahasa Inggris → Indonesia
  const PROV_EN_ID = {
    'aceh': 'Aceh', 'bali': 'Bali', 'banten': 'Banten', 'bengkulu': 'Bengkulu',
    'yogyakarta': 'D.I. Yogyakarta', 'special region of yogyakarta': 'D.I. Yogyakarta',
    'daerah istimewa yogyakarta': 'D.I. Yogyakarta',
    'jakarta': 'DKI Jakarta', 'dki jakarta': 'DKI Jakarta',
    'daerah khusus ibukota jakarta': 'DKI Jakarta',
    'gorontalo': 'Gorontalo', 'jambi': 'Jambi',
    'west java': 'Jawa Barat', 'jawa barat': 'Jawa Barat',
    'central java': 'Jawa Tengah', 'jawa tengah': 'Jawa Tengah',
    'east java': 'Jawa Timur', 'jawa timur': 'Jawa Timur',
    'west kalimantan': 'Kalimantan Barat', 'south kalimantan': 'Kalimantan Selatan',
    'central kalimantan': 'Kalimantan Tengah', 'east kalimantan': 'Kalimantan Timur',
    'north kalimantan': 'Kalimantan Utara',
    'bangka belitung islands': 'Kepulauan Bangka Belitung',
    'bangka belitung': 'Kepulauan Bangka Belitung',
    'riau islands': 'Kepulauan Riau', 'kepulauan riau': 'Kepulauan Riau',
    'lampung': 'Lampung', 'maluku': 'Maluku',
    'north maluku': 'Maluku Utara', 'maluku utara': 'Maluku Utara',
    'west nusa tenggara': 'Nusa Tenggara Barat', 'east nusa tenggara': 'Nusa Tenggara Timur',
    'papua': 'Papua', 'west papua': 'Papua Barat', 'papua barat': 'Papua Barat',
    'riau': 'Riau',
    'west sulawesi': 'Sulawesi Barat', 'south sulawesi': 'Sulawesi Selatan',
    'central sulawesi': 'Sulawesi Tengah', 'southeast sulawesi': 'Sulawesi Tenggara',
    'north sulawesi': 'Sulawesi Utara',
    'west sumatra': 'Sumatera Barat', 'sumatera barat': 'Sumatera Barat',
    'south sumatra': 'Sumatera Selatan', 'north sumatra': 'Sumatera Utara',
  };

  function normalizePlace(s) {
    return (s || '').toLowerCase()
      // Normalisasi tanda hubung & spasi
      .replace(/[-–—]/g, ' ')
      // Hapus prefix bahasa Indonesia
      .replace(/^(kota|kab\.?|kabupaten|kepulauan|kep\.?|administrasi|kec\.?|kecamatan|daerah istimewa|daerah khusus ibukota)\s+/i, '')
      // Hapus suffix bahasa Inggris (Nominatim terkadang pakai bahasa Inggris)
      .replace(/\s+(regency|city|municipality|district|province|island|islands|special region|region|special capital region)$/i, '')
      // Hapus suffix bahasa Indonesia
      .replace(/\s+(provinsi|kota|kabupaten|kepulauan)$/i, '')
      // Normalisasi spasi
      .replace(/\s+/g, ' ').trim();
  }

  // Skor kesamaan token: berapa % kata dari string pendek ada di string panjang
  function tokenRecall(a, b) {
    const ta = a.split(' ').filter(w => w.length > 1);
    const tb = b.split(' ').filter(w => w.length > 1);
    if (!ta.length || !tb.length) return 0;
    const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    const hit = shorter.filter(w => longer.includes(w)).length;
    return hit / shorter.length;           // recall: semua kata pendek ada di panjang
  }

  // Skor satu kandidat vs query
  function matchScore(q, norm) {
    if (norm === q) return 1.0;
    if (norm.includes(q) || q.includes(norm)) return 0.9;
    const rec = tokenRecall(q, norm);
    if (rec >= 1.0) return 0.85;           // semua kata q ada di norm
    if (rec >= 0.6) return rec * 0.8;
    return 0;
  }

  function findBestMatch(raw, list) {
    if (!raw || !list.length) return null;
    const q  = normalizePlace(raw);
    if (!q) return null;

    let best = null, bestScore = 0;
    for (const item of list) {
      const norm = normalizePlace(item);
      const s    = matchScore(q, norm);
      if (s > bestScore) { bestScore = s; best = item; }
    }
    // Threshold: perlu skor ≥ 0.5 agar tidak asal cocok
    return bestScore >= 0.5 ? best : null;
  }

  // Coba semua kandidat field Nominatim, kembalikan match terbaik
  function pickBestCityMatch(candidates, kabList) {
    let best = null, bestScore = 0;
    for (const raw of candidates) {
      if (!raw) continue;
      const q  = normalizePlace(raw);
      for (const item of kabList) {
        const s = matchScore(q, normalizePlace(item));
        if (s > bestScore) { bestScore = s; best = item; }
      }
      if (bestScore >= 0.9) break;         // early exit jika sudah sangat yakin
    }
    return bestScore >= 0.5 ? best : null;
  }

  function setGpsLoading(on) {
    shalatGpsRunning = on;
    const btns  = [$('shalatGpsBtn'), $('shalatGpsBtnEmpty')].filter(Boolean);
    const label = $('shalatGpsLabel');
    btns.forEach(b => {
      b.disabled = on;
      b.classList.toggle('loading', on);
    });
    if (label) label.textContent = on ? 'Mendeteksi lokasi…' : 'Gunakan Lokasi GPS';
  }

  function showGpsStatus(msg) {
    const el = $('shalatGpsStatus');
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  async function detectLocationGPS() {
    if (shalatGpsRunning) return;
    if (!navigator.geolocation) { showToast('GPS tidak tersedia di perangkat ini'); return; }

    setGpsLoading(true);
    showGpsStatus('📡 Meminta izin lokasi…');
    $('shalatLocPicker').hidden = false;
    $('shalatEmpty').hidden = true;

    try {
      /* 1. Ambil koordinat GPS */
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true, timeout: 12000, maximumAge: 60000,
        })
      );
      const { latitude: lat, longitude: lon } = pos.coords;
      showGpsStatus(`📍 Koordinat: ${lat.toFixed(4)}, ${lon.toFixed(4)} — mencari kota…`);

      /* 2. Reverse geocoding via Nominatim (OpenStreetMap) */
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=id`,
        { headers: { 'User-Agent': 'CatatanHarianPWA/1.0 (adesaputra2301@gmail.com)' } }
      );
      const geo  = await geoRes.json();
      const addr = geo.address || {};

      /* 2b. Kumpulkan semua field kandidat dari Nominatim */
      const rawState = addr.state || addr.province || '';
      // Untuk kabkota: coba county dulu (kabupaten), lalu city (kota), lalu lainnya
      const cityCandidates = [
        addr.county, addr.city, addr.town,
        addr.municipality, addr.district, addr.village,
      ].filter(Boolean);
      const displayCity = cityCandidates[0] || '?';

      showGpsStatus(`🗺 Ditemukan: ${displayCity}, ${rawState} — mencocokkan…`);

      /* 3. Muat daftar provinsi jika belum */
      if (!shalatProvinsiList.length) await fetchProvinsi();

      /* 4. Cocokkan provinsi — coba fuzzy dulu, fallback ke tabel EN→ID */
      let matchedProv = findBestMatch(rawState, shalatProvinsiList);
      if (!matchedProv) {
        const key = rawState.toLowerCase().trim();
        const mapped = PROV_EN_ID[key];
        if (mapped) matchedProv = mapped;
      }
      if (!matchedProv) throw new Error(`Provinsi "${rawState}" tidak cocok. Pilih lokasi manual.`);

      /* 5. Ambil daftar kabkota untuk provinsi tersebut */
      const kabRes  = await fetch(`${SHALAT_API}/kabkota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provinsi: matchedProv }),
      });
      const kabJson = await kabRes.json();
      const kabList = kabJson.data || [];

      /* 6. Cocokkan kota — coba semua field kandidat Nominatim */
      const matchedKab = pickBestCityMatch(cityCandidates, kabList);
      if (!matchedKab) throw new Error(`Kota "${displayCity}" di ${matchedProv} tidak cocok. Pilih lokasi manual.`);

      /* 7. Terapkan dan ambil jadwal */
      shalatSelProvinsi = matchedProv;
      shalatSelKabkota  = matchedKab;
      $('shalatLocPicker').hidden = true;
      showGpsStatus('');
      showToast(`📍 Lokasi: ${matchedKab}`);
      fetchShalatJadwal(matchedProv, matchedKab);

    } catch (err) {
      const msg =
        err.code === 1 ? 'Izin akses lokasi ditolak — aktifkan izin lokasi di pengaturan browser' :
        err.code === 2 ? 'Sinyal GPS lemah, coba di tempat terbuka' :
        err.code === 3 ? 'GPS timeout, coba lagi' :
        (err.message || 'Gagal mendeteksi lokasi');
      showGpsStatus('');
      showToast('❌ ' + msg);
    } finally {
      setGpsLoading(false);
    }
  }

  /* ---------- open / close ---------- */
  function openShalatPage() {
    const page = $('shalatPage');
    page.hidden = false;
    requestAnimationFrame(() => page.classList.add('shalat-page--open'));
    $('shalatHeroDate').textContent = fmtDateLong(Date.now());

    const cached = (() => { try { return JSON.parse(localStorage.getItem(SHALAT_CACHE) || '{}'); } catch { return {}; } })();
    if (cached.provinsi && cached.kabkota) {
      shalatSelProvinsi = cached.provinsi;
      shalatSelKabkota  = cached.kabkota;
      $('shalatCityLabel').textContent = cached.kabkota;
      $('shalatEmpty').hidden = true;
      if (cached.data && cached.bulan === shalatBulan && cached.tahun === shalatTahun) {
        shalatData = cached.data;
        renderShalatData(shalatData);
      } else {
        fetchShalatJadwal(cached.provinsi, cached.kabkota);
      }
    }

    if (!shalatProvinsiList.length) fetchProvinsi();
  }

  function closeShalatPage() {
    const page = $('shalatPage');
    page.classList.remove('shalat-page--open');
    clearInterval(shalatCountdownTimer);
    setTimeout(() => { page.hidden = true; }, 340);
  }

  /* ---------- API calls ---------- */
  async function fetchProvinsi() {
    try {
      const res  = await fetch(`${SHALAT_API}/provinsi`);
      const json = await res.json();
      if (json.code === 200) {
        shalatProvinsiList = json.data;
        populateProvinsiSelect();
      }
    } catch (e) { /* offline – silently fail */ }
  }

  async function fetchKabkota(provinsi) {
    const sel = $('kabkotaSelect');
    sel.innerHTML = '<option value="">Memuat…</option>';
    sel.disabled = true;
    $('shalatApplyBtn').disabled = true;
    try {
      const res  = await fetch(`${SHALAT_API}/kabkota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provinsi }),
      });
      const json = await res.json();
      if (json.code === 200) {
        sel.innerHTML = '<option value="">— Pilih Kab/Kota —</option>';
        json.data.forEach(k => {
          const o = document.createElement('option');
          o.value = k; o.textContent = k;
          if (k === shalatSelKabkota) o.selected = true;
          sel.appendChild(o);
        });
        sel.disabled = false;
        if (shalatSelKabkota) $('shalatApplyBtn').disabled = false;
      }
    } catch {
      sel.innerHTML = '<option value="">Gagal memuat</option>';
      showToast('Gagal memuat daftar kota. Periksa koneksi.');
    }
  }

  async function fetchShalatJadwal(provinsi, kabkota, bulan = shalatBulan, tahun = shalatTahun) {
    $('shalatLoading').hidden = false;
    $('shalatHero').hidden = true;
    $('shalatMonth').hidden = true;
    $('shalatEmpty').hidden = true;
    try {
      const res  = await fetch(SHALAT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provinsi, kabkota, bulan, tahun }),
      });
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message);
      shalatData        = json.data;
      shalatSelProvinsi = provinsi;
      shalatSelKabkota  = kabkota;
      shalatBulan       = bulan;
      shalatTahun       = tahun;
      localStorage.setItem(SHALAT_CACHE, JSON.stringify({ provinsi, kabkota, bulan, tahun, data: shalatData }));
      $('shalatCityLabel').textContent = kabkota;
      renderShalatData(shalatData);
    } catch (e) {
      showToast('Gagal memuat jadwal: ' + (e.message || 'Periksa koneksi internet'));
      if (!shalatData) $('shalatEmpty').hidden = false;
    } finally {
      $('shalatLoading').hidden = true;
    }
  }

  /* ---------- render ---------- */
  function renderShalatData(data) {
    const today = new Date();
    const isThisMonth = data.bulan === (today.getMonth() + 1) && data.tahun === today.getFullYear();
    const todayNum    = isThisMonth ? today.getDate() : -1;
    const todayJadwal = data.jadwal.find(j => j.tanggal === todayNum) || null;

    if (todayJadwal) {
      $('shalatHero').hidden = false;
      renderTodayGrid(todayJadwal);
      startCountdown(todayJadwal);
    }

    $('shalatMonth').hidden = false;
    $('shalatMonthLabel').textContent = `${data.bulan_nama} ${data.tahun}`;
    renderMonthTable(data, todayNum);

    if (todayJadwal) {
      setTimeout(() => {
        const todayRow = $('shalatTable').querySelector('.today');
        if (todayRow) todayRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 200);
    }
  }

  function getNextPrayer(schedule) {
    const now = new Date();
    const nowM = now.getHours() * 60 + now.getMinutes();
    for (const k of PRAYER_KEYS) {
      const [h, m] = (schedule[k] || '00:00').split(':').map(Number);
      if (h * 60 + m > nowM) return k;
    }
    return 'imsak';
  }

  function renderTodayGrid(schedule) {
    const nextKey = getNextPrayer(schedule);
    const grid = $('shalatGrid');
    grid.innerHTML = '';
    PRAYER_KEYS.forEach(k => {
      const item = document.createElement('div');
      item.className = 'shalat-item' + (k === nextKey ? ' next' : '');
      item.innerHTML =
        `<div class="shalat-item__icon">${PRAYER_ICONS[k]}</div>` +
        `<div class="shalat-item__name">${PRAYER_LABELS[k]}</div>` +
        `<div class="shalat-item__time">${schedule[k]}</div>`;
      grid.appendChild(item);
    });
  }

  function startCountdown(schedule) {
    clearInterval(shalatCountdownTimer);
    const badge = $('shalatNextBadge');
    function tick() {
      const k = getNextPrayer(schedule);
      const [h, m] = (schedule[k] || '00:00').split(':').map(Number);
      const now  = new Date();
      const diff = (h * 60 + m) - (now.getHours() * 60 + now.getMinutes());
      if (diff > 0) {
        const hrs = Math.floor(diff / 60), mins = diff % 60;
        badge.textContent = hrs > 0
          ? `⏱ ${PRAYER_LABELS[k]} dalam ${hrs} j ${mins} m`
          : `⏱ ${PRAYER_LABELS[k]} dalam ${mins} menit`;
      } else {
        badge.textContent = `🕌 Waktu ${PRAYER_LABELS[k]}`;
      }
    }
    tick();
    shalatCountdownTimer = setInterval(tick, 30000);
  }

  function renderMonthTable(data, todayNum) {
    const table = $('shalatTable');
    table.innerHTML =
      '<thead><tr>' +
      '<th>Tgl</th><th>Subuh</th><th>Dzuhur</th><th>Ashar</th><th>Maghrib</th><th>Isya</th>' +
      '</tr></thead><tbody id="shalatTbody"></tbody>';
    const tbody = table.querySelector('#shalatTbody');
    data.jadwal.forEach(j => {
      const tr = document.createElement('tr');
      if (j.tanggal === todayNum) tr.className = 'today';
      tr.innerHTML =
        `<td><span class="tgl-cell">${j.tanggal}</span><br><span class="hari-cell">${j.hari.substring(0,3)}</span></td>` +
        `<td>${j.subuh}</td><td>${j.dzuhur}</td><td>${j.ashar}</td><td>${j.maghrib}</td><td>${j.isya}</td>`;
      tbody.appendChild(tr);
    });
  }

  /* ---------- location picker helpers ---------- */
  function populateProvinsiSelect() {
    const sel = $('provinsiSelect');
    sel.innerHTML = '<option value="">— Pilih Provinsi —</option>';
    shalatProvinsiList.forEach(p => {
      const o = document.createElement('option');
      o.value = p; o.textContent = p;
      if (p === shalatSelProvinsi) o.selected = true;
      sel.appendChild(o);
    });
  }

  function toggleLocPicker(forceOpen) {
    const picker = $('shalatLocPicker');
    const wasHidden = picker.hidden;
    picker.hidden = forceOpen ? false : !wasHidden;
    if (!picker.hidden && shalatProvinsiList.length) populateProvinsiSelect();
    if (!picker.hidden && shalatSelProvinsi) fetchKabkota(shalatSelProvinsi);
  }

  // ---- Bluetooth ----
  function openBtModal() {
    const modal = $('btModal');
    if (!navigator.bluetooth) {
      $('btStatus').innerHTML = '⚠️ <strong>Web Bluetooth tidak didukung</strong> di browser ini.<br>Gunakan <strong>Chrome / Edge</strong> di Android atau desktop, pastikan Bluetooth perangkat aktif.';
      $('btScanBtn').hidden = true;
    } else {
      $('btStatus').textContent = 'Ketuk Pindai untuk menemukan perangkat di sekitar Anda.';
      $('btScanBtn').hidden = false;
    }
    modal.hidden = false;
  }

  function closeBtModal() {
    $('btModal').hidden = true;
  }

  function setBtStatus(msg) { $('btStatus').innerHTML = msg; }

  async function btScan() {
    setBtStatus('🔍 Membuka pemilih perangkat…');
    $('btDeviceCard').hidden = true;
    $('btInsertBtn').hidden = true;
    $('btDisconnectBtn').hidden = true;
    try {
      btDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information'],
      });

      setBtStatus(`🔗 Menghubungkan ke <strong>${btDevice.name || 'perangkat'}</strong>…`);

      const server = await btDevice.gatt.connect();

      let battery = '–';
      try {
        const svc = await server.getPrimaryService('battery_service');
        const chr = await svc.getCharacteristic('battery_level');
        const val = await chr.readValue();
        battery = val.getUint8(0) + '%';
      } catch { /* perangkat tidak mendukung layanan baterai */ }

      btDevice.addEventListener('gattserverdisconnected', () => {
        setBtStatus('🔌 Perangkat terputus.');
        $('btDeviceCard').hidden = true;
        $('btDisconnectBtn').hidden = true;
        $('btInsertBtn').hidden = true;
      });

      $('btDeviceName').textContent = btDevice.name || 'Perangkat tidak dikenal';
      $('btDeviceBattery').textContent = battery;
      $('btDeviceCard').hidden = false;
      $('btDisconnectBtn').hidden = false;
      $('btInsertBtn').hidden = false;
      setBtStatus('✅ Terhubung dengan sukses.');
    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'AbortError') {
        setBtStatus('Pemilihan dibatalkan.');
      } else {
        setBtStatus(`❌ Gagal terhubung: ${err.message}`);
      }
    }
  }

  function btDisconnect() {
    if (btDevice && btDevice.gatt.connected) btDevice.gatt.disconnect();
    btDevice = null;
    setBtStatus('🔌 Koneksi diputuskan.');
    $('btDeviceCard').hidden = true;
    $('btDisconnectBtn').hidden = true;
    $('btInsertBtn').hidden = true;
  }

  async function btInsertNote() {
    if (!btDevice) return;
    const now = Date.now();
    const name = $('btDeviceName').textContent;
    const battery = $('btDeviceBattery').textContent;
    const title = `📡 ${name}`;
    const body = `Perangkat: ${name}\nBaterai: ${battery}\nWaktu: ${fmtDateLong(now)} pukul ${fmtTime(now)}`;
    await DB.put({ id: uid(), title, body, mood: '🙂', images: [], createdAt: now, updatedAt: now });
    await reload();
    closeBtModal();
    showToast('Catatan Bluetooth disimpan 📝');
  }

  // ============================================================
  // KEUANGAN — Catatan Pengeluaran & Pemasukan
  // ============================================================

  function fmtRupiah(amount) {
    return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
  }

  function isThisMonth(ts) {
    const d = new Date(ts), now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  function getFilteredTransactions() {
    return finPeriod === 'month' ? transactions.filter((t) => isThisMonth(t.createdAt)) : transactions;
  }

  async function reloadTransactions() {
    transactions = await DB.Transactions.getAll();
    renderFinanceSummary();
    renderTransactionsList();
  }

  function renderFinanceSummary() {
    const list = getFilteredTransactions();
    const totalIncome  = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    $('finSaldo').textContent       = fmtRupiah(totalIncome - totalExpense);
    $('finTotalIncome').textContent  = fmtRupiah(totalIncome);
    $('finTotalExpense').textContent = fmtRupiah(totalExpense);
  }

  function renderTransactionsList() {
    const listEl = $('transactionsList');
    const emptyEl = $('financeEmpty');
    const filtered = getFilteredTransactions();

    listEl.innerHTML = '';
    if (!filtered.length) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;

    const groups = new Map();
    for (const t of filtered) {
      const key = fmtDateKey(t.createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }

    for (const [, items] of groups) {
      const section = document.createElement('section');
      section.className = 'date-group';

      const label = document.createElement('div');
      label.className = 'date-group__label';
      label.textContent = fmtGroupLabel(items[0].createdAt);
      section.appendChild(label);

      const wrap = document.createElement('div');
      wrap.className = 'date-group__notes';
      items.forEach((t) => wrap.appendChild(trxCard(t)));
      section.appendChild(wrap);
      listEl.appendChild(section);
    }
  }

  function trxCard(t) {
    const isIncome = t.type === 'income';
    const cats = FIN_CATS[t.type] || [];
    const cat = cats.find((c) => c.key === t.category);
    const catLabel = cat ? cat.label : (isIncome ? '💰 Pemasukan' : '💸 Pengeluaran');

    const card = document.createElement('article');
    card.className = 'trx-card';
    card.dataset.type = t.type;

    const head = document.createElement('div');
    head.className = 'trx-card__head';

    const icon = document.createElement('span');
    icon.className = 'trx-card__icon';
    icon.textContent = isIncome ? '↑' : '↓';

    const desc = document.createElement('span');
    desc.className = 'trx-card__desc';
    desc.textContent = t.description || catLabel.replace(/^\S+\s*/, '');

    const amount = document.createElement('span');
    amount.className = 'trx-card__amount';
    amount.textContent = (isIncome ? '+ ' : '− ') + fmtRupiah(t.amount);

    head.append(icon, desc, amount);

    const meta = document.createElement('div');
    meta.className = 'trx-card__meta';

    const catEl = document.createElement('span');
    catEl.className = 'trx-card__cat';
    catEl.textContent = catLabel;

    const timeEl = document.createElement('span');
    timeEl.className = 'trx-card__time';
    timeEl.textContent = fmtTime(t.createdAt);

    meta.append(catEl, timeEl);
    card.append(head, meta);
    card.addEventListener('click', () => openFinanceEditor(t));
    return card;
  }

  function openFinancePage() {
    const page = $('financePage');
    page.hidden = false;
    requestAnimationFrame(() => page.classList.add('finance-page--open'));
    $('financeFab').hidden = false;
    reloadTransactions();
  }

  function closeFinancePage() {
    const page = $('financePage');
    page.classList.remove('finance-page--open');
    $('financeFab').hidden = true;
    setTimeout(() => { page.hidden = true; }, 340);
  }

  function updateFinTypeUI() {
    $('finTypeIncomeBtn').classList.toggle('fin-type-btn--active', finSelectedType === 'income');
    $('finTypeExpenseBtn').classList.toggle('fin-type-btn--active', finSelectedType === 'expense');
  }

  function renderFinCategories() {
    const picker = $('finCategoryPicker');
    picker.innerHTML = '';
    (FIN_CATS[finSelectedType] || []).forEach((c) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'fin-cat-chip' + (c.key === finSelectedCategory ? ' selected' : '');
      chip.textContent = c.label;
      chip.dataset.key = c.key;
      chip.addEventListener('click', () => {
        finSelectedCategory = finSelectedCategory === c.key ? '' : c.key;
        picker.querySelectorAll('.fin-cat-chip').forEach((ch) =>
          ch.classList.toggle('selected', ch.dataset.key === finSelectedCategory));
      });
      picker.appendChild(chip);
    });
  }

  function openFinanceEditor(trx) {
    finEditingId = trx ? trx.id : null;
    finSelectedType = trx ? trx.type : 'expense';
    finSelectedCategory = trx ? (trx.category || '') : '';

    $('finAmountInput').value = trx ? trx.amount : '';
    $('finDescInput').value   = trx ? (trx.description || '') : '';
    $('finDeleteBtn').hidden  = !trx;

    updateFinTypeUI();
    renderFinCategories();
    $('financeEditor').hidden = false;
    setTimeout(() => $('finAmountInput').focus(), 100);
  }

  function closeFinanceEditor() {
    $('financeEditor').hidden = true;
    finEditingId = null;
  }

  async function saveTransaction() {
    const raw = $('finAmountInput').value;
    const amount = parseFloat(raw);
    if (!raw || isNaN(amount) || amount <= 0) {
      showToast('Masukkan jumlah yang valid'); return;
    }
    const description = $('finDescInput').value.trim();
    const now = Date.now();
    const item = finEditingId
      ? { ...transactions.find((t) => t.id === finEditingId), amount, description, category: finSelectedCategory, type: finSelectedType, updatedAt: now }
      : { id: uid(), type: finSelectedType, amount, description, category: finSelectedCategory, createdAt: now, updatedAt: now };

    await DB.Transactions.put(item);
    await reloadTransactions();
    closeFinanceEditor();
    showToast(finEditingId ? 'Transaksi diperbarui ✏️' : (finSelectedType === 'income' ? 'Pemasukan dicatat 💰' : 'Pengeluaran dicatat 💸'));
  }

  async function deleteTransaction() {
    if (!finEditingId) return;
    if (!confirm('Hapus transaksi ini? Tindakan ini tidak bisa dibatalkan.')) return;
    await DB.Transactions.remove(finEditingId);
    await reloadTransactions();
    closeFinanceEditor();
    showToast('Transaksi dihapus 🗑️');
  }

  // ============================================================
  // NOTIFIKASI
  // ============================================================
  const NOTIF_SUPPORTED = ('Notification' in window) && ('serviceWorker' in navigator);

  function notifEnabled() {
    return NOTIF_SUPPORTED && Notification.permission === 'granted';
  }

  function updateNotifBtn() {
    const btn = $('notifBtn');
    if (!btn) return;
    if (!NOTIF_SUPPORTED) { btn.hidden = true; return; }
    const on = notifEnabled();
    btn.textContent = on ? '🔔' : '🔕';
    btn.title = on ? 'Notifikasi aktif' : 'Aktifkan notifikasi';
  }

  async function requestNotif() {
    if (!NOTIF_SUPPORTED) { showToast('Browser ini tidak mendukung notifikasi'); return; }
    if (Notification.permission === 'denied') {
      showToast('Notifikasi diblokir — aktifkan lewat pengaturan situs di browser'); return;
    }
    if (Notification.permission === 'granted') {
      showToast('Notifikasi sudah aktif 🔔');
      showNotif('Catatan Harian', 'Notifikasi sudah aktif ✓');
      return;
    }
    const perm = await Notification.requestPermission();
    updateNotifBtn();
    if (perm === 'granted') {
      showToast('Notifikasi diaktifkan 🔔');
      showNotif('Catatan Harian', 'Kamu akan diberi tahu saat data berubah dari perangkat lain.');
    } else {
      showToast('Notifikasi tidak diaktifkan');
    }
  }

  async function showNotif(title, body) {
    if (!notifEnabled()) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: 'catatan-harian',
        renotify: true,
      });
    } catch {
      try { new Notification(title, { body }); } catch { /* abaikan */ }
    }
  }

  // Susun pesan notifikasi dari satu perubahan hasil sinkron
  function describeChange(c) {
    const { store, op, item } = c;
    if (store === 'transactions') {
      const nominal = fmtRupiah(item.amount || 0);
      if (op === 'delete') return { title: '🗑️ Transaksi dihapus', body: `${nominal}${item.description ? ' — ' + item.description : ''}` };
      const income = item.type === 'income';
      const label = income ? 'Pemasukan' : 'Pengeluaran';
      const icon = income ? '💰' : '💸';
      return {
        title: `${icon} ${label} ${op === 'add' ? 'baru' : 'diperbarui'}`,
        body: `${nominal}${item.description ? ' — ' + item.description : ''}`,
      };
    }
    // notes
    if (op === 'delete') return { title: '🗑️ Catatan dihapus', body: item.title || '(tanpa judul)' };
    return {
      title: `📝 Catatan ${op === 'add' ? 'baru' : 'diperbarui'}`,
      body: item.title || (item.body ? item.body.slice(0, 60) : '(tanpa judul)'),
    };
  }

  function notifyChanges(changes) {
    if (!notifEnabled() || !changes || !changes.length) return;
    if (changes.length === 1) {
      const { title, body } = describeChange(changes[0]);
      showNotif(title, body);
    } else {
      showNotif('Catatan Harian', `${changes.length} perubahan tersinkron dari perangkat lain`);
    }
  }

  // ---- Install prompt (PWA) ----
  let deferredPrompt = null;
  const installCard = $('installCard');
  const iosGuide = $('iosGuide');

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const installDismissed = () => localStorage.getItem('installDismissed') === '1';

  function showInstallCard() {
    if (isStandalone || installDismissed()) return;
    installCard.classList.remove('closing');
    installCard.hidden = false;
    $('installBtn').hidden = false;
  }
  function hideInstallCard(remember) {
    if (remember) localStorage.setItem('installDismissed', '1');
    installCard.classList.add('closing');
    setTimeout(() => { installCard.hidden = true; }, 280);
  }

  async function triggerInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      hideInstallCard(true);
      $('installBtn').hidden = true;
      if (outcome === 'accepted') showToast('Memasang aplikasi… 🎉');
    } else if (isIOS) {
      // Safari iOS tidak mendukung prompt otomatis → tampilkan panduan manual
      iosGuide.hidden = false;
    } else {
      showToast('Buka menu browser ▸ "Install / Tambahkan ke layar utama"');
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallCard();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallCard(true);
    $('installBtn').hidden = true;
    showToast('Aplikasi terpasang 🎉');
  });

  $('installNow').addEventListener('click', triggerInstall);
  $('installLater').addEventListener('click', () => hideInstallCard(true));
  $('iosGuideClose').addEventListener('click', () => { iosGuide.hidden = true; });
  iosGuide.addEventListener('click', (e) => { if (e.target === iosGuide) iosGuide.hidden = true; });

  // iOS tidak memicu beforeinstallprompt — tampilkan popup setelah jeda singkat
  if (isIOS && !isStandalone && !installDismissed()) {
    setTimeout(showInstallCard, 1500);
  }

  // ---- Event ----
  $('fab').addEventListener('click', () => openEditor(null));
  $('saveBtn').addEventListener('click', saveNote);
  $('cancelBtn').addEventListener('click', closeEditor);
  $('deleteBtn').addEventListener('click', deleteNote);
  $('themeBtn').addEventListener('click', toggleTheme);
  $('exportBtn').addEventListener('click', exportData);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  $('installBtn').addEventListener('click', triggerInstall);

  // Kamera
  $('cameraBtn').addEventListener('click', () => {
    if (editingImages.length >= 3) { showToast('Maksimal 3 foto per catatan'); return; }
    $('cameraInput').click();
  });
  $('cameraInput').addEventListener('change', async (e) => {
    const files = [...e.target.files].slice(0, 3 - editingImages.length);
    for (const file of files) {
      const compressed = await compressImage(file);
      editingImages.push(compressed);
    }
    renderImagePreview();
    e.target.value = '';
  });

  // Jadwal Shalat
  $('shalatBtn').addEventListener('click', openShalatPage);
  $('shalatGpsBtn').addEventListener('click', detectLocationGPS);
  $('shalatGpsBtnEmpty').addEventListener('click', detectLocationGPS);
  $('shalatBackBtn').addEventListener('click', closeShalatPage);
  $('shalatLocBtn').addEventListener('click', () => toggleLocPicker());
  $('shalatPickLocBtn').addEventListener('click', () => toggleLocPicker(true));
  $('provinsiSelect').addEventListener('change', (e) => {
    shalatSelProvinsi = e.target.value;
    shalatSelKabkota  = '';
    $('shalatApplyBtn').disabled = true;
    if (e.target.value) fetchKabkota(e.target.value);
    else { $('kabkotaSelect').innerHTML = '<option value="">— Pilih Kab/Kota —</option>'; $('kabkotaSelect').disabled = true; }
  });
  $('kabkotaSelect').addEventListener('change', (e) => {
    shalatSelKabkota = e.target.value;
    $('shalatApplyBtn').disabled = !e.target.value;
  });
  $('shalatApplyBtn').addEventListener('click', () => {
    if (!shalatSelProvinsi || !shalatSelKabkota) return;
    $('shalatLocPicker').hidden = true;
    fetchShalatJadwal(shalatSelProvinsi, shalatSelKabkota);
  });
  $('shalatPrevMonth').addEventListener('click', () => {
    if (!shalatSelProvinsi) return;
    let b = shalatBulan - 1, y = shalatTahun;
    if (b < 1) { b = 12; y--; }
    fetchShalatJadwal(shalatSelProvinsi, shalatSelKabkota, b, y);
  });
  $('shalatNextMonth').addEventListener('click', () => {
    if (!shalatSelProvinsi) return;
    let b = shalatBulan + 1, y = shalatTahun;
    if (b > 12) { b = 1; y++; }
    fetchShalatJadwal(shalatSelProvinsi, shalatSelKabkota, b, y);
  });

  // Bluetooth
  $('btBtn').addEventListener('click', openBtModal);
  $('btCloseBtn').addEventListener('click', closeBtModal);
  $('btModal').addEventListener('click', (e) => { if (e.target === $('btModal')) closeBtModal(); });
  $('btScanBtn').addEventListener('click', btScan);
  $('btDisconnectBtn').addEventListener('click', btDisconnect);
  $('btInsertBtn').addEventListener('click', btInsertNote);

  // ---- Keuangan: event ----
  $('financeBtn').addEventListener('click', openFinancePage);
  $('financeBackBtn').addEventListener('click', closeFinancePage);
  $('financeFab').addEventListener('click', () => openFinanceEditor(null));

  $('finTypeIncomeBtn').addEventListener('click', () => {
    finSelectedType = 'income';
    finSelectedCategory = '';
    updateFinTypeUI();
    renderFinCategories();
  });
  $('finTypeExpenseBtn').addEventListener('click', () => {
    finSelectedType = 'expense';
    finSelectedCategory = '';
    updateFinTypeUI();
    renderFinCategories();
  });

  $('finSaveBtn').addEventListener('click', saveTransaction);
  $('finCancelBtn').addEventListener('click', closeFinanceEditor);
  $('finDeleteBtn').addEventListener('click', deleteTransaction);
  $('financeEditor').addEventListener('click', (e) => { if (e.target === $('financeEditor')) closeFinanceEditor(); });

  $('finPeriodTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.fin-period-tab');
    if (!tab) return;
    finPeriod = tab.dataset.period;
    $('finHeroPeriod').textContent = finPeriod === 'month' ? 'Bulan ini' : 'Semua waktu';
    $('finPeriodTabs').querySelectorAll('.fin-period-tab').forEach((t) =>
      t.classList.toggle('fin-period-tab--active', t.dataset.period === finPeriod));
    renderFinanceSummary();
    renderTransactionsList();
  });

  searchInput.addEventListener('input', (e) => { searchTerm = e.target.value; render(); });

  moodPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const m = btn.dataset.mood;
    selectedMood = selectedMood === m ? '' : m;
    [...moodPicker.children].forEach((b) =>
      b.classList.toggle('selected', b.dataset.mood === selectedMood));
  });

  editor.addEventListener('click', (e) => { if (e.target === editor) closeEditor(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!editor.hidden) closeEditor();
      else if (!$('financeEditor').hidden) closeFinanceEditor();
      else if (!$('btModal').hidden) closeBtModal();
      else if ($('shalatPage').classList.contains('shalat-page--open')) closeShalatPage();
      else if ($('financePage').classList.contains('finance-page--open')) closeFinancePage();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !editor.hidden) saveNote();
  });

  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);

  // ---- Sinkronisasi dengan server ----
  async function refreshFromServer() {
    await reload();
    await reloadTransactions();
  }

  async function syncWithServer(announce) {
    if (!window.Sync) return;
    try {
      const changed = await Sync.init();
      if (changed) {
        await refreshFromServer();
        if (announce) showToast('☁️ Data tersinkron dari server');
      }
    } catch { /* server tidak tersedia — tetap jalan dari data lokal */ }
  }

  // ---- Init ----
  applyTheme(localStorage.getItem('theme') || 'light');
  const dateSub = $('dateSub');
  if (dateSub) dateSub.textContent = fmtDateLong(Date.now());
  updateOnline();
  reload();
  syncWithServer(true);

  // Dengarkan perubahan dari server secara real-time (SSE) → perbarui tampilan + notifikasi
  if (window.Sync) {
    Sync.listen((changes) => {
      refreshFromServer();
      notifyChanges(changes);
      showToast('🔄 Data diperbarui dari server');
    });
  }

  // Notifikasi
  updateNotifBtn();
  $('notifBtn').addEventListener('click', requestNotif);

  // Sinkron ulang ketika koneksi kembali
  window.addEventListener('online', () => syncWithServer(false));

  // ---- Daftarkan service worker ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
        .catch((err) => console.warn('SW gagal didaftarkan:', err));
    });
  }
})();
