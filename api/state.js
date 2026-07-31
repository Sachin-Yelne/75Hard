const { getSql } = require('./lib/db');

const PROFILES = ['sachin', 'aarya'];

module.exports = async function handler(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const metaRows = await sql`SELECT start_date::text AS start_date FROM challenge_meta WHERE id = 1`;
      const startDate = metaRows[0]?.start_date || new Date().toISOString().slice(0, 10);

      const taskRows = await sql`
        SELECT profile_id, day_date::text AS day_date, tasks
        FROM day_tasks
        WHERE profile_id = ANY(${PROFILES})
      `;

      const photoRows = await sql`
        SELECT profile_id, day_date::text AS day_date
        FROM photos
        WHERE profile_id = ANY(${PROFILES})
      `;

      const data = { sachin: {}, aarya: {} };
      for (const row of taskRows) {
        data[row.profile_id][row.day_date] = row.tasks;
      }

      const photoDays = { sachin: [], aarya: [] };
      for (const row of photoRows) {
        photoDays[row.profile_id].push(row.day_date);
      }

      return res.status(200).json({ startDate, data, photoDays });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to load state' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { profileId, date, tasks } = req.body || {};
      if (!PROFILES.includes(profileId) || !date || !tasks) {
        return res.status(400).json({ error: 'profileId, date, and tasks are required' });
      }

      await sql`
        INSERT INTO day_tasks (profile_id, day_date, tasks)
        VALUES (${profileId}, ${date}::date, ${JSON.stringify(tasks)}::jsonb)
        ON CONFLICT (profile_id, day_date)
        DO UPDATE SET tasks = EXCLUDED.tasks
      `;

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to save tasks' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { startDate } = req.body || {};
      if (!startDate) {
        return res.status(400).json({ error: 'startDate is required' });
      }

      await sql`
        INSERT INTO challenge_meta (id, start_date)
        VALUES (1, ${startDate}::date)
        ON CONFLICT (id) DO UPDATE SET start_date = EXCLUDED.start_date
      `;

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update start date' });
    }
  }

  res.setHeader('Allow', 'GET, PUT, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};
