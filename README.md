# 75 Hard

A two-person PWA for the 75 Hard challenge — daily tasks, streaks, head-to-head rivalry, and a shared progress-photo feed, all synced through Neon Postgres.

## The app

Four tabs, phone-first:

- **Today** — the day number set large, a five-segment rule (one per task), streak, a live countdown to local midnight, and your partner's progress underneath. Completing all five holds a full-screen typographic moment for a second and a half, then returns you to the day.
- **Wall** — the 75-day grid for both people, with missed days, photo markers, and a milestone list.
- **Feed** — full-screen, snap-scrolling progress photos from both of you, newest first. Double-tap to give kudos, or use the button.
- **Rivals** — a side-by-side table: perfect days, current and longest streaks, consistency, per-task completion rates, frames posted, kudos received.

Pick who you are on first launch (stored locally); you can switch from the settings sheet. Your own progress is always clay, your partner's sage.

## Design

Editorial and deliberately restrained — near-black, hairline rules, Anton for figures and Barlow Condensed for labels. Two muted accents (clay `#C8613A` for you, sage `#6E7F6A` for your partner) carry all state; there are no gradients, glows, emoji, or confetti anywhere.

Icons come from Font Awesome Pro (`sharp-light`). The full library lives in `svgs/` locally and is **gitignored** — it's ~132MB across 35k files. Only the eight icons actually used are inlined as paths in `index.html`, totalling about 3KB. To swap one in, copy the `d` attribute out of the relevant `svgs/sharp-light/*.svg` and add it to the `ICON` map.

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
- The `reactions` table is created lazily by `api/reactions.js`; if it is unavailable the rest of the app still works, just without kudos. New rows are written with the token `kudos`; emoji tokens from the previous build still validate and still count.
- Free Neon + Vercel tiers are enough for two people over 75 days.
