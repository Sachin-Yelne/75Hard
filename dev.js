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
const demo = { data: { sachin: {}, aarya: {} }, photos: { sachin: {}, aarya: {} }, reactions: [] };
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
      if (i % 6 === 0) demo.photos.sachin[day].push('water');
    }
    if (i % 3 === 0) {
      demo.photos.aarya[day] = i % 6 === 0 ? ['day', 'workout2'] : ['workout1'];
    }
  }
  const t = iso(today);
  demo.data.sachin[t] = { diet: true, workout1: true, workout2: false, water: false, read: false };
  demo.data.aarya[t]  = { diet: true, workout1: true, workout2: true, water: true, read: false };
  demo.reactions = [
    { from: 'aarya', to: 'sachin', date: at(20), emoji: 'kudos' },
    { from: 'aarya', to: 'sachin', date: at(18), emoji: 'kudos' },
    { from: 'sachin', to: 'aarya', date: at(18), emoji: 'kudos' }
  ];
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

/* ---- demo API ---- */
async function demoApi(pathname, req, res, url) {
  if (pathname === '/api/state') {
    if (req.method === 'PUT') {
      const b = await readBody(req);
      demo.data[b.profileId][b.date] = b.tasks;
      return res.status(200).json({ ok: true });
    }
    return res.status(200).json({ startDate: demoStart, data: demo.data, photos: demo.photos });
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
      const list = (demo.photos[prof][date] ||= []);
      if (!list.includes(slot)) list.push(slot);
      // keep the real bytes so what you upload is what you see back
      const b = await readBody(req);
      if (b.dataBase64) {
        demoUploads.set(`${prof}|${date}|${slot}`,
          { type: b.contentType || 'image/jpeg', buf: Buffer.from(b.dataBase64, 'base64') });
      }
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
    const up = demoUploads.get(`${prof}|${date}|${slot}`);
    if (up) {
      res.setHeader('Content-Type', up.type);
      return res.status(200).send(up.buf);
    }
    res.setHeader('Content-Type', 'image/png');
    return res.status(200).send(demoPng(prof + date + slot));
  }
  if (pathname === '/api/reset') {
    demo.data = { sachin: {}, aarya: {} };
    demo.photos = { sachin: {}, aarya: {} };
    demo.reactions = [];
    demoStart = new Date().toISOString().slice(0, 10);
    return res.status(200).json({ ok: true, startDate: demoStart });
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
