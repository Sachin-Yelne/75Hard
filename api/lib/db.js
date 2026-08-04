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

/**
 * Resolve a ready-to-use `sql` tag, or answer the request with a specific
 * error and return null. Handlers used to call getSql() at the top level,
 * outside their try/catch, so a missing DATABASE_URL crashed the function and
 * Vercel returned an opaque 500.
 */
async function connect(res) {
  let s;
  try {
    s = getSql();
  } catch (err) {
    console.error(err);
    res.status(503).json({
      error: 'Database not configured — set DATABASE_URL in Vercel',
      code: 'NO_DATABASE_URL'
    });
    return null;
  }

  try {
    await ensureSchema(s);
  } catch (err) {
    console.error(err);
    res.status(503).json({
      error: 'Database unreachable — check DATABASE_URL and that Neon is awake',
      code: 'DB_UNAVAILABLE'
    });
    return null;
  }

  return s;
}

module.exports = { getSql, ensurePhotoSlot, ensureSchema, connect };
