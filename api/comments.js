const { connect, fail } = require('./lib/db');
const { notify } = require('./lib/push');

const PROFILES = ['sachin', 'aarya'];
const NAMES = { sachin: 'Sachin', aarya: 'Aarya' };
const MAX_LEN = 280;

// The frame a comment was filed against, said the way you'd say it out loud.
const ON_LABEL = {
  day: 'progress frame',
  diet: 'meal',
  workout1: 'Workout One',
  workout2: 'Workout Two',
  read: 'reading shot'
};

const shape = (r) => ({
  id: Number(r.id),
  from: r.from_profile,
  to: r.to_profile,
  date: r.day_date,
  slot: r.slot,
  body: r.body,
  at: r.created_at
});

module.exports = async function handler(req, res) {
  // The comments table is part of the shared schema connect() ensures.
  const sql = await connect(res);
  if (!sql) return;

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, from_profile, to_profile, day_date::text AS day_date, slot, body, created_at
        FROM comments
        ORDER BY created_at, id
      `;
      return res.status(200).json({ comments: rows.map(shape) });
    } catch (err) {
      return fail(res, err, 'Failed to load comments');
    }
  }

  if (req.method === 'POST') {
    try {
      const { from, to, date, slot = 'day', body } = req.body || {};
      const text = typeof body === 'string' ? body.trim() : '';
      // slot is free-form on purpose: a multi task stores frames as `id#<ms>`,
      // and the thread only ever labels a slot the day actually carries.
      if (!PROFILES.includes(from) || !PROFILES.includes(to) || !date || typeof slot !== 'string') {
        return res.status(400).json({ error: 'from, to, date and slot are required' });
      }
      if (!text) {
        return res.status(400).json({ error: 'Comment is empty' });
      }
      if (text.length > MAX_LEN) {
        return res.status(413).json({ error: `Comment too long (max ${MAX_LEN})` });
      }

      const rows = await sql`
        INSERT INTO comments (from_profile, to_profile, day_date, slot, body)
        VALUES (${from}, ${to}, ${date}::date, ${slot.slice(0, 64)}, ${text})
        RETURNING id, from_profile, to_profile, day_date::text AS day_date, slot, body, created_at
      `;

      // Talking to yourself on your own frame shouldn't ring your own phone.
      // Unlike kudos, each comment is worth its own alert, so the once-per-day
      // claim key carries the row id — the throttle still stops a retry of the
      // same insert ringing twice.
      if (from !== to) {
        const on = ON_LABEL[String(slot).split('#')[0]];
        await notify(sql, {
          to, date, kind: `comment:${from}:${rows[0].id}`,
          // naming the frame turns "someone said something" into something you
          // can picture before you've even opened the app
          title: on
            ? `${NAMES[from] || from} commented on your ${on}`
            : `${NAMES[from] || from} commented`,
          body: text.length > 120 ? `${text.slice(0, 119)}…` : text
        });
      }

      return res.status(200).json({ ok: true, comment: shape(rows[0]) });
    } catch (err) {
      return fail(res, err, 'Failed to save comment');
    }
  }

  if (req.method === 'DELETE') {
    try {
      const id = Number(req.query.id || req.body?.id);
      const from = req.query.from || req.body?.from;
      if (!Number.isInteger(id) || !PROFILES.includes(from)) {
        return res.status(400).json({ error: 'id and from are required' });
      }

      // Scoped to the author so one phone can't delete the other's words.
      const rows = await sql`
        DELETE FROM comments WHERE id = ${id} AND from_profile = ${from} RETURNING id
      `;
      if (!rows.length) {
        return res.status(404).json({ error: 'Comment not found' });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      return fail(res, err, 'Failed to delete comment');
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};
