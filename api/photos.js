const { getSql } = require('./lib/db');

const PROFILES = ['sachin', 'aarya'];

module.exports = async function handler(req, res) {
  const sql = getSql();
  const profileId = req.query.profile || req.body?.profileId;
  const date = req.query.date || req.body?.date;

  if (!PROFILES.includes(profileId) || !date) {
    return res.status(400).json({ error: 'profile and date are required' });
  }

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT content_type, encode(data, 'base64') AS data_base64
        FROM photos
        WHERE profile_id = ${profileId} AND day_date = ${date}::date
      `;

      if (!rows.length) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      const buffer = Buffer.from(rows[0].data_base64, 'base64');
      res.setHeader('Content-Type', rows[0].content_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.status(200).send(buffer);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to load photo' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { contentType = 'image/jpeg', dataBase64 } = req.body || {};
      if (!dataBase64) {
        return res.status(400).json({ error: 'dataBase64 is required' });
      }

      const bytes = Buffer.from(dataBase64, 'base64');
      if (bytes.length > 4 * 1024 * 1024) {
        return res.status(413).json({ error: 'Photo too large (max 4MB)' });
      }

      await sql`
        INSERT INTO photos (profile_id, day_date, content_type, data, updated_at)
        VALUES (${profileId}, ${date}::date, ${contentType}, ${bytes}, now())
        ON CONFLICT (profile_id, day_date)
        DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now()
      `;

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to save photo' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await sql`
        DELETE FROM photos
        WHERE profile_id = ${profileId} AND day_date = ${date}::date
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to delete photo' });
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};
