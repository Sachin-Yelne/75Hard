# Project 75

A two-person PWA for the 75 Hard challenge — daily tasks, streaks, head-to-head rivalry, and a shared progress-photo feed, all synced through Neon Postgres.

## The app

Four tabs, phone-first. It **opens on the Feed** — that's the part worth coming
back to, and the checklist is one tap away. A challenge with no photos in it yet
is the exception: an empty feed makes a poor front door, so a fresh start lands
on Today until there's something to look at.

- **Today** — the day number set large, a five-segment rule (one per task), streak, a live countdown to local midnight, and your partner's progress underneath. Workout One, Workout Two and Read each carry an optional camera; Diet carries one you can use over and over, so snacks and dinner all land on the same day. The two workouts also take a written note, for when you would rather say what you did than photograph it. Diet starts ticked — you only touch it to record a day you didn't keep it. Every diet photo can be named: the moment one lands, a sheet asks what it was and offers a one-tap verdict — loved it, fine, regret it. Skipping is fine, and an unnamed shot just reads as "Diet" as before. Once named, the Diet row says what you last ate rather than the rule you're keeping. Completing all five holds a full-screen typographic moment for a second and a half, then returns you to the day.
- **Water** is logged incrementally rather than ticked. Tap the row to open the tracker, then tap a vessel — a 16 oz bottle, a 32 oz tumbler, whatever you keep — to pour it toward the gallon. The row's own bottom hairline fills as you go, and the task checks itself at 128 oz. Keep pouring past the gallon if you want — the total and percentage carry on past 100% while the bar stays full. Undo removes the last pour. The checkbox can't be tapped: it mirrors the pour rather than setting it, so tapping it opens the tracker.
- **Wall** — the 75-day grid for both people, with missed days, photo markers, and a milestone list. Opening a day shows its gallery, and a named meal reads as its own name under the frame; tap it to rename or re-judge, or tap the caption in the full-screen viewer to do the same from the photo itself. Your partner sees the names, read-only.
- **Feed** — one day per screen, newest first, each rendered as a collage of everything logged that day. A lone frame fills the screen; more than one tiles into a grid, and past six the last tile carries a `+N`. Tap any tile to open the full-screen viewer; inside it a tap steps to the next frame and wraps at the end, and swiping still works. Two actions sit under the day, on the collage and in the viewer alike: a thumb for kudos, and a bubble for comments, each carrying its count. The collage shows the last comment as one line; open a frame full screen and the day's last three lie faintly over the photo itself, each clamped to two lines, with a `+N earlier` above them when the thread runs longer. Tapping any of it opens the day's thread, where both of you can write — including on your own frame, so a reply lands where the picture is. A comment written in the viewer is filed against the frame on screen and carries its task as a tag. A day can also carry a song. It plays when you open the Feed, and scrolling from day to day swaps the track, fading between them; a day without one falls silent. The sleeve, title and artist read as one line on the post, and three bars beside the date move while the sound is on — tap them to mute, and the choice is remembered. On your own posts that line is also the way in: **Add music** where there is none, **Change** where there is.
- **Rivals** — a side-by-side table: perfect days, current and longest streaks, consistency, per-task completion rates, photos posted, kudos received.

Your partner's strip at the foot of Today opens their day read-only — every task and photo visible, nothing tickable. Pick who you are on first launch (stored locally); you can switch from the settings sheet. Your own progress is always clay, your partner's sage.

## Design

Editorial and deliberately restrained — near-black, hairline rules, Anton for figures and Barlow Condensed for labels. Two muted accents (clay `#C8613A` for you, sage `#6E7F6A` for your partner) carry all state; there are no gradients, glows, emoji, or confetti anywhere.

A meal's verdict is a small square rather than a colour: filled bone for loved
it, a hairline outline for fine, filled `--miss` brick for regret it. Clay and
sage already mean *whose* something is, so spending them on *how good* a meal
was would make the palette say two things at once.

Icons come from Font Awesome Pro (`sharp-light`). The full library lives in `svgs/` locally and is **gitignored** — it's ~132MB across 35k files. Only the icons actually used are inlined as paths in `index.html`, totalling about 3KB. To swap one in, copy the `d` attribute out of the relevant `svgs/sharp-light/*.svg` and add it to the `ICON` map.

Two entries in that map — `thumb` and `comment`, the feed's kudos and comment
glyphs — are drawn by hand rather than copied, since the library isn't in the
repo. They follow the same spec as the rest (512 box, 32 stroke, square
corners) and sit at the same weight; paste the real `thumbs-up` and `comment`
paths over them if you have `svgs/` to hand.

The app icon is a large Anton `75` in the app's near-black on bone — the same
face the day number uses, run dark-on-light while the app itself is
light-on-dark. That inversion is the point: a near-black icon sinks into a dark
wallpaper, and bone is the brightest thing you can put on a Home Screen. The
label under it reads **Lemi**; the mark stays `75` because that is what the
thing counts. Swap `FIELD, MARK` in `scripts/make-icons.py` to flip it back.

Regenerate all sizes with `scripts/make-icons.py` after editing it — it needs
Pillow and the Anton TTF (`ANTON_TTF=…`, fetch line in the script's header).
The separate `icon-maskable-512.png` pulls the mark into the inner safe area,
since Android crops maskable icons to the launcher's shape.

## Names, and why there are two

The app calls itself **Project 75** — the top bar, the identity picker, the
boot screen, the page title. The **Home Screen** label is **Lemi**, set by
`apple-mobile-web-app-title` on iOS and by the manifest's `name`/`short_name`
elsewhere. They are deliberately different: one is the app's own voice, the
other is what you want to read on a phone full of other people's icons.

**iOS freezes both the icon and the label when the app is added to the Home
Screen, and never revisits them.** A deploy cannot change an installed icon —
not with a reload, not with a service-worker update, not with time. Changing
either means removing the app from the Home Screen and adding it again from
Safari. (An install left over from an older build will happily keep showing a
name and a mark that no longer exist anywhere in this repo.)

The icon URLs carry a `?v=` so that a *fresh* add fetches the current file
rather than whatever Safari cached last time; bump it whenever the mark is
redrawn, in `index.html`, `manifest.json` and `sw.js` together.

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

Five alerts: kudos received, a comment on one of your frames, your partner
finishing their day, your partner posting photos (once a day, not once a
photo), and an evening nudge if you still have tasks left.

Comments are the one alert that isn't throttled to once a day — each is worth
its own, so the throttle key carries the comment's row id. Talking to yourself
on your own frame doesn't ring your own phone.

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

## Music

Tap **Add music** — on your own post in the feed, or in the day sheet — then
search and tap a result to hear it. Choosing is by ear, not by title, and
**Add** attaches whatever is playing. Search runs through `/api/music`, which
proxies Apple's public iTunes Search API.

Nothing to configure and nothing to pay for: that endpoint needs no key and no
account. The proxy exists because it sends no CORS headers, and because one
warm instance can answer a repeated search from memory instead of calling Apple
once per keystroke per phone.

The audio never touches this app's infrastructure. Apple serves the 30-second
preview straight to the phone from their CDN; what reaches Postgres is five
fields — id, title, artist, artwork URL, preview URL — about 100 bytes, stored
in the day's existing `tasks` JSONB. Even if all 150 person-days carried a
song that is well under a tenth of a megabyte.

Two things to know about playing it:

- **iOS needs a gesture before any audio starts**, and grants it to the element
  the user touched rather than to the page. There is therefore one `<audio>`
  element for the whole app, and every track change is a `src` swap on it.
  Tapping the **Feed** tab is itself that gesture, so arriving at the feed
  starts the music: playback begins inside that tap's own handler, which is
  what makes it legal. Opening the app straight into the feed has no gesture to
  spend, so the attempt is refused — the app then waits for the next touch
  anywhere, a scroll of the feed included, and starts there. A refusal never
  writes the preference; only a deliberate tap on the sound control does.
- **The ring/silent switch would mute it, so the app opts out.** Safari starts
  a page's audio session as `ambient` — the category the silent switch
  silences, alongside alerts and game effects — and a plain `<audio>` element
  inherits it. Music on a feed is media playback, so the app says so:

  ```js
  if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
  ```

  That is the [Audio Session API](https://github.com/w3c/audio-session), which
  only Safari implements and which is still a draft, so it sits behind a
  feature check — where it doesn't exist nothing changes. The session is
  claimed at the moment the first track loads rather than on page load, so an
  app that never plays music never presents itself as a media app. Like any
  media playback, it interrupts whatever else the phone was playing.

Preview URLs rotate occasionally, so the track's id is stored alongside its
URL — `/api/music?id=…` re-resolves a stale one without needing the search
again.

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
- `comments` — one thread per feed post, keyed by the post's owner and day,
  plus the photo `slot` the comment was written under, so a note left in the
  viewer can say which frame it means. Bodies are capped at 280 characters
- `push_subscriptions` — one row per registered device
- `notifications_sent` — one row per alert delivered, keyed
  `(profile_id, day_date, kind)`, which is what stops anything ringing twice

All seven are created on the first request (`CREATE TABLE IF NOT EXISTS`, in
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
  comments.js     Feed comments, one thread per post
  music.js        Track search, proxied to the iTunes catalogue (no database)
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
- Comment bodies are the only free text either phone sends the other, so they are escaped on render and capped at 280 characters. Posting is optimistic: the line appears at once, rolls back on failure, and keeps your text in the box. Deleting is scoped to the author server-side, so one phone can't remove the other's words even though the app has no real accounts.
- The feed's nav dot covers kudos landing on you *and* anything your partner has said; opening the Feed tab marks both seen. It counts kudos to you against the same measure it stores — it used to compare that against every reaction in the table, so it rarely lit up.
- `#sheets` sits at `z-index:65`, above the photo viewer and below the completion moment. The comment sheet is the first sheet that opens on top of an open photo, and `#viewer` comes later in the DOM.
- Diet carries `auto:true`: opening the app on a day writes the tick into that day's record, so you only untick it to log a failure. It is seeded on check-in rather than defaulted at read time — a read-time default would credit Diet on days nobody opened the app and would rewrite past days' streaks and rates. A day you never open stays at 0/5.
- Diet also carries `meal:true`: its shots are things you ate, so each one takes a name and a verdict. They live under `meals` in the day's existing `day_tasks.tasks` JSONB, keyed by the photo's own slot (`{ 'diet#1750…': { nm:'Chipotle bowl', v:'loved' } }`) — the same trick `notes` uses, so this needed no schema change and rides the save that was already happening. Deleting a photo takes its label with it rather than leaving an orphan.
- A day's song lives under `track` in the same JSONB as `meals` and `notes`, so music needed no schema change either. The feed is built from photos, so a day with a song and no photo has no post to play it on — the day sheet says as much rather than letting it look broken.
- Opening on the Feed means opening with no gesture spent, so the first attempt at playback is refused every launch and the app waits for a touch. The "tap anywhere for sound" tip is therefore shown once per *device* (`soundHint`), not once per load — otherwise it would greet you on every single open.
- The viewer's scrim ramps up early rather than only at the very bottom. The comments sit at the foot of the frame now, and without that ramp the topmost line washes out over a bright photo; the middle of the gradient is left alone, since this is a photo viewer first.
- Which post the feed is showing is arithmetic, not an observer: the feed is a snap scroller of full-height posts, so `scrollTop / clientHeight` names the current one exactly. The same sum survives a re-render — adding music from the feed rebuilds it, and without restoring that index you would be thrown back to the newest day.
- Sound on or off is a setting (`musicOff` in `localStorage`), not a per-visit decision, so muting sticks across loads. It is deliberately separate from the track line: the control sits by the date at the top, where a feed's audio control belongs, which leaves the line below free to be **Add music** / **Change** on your own posts.
- `node dev.js --demo` serves its own canned catalogue and synthesises a short sine as the preview, so the whole music path — search, audition, attach, play, swap on scroll — works with no network and no Apple.
- Meal names are free text, so they are escaped wherever they render — captions, the Diet row, image `alt`. The row's note fell under the same interpolation and is now escaped too.
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
