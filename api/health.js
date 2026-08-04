const { getSql, ensureSchema } = require('./lib/db');

/**
 * Diagnostic endpoint. Open /api/health in a browser to see, in one JSON blob,
 * whether the API routes deployed at all, whether DATABASE_URL is set, and
 * whether the schema is reachable. The app itself only ever reports a failed
 * load as "Server unreachable", which does not say which of the three broke.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const checks = {
    api: 'ok',
    databaseUrl: process.env.DATABASE_URL ? 'set' : 'missing',
    database: 'unknown',
    schema: 'unknown'
  };

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      ok: false,
      checks,
      hint: 'Add DATABASE_URL (the pooled Neon connection string) in Vercel → Project → Settings → Environment Variables, then redeploy.'
    });
  }

  let sql;
  try {
    sql = getSql();
    await sql`SELECT 1`;
    checks.database = 'ok';
  } catch (err) {
    console.error(err);
    checks.database = 'failed';
    return res.status(503).json({
      ok: false,
      checks,
      detail: err.message,
      hint: 'The connection string is set but Neon did not answer. Check that the project is not deleted and that the string is the pooled one.'
    });
  }

  try {
    await ensureSchema(sql);
    checks.schema = 'ok';
  } catch (err) {
    console.error(err);
    checks.schema = 'failed';
    return res.status(503).json({
      ok: false,
      checks,
      detail: err.message,
      hint: 'Connected, but the tables could not be created. The database role probably lacks CREATE permission.'
    });
  }

  return res.status(200).json({ ok: true, checks });
};
