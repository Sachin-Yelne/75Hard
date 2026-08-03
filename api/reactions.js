const { connect } = require('./lib/db');

const PROFILES = ['sachin', 'aarya'];
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
        SELECT from_profile, to_profile, day_date::text AS day_date, emoji
        FROM reactions
      `;
      return res.status(200).json({
        reactions: rows.map((r) => ({
          from: r.from_profile,
          to: r.to_profile,
          date: r.day_date,
          emoji: r.emoji
        }))
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to load reactions' });
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
      return res.status(200).json({ ok: true, active: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to save reaction' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
