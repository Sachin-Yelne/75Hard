const webpush = require('web-push');

/*
 * Web Push, kept entirely optional. Without VAPID keys configured every send
 * is a no-op and the rest of the app carries on — notifications must never be
 * the reason a task fails to save.
 */
let vapid = null;
function pushReady() {
  if (vapid === null) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    vapid = Boolean(publicKey && privateKey);
    if (vapid) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:75hard@example.com',
        publicKey, privateKey
      );
    }
  }
  return vapid;
}

/*
 * Fire once per (profile, day, kind). The table is the throttle: kudos can be
 * toggled off and on, a day can be completed, un-completed and completed
 * again, and Diet now takes a dozen photos a day — none of which should ring
 * a dozen times. Returns false when this one has already been sent.
 */
async function claimOnce(sql, profileId, date, kind) {
  const rows = await sql`
    INSERT INTO notifications_sent (profile_id, day_date, kind)
    VALUES (${profileId}, ${date}::date, ${kind})
    ON CONFLICT (profile_id, day_date, kind) DO NOTHING
    RETURNING kind
  `;
  return rows.length > 0;
}

/*
 * Deliver to every device a profile has registered. A subscription that the
 * push service has retired answers 404/410; drop those rows rather than
 * retrying them forever — deleting and re-adding the app to the Home Screen
 * strands the old endpoint exactly this way.
 */
async function sendTo(sql, profileId, payload) {
  if (!pushReady()) return { sent: 0, skipped: 'not configured' };

  const subs = await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE profile_id = ${profileId}
  `;
  let sent = 0;
  const dead = [];

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) dead.push(s.endpoint);
      else console.error('push failed', err && err.statusCode, err && err.message);
    }
  }

  if (dead.length) {
    await sql`DELETE FROM push_subscriptions WHERE endpoint = ANY(${dead})`;
  }
  return { sent, dropped: dead.length };
}

/*
 * Notify from inside a request handler. Swallows everything: a push problem
 * must never turn a successful save into an error for the person saving.
 */
async function notify(sql, { to, date, kind, title, body, url }) {
  try {
    if (!pushReady()) return;
    if (!(await claimOnce(sql, to, date, kind))) return;
    await sendTo(sql, to, { title, body, url: url || '/', tag: `${kind}-${date}` });
  } catch (err) {
    console.error('notify failed', err && err.message);
  }
}

module.exports = { pushReady, sendTo, notify, claimOnce };
