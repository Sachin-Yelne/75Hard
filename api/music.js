/*
 * Track search for the feed's music.
 *
 * Proxied rather than called from the phone for two reasons: the iTunes
 * endpoint doesn't send CORS headers, and one warm instance can answer a
 * repeated search from memory instead of hitting Apple once per keystroke per
 * device. Apple serves the audio itself — the 30s preview streams straight
 * from their CDN to the phone and never passes through here.
 *
 * This route never touches Neon. What reaches Postgres is the five fields a
 * chosen track needs, and those ride the day's existing tasks JSONB.
 */
const ITUNES = 'https://itunes.apple.com';
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 60;
const TIMEOUT_MS = 6000;

const cache = new Map();   // key -> { at, tracks }

function remember(key, tracks) {
  cache.set(key, { at: Date.now(), tracks });
  // bounded so a long-lived instance can't grow without limit
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}

function recall(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { cache.delete(key); return null; }
  return hit.tracks;
}

/* Only what a post needs to render and play. artworkUrl100 resizes by name. */
const trim = (r) => ({
  id: r.trackId,
  nm: r.trackName,
  ar: r.artistName,
  art: (r.artworkUrl100 || '').replace('100x100', '200x200'),
  url: r.previewUrl
});

async function fromApple(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${ITUNES}${path}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Project75/1.0' }
    });
    if (!r.ok) throw new Error(`iTunes ${r.status}`);
    const body = await r.json();
    // a track with no preview can't be played, so it isn't offered
    return (body.results || []).map(trim).filter((t) => t.id && t.url && t.nm);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = (req.query.q || '').toString().trim().slice(0, 120);
  const id = (req.query.id || '').toString().trim();

  // `id` re-resolves a saved track: preview URLs rotate, the id doesn't.
  const key = id ? `id:${id}` : `q:${q.toLowerCase()}`;
  if (!q && !id) return res.status(200).json({ tracks: [] });

  const cached = recall(key);
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=600');
    return res.status(200).json({ tracks: cached, cached: true });
  }

  try {
    const path = id
      ? `/lookup?id=${encodeURIComponent(id)}&entity=song`
      : `/search?term=${encodeURIComponent(q)}&entity=song&limit=20`;
    const tracks = await fromApple(path);
    remember(key, tracks);
    res.setHeader('Cache-Control', 'public, max-age=600');
    return res.status(200).json({ tracks });
  } catch (err) {
    console.error('music search failed', err && err.message);
    // Music is a garnish: a failed search says so and leaves the rest alone.
    return res.status(502).json({ error: 'Could not reach the music catalogue', tracks: [] });
  }
};
