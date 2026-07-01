const { getPublicKey } = require('../../lib/webpush');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'metode tidak diizinkan' });
  const publicKey = getPublicKey();
  if (!publicKey) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY belum diset di server' });
  res.status(200).json({ publicKey });
};
