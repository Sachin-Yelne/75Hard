const { connect, fail } = require('./lib/db');
const { notify } = require('./lib/push');

const PROFILES = ['sachin', 'aarya'];
const NAMES = { sachin: 'Sachin', aarya: 'Aarya' };

/*
 * The marks you can leave on a single line of a thread. Tokens, not emoji:
 * the app draws each one as a glyph in its own icon set, so what gets stored
 * is the name of a mark rather than a character whose picture changes with
 * whatever font the phone happens to render it in.
 */
const TOKENS = ['heart', 'fire', 'bolt', 'star', 'nod'];
const SAID = {
  heart: 'loved', fire: 'fired up', bolt: 'charged', star: 'starred', nod: 'nodded at'
};

module.exports = async function handler(req, res) {
  // comment_reactions is part of the shared schema connect() ensures.
  const sql = await connect(res);
  if (!sql) return;

  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT comment_id, from_profile, token FROM comment_reactions`;
      return res.status(200).json({
        reactions: rows.map((r) => ({
          comment: Number(r.comment_id),
          from: r.from_profile,
          token: r.token
        }))
      });
    } catch (err) {
      return fail(res, err, 'Failed to load comment reactions');
    }
  }

  if (req.method === 'POST') {
    try {
      const { from, commentId, token } = req.body || {};
      const id = Number(commentId);
      if (!PROFILES.includes(from) || !Number.isInteger(id) || !TOKENS.includes(token)) {
        return res.status(400).json({ error: 'from, commentId and a supported reaction are required' });
      }

      // The comment is looked up before anything is written: it says who to
      // tell, and a mark on a line that has since been deleted is a row that
      // nothing will ever clean up.
      const found = await sql`
        SELECT id, from_profile, day_date::text AS day_date, body
        FROM comments WHERE id = ${id}
      `;
      if (!found.length) {
        return res.status(404).json({ error: 'That comment is gone' });
      }
      const comment = found[0];

      // The primary key is the toggle: the same mark twice takes it back.
      const existing = await sql`
        DELETE FROM comment_reactions
        WHERE comment_id = ${id} AND from_profile = ${from} AND token = ${token}
        RETURNING token
      `;
      if (existing.length) {
        return res.status(200).json({ ok: true, active: false });
      }

      await sql`
        INSERT INTO comment_reactions (comment_id, from_profile, token)
        VALUES (${id}, ${from}, ${token})
        ON CONFLICT DO NOTHING
      `;

      /*
       * Told once per (comment, mark), which is what the claim key buys:
       * taking a mark back and leaving it again is a fidget, not news.
       * Reacting to your own words never rings anything.
       */
      if (comment.from_profile !== from) {
        const said = SAID[token] || 'reacted to';
        await notify(sql, {
          to: comment.from_profile,
          date: comment.day_date,
          kind: `creact:${from}:${id}:${token}`,
          title: `${NAMES[from] || from} ${said} your comment`,
          body: comment.body.length > 120 ? `${comment.body.slice(0, 119)}…` : comment.body
        });
      }

      return res.status(200).json({ ok: true, active: true });
    } catch (err) {
      return fail(res, err, 'Failed to save comment reaction');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
