const store = require('../lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'metode tidak diizinkan' });
  try {
    const db = await store.loadDB();
    res.status(200).json({ notes: db.notes, transactions: db.transactions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
