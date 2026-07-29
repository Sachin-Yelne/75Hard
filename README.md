# 75 Hard — The Wall

A simple PWA to track daily 75 Hard progress for two people. Tap bricks on the wall, check off tasks, and watch the streak grow.

## Run locally

```bash
cd 75HARD
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

> Use a local server — opening `index.html` directly from the filesystem breaks the service worker and manifest.

## Install on iPhone

1. Deploy the app to a host with HTTPS (see below).
2. Open the URL in **Safari**.
3. Tap **Share** → **Add to Home Screen**.

The app runs full-screen like a native app and saves progress on that device.

## Deploy (free)

**Vercel**

1. Push this repo to GitHub.
2. Import the repo at [vercel.com](https://vercel.com).
3. Deploy — no build step needed (static site).

**Netlify**

1. Drag the project folder onto [app.netlify.com/drop](https://app.netlify.com/drop), or connect the GitHub repo.

Either gives you an HTTPS URL you can share.

## Data storage

Progress is stored in **localStorage** on each device. Your GF will see her own data on her phone; yours stays on yours until you add a shared backend (Neon is the planned next step).

## Project structure

```
index.html      Main app
manifest.json   PWA install config
sw.js           Offline cache
icons/          App icons
```

## Next steps

- [ ] Neon Postgres for shared sync between devices
- [ ] Simple auth or shared household code
