const store = require('../../lib/store');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const db = await store.loadDB();
      return res.status(200).json(db.transactions);
    }

    if (req.method === 'POST') {
      const items = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'harus berupa array' });
      const db = await store.loadDB();
      items.forEach((it) => store.upsert(db, 'transactions', it));
      await store.saveDB(db);
      return res.status(200).json({ ok: true, count: items.length });
    }

    res.status(405).json({ error: 'metode tidak diizinkan' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
