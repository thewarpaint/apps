# AGENTS.md

Small single-page apps, each a self-contained `index.html` (inline CSS and JS) in its own directory, with no build step and no dependencies. The root `index.html` links to every app.

| Dir | App | Storage |
|---|---|---|
| `smoking-log/` | Cigarettes per day, streaks, month heatmap | `localStorage['smoke.log.v1']`: `{"YYYY-MM-DD": count}` |
| `fridge-tracker/` | Items sorted by expiry, optional photos | `localStorage['fridge.items.v1']`: `[{id, name, photo, exp, added}]`. Photos are JPEG data URLs, so mind the ~5MB quota |
| `coloring/` | Type a name, color it in, add stickers | None. Pictures are saved as PNG downloads |

Never rename a storage key without migrating the data, or users lose it.

## Conventions
- **Relative URLs only.** The site must work at a domain root or under a sub-path such as `/apps/`.
- **No cross-origin requests.** Vendor anything external into `vendor/`, with its license. Fredoka lives in `vendor/fredoka/` (SIL OFL).
- **Wrap every storage read and write in try/catch,** and keep the page working when storage is unavailable.
- **Layout must hold from 320px wide.** Check phone widths.
- **Apps are often copied from claude.ai artifacts.** Copy them verbatim, then adapt anything that only works on claude.ai. For example, `window.claude.use("downloads")` needs a plain `<a download>` fallback, which the coloring book already has.

## PWA and offline
- **`sw.js`:** one service worker for the whole site, registered from each page with a relative URL (`./sw.js` from the root, `../sw.js` from an app).
  - Pages load network-first with a 1.5s timeout, then fall back to the cache. Other files load cache-first.
  - It only handles same-origin requests.
  - Offline, a URL without the trailing slash redirects to the slash form so relative links resolve.
- **Bump `CACHE_NAME` (`apps-v<PR number>`) in every PR that changes a precached file.** Otherwise users keep getting the old copy.
- **`PRECACHE_PATHS`** must list, for each app: `<app>/`, `index.html`, `manifest.json`, and `icons/{icon.svg,icon-192.png,icon-512.png,apple-touch-icon.png}`. One failed URL fails the whole install.
- **Manifests:** the root and each app have their own `manifest.json`, so each app installs separately. Each manifest sets `id`, `start_url` and `scope` to `"./"` and lists the 512px PNG again as maskable.
- **Icons:** edit `icons/icon.svg`, keep the artwork inside the central ~60% so maskable crops don't cut it, then run `node tools/build-icons.js` (needs Playwright).
- **Head tags:** every page needs `theme-color`, the `mobile-web-app-capable` and `apple-mobile-web-app-*` metas, the manifest link, the SVG and PNG icons, `apple-touch-icon`, and the service worker registration script before `</body>`.
- **Adding an app:**
  1. Create the directory with `index.html`, `manifest.json` and `icons/`.
  2. Copy the head tags and registration script from an existing app.
  3. Add `<app>/icons` to `DIRS` in `tools/build-icons.js` and run it.
  4. Add the app's files to `PRECACHE_PATHS`, bump `CACHE_NAME`, and link the app from the root `index.html`.
- **iOS:** a home-screen app has its own storage, separate from Safari's. It's also exempt from Safari's 7-day data deletion.

## Coloring book specifics
- **Canvas layers:** `#paint` holds strokes and stickers; `#outline` holds the letter outlines. Off-screen, `mask` holds the filled letters (used for "stay inside" clipping) and `scratch` is a per-segment work area.
- **Toolbar:**
  - The top row holds brush sizes, eraser, stickers and the stay-inside toggle.
  - Below it, the palette and the undo/clear/save group share one row, centred vertically.
  - At 720px wide or less, the palette is two rows of six. At 480px or less, swatches and action buttons shrink so that row still fits.
- **Sticker panel:** it's anchored to `#tools` (`position: relative`) so it stays on screen.
- **Sticker button:** it cycles stickers every 5s until the sticker tool is active, then shows the chosen sticker.
- **Zoom is blocked on purpose:** gesture events, multi-touch moves, `dblclick` and ctrl+wheel are all cancelled, and `touch-action: manipulation` is set. Keyboard zoom still works.

## Testing
No test suite. Test with Playwright (`require('playwright')`, preinstalled Chromium):
1. Serve a symlink to the repo under a sub-path: `ln -s <repo> www/apps && cd www && python3 -m http.server`.
2. Load the site and wait for `navigator.serviceWorker.ready`, then call `context.setOffline(true)`.
3. Open every page, including URLs without the trailing slash, and check there are no console errors.
4. Check installability with the CDP command `Page.getInstallabilityErrors`.

## Workflow
- Work on a branch and open a PR.
- **Merge only when the user explicitly asks.**
