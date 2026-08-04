const { connect } = require('./lib/db');
const { pushReady, sendTo, claimOnce } = require('./lib/push');

const PROFILES = ['sachin', 'aarya'];
const TASK_IDS = ['diet', 'workout1', 'workout2', 'water', 'read'];

/*
 * The evening nudge. iOS gives a PWA no way to schedule a local notification —
 * Safari has no Notification Triggers API — so a reminder has to arrive as a
 * push, which means something outside Vercel has to wake this up. That's the
 * GitHub Actions workflow in .github/workflows/nudge.yml.
 *
 * Protected by a shared secret: anything that can reach this URL can ring both
 * phones.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'CRON_SECRET is not set on this deployment' });
  }
  const offered = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.key;
  if (offered !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!pushReady()) {
    return res.status(200).json({ ok: true, skipped: 'push not configured' });
  }

  const sql = await connect(res);
  if (!sql) return;

  // The whole app works in local dates, and the nudge is about the day the
  // phones are living in — not whatever day it is in UTC when cron fires.
  const zone = process.env.APP_TIMEZONE || 'America/New_York';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  try {
    const rows = await sql`
      SELECT profile_id, tasks FROM day_tasks
      WHERE day_date = ${today}::date AND profile_id = ANY(${PROFILES})
    `;
    const byProfile = Object.fromEntries(rows.map((r) => [r.profile_id, r.tasks || {}]));

    const results = [];
    for (const profileId of PROFILES) {
      const tasks = byProfile[profileId] || {};
      const done = TASK_IDS.filter((id) => tasks[id]).length;
      if (done === TASK_IDS.length) { results.push({ profileId, skipped: 'complete' }); continue; }

      // one nudge per person per day, however often cron runs
      if (!(await claimOnce(sql, profileId, today, 'nudge'))) {
        results.push({ profileId, skipped: 'already nudged' });
        continue;
      }

      const left = TASK_IDS.length - done;
      const out = await sendTo(sql, profileId, {
        title: `${left} task${left === 1 ? '' : 's'} left today`,
        body: done
          ? `You're ${done} of ${TASK_IDS.length} through. Finish before midnight.`
          : 'Nothing logged yet today. There is still time.',
        url: '/',
        tag: `nudge-${today}`
      });
      results.push({ profileId, left, ...out });
    }

    return res.status(200).json({ ok: true, date: today, zone, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Nudge failed' });
  }
};
