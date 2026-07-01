/* Proksi ke muslim-api (tidak mengirim header CORS, jadi tidak bisa
   difetch langsung dari browser). Cache in-memory best-effort — hanya
   bertahan selama serverless instance masih "hangat". */
let cache = null;
let cacheAt = 0;
const TTL = 6 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'metode tidak diizinkan' });

  if (cache && (Date.now() - cacheAt < TTL)) {
    return res.status(200).json(cache);
  }
  try {
    const upstream = await fetch('https://muslim-api-three.vercel.app/v1/dzikir');
    const json = await upstream.json();
    cache = json;
    cacheAt = Date.now();
    return res.status(200).json(json);
  } catch (e) {
    if (cache) return res.status(200).json(cache);
    return res.status(502).json({ error: 'Gagal mengambil data dzikir: ' + e.message });
  }
};
