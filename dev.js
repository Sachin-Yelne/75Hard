/*
 * Local dev server. Runs the real api/*.js handlers without needing `vercel dev`
 * (which requires an interactive project link).
 *
 *   node dev.js          → real mode, talks to DATABASE_URL from .env
 *   node dev.js --demo   → demo mode, in-memory seeded data, never touches the DB
 *
 * Listens on 0.0.0.0 so you can open it on your phone over the LAN.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEMO = process.argv.includes('--demo');
const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

/* ---- load .env (real mode only) ---- */
if (!DEMO) {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
  if (!process.env.DATABASE_URL) {
    console.error('No DATABASE_URL found in .env — run with --demo instead.');
    process.exit(1);
  }
}

/* ---- demo data: day 22 of 75, both profiles active ---- */
const TASK_IDS = ['diet', 'workout1', 'workout2', 'water', 'read'];
const demo = { data: { sachin: {}, aarya: {} }, photos: { sachin: {}, aarya: {} },
               reactions: [], comments: [], commentReactions: [] };
let demoCommentId = 1;
let demoStart;
{
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 21);
  demoStart = iso(start);
  const at = (n) => { const d = new Date(start); d.setDate(d.getDate() + n); return iso(d); };

  for (let i = 0; i < 21; i++) {
    const day = at(i);
    const sMiss = [4, 11].includes(i), aMiss = [8].includes(i);
    demo.data.sachin[day] = {}; demo.data.aarya[day] = {};
    TASK_IDS.forEach((t, ti) => {
      demo.data.sachin[day][t] = sMiss ? ti < 3 : true;
      demo.data.aarya[day][t]  = aMiss ? ti < 2 : true;
    });
    // vary how many slots each day carries so the feed carousel gets exercised
    if (i % 2 === 0) {
      demo.photos.sachin[day] = ['day'];
      if (i % 4 === 0) demo.photos.sachin[day].push('workout1', 'read');
      // several diet shots on some days, as snacks and dinner would land
      if (i % 6 === 0) {
        const meals = [3600000, 7200000, 9000000]
          .map((o) => `diet#${1750000000000 + i * 86400000 + o}`);
        demo.photos.sachin[day].push(...meals);
        // a couple named and judged, one left blank — all three states show
        demo.data.sachin[day].meals = {
          [meals[0]]: { nm: 'Eggs, two slices sourdough', v: 'fine' },
          [meals[1]]: { nm: 'Chipotle bowl, double chicken', v: 'loved' }
        };
        if (i % 12 === 0) demo.data.sachin[day].meals[meals[2]] =
          { nm: 'Gas station protein bar', v: 'regret' };
      }
    }
    if (i % 3 === 0) {
      demo.photos.aarya[day] = i % 6 === 0 ? ['day', 'workout2'] : ['workout1'];
    }
  }
  // completed past days carry a full log; today is mid-way so the meter shows
  for (const p of ['sachin', 'aarya']) {
    for (const [day, e] of Object.entries(demo.data[p])) {
      if (e.water) { e.waterOz = 128; e.waterLog = [32, 32, 32, 16, 16]; }
    }
  }
  const t = iso(today);
  demo.data.sachin[t] = { diet: true, workout1: true, workout2: false, water: false, read: false,
                          waterOz: 48, waterLog: [16, 16, 16] };
  demo.data.aarya[t]  = { diet: true, workout1: true, workout2: true, water: true, read: false,
                          waterOz: 128, waterLog: [32, 32, 32, 32] };
  demo.reactions = [
    { from: 'aarya', to: 'sachin', date: at(20), emoji: 'kudos' },
    { from: 'aarya', to: 'sachin', date: at(18), emoji: 'kudos' },
    { from: 'sachin', to: 'aarya', date: at(18), emoji: 'kudos' }
  ];
  // a couple of days carry a track, so the feed has something to play
  demo.data.sachin[at(20)].track =
    { id: 9001, nm: 'Delilah (pull me out of this)', ar: 'Fred again..',
      art: '/api/music?art=9001', url: '/api/music?tone=330' };
  demo.data.aarya[at(18)].track =
    { id: 9002, nm: 'Nightcall', ar: 'Kavinsky',
      art: '/api/music?art=9002', url: '/api/music?tone=262' };
  demo.data.sachin[at(16)].track =
    { id: 9006, nm: 'Sun Models', ar: 'ODESZA',
      art: '/api/music?art=9006', url: '/api/music?tone=349' };

  const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
  demo.comments = [
    { id: demoCommentId++, from: 'aarya', to: 'sachin', date: at(20), slot: 'day',
      body: 'Look at the shoulders on day 21 vs day 1.', parent: null, at: ago(320) },
    // a reply and a reply to the reply, so the thread renders both levels
    { id: demoCommentId++, from: 'sachin', to: 'sachin', date: at(20), slot: 'day',
      body: "Don't say that, I'll get cocky.", parent: 1, at: ago(300) },
    { id: demoCommentId++, from: 'aarya', to: 'sachin', date: at(20), slot: 'day',
      body: 'Too late.', parent: 1, at: ago(288) },
    { id: demoCommentId++, from: 'sachin', to: 'sachin', date: at(20), slot: 'day',
      body: 'Barely made the second one, it was pouring.', parent: null, at: ago(180) },
    { id: demoCommentId++, from: 'sachin', to: 'aarya', date: at(18), slot: 'workout1',
      body: 'That hill again? Respect.', parent: null, at: ago(96) }
  ];
  // stored the way the table stores it: one row per (comment, person, emoji)
  demo.commentReactions = [
    { comment: 1, from: 'sachin', emoji: '❤️' },
    { comment: 1, from: 'aarya', emoji: '🔥' },
    { comment: 3, from: 'sachin', emoji: '👍' },
    { comment: 3, from: 'aarya', emoji: '👍' },
    { comment: 5, from: 'aarya', emoji: '🔥' }
  ];
}

/* ---- demo music: canned catalogue + a synthesised preview to play ---- */
const DEMO_TRACKS = [
  { id: 9001, nm: 'Delilah (pull me out of this)', ar: 'Fred again..', hz: 330 },
  { id: 9002, nm: 'Nightcall', ar: 'Kavinsky', hz: 262 },
  { id: 9003, nm: 'Weightless', ar: 'Marconi Union', hz: 220 },
  { id: 9004, nm: 'Alright', ar: 'Kendrick Lamar', hz: 392 },
  { id: 9005, nm: 'Teardrop', ar: 'Massive Attack', hz: 294 },
  { id: 9006, nm: 'Sun Models', ar: 'ODESZA', hz: 349 }
];
const demoTrack = (t) => ({
  id: t.id, nm: t.nm, ar: t.ar,
  art: `/api/music?art=${t.id}`,
  url: `/api/music?tone=${t.hz}`
});

/* A few seconds of a quiet sine, so the feed's audio path is real in demo. */
function toneWav(seconds, freq) {
  const rate = 8000;
  const n = rate * seconds;
  const data = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    // fade the ends so looping doesn't click
    const env = Math.min(1, i / 400, (n - i) / 400);
    data[i] = 128 + Math.round(45 * env * Math.sin((2 * Math.PI * freq * i) / rate));
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + n, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate, 28); h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34);
  h.write('data', 36); h.writeUInt32LE(n, 40);
  return Buffer.concat([h, data]);
}

/* ---- generated placeholder photos for demo mode ---- */
const zlib = require('zlib');
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const demoUploads = new Map();   // prof|date|slot -> { type, buf }
const demoThumbs  = new Map();   // prof|date|slot -> Buffer, once one exists
const pngCache = new Map();
function demoPng(seed) {
  if (pngCache.has(seed)) return pngCache.get(seed);
  const W = 120, H = 214;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r0 = 45 + (h % 120), g0 = 40 + ((h >> 5) % 110), b0 = 38 + ((h >> 10) % 100);
  const raw = Buffer.alloc(H * (W * 3 + 1));
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      const t = y / H;
      raw[o++] = Math.round(r0 * (1 - t) + 14 * t);
      raw[o++] = Math.round(g0 * (1 - t) + 14 * t);
      raw[o++] = Math.round(b0 * (1 - t) + 16 * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
  pngCache.set(seed, png);
  return png;
}

/* ---- Vercel-style req/res shims over node http ---- */
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (_) { resolve({}); } });
  });
}
function shimRes(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (d) => { res.end(Buffer.isBuffer(d) ? d : String(d)); return res; };
  return res;
}

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json',
               '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

/* The aggregate the real handler builds in SQL: one row per (comment, emoji)
   with a count and whether the person asking is in it. */
function demoRx(me) {
  const by = new Map();
  for (const r of demo.commentReactions) {
    const k = r.comment + '\u0000' + r.emoji;
    const hit = by.get(k) || { c: r.comment, e: r.emoji, n: 0, mine: false };
    hit.n++;
    if (r.from === me) hit.mine = true;
    by.set(k, hit);
  }
  return [...by.values()].sort((a, b) => a.c - b.c || b.n - a.n || (a.e < b.e ? -1 : 1));
}

/* ---- demo API ---- */
async function demoApi(pathname, req, res, url) {
  if (pathname === '/api/state') {
    if (req.method === 'PUT') {
      const b = await readBody(req);
      demo.data[b.profileId][b.date] = b.tasks;
      return res.status(200).json({ ok: true });
    }
    /*
     * Half the seeded frames deliberately arrive without a thumb, so the
     * backfill the real app runs against a pre-thumbnail database is something
     * you can actually watch happen locally.
     */
    const needThumb = [];
    for (const [prof, byDay] of Object.entries(demo.photos)) {
      for (const [day, slots] of Object.entries(byDay)) {
        for (const slot of slots) {
          const key = `${prof}|${day}|${slot}`;
          if (!demoThumbs.has(key)) needThumb.push(key);
        }
      }
    }
    return res.status(200).json({ startDate: demoStart, data: demo.data, photos: demo.photos, needThumb });
  }
  if (pathname === '/api/reactions') {
    if (req.method === 'POST') {
      const b = await readBody(req);
      const i = demo.reactions.findIndex((r) =>
        r.from === b.from && r.to === b.to && r.date === b.date && r.emoji === b.emoji);
      if (i >= 0) demo.reactions.splice(i, 1); else demo.reactions.push(b);
      return res.status(200).json({ ok: true, active: i < 0 });
    }
    return res.status(200).json({ reactions: demo.reactions });
  }
  if (pathname === '/api/photos') {
    const prof = url.searchParams.get('profile'), date = url.searchParams.get('date');
    const slot = url.searchParams.get('slot') || 'day';
    if (req.method === 'POST') {
      const b = await readBody(req);
      const key = `${prof}|${date}|${slot}`;
      // a body with only a thumb is the backfill filling in an old frame
      if (!b.dataBase64 && b.thumbBase64) {
        if (!demoThumbs.has(key)) demoThumbs.set(key, Buffer.from(b.thumbBase64, 'base64'));
        return res.status(200).json({ ok: true, filled: true });
      }
      const list = (demo.photos[prof][date] ||= []);
      if (!list.includes(slot)) list.push(slot);
      // keep the real bytes so what you upload is what you see back
      if (b.dataBase64) {
        demoUploads.set(key, { type: b.contentType || 'image/jpeg', buf: Buffer.from(b.dataBase64, 'base64') });
      }
      if (b.thumbBase64) demoThumbs.set(key, Buffer.from(b.thumbBase64, 'base64'));
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      const list = demo.photos[prof][date] || [];
      const i = list.indexOf(slot);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) delete demo.photos[prof][date];
      demoUploads.delete(`${prof}|${date}|${slot}`);
      return res.status(200).json({ ok: true });
    }
    if (!(demo.photos[prof]?.[date] || []).includes(slot)) return res.status(404).json({ error: 'not found' });
    // COALESCE(thumb, data), the same fallback the real handler does
    if (url.searchParams.get('size') === 'thumb') {
      const t = demoThumbs.get(`${prof}|${date}|${slot}`);
      if (t) { res.setHeader('Content-Type', 'image/jpeg'); return res.status(200).send(t); }
    }
    const up = demoUploads.get(`${prof}|${date}|${slot}`);
    if (up) {
      res.setHeader('Content-Type', up.type);
      return res.status(200).send(up.buf);
    }
    res.setHeader('Content-Type', 'image/png');
    return res.status(200).send(demoPng(prof + date + slot));
  }
  if (pathname === '/api/music') {
    const tone = url.searchParams.get('tone');
    if (tone) {
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(toneWav(6, Number(tone) || 330));
    }
    const art = url.searchParams.get('art');
    if (art) {
      res.setHeader('Content-Type', 'image/png');
      return res.status(200).send(demoPng('art' + art));
    }
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const id = url.searchParams.get('id');
    if (id) return res.status(200).json({
      tracks: DEMO_TRACKS.filter((t) => String(t.id) === id).map(demoTrack) });
    const hits = q
      ? DEMO_TRACKS.filter((t) => (t.nm + ' ' + t.ar).toLowerCase().includes(q))
      : [];
    return res.status(200).json({ tracks: (hits.length ? hits : DEMO_TRACKS).map(demoTrack) });
  }
  if (pathname === '/api/comments') {
    if (req.method === 'POST') {
      const b = await readBody(req);
      const body = String(b.body || '').trim();
      if (!body) return res.status(400).json({ error: 'Comment is empty' });
      // replies are one level deep and inherit the frame their parent is on,
      // exactly as the real handler does it
      const parent = b.parentId == null ? null
        : demo.comments.find((c) => c.id === Number(b.parentId) && c.to === b.to && c.date === b.date);
      if (b.parentId != null && !parent) return res.status(404).json({ error: 'That comment is gone' });
      const c = { id: demoCommentId++, from: b.from, to: b.to, date: b.date,
                  slot: parent ? parent.slot : (b.slot || 'day'), body,
                  parent: parent ? (parent.parent ?? parent.id) : null,
                  at: new Date().toISOString() };
      demo.comments.push(c);
      return res.status(200).json({ ok: true, comment: c });
    }
    if (req.method === 'DELETE') {
      const id = Number(url.searchParams.get('id'));
      const from = url.searchParams.get('from');
      const i = demo.comments.findIndex((c) => c.id === id && c.from === from);
      if (i < 0) return res.status(404).json({ error: 'Comment not found' });
      demo.comments.splice(i, 1);
      const gone = [id];
      for (let j = demo.comments.length - 1; j >= 0; j--) {
        if (demo.comments[j].parent === id) gone.push(demo.comments.splice(j, 1)[0].id);
      }
      demo.commentReactions = demo.commentReactions.filter((r) => !gone.includes(r.comment));
      return res.status(200).json({ ok: true, removed: gone });
    }
    return res.status(200).json({
      comments: demo.comments, reactions: demoRx(url.searchParams.get('me')) });
  }
  if (pathname === '/api/comment-reactions') {
    if (req.method === 'POST') {
      const b = await readBody(req);
      const id = Number(b.commentId);
      if (!demo.comments.some((c) => c.id === id)) {
        return res.status(404).json({ error: 'That comment is gone' });
      }
      const i = demo.commentReactions.findIndex((r) =>
        r.comment === id && r.from === b.from && r.emoji === b.emoji);
      if (i >= 0) {
        demo.commentReactions.splice(i, 1);
        return res.status(200).json({ ok: true, active: false });
      }
      // the same cap the real handler applies inside its insert
      const held = demo.commentReactions.filter((r) => r.comment === id && r.from === b.from).length;
      if (held >= 6) {
        return res.status(409).json({ error: "That's 6 reactions on one comment — take one back first",
                                      code: 'REACTION_LIMIT' });
      }
      demo.commentReactions.push({ comment: id, from: b.from, emoji: b.emoji });
      return res.status(200).json({ ok: true, active: true });
    }
    return res.status(200).json({ reactions: demoRx(url.searchParams.get('me')) });
  }
  if (pathname === '/api/push') {
    // demo mode has no push service; report it as unavailable
    return res.status(200).json({ enabled: false, publicKey: null });
  }
  if (pathname === '/api/health') {
    return res.status(200).json({
      ok: true,
      checks: { api: 'ok', databaseUrl: 'demo', database: 'demo', schema: 'demo' }
    });
  }
  return res.status(404).json({ error: 'no route' });
}

/* ---- server ---- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  shimRes(res);

  if (p.startsWith('/api/')) {
    try {
      if (DEMO) return await demoApi(p, req, res, url);
      req.query = Object.fromEntries(url.searchParams);
      if (req.method !== 'GET') req.body = await readBody(req);
      const file = path.join(ROOT, 'api', p.replace('/api/', '') + '.js');
      if (!fs.existsSync(file)) return res.status(404).json({ error: 'no route' });
      delete require.cache[require.resolve(file)];
      return await require(file)(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: String(err.message || err) });
      return;
    }
  }

  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(fs.readFileSync(file));
  }
  res.status(404).end('not found');
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  console.log(`\n  75 HARD — ${DEMO ? 'DEMO (seeded, no database)' : 'REAL (your Neon database)'}`);
  console.log(`  local   http://localhost:${PORT}`);
  if (lan) console.log(`  phone   http://${lan.address}:${PORT}`);
  console.log('');
});
