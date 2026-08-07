const { connect, fail } = require('./lib/db');
const { notify } = require('./lib/push');

const PROFILES = ['sachin', 'aarya'];
const NAMES = { sachin: 'Sachin', aarya: 'Aarya' };
// 'day' is the daily progress frame; the rest attach to an individual task.
// 'water' has no camera any more but stays accepted so frames posted when it
// did can still be deleted.
const SLOTS = ['day', 'workout1', 'workout2', 'water', 'read', 'diet'];

// A task that takes several shots a day stores each under `id#<epoch ms>`,
// since the table is keyed (profile_id, day_date, slot). Accept that shape as
// well as the bare id.
const MULTI = ['diet'];

// What a fresh frame is called when it lands on the other phone. Written per
// task rather than "posted a photo" so the alert is worth reading on a lock
// screen — you know whether it's a run, a meal or the day's progress frame.
const PHOTO_TITLE = {
  day:      (n) => `${n} posted today's progress frame`,
  diet:     (n) => `${n} logged a meal`,
  workout1: (n) => `${n} put up Workout One`,
  workout2: (n) => `${n} put up Workout Two`,
  read:     (n) => `${n} posted a reading shot`
};
const whenLabel = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC'
  });
const validSlot = (slot) => {
  if (SLOTS.includes(slot)) return true;
  const [base, stamp, ...rest] = String(slot).split('#');
  return !rest.length && MULTI.includes(base) && /^\d{1,15}$/.test(stamp || '');
};

module.exports = async function handler(req, res) {
  const sql = await connect(res);
  if (!sql) return;

  const profileId = req.query.profile || req.body?.profileId;
  const date = req.query.date || req.body?.date;
  const slot = req.query.slot || req.body?.slot || 'day';

  if (!PROFILES.includes(profileId) || !date || !validSlot(slot)) {
    return res.status(400).json({ error: 'profile, date and a valid slot are required' });
  }

  if (req.method === 'GET') {
    try {
      /*
       * `size=thumb` asks for the collage-sized rendition. COALESCE rather
       * than a second request path: a frame posted before thumbs existed has
       * none, and answering with the full image keeps it looking right while
       * the app backfills. Nothing has to know which frames are converted.
       */
      const wantThumb = req.query.size === 'thumb';
      const rows = wantThumb
        ? await sql`
            SELECT content_type, encode(COALESCE(thumb, data), 'base64') AS data_base64
            FROM photos
            WHERE profile_id = ${profileId} AND day_date = ${date}::date AND slot = ${slot}
          `
        : await sql`
            SELECT content_type, encode(data, 'base64') AS data_base64
            FROM photos
            WHERE profile_id = ${profileId} AND day_date = ${date}::date AND slot = ${slot}
          `;

      if (!rows.length) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      const buffer = Buffer.from(rows[0].data_base64, 'base64');
      res.setHeader('Content-Type', rows[0].content_type || 'image/jpeg');
      // Immutable: the client busts this with a ?v= stamp whenever it replaces one.
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      return res.status(200).send(buffer);
    } catch (err) {
      return fail(res, err, 'Failed to load photo');
    }
  }

  if (req.method === 'POST') {
    try {
      const { contentType = 'image/jpeg', dataBase64, thumbBase64 } = req.body || {};

      /*
       * A body carrying only a thumb is the app converting a frame posted
       * before thumbs existed. It fills in the missing rendition and nothing
       * else — the photo is not new, so it neither replaces the full image nor
       * rings the other phone. `thumb IS NULL` makes it a no-op if two devices
       * get to the same frame at once.
       */
      if (!dataBase64 && thumbBase64) {
        const thumbOnly = Buffer.from(thumbBase64, 'base64');
        if (thumbOnly.length > 1024 * 1024) {
          return res.status(413).json({ error: 'Thumbnail too large' });
        }
        await sql`
          UPDATE photos SET thumb = ${thumbOnly}
          WHERE profile_id = ${profileId} AND day_date = ${date}::date
            AND slot = ${slot} AND thumb IS NULL
        `;
        return res.status(200).json({ ok: true, filled: true });
      }

      if (!dataBase64) {
        return res.status(400).json({ error: 'dataBase64 is required' });
      }

      const bytes = Buffer.from(dataBase64, 'base64');
      if (bytes.length > 4 * 1024 * 1024) {
        return res.status(413).json({ error: 'Photo too large (max 4MB)' });
      }
      const thumb = thumbBase64 ? Buffer.from(thumbBase64, 'base64') : null;

      await sql`
        INSERT INTO photos (profile_id, day_date, slot, content_type, data, thumb, updated_at)
        VALUES (${profileId}, ${date}::date, ${slot}, ${contentType}, ${bytes}, ${thumb}, now())
        ON CONFLICT (profile_id, day_date, slot)
        DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data,
                      thumb = EXCLUDED.thumb, updated_at = now()
      `;

      /*
       * One alert per task per day rather than one per person per day. Diet
       * alone can be a dozen shots, so per-photo would be a pager — but a
       * single daily "posted fresh shots" meant the evening run never got
       * mentioned if breakfast already had. Five at the very most, and each
       * one says what it is.
       */
      const other = PROFILES.find((p) => p !== profileId);
      const base = String(slot).split('#')[0];
      const who = NAMES[profileId] || profileId;
      await notify(sql, {
        to: other, date, kind: `photo:${profileId}:${base}`,
        title: PHOTO_TITLE[base] ? PHOTO_TITLE[base](who) : `${who} added a photo`,
        body: whenLabel(date),
        url: '/'
      });

      return res.status(200).json({ ok: true });
    } catch (err) {
      return fail(res, err, 'Failed to save photo');
    }
  }

  if (req.method === 'DELETE') {
    try {
      await sql`
        DELETE FROM photos
        WHERE profile_id = ${profileId} AND day_date = ${date}::date AND slot = ${slot}
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      return fail(res, err, 'Failed to delete photo');
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};
