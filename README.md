# 75 Hard

A two-person PWA for the 75 Hard challenge — daily tasks, streaks, head-to-head rivalry, and a shared progress-photo feed, all synced through Neon Postgres.

## The app

Four tabs, phone-first:

- **Today** — a five-segment progress ring (one arc per task), streak counter, a live countdown to midnight, and a head-to-head strip showing where you stand against your partner right now. Completing all five fires a full-screen celebration with confetti.
- **Wall** — the 75-day grid for both people, with missed days, photo markers, milestone days, and unlockable badges.
- **Feed** — full-screen, snap-scrolling progress photos from both of you, newest first. Double-tap to send 🔥, or tap a reaction chip.
- **Rivals** — side-by-side stats: current and longest streaks, consistency, per-task completion rates, photos posted, kudos received.

Pick who you are on first launch (stored locally); you can switch from the settings sheet.

## Run locally

```bash
npm install
```

```bash
cp .env.example .env
```

Paste your Neon `DATABASE_URL` into `.env`, then:

```bash
npx vercel dev
```

Open the URL Vercel prints (usually http://localhost:3000).

> A plain static server won't work — the app needs the `/api` routes.

## Deploy on Vercel

1. Push to GitHub and import in Vercel (or redeploy if already connected).
2. In Vercel → **Project → Settings → Environment Variables**, add:
   - `DATABASE_URL` = your Neon connection string (use the **pooled** one)
3. Redeploy.

Get the connection string from the [Neon console](https://console.neon.tech) → your **75Hard** project → Connect.

## Install on iPhone

1. Open your deployed HTTPS URL in **Safari**.
2. Tap **Share** → **Add to Home Screen**.

Both phones see the same synced progress, photos, and kudos.

## Database schema

Neon project **75Hard** stores:

- `challenge_meta` — challenge start date
- `day_tasks` — task checkboxes per profile per day
- `photos` — compressed progress pics (JPEG bytes)
- `reactions` — kudos between profiles, created automatically on first use

## Project structure

```
index.html        Frontend PWA (single file, no build step)
api/              Vercel serverless routes
  state.js        Load/save tasks
  photos.js       Upload/view/delete pics
  reactions.js    Kudos between profiles
  reset.js        Start a new challenge
manifest.json     PWA install config
sw.js             Offline shell cache
```

## Notes

- Photos are resized on-device before upload (max ~1200px, JPEG). Max 4MB after compression.
- All day boundaries use the device's **local** date, so the day rolls over at local midnight rather than UTC.
- `index.html` is served network-first by the service worker, so a redeploy reaches both phones instead of being pinned to a cached shell.
- The `reactions` table is created lazily by `api/reactions.js`; if it's unavailable the rest of the app still works, just without kudos.
- Free Neon + Vercel tiers are enough for two people over 75 days.
