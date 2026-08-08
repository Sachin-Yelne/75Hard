const { connect, fail } = require('./lib/db');
const { pushReady } = require('./lib/push');

const PROFILES = ['sachin', 'aarya'];

/*
 * GET    — what the client needs to subscribe, and whether it can at all.
 * POST   — register this device for a profile.
 * DELETE — unregister it.
 *
 * The public key is served rather than baked into index.html so rotating the
 * keypair is an environment change, not a redeploy of the app shell.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      enabled: pushReady(),
      publicKey: process.env.VAPID_PUBLIC_KEY || null
    });
  }

  const sql = await connect(res);
  if (!sql) return;

  if (req.method === 'POST') {
    try {
      const { profileId, subscription } = req.body || {};
      const keys = subscription && subscription.keys;
      if (!PROFILES.includes(profileId) || !subscription || !subscription.endpoint || !keys) {
        return res.status(400).json({ error: 'profileId and a full subscription are required' });
      }

      // An endpoint identifies a device, and a device belongs to whoever last
      // claimed it — switching profile on a shared phone must move the alerts.
      await sql`
        INSERT INTO push_subscriptions (endpoint, profile_id, p256dh, auth)
        VALUES (${subscription.endpoint}, ${profileId}, ${keys.p256dh}, ${keys.auth})
        ON CONFLICT (endpoint) DO UPDATE
          SET profile_id = EXCLUDED.profile_id,
              p256dh     = EXCLUDED.p256dh,
              auth       = EXCLUDED.auth
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      return fail(res, err, 'Failed to register for notifications');
    }
  }

  if (req.method === 'DELETE') {
    try {
      const endpoint = req.query.endpoint || (req.body && req.body.endpoint);
      if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
      await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
      return res.status(200).json({ ok: true });
    } catch (err) {
      return fail(res, err, 'Failed to unregister');
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};
