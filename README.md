# Project 75

A two-person PWA for the 75 Hard challenge — daily tasks, streaks, head-to-head rivalry, and a shared progress-photo feed, all synced through Neon Postgres.

## The app

Four tabs, phone-first:

- **Today** — the day number set large, a five-segment rule (one per task), streak, a live countdown to local midnight, and your partner's progress underneath. Workout One, Workout Two and Read each carry an optional camera; Diet carries one you can use over and over, so snacks and dinner all land on the same day. The two workouts also take a written note, for when you would rather say what you did than photograph it. Diet starts ticked — you only touch it to record a day you didn't keep it. Completing all five holds a full-screen typographic moment for a second and a half, then returns you to the day.
- **Water** is logged incrementally rather than ticked. Tap the row to open the tracker, then tap a vessel — a 16 oz bottle, a 32 oz tumbler, whatever you keep — to pour it toward the gallon. The row's own bottom hairline fills as you go, and the task checks itself at 128 oz. Keep pouring past the gallon if you want — the total and percentage carry on past 100% while the bar stays full. Undo removes the last pour. The checkbox can't be tapped: it mirrors the pour rather than setting it, so tapping it opens the tracker.
- **Wall** — the 75-day grid for both people, with missed days, photo markers, and a milestone list.
- **Feed** — one day per screen, newest first, each rendered as a collage of everything logged that day. A lone frame fills the screen; more than one tiles into a grid, and past six the last tile carries a `+N`. Tap any tile to open the full-screen viewer; inside it a tap steps to the next frame and wraps at the end, swiping still works, and kudos has its own button. The collage carries a kudos button too.
- **Rivals** — a side-by-side table: perfect days, current and longest streaks, consistency, per-task completion rates, photos posted, kudos received.

Your partner's strip at the foot of Today opens their day read-only — every task and photo visible, nothing tickable. Pick who you are on first launch (stored locally); you can switch from the settings sheet. Your own progress is always clay, your partner's sage.

## Design

Editorial and deliberately restrained — near-black, hairline rules, Anton for figures and Barlow Condensed for labels. Two muted accents (clay `#C8613A` for you, sage `#6E7F6A` for your partner) carry all state; there are no gradients, glows, emoji, or confetti anywhere.

Icons come from Font Awesome Pro (`sharp-light`). The full library lives in `svgs/` locally and is **gitignored** — it's ~132MB across 35k files. Only the icons actually used are inlined as paths in `index.html`, totalling about 3KB. To swap one in, copy the `d` attribute out of the relevant `svgs/sharp-light/*.svg` and add it to the `ICON` map.

The app icon is a large Anton `75` in bone on the app's near-black — the same
face the day number uses. Regenerate all sizes with
`scripts/make-icons.py` after editing it. Three things govern how iOS treats
it: it reads `apple-touch-icon.png` rather than the manifest icons, it fills
any transparency with black, and it caches the icon hard — changing the file
does not update an app already on the Home Screen, so it has to be removed and
re-added. The separate `icon-maskable-512.png` pulls the mark into the inner
safe area, since Android crops maskable icons to the launcher's shape.

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

Notifications are optional — leave the variables below unset and the app
behaves exactly as before, with the Settings toggle reporting them as
unavailable.

Get the connection string from the [Neon console](https://console.neon.tech) → your **75Hard** project → Connect.

## Notifications (optional)

Four alerts: kudos received, your partner finishing their day, your partner
posting photos (once a day, not once a photo), and an evening nudge if you
still have tasks left.

iOS only allows Web Push for a PWA **installed to the Home Screen**, and only
asks permission from a real tap — hence the toggle in Settings rather than a
prompt on load. It asks once ever; a refusal can only be undone in iOS
Settings.

1. Generate a keypair — the private key is a secret, keep it out of git:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. In Vercel → **Project → Settings → Environment Variables** add:
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from step 1
   - `VAPID_SUBJECT` = `mailto:you@example.com`
   - `CRON_SECRET` = any long random string (`openssl rand -hex 32`)
   - `APP_TIMEZONE` = e.g. `America/New_York`, used to decide which local day
     the nudge is about
3. Redeploy, then open Settings in the app on each phone and turn notifications
   on. Each phone registers separately.

The first three alerts need nothing else — they are sent by the API handlers
that already run when kudos, tasks and photos are saved.

The evening nudge needs a scheduler, because iOS gives an installed PWA no way
to schedule a local notification (Safari has no Notification Triggers API) and
Vercel functions only run when called. `.github/workflows/nudge.yml` calls
`/api/notify` daily; add two repository secrets under **Settings → Secrets and
variables → Actions**:

- `APP_URL` = `https://your-app.vercel.app` (no trailing slash)
- `CRON_SECRET` = the same value you set in Vercel

Run it by hand from the Actions tab to test. `notifications_sent` makes every
alert once-per-person-per-day, so an extra run is harmless.

Until those secrets exist the daily run skips quietly rather than failing —
notifications are opt-in, and an unconfigured feature shouldn't mail you a
red X every morning. A manual run does fail, since that one is you asking
whether it works.

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
  per-task photo. A task marked `multi` stores each shot under `id#<epoch ms>`
  so a day can hold several — the key makes one row per slot, so reusing the
  bare id would overwrite. `slot` is a text column, so this needed no migration.
- `reactions` — kudos between profiles
- `push_subscriptions` — one row per registered device
- `notifications_sent` — one row per alert delivered, keyed
  `(profile_id, day_date, kind)`, which is what stops anything ringing twice

All six are created on the first request (`CREATE TABLE IF NOT EXISTS`, in
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
  health.js       Config/database diagnostics
  push.js         Register/unregister a device for notifications
  notify.js       Evening nudge, called by the scheduled workflow
  lib/db.js       Connection, schema bootstrap
  lib/push.js     Web Push sending, throttling, dead-subscription cleanup
manifest.json     PWA install config
sw.js             Offline shell cache, push handlers
.github/workflows/nudge.yml   Daily call to /api/notify
```

## Notes

- Photos are resized on-device before upload (max ~1200px, JPEG). Max 4MB after compression.
- The photo inputs deliberately omit the `capture` attribute. With it, iOS jumps straight to the rear camera and the photo library is unreachable, so a shot taken earlier can never be used. Without it, iOS offers Photo Library / Take Photo / Choose File — live capture is one extra tap, and the library and front camera stay available.
- All day boundaries use the device's **local** date, so the day rolls over at local midnight rather than UTC.
- `index.html` is served network-first by the service worker, so a redeploy reaches both phones instead of being pinned to a cached shell.
- Reaction rows are written with the token `kudos`; emoji tokens from the previous build still validate and still count.
- Diet carries `auto:true`: opening the app on a day writes the tick into that day's record, so you only untick it to log a failure. It is seeded on check-in rather than defaulted at read time — a read-time default would credit Diet on days nobody opened the app and would rewrite past days' streaks and rates. A day you never open stays at 0/5.
- Diet takes several photos a day (`multi:true`), capped at 12; every other camera holds one. `slotBase()`/`slotLabel()` read through the `#` suffix, and `isKnownSlot()` accepts a stamped slot only for a multi task, so a stray `read#123` is rejected on both client and server.
- Water had a camera and no longer does. `knownPhotos()` filters the photos map on load to slots in `SLOT_ORDER`, so rows left behind by a retired slot are ignored by the feed, the Wall markers and the Rivals tally alike — without it they would be invisible yet still counted. `api/photos.js` still accepts the `water` slot so any stray rows can be deleted later.
- Workout notes live in the existing `day_tasks.tasks` JSONB under `notes`, keyed by task id, so writing one rides along with the save that was already happening. A note replaces the row's subtitle when set.
- There is no reset. Wiping the challenge was one unauthenticated request away from erasing 75 days for both people, and `/api/reset` was removed along with the button. Starting over means clearing the tables in the Neon console by hand.
- Water totals live in the existing `day_tasks.tasks` JSONB as `waterOz` and `waterLog`, so no schema change was needed. The `water` boolean stays derived from `waterOz >= 128`, which keeps streaks, the wall and completion logic untouched. Days ticked before the meter existed read as a full gallon.
- Your vessels are personal kit rather than shared progress, so they live in `localStorage` per profile. They don't follow you to a second device — move them to a table if that becomes annoying.
- iOS stamps the app name on every notification and there is no way to suppress it — it is an anti-spoofing guarantee, not a setting. The copy is written around that: the title carries the news and the body adds the day, so nothing is repeated under the app name.
- Notifications fail silently by design: `notify()` swallows everything, so a push problem can never turn a successful save into an error for the person saving. With no VAPID keys set, every send is a no-op.
- A push endpoint belongs to whoever last claimed it, so switching profile on a phone moves that phone's alerts. Deleting and re-adding the app strands the old endpoint; the server drops it on the first 404/410.
- Free Neon + Vercel tiers are enough for two people over 75 days.
