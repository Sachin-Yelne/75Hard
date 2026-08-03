# 75 Hard

A two-person PWA for the 75 Hard challenge — daily tasks, streaks, head-to-head rivalry, and a shared progress-photo feed, all synced through Neon Postgres.

## The app

Four tabs, phone-first:

- **Today** — the day number set large, a five-segment rule (one per task), streak, a live countdown to local midnight, and your partner's progress underneath. Workout One, Workout Two and Read each carry an optional camera; tap it to attach a photo, or ignore it. Diet starts ticked — you only touch it to record a day you didn't keep it. Completing all five holds a full-screen typographic moment for a second and a half, then returns you to the day.
- **Water** is logged incrementally rather than ticked. Tap the row to open the tracker, then tap a vessel — a 16 oz bottle, a 32 oz tumbler, whatever you keep — to pour it toward the gallon. The row's own bottom hairline fills as you go, and the task checks itself at 128 oz. Undo removes the last pour; the checkbox is still there as a shortcut for filling or clearing the day outright.
- **Wall** — the 75-day grid for both people, with missed days, photo markers, and a milestone list.
- **Feed** — full-screen, snap-scrolling photos from both of you, newest first. Scroll vertically through days; if a day carries more than one photo, swipe sideways through them, with a caption naming the task and a segmented bar tracking position. Double-tap to give kudos, or use the button.
- **Rivals** — a side-by-side table: perfect days, current and longest streaks, consistency, per-task completion rates, photos posted, kudos received.

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
- `photos` — compressed pics (JPEG bytes), keyed `(profile_id, day_date, slot)`.
  `slot` is `day` for the daily progress frame, or a task id for an optional
  per-task photo.
- `reactions` — kudos between profiles

All four are created on the first request (`CREATE TABLE IF NOT EXISTS`, in
`api/lib/db.js`), and a `photos` table predating the `slot` column is widened
in place at the same time. Pointing `DATABASE_URL` at an empty Neon database is
enough — there is no migration step to run by hand.

## Troubleshooting

**"Server unreachable" / "offline" in the app.** The phone is fine; the app is
telling you `GET /api/state` failed. Open `/api/health` on the deployed URL for
the specific cause:

```json
{ "ok": true, "checks": { "api": "ok", "databaseUrl": "set", "database": "ok", "schema": "ok" } }
```

- `databaseUrl: "missing"` — `DATABASE_URL` is not set for the environment you
  deployed to. Add it under **Project → Settings → Environment Variables** for
  **Production**, then redeploy. Adding a variable does not update the running
  deployment on its own.
- `database: "failed"` — the string is set but Neon did not answer. Confirm the
  project still exists and that you copied the **pooled** connection string.
- A 404 on `/api/health` — the serverless functions did not deploy at all, so
  none of `/api/*` exists. Check the Vercel build log for the `api/` directory.

## Project structure

```
index.html        Frontend PWA (single file, no build step)
api/              Vercel serverless routes
  state.js        Load/save tasks
  photos.js       Upload/view/delete pics (per slot)
  reactions.js    Kudos between profiles
  reset.js        Start a new challenge
  health.js       Config/database diagnostics
  lib/db.js       Connection, schema bootstrap
manifest.json     PWA install config
sw.js             Offline shell cache
```

## Notes

- Photos are resized on-device before upload (max ~1200px, JPEG). Max 4MB after compression.
- The photo inputs deliberately omit the `capture` attribute. With it, iOS jumps straight to the rear camera and the photo library is unreachable, so a shot taken earlier can never be used. Without it, iOS offers Photo Library / Take Photo / Choose File — live capture is one extra tap, and the library and front camera stay available.
- All day boundaries use the device's **local** date, so the day rolls over at local midnight rather than UTC.
- `index.html` is served network-first by the service worker, so a redeploy reaches both phones instead of being pinned to a cached shell.
- Reaction rows are written with the token `kudos`; emoji tokens from the previous build still validate and still count.
- Diet carries `auto:true`: opening the app on a day writes the tick into that day's record, so you only untick it to log a failure. It is seeded on check-in rather than defaulted at read time — a read-time default would credit Diet on days nobody opened the app and would rewrite past days' streaks and rates. A day you never open stays at 0/5.
- Water had a camera and no longer does. `knownPhotos()` filters the photos map on load to slots in `SLOT_ORDER`, so rows left behind by a retired slot are ignored by the feed, the Wall markers and the Rivals tally alike — without it they would be invisible yet still counted. `api/photos.js` still accepts the `water` slot so any stray rows can be deleted later.
- Water totals live in the existing `day_tasks.tasks` JSONB as `waterOz` and `waterLog`, so no schema change was needed. The `water` boolean stays derived from `waterOz >= 128`, which keeps streaks, the wall and completion logic untouched. Days ticked before the meter existed read as a full gallon.
- Your vessels are personal kit rather than shared progress, so they live in `localStorage` per profile. They don't follow you to a second device — move them to a table if that becomes annoying.
- Free Neon + Vercel tiers are enough for two people over 75 days.
