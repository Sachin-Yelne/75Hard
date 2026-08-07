const { connect, fail } = require('./lib/db');
const { notify } = require('./lib/push');

const PROFILES = ['sachin', 'aarya'];
const NAMES = { sachin: 'Sachin', aarya: 'Aarya' };
const TASK_IDS = ['diet', 'workout1', 'workout2', 'water', 'read'];

module.exports = async function handler(req, res) {
  const sql = await connect(res);
  if (!sql) return;

  if (req.method === 'GET') {
    try {
      const metaRows = await sql`SELECT start_date::text AS start_date FROM challenge_meta WHERE id = 1`;
      const startDate = metaRows[0]?.start_date || new Date().toISOString().slice(0, 10);

      const taskRows = await sql`
        SELECT profile_id, day_date::text AS day_date, tasks
        FROM day_tasks
        WHERE profile_id = ANY(${PROFILES})
      `;

      // No image bytes here — just which frames exist, and which of them still
      // have no small rendition for the app to fill in.
      const photoRows = await sql`
        SELECT profile_id, day_date::text AS day_date, slot, (thumb IS NULL) AS needs_thumb
        FROM photos
        WHERE profile_id = ANY(${PROFILES})
      `;

      const data = { sachin: {}, aarya: {} };
      for (const row of taskRows) {
        data[row.profile_id][row.day_date] = row.tasks;
      }

      // { sachin: { '2026-08-02': ['day','read'] }, ... }
      const photos = { sachin: {}, aarya: {} };
      // ['sachin|2026-08-02|day', ...] — the work list for thumbnail backfill
      const needThumb = [];
      for (const row of photoRows) {
        (photos[row.profile_id][row.day_date] ||= []).push(row.slot);
        if (row.needs_thumb) needThumb.push(`${row.profile_id}|${row.day_date}|${row.slot}`);
      }

      return res.status(200).json({ startDate, data, photos, needThumb });
    } catch (err) {
      return fail(res, err, 'Failed to load state');
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

      // tell the other one when a day goes green
      if (TASK_IDS.every((id) => tasks[id])) {
        const other = PROFILES.find((p) => p !== profileId);
        await notify(sql, {
          to: other, date, kind: `complete:${profileId}`,
          title: `${NAMES[profileId] || profileId} sealed the day`,
          body: `All ${TASK_IDS.length} done. Your move.`
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      return fail(res, err, 'Failed to save tasks');
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
      return fail(res, err, 'Failed to update start date');
    }
  }

  res.setHeader('Allow', 'GET, PUT, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};
