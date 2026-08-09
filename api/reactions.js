const { connect, fail } = require('./lib/db');
const { notify } = require('./lib/push');

const PROFILES = ['sachin', 'aarya'];
const NAMES = { sachin: 'Sachin', aarya: 'Aarya' };
// 'kudos' is what the current UI sends; the emoji are kept so rows written by
// the previous build still validate and still count.
const TOKENS = ['kudos', '🔥', '💪', '👏', '🫡', '❤️'];

module.exports = async function handler(req, res) {
  // The reactions table is part of the shared schema connect() ensures.
  const sql = await connect(res);
  if (!sql) return;

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT from_profile, to_profile, day_date::text AS day_date, emoji, created_at
        FROM reactions
      `;
      return res.status(200).json({
        reactions: rows.map((r) => ({
          from: r.from_profile,
          to: r.to_profile,
          date: r.day_date,
          emoji: r.emoji,
          // when it landed, so What's new can order kudos against comments
          at: r.created_at
        }))
      });
    } catch (err) {
      return fail(res, err, 'Failed to load reactions');
    }
  }

  if (req.method === 'POST') {
    try {
      const { from, to, date, emoji } = req.body || {};
      if (!PROFILES.includes(from) || !PROFILES.includes(to) || !date || !TOKENS.includes(emoji)) {
        return res.status(400).json({ error: 'from, to, date, and a supported reaction are required' });
      }

      const existing = await sql`
        DELETE FROM reactions
        WHERE from_profile = ${from} AND to_profile = ${to}
          AND day_date = ${date}::date AND emoji = ${emoji}
        RETURNING emoji
      `;

      if (existing.length) {
        return res.status(200).json({ ok: true, active: false });
      }

      await sql`
        INSERT INTO reactions (from_profile, to_profile, day_date, emoji)
        VALUES (${from}, ${to}, ${date}::date, ${emoji})
        ON CONFLICT DO NOTHING
      `;

      // kudos are otherwise invisible until they next open the app.
      // iOS already stamps the app name on every notification, so the title
      // carries the news rather than repeating the word "Kudos" under it.
      const when = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', timeZone: 'UTC'
      });
      await notify(sql, {
        to, date, kind: `kudos:${from}`,
        title: `${NAMES[from] || from} just sent kudos`,
        body: `Reaction recorded for ${when}.`
      });

      return res.status(200).json({ ok: true, active: true });
    } catch (err) {
      return fail(res, err, 'Failed to save reaction');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
