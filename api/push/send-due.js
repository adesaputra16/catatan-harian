/* Dipanggil oleh cron eksternal (mis. cron-job.org) tiap 5 menit.
   Endpoint ini TIDAK boleh publik tanpa secret — sembarang orang yang tahu
   URL-nya bisa memicu pengiriman push berulang-ulang ke semua subscriber. */
const pushStore = require('../../lib/pushStore');
const store = require('../../lib/store');
const { sendPush } = require('../../lib/webpush');
const { computeDueNotifications } = require('../../lib/dueReminders');

module.exports = async (req, res) => {
  const secret = req.query.secret || (req.headers.authorization || '').replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const [subs, db] = await Promise.all([pushStore.listSubscriptions(), store.loadDB()]);
    const scheduleCache = new Map();
    let sent = 0;

    for (const sub of subs) {
      const notifs = await computeDueNotifications(sub, db, scheduleCache);
      for (const n of notifs) {
        const dedupKey = `${sub.id}:${n.tag}`;
        if (await pushStore.wasSent(dedupKey)) continue;
        const ok = await sendPush(sub, { title: n.title, body: n.body, tag: n.tag });
        if (ok) { await pushStore.markSent(dedupKey); sent++; }
      }
    }

    res.status(200).json({ ok: true, subscriptions: subs.length, sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
