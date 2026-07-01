const webpush = require('web-push');
const pushStore = require('./pushStore');

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY belum diset di environment variable');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

// Kirim satu notifikasi push. Subscription yang sudah tidak valid (404/410)
// otomatis dihapus dari penyimpanan agar tidak dicoba lagi di siklus berikutnya.
async function sendPush(sub, payload) {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload)
    );
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await pushStore.removeSubscription(sub.endpoint);
    } else {
      console.error('Gagal mengirim push ke', sub.endpoint, ':', err.message);
    }
    return false;
  }
}

module.exports = {
  sendPush,
  ensureConfigured,
  getPublicKey: () => process.env.VAPID_PUBLIC_KEY || '',
};
