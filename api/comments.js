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
  // null rather than undefined: the client tests it, and JSON drops undefined
  parent: r.parent_id == null ? null : Number(r.parent_id),
  at: r.created_at
});

module.exports = async function handler(req, res) {
  // The comments table is part of the shared schema connect() ensures.
  const sql = await connect(res);
  if (!sql) return;

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, from_profile, to_profile, day_date::text AS day_date, slot, body,
               parent_id, created_at
        FROM comments
        ORDER BY created_at, id
      `;
      /*
       * The marks left on those comments ride along rather than costing a
       * second request. Two people's whole challenge is a few hundred rows at
       * the very most, and a thread is worthless without them: a reaction that
       * arrives a beat after the words it belongs to reads as a bug.
       */
      const marks = await sql`
        SELECT comment_id, from_profile, token FROM comment_reactions
      `;
      return res.status(200).json({
        comments: rows.map(shape),
        reactions: marks.map((r) => ({
          comment: Number(r.comment_id),
          from: r.from_profile,
          token: r.token
        }))
      });
    } catch (err) {
      return fail(res, err, 'Failed to load comments');
    }
  }

  if (req.method === 'POST') {
    try {
      const { from, to, date, slot = 'day', body, parentId } = req.body || {};
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

      /*
       * A reply is only a reply if it lands in the thread it claims to. Look
       * the parent up rather than trusting the id: it decides who gets told,
       * and an id from another day would ring the wrong phone about a comment
       * they can't see from here.
       *
       * Replies are one level deep. Answering a reply attaches to the same
       * root, which is what the thread draws anyway — nesting a conversation
       * between two people three levels in buys indentation and nothing else.
       */
      let parent = null;
      if (parentId != null && parentId !== '') {
        const pid = Number(parentId);
        if (!Number.isInteger(pid)) {
          return res.status(400).json({ error: 'parentId must be a comment id' });
        }
        const found = await sql`
          SELECT id, from_profile, slot, parent_id
          FROM comments
          WHERE id = ${pid} AND to_profile = ${to} AND day_date = ${date}::date
        `;
        if (!found.length) {
          return res.status(404).json({ error: 'That comment is gone' });
        }
        parent = found[0];
      }

      // a reply belongs to the frame its parent was written about, whatever
      // the composer happened to be pointed at when you tapped Reply
      const onSlot = parent ? parent.slot : slot.slice(0, 64);
      const root = parent ? (parent.parent_id == null ? parent.id : parent.parent_id) : null;

      const rows = await sql`
        INSERT INTO comments (from_profile, to_profile, day_date, slot, body, parent_id)
        VALUES (${from}, ${to}, ${date}::date, ${onSlot}, ${text}, ${root})
        RETURNING id, from_profile, to_profile, day_date::text AS day_date, slot, body,
                  parent_id, created_at
      `;

      /*
       * Who hears about it. A comment on a frame is news for whoever owns the
       * frame; a reply is news for whoever wrote the line being answered, who
       * on your own post is the other person rather than you. Either way,
       * talking to yourself shouldn't ring your own phone.
       *
       * Unlike kudos, each comment is worth its own alert, so the once-per-day
       * claim key carries the row id — the throttle still stops a retry of the
       * same insert ringing twice.
       */
      const target = parent ? parent.from_profile : to;
      if (target !== from) {
        const on = ON_LABEL[String(onSlot).split('#')[0]];
        const title = parent
          ? `${NAMES[from] || from} replied to your comment`
          // naming the frame turns "someone said something" into something you
          // can picture before you've even opened the app
          : on
            ? `${NAMES[from] || from} commented on your ${on}`
            : `${NAMES[from] || from} commented`;
        await notify(sql, {
          to: target, date, kind: `comment:${from}:${rows[0].id}`,
          title,
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

      /*
       * Taking a comment back takes its answers with it — a reply to nothing
       * is worse than no reply. Replies are anyone's, so this isn't scoped to
       * the author the way the parent is: the thread they hung off is gone.
       *
       * The marks go first, while the replies are still there to be named by
       * a subquery: with the rows deleted there is nothing left to join to,
       * and every id would have to be handed back to Postgres as an array.
       */
      await sql`
        DELETE FROM comment_reactions
        WHERE comment_id = ${id}
           OR comment_id IN (SELECT id FROM comments WHERE parent_id = ${id})
      `;
      const replies = await sql`
        DELETE FROM comments WHERE parent_id = ${id} RETURNING id
      `;

      return res.status(200).json({
        ok: true, removed: [id, ...replies.map((r) => Number(r.id))]
      });
    } catch (err) {
      return fail(res, err, 'Failed to delete comment');
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};
