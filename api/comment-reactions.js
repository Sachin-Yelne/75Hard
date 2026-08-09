const { connect, fail } = require('./lib/db');
const { notify } = require('./lib/push');

const PROFILES = ['sachin', 'aarya'];
const NAMES = { sachin: 'Sachin', aarya: 'Aarya' };

/*
 * A reaction is whatever came off the phone's emoji keyboard, so the server
 * can't hold a list of what's allowed — it can only say "that is one emoji".
 *
 * `\p{RGI_Emoji}` with the v flag is exactly that test: it matches one
 * well-formed emoji, including the awkward ones (skin tones, keycaps, flags,
 * and ZWJ sequences like a four-person family), and rejects plain text, an
 * empty string, and two emoji stuck together. Without it a reaction would be a
 * second comment field with no length limit and no escaping story.
 *
 * The regex needs a runtime new enough to know the v flag; where it isn't,
 * fall back to a coarser shape test rather than letting anything through.
 */
let ONE_EMOJI = null;
try {
  ONE_EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v');
} catch (_) { /* older runtime — the fallback below carries it */ }

// A family-of-four ZWJ sequence is 25 bytes; nothing legitimate is longer.
const MAX_BYTES = 32;

function isEmoji(value) {
  if (typeof value !== 'string' || !value) return false;
  if (Buffer.byteLength(value, 'utf8') > MAX_BYTES) return false;
  if (ONE_EMOJI) return ONE_EMOJI.test(value);
  // Coarse fallback: pictographic content only, and short enough to be one.
  return /\p{Extended_Pictographic}/u.test(value) &&
    /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️]+$/u.test(value) &&
    [...value].length <= 12;
}

/*
 * How many different emoji one person may leave on one comment. The five drawn
 * marks this replaced were their own limit — there were only five. Anything off
 * a keyboard is unbounded, and a row per tap with nothing stopping it is how a
 * two-person table grows to thousands of rows nobody asked for. Six is more
 * than anyone means and still a number.
 */
const MAX_PER_PERSON = 6;

module.exports = async function handler(req, res) {
  // comment_reactions is part of the shared schema connect() ensures.
  const sql = await connect(res);
  if (!sql) return;

  if (req.method === 'GET') {
    /*
     * Aggregated, the same way the thread reads it: one row per (comment,
     * emoji) with a count, rather than one row per person. `me` is who is
     * asking, which is the only thing an individual row was still carrying.
     */
    try {
      const me = PROFILES.includes(req.query.me) ? req.query.me : '';
      const rows = await sql`
        SELECT comment_id, emoji, count(*)::int AS n,
               bool_or(from_profile = ${me}) AS mine
        FROM comment_reactions
        GROUP BY comment_id, emoji
        ORDER BY comment_id, count(*) DESC, emoji
      `;
      return res.status(200).json({
        reactions: rows.map((r) => ({
          c: Number(r.comment_id), e: r.emoji, n: r.n, mine: r.mine
        }))
      });
    } catch (err) {
      return fail(res, err, 'Failed to load comment reactions');
    }
  }

  if (req.method === 'POST') {
    try {
      const { from, commentId, emoji } = req.body || {};
      const id = Number(commentId);
      if (!PROFILES.includes(from) || !Number.isInteger(id) || !isEmoji(emoji)) {
        return res.status(400).json({ error: 'from, commentId and one emoji are required' });
      }

      // The comment is looked up before anything is written: it says who to
      // tell, and a reaction on a line that has since been deleted is a row
      // nothing will ever clean up.
      const found = await sql`
        SELECT id, from_profile, day_date::text AS day_date, body
        FROM comments WHERE id = ${id}
      `;
      if (!found.length) {
        return res.status(404).json({ error: 'That comment is gone' });
      }
      const comment = found[0];

      // The primary key is the toggle: the same emoji twice takes it back.
      const existing = await sql`
        DELETE FROM comment_reactions
        WHERE comment_id = ${id} AND from_profile = ${from} AND emoji = ${emoji}
        RETURNING emoji
      `;
      if (existing.length) {
        return res.status(200).json({ ok: true, active: false });
      }

      /*
       * The cap is applied inside the insert rather than by reading first and
       * writing second — two phones tapping at once would both pass a separate
       * check. No row back means the cap is full, since the delete above has
       * already ruled out a conflict.
       */
      const added = await sql`
        INSERT INTO comment_reactions (comment_id, from_profile, emoji)
        SELECT ${id}, ${from}, ${emoji}
        WHERE (
          SELECT count(*) FROM comment_reactions
          WHERE comment_id = ${id} AND from_profile = ${from}
        ) < ${MAX_PER_PERSON}
        ON CONFLICT DO NOTHING
        RETURNING emoji
      `;
      if (!added.length) {
        return res.status(409).json({
          error: `That's ${MAX_PER_PERSON} reactions on one comment — take one back first`,
          code: 'REACTION_LIMIT'
        });
      }

      /*
       * Told once per (comment, emoji), which is what the claim key buys:
       * taking one back and leaving it again is a fidget, not news. Reacting
       * to your own words never rings anything.
       */
      if (comment.from_profile !== from) {
        await notify(sql, {
          to: comment.from_profile,
          date: comment.day_date,
          kind: `creact:${from}:${id}:${emoji}`,
          title: `${NAMES[from] || from} reacted ${emoji} to your comment`,
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
