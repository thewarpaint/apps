# Apps

Small single-page apps, each a self-contained `index.html` in its own directory, linked from the root `index.html`.

## Offline and install support

The whole site is a PWA that works offline after the first visit.

- **`sw.js`**: one service worker for every page. It precaches every app on install. Pages load network-first with a 1.5s timeout, then fall back to the cache. Other files load cache-first.
- **`manifest.json` in the root and in each app directory**: each app can be installed to the home screen on its own. The root manifest installs the launcher.
- **`icons/`**: each directory has an `icon.svg` source and the PNGs rendered from it. After editing an `icon.svg`, run `node tools/build-icons.js` (needs Playwright).
- **`vendor/fredoka/`**: the coloring book's font, self-hosted so it works offline (SIL OFL).

All URLs are relative, so the site works at a domain root or under a sub-path.

### Changing things

- **Bump `CACHE_NAME` in `sw.js` whenever a precached file changes.** Without the bump, visitors keep getting the old cached copy.
- To add an app:
  1. Create `<app>/index.html`, `<app>/manifest.json` and `<app>/icons/`.
  2. Copy the head tags and service worker registration script from an existing app.
  3. Add `<app>/icons` to `DIRS` in `tools/build-icons.js` and run it.
  4. List the app's files in `PRECACHE_PATHS` in `sw.js`, bump `CACHE_NAME`, and link the app from the root `index.html`.
