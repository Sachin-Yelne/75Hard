const { neon } = require('@neondatabase/serverless');

let sql;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}

let slotMigrated = false;

/*
 * photos was originally keyed (profile_id, day_date) — one frame per person per
 * day. Per-task photos need a third key column, so widen the table in place.
 *
 * Both /api/photos and /api/state read the slot column, so either can be the
 * first to touch a cold database. Runs once per process, no-op once the column
 * exists.
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

module.exports = { getSql, ensurePhotoSlot };
