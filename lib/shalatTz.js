/* Pemetaan provinsi → zona waktu Indonesia (WIB/WITA/WIT), dipakai server
   untuk menghitung "jam berapa sekarang" di lokasi masing-masing subscriber
   saat mengevaluasi reminder jadwal sholat (server sendiri berjalan di UTC). */
const OFFSET_BY_PROVINSI = {
  'Aceh': 7, 'Sumatera Utara': 7, 'Sumatera Barat': 7, 'Riau': 7,
  'Kepulauan Riau': 7, 'Jambi': 7, 'Bengkulu': 7, 'Sumatera Selatan': 7,
  'Kepulauan Bangka Belitung': 7, 'Lampung': 7, 'Banten': 7, 'DKI Jakarta': 7,
  'Jawa Barat': 7, 'Jawa Tengah': 7, 'D.I. Yogyakarta': 7, 'Jawa Timur': 7,
  'Kalimantan Barat': 7, 'Kalimantan Tengah': 7,

  'Bali': 8, 'Nusa Tenggara Barat': 8, 'Nusa Tenggara Timur': 8,
  'Kalimantan Selatan': 8, 'Kalimantan Timur': 8, 'Kalimantan Utara': 8,
  'Sulawesi Utara': 8, 'Sulawesi Tengah': 8, 'Sulawesi Selatan': 8,
  'Sulawesi Tenggara': 8, 'Sulawesi Barat': 8, 'Gorontalo': 8,

  'Maluku': 9, 'Maluku Utara': 9, 'Papua': 9, 'Papua Barat': 9,
};

function offsetForProvinsi(provinsi) {
  return OFFSET_BY_PROVINSI[provinsi] || 7; // default WIB
}

// Mengembalikan Date yang epoch-nya digeser sebesar offset zona provinsi.
// PENTING: baca hasilnya lewat getUTC*() (bukan getHours/getDate biasa),
// supaya tidak tergeser dua kali oleh timezone mesin server itu sendiri.
// Contoh: nowInProvinsi('Bali').getUTCHours() → jam saat ini di WITA.
function nowInProvinsi(provinsi) {
  const offset = offsetForProvinsi(provinsi);
  return new Date(Date.now() + offset * 60 * 60 * 1000);
}

module.exports = { offsetForProvinsi, nowInProvinsi };
