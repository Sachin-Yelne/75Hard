const { neon } = require('@neondatabase/serverless');

let sql;
let schemaReady = null;
let slotMigrated = false;

function getSql() {
  if (!process.env.DATABASE_URL) {
    const err = new Error('DATABASE_URL is not configured');
    err.code = 'NO_DATABASE_URL';
    throw err;
  }
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}

/*
 * photos predates per-task photos and was keyed (profile_id, day_date) — one
 * frame per person per day. Widen an existing table in place; a table created
 * by createSchema below already has the column. No-op once it exists.
 */
async function ensurePhotoSlot(sqlClient) {
  if (slotMigrated) return;
  const existing = await sqlClient`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'photos' AND column_name = 'slot'
  `;
  if (!existing.length) {
    await sqlClient`ALTER TABLE photos ADD COLUMN slot text NOT NULL DEFAULT 'day'`;
    await sqlClient`ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_pkey`;
    await sqlClient`ALTER TABLE photos ADD PRIMARY KEY (profile_id, day_date, slot)`;
  }
  slotMigrated = true;
}

/*
 * A second, small rendition of each frame, for the places that draw a photo at
 * a couple of hundred pixels. Nullable on purpose: a frame posted before this
 * existed simply has no thumb, reads are written to fall back to the full
 * image, and the app fills them in from the phone as it goes.
 */
async function ensureThumb(sqlClient) {
  await sqlClient`ALTER TABLE photos ADD COLUMN IF NOT EXISTS thumb bytea`;
}

// challenge_meta, day_tasks and photos used to be expected to already exist —
// only `reactions` created itself. A database that had never been set up by
// hand therefore failed every request, which the UI reported as the generic
// "Server unreachable". Create them all on demand instead; IF NOT EXISTS
// leaves an already-populated database untouched, and ensurePhotoSlot then
// brings a pre-slot photos table up to the current shape.
async function createSchema(s) {
  await s`
    CREATE TABLE IF NOT EXISTS challenge_meta (
      id         integer PRIMARY KEY,
      start_date date NOT NULL
    )
  `;
  await s`
    CREATE TABLE IF NOT EXISTS day_tasks (
      profile_id text NOT NULL,
      day_date   date NOT NULL,
      tasks      jsonb NOT NULL,
      PRIMARY KEY (profile_id, day_date)
    )
  `;
  await s`
    CREATE TABLE IF NOT EXISTS photos (
      profile_id   text NOT NULL,
      day_date     date NOT NULL,
      slot         text NOT NULL DEFAULT 'day',
      content_type text NOT NULL DEFAULT 'image/jpeg',
      data         bytea NOT NULL,
      -- the collage-sized rendition of the same frame; see ensureThumb
      thumb        bytea,
      updated_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (profile_id, day_date, slot)
    )
  `;
  await s`
    CREATE TABLE IF NOT EXISTS reactions (
      from_profile text NOT NULL,
      to_profile   text NOT NULL,
      day_date     date NOT NULL,
      emoji        text NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (from_profile, to_profile, day_date, emoji)
    )
  `;
  // one thread per feed post — the post's owner and day, plus the photo slot
  // the comment was written under, so a note on one frame can say which
  await s`
    CREATE TABLE IF NOT EXISTS comments (
      id           bigserial PRIMARY KEY,
      from_profile text NOT NULL,
      to_profile   text NOT NULL,
      day_date     date NOT NULL,
      slot         text NOT NULL DEFAULT 'day',
      body         text NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now()
    )
  `;
  await s`
    CREATE INDEX IF NOT EXISTS comments_thread_idx ON comments (to_profile, day_date)
  `;
  await s`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint   text PRIMARY KEY,
      profile_id text NOT NULL,
      p256dh     text NOT NULL,
      auth       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  // one row per notification actually sent, so nothing rings twice
  await s`
    CREATE TABLE IF NOT EXISTS notifications_sent (
      profile_id text NOT NULL,
      day_date   date NOT NULL,
      kind       text NOT NULL,
      sent_at    timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (profile_id, day_date, kind)
    )
  `;
  await ensurePhotoSlot(s);
  await ensureThumb(s);
}

// Memoised per warm instance, but a failure clears the memo so the next
// request retries rather than caching a broken database forever.
function ensureSchema(s) {
  if (!schemaReady) {
    schemaReady = createSchema(s).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/*
 * The schema check used to run ahead of every request. It is eight statements,
 * each its own HTTP round trip on the serverless driver, and on a database
 * that has been set up since the first deploy all eight are no-ops — so every
 * cold start paid a fifth of a second to be told nothing had changed. Two
 * people opening the app a few times a day are almost always cold, which made
 * that the standing cost of the whole API rather than a one-off.
 *
 * So don't ask. Run the query, and only if Postgres says the table or column
 * isn't there, build the schema and run it again. The happy path costs
 * nothing, and the setup path — first deploy, or a migration that adds a
 * column — still heals itself on the one request that trips over it.
 */
const MISSING = new Set([
  '42P01',   // undefined_table
  '42703'    // undefined_column, i.e. a migration this build expects
]);
const isMissingSchema = (err) =>
  MISSING.has(err?.code) ||
  // the driver doesn't always surface a SQLSTATE; the text is the fallback
  /relation .* does not exist|column .* does not exist/i.test(err?.message || '');

/*
 * Wraps the tag so callers are untouched: `sql\`…\`` still returns rows. Only
 * the first query to notice a missing table pays for the repair, and the memo
 * in ensureSchema keeps concurrent misses from all building it at once.
 */
function guard(s) {
  return async (strings, ...vals) => {
    try {
      return await s(strings, ...vals);
    } catch (err) {
      if (!isMissingSchema(err)) throw err;
      await ensureSchema(s);
      return s(strings, ...vals);
    }
  };
}

/**
 * Resolve a ready-to-use `sql` tag, or answer the request with a specific
 * error and return null. Handlers used to call getSql() at the top level,
 * outside their try/catch, so a missing DATABASE_URL crashed the function and
 * Vercel returned an opaque 500.
 */
function connect(res) {
  try {
    return guard(getSql());
  } catch (err) {
    console.error(err);
    res.status(503).json({
      error: 'Database not configured — set DATABASE_URL in Vercel',
      code: 'NO_DATABASE_URL'
    });
    return null;
  }
}

/*
 * connect() no longer touches the database, so "Neon is asleep" now surfaces
 * when the handler's own query fails rather than before it runs. Handlers
 * report through here so that case keeps saying what it used to say instead of
 * being flattened into the generic 500 for its route.
 */
function fail(res, err, message) {
  console.error(err);
  const offline = /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|terminating connection|Connection terminated/i
    .test(err?.message || '');
  if (offline) {
    return res.status(503).json({
      error: 'Database unreachable — check DATABASE_URL and that Neon is awake',
      code: 'DB_UNAVAILABLE'
    });
  }
  return res.status(500).json({ error: message });
}

module.exports = { getSql, ensurePhotoSlot, ensureSchema, connect, fail };
