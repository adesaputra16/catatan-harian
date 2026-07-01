const store = require('../../lib/store');

module.exports = async (req, res) => {
  const id = req.query.id;
  try {
    if (req.method === 'PUT') {
      const item = req.body;
      if (!item || item.id !== id) return res.status(400).json({ error: 'id tidak cocok' });
      const db = await store.loadDB();
      store.upsert(db, 'transactions', item);
      await store.saveDB(db);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const db = await store.loadDB();
      store.removeItem(db, 'transactions', id);
      await store.saveDB(db);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'metode tidak diizinkan' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
