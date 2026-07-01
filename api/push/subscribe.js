const pushStore = require('../../lib/pushStore');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'metode tidak diizinkan' });
  try {
    const { subscription, provinsi, kabkota } = req.body || {};
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'subscription tidak valid' });
    }
    const record = await pushStore.saveSubscription({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      provinsi, kabkota,
    });
    res.status(200).json({ ok: true, id: record.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
