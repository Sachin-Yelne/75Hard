const { getSql } = require('./lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getSql();
  const startDate = (req.body && req.body.startDate) || new Date().toISOString().slice(0, 10);

  try {
    await sql`DELETE FROM day_tasks`;
    await sql`DELETE FROM photos`;
    // Reactions are created lazily by /api/reactions, so this table may not exist yet.
    try {
      await sql`DELETE FROM reactions`;
    } catch (_) {}
    await sql`
      INSERT INTO challenge_meta (id, start_date)
      VALUES (1, ${startDate}::date)
      ON CONFLICT (id) DO UPDATE SET start_date = EXCLUDED.start_date
    `;
    return res.status(200).json({ ok: true, startDate });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to reset challenge' });
  }
};
