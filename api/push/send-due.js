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

  const debug = req.query.debug === '1';
  const restoreNow = req.query.fakeNow ? overrideNow(req.query.fakeNow) : null;

  try {
    const [subs, db] = await Promise.all([pushStore.listSubscriptions(), store.loadDB()]);
    const scheduleCache = new Map();
    let sent = 0;
    const debugInfo = [];

    for (const sub of subs) {
      const notifs = await computeDueNotifications(sub, db, scheduleCache);
      if (debug) debugInfo.push({ id: sub.id, provinsi: sub.provinsi, kabkota: sub.kabkota, notifs });
      for (const n of notifs) {
        const dedupKey = `${sub.id}:${n.tag}`;
        if (await pushStore.wasSent(dedupKey)) continue;
        const ok = await sendPush(sub, { title: n.title, body: n.body, tag: n.tag });
        if (ok) { await pushStore.markSent(dedupKey); sent++; }
      }
    }

    const payload = { ok: true, subscriptions: subs.length, sent };
    if (debug) {
      payload.debug = debugInfo;
      payload._rawQuery = req.query;
      payload._nowAfterOverride = new Date(Date.now()).toISOString();
    }
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (restoreNow) restoreNow();
  }
};

// Hanya untuk debug manual lewat query ?fakeNow=2026-07-01T08:35:00Z — override
// Date.now() sesaat untuk request ini saja, dipulihkan lewat restoreNow().
function overrideNow(iso) {
  const fixed = new Date(iso).getTime();
  if (Number.isNaN(fixed)) return null;
  const original = Date.now;
  Date.now = () => fixed;
  return () => { Date.now = original; };
}
