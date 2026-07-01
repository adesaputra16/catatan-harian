/* Logika inti: menentukan reminder apa saja yang jatuh tempo SEKARANG untuk
   satu subscription (jadwal sholat -5 menit & pas waktu, dzikir pagi/petang,
   reminder catat keuangan). Dipakai oleh cron produksi (api/push/send-due.js)
   maupun setInterval lokal (server.js) — logika sama, sumber pemicu berbeda. */
const { offsetForProvinsi } = require('./shalatTz');

const DUE_WINDOW_MIN = 5; // granularitas polling (harus sinkron dengan interval cron)

const SHALAT_REMINDER_KEYS = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];
const PRAYER_LABELS = { subuh: 'Subuh', dzuhur: 'Dzuhur', ashar: 'Ashar', maghrib: 'Maghrib', isya: 'Isya' };
const PRAYER_ICONS  = { subuh: '🌄', dzuhur: '☀️', ashar: '🌤️', maghrib: '🌇', isya: '🌙' };

const DZIKIR_PAGI_MIN = 6 * 60 + 30;   // 06:30
const DZIKIR_SORE_MIN = 16 * 60 + 30;  // 16:30
const FINANCE_MIN     = 20 * 60;       // 20:00

function minutesSinceMidnight(d) {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function isDueWindow(targetMinutes, nowMinutes) {
  return nowMinutes >= targetMinutes && nowMinutes < targetMinutes + DUE_WINDOW_MIN;
}

function localDateParts(provinsi) {
  const offset = offsetForProvinsi(provinsi || 'DKI Jakarta');
  const local = new Date(Date.now() + offset * 60 * 60 * 1000);
  return {
    local,
    offset,
    nowMin: minutesSinceMidnight(local),
    y: local.getUTCFullYear(),
    m: local.getUTCMonth() + 1,
    d: local.getUTCDate(),
    dateStr: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`,
  };
}

// Cache jadwal sholat per (provinsi, kabkota, bulan, tahun) — dibagi antar
// subscriber yang lokasinya sama supaya tidak fetch berulang dalam satu run.
async function getShalatSchedule(provinsi, kabkota, bulan, tahun, cache) {
  const key = `${provinsi}|${kabkota}|${bulan}-${tahun}`;
  if (cache.has(key)) return cache.get(key);
  let data = null;
  try {
    const res = await fetch('https://equran.id/api/v2/shalat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provinsi, kabkota, bulan, tahun }),
    });
    const json = await res.json();
    if (json.code === 200) data = json.data;
  } catch { /* offline / gagal fetch — lewati diam-diam */ }
  cache.set(key, data);
  return data;
}

// sub: { provinsi, kabkota }, db: { notes, transactions } (untuk cek reminder keuangan)
async function computeDueNotifications(sub, db, scheduleCache) {
  const notifs = [];
  const { nowMin, offset, m, y, d, dateStr } = localDateParts(sub.provinsi);

  if (isDueWindow(DZIKIR_PAGI_MIN, nowMin)) {
    notifs.push({ title: '📿 Dzikir Pagi', body: 'Yuk luangkan waktu sejenak untuk berdzikir.', tag: `dzikir-pagi:${dateStr}` });
  }
  if (isDueWindow(DZIKIR_SORE_MIN, nowMin)) {
    notifs.push({ title: '📿 Dzikir Petang', body: 'Yuk luangkan waktu sejenak untuk berdzikir.', tag: `dzikir-sore:${dateStr}` });
  }

  if (isDueWindow(FINANCE_MIN, nowMin) && db) {
    const sudahCatat = (db.transactions || []).some((t) => {
      const dt = new Date((t.createdAt || 0) + offset * 60 * 60 * 1000);
      return dt.getUTCFullYear() === y && (dt.getUTCMonth() + 1) === m && dt.getUTCDate() === d;
    });
    if (!sudahCatat) {
      notifs.push({ title: '💰 Catat Keuanganmu', body: 'Belum ada transaksi tercatat hari ini — jangan sampai lupa ya.', tag: `finance:${dateStr}` });
    }
  }

  if (sub.provinsi && sub.kabkota) {
    const jadwalBulan = await getShalatSchedule(sub.provinsi, sub.kabkota, m, y, scheduleCache);
    const todayJadwal = jadwalBulan && jadwalBulan.jadwal && jadwalBulan.jadwal.find((j) => j.tanggal === d);
    if (todayJadwal) {
      SHALAT_REMINDER_KEYS.forEach((key) => {
        const waktu = todayJadwal[key];
        if (!waktu) return;
        const [hh, mm] = waktu.split(':').map(Number);
        const targetMin = hh * 60 + mm;

        if (isDueWindow(targetMin - 5, nowMin)) {
          notifs.push({
            title: `⏰ 5 menit sebelum ${PRAYER_LABELS[key]}`,
            body: `Waktu ${PRAYER_LABELS[key]} akan tiba pukul ${waktu}.`,
            tag: `shalat-pre-${key}:${dateStr}`,
          });
        }
        if (isDueWindow(targetMin, nowMin)) {
          notifs.push({
            title: `${PRAYER_ICONS[key]} Waktu ${PRAYER_LABELS[key]}`,
            body: `Saatnya melaksanakan sholat ${PRAYER_LABELS[key]}.`,
            tag: `shalat-${key}:${dateStr}`,
          });
        }
      });
    }
  }

  return notifs;
}

module.exports = { computeDueNotifications, DUE_WINDOW_MIN };
