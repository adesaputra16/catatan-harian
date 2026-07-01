const pushStore = require('../../lib/pushStore');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'metode tidak diizinkan' });
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint wajib diisi' });
    await pushStore.removeSubscription(endpoint);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
