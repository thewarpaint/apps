# AGENTS.md

Small single-page apps, each a self-contained `index.html` (inline CSS and JS) in its own directory, with no build step and no dependencies. The root `index.html` links to every app.

| Dir | App | Storage |
|---|---|---|
| `smoking-log/` | Cigarettes per day, streaks, month heatmap | `localStorage['smoke.log.v1']`: `{"YYYY-MM-DD": count}` |
| `fridge-tracker/` | Items sorted by expiry, optional photos | `localStorage['fridge.items.v1']`: `[{id, name, photo, exp, added}]`. Photos are JPEG data URLs, so mind the ~5MB quota |
| `coloring/` | Type a name or upload a picture, color it in, add stickers | None. Pictures are saved as PNG downloads |

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
- **`PRECACHE_PATHS`** must list, for each app: `<app>/`, `index.html`, `manifest.json`, and `icons/{icon.svg,icon-192.png,icon-512.png,apple-touch-icon.png}`, plus any bundled assets such as `coloring/images/*.png`. One failed URL fails the whole install.
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
- **Canvas layers:** `#bg` holds an uploaded picture in Photo view, `#paint` holds strokes and stickers, and `#outline` holds the letter outlines or a picture's lines. Off-screen, `mask` holds the filled letters (used for "stay inside" clipping) and `scratch` is a per-segment work area.
- **Name vs picture:** `state.lay` is `{lines, size}` for a name, or for a picture `{img, art, kind, view, fit, id, size}`. For a picture, `size` is the cover scale (`fit: "cover"`, fills the board, cropping) or the contain scale (`fit: "contain"`, whole picture shown). Both are centred.
  - The photo button (`#photoBtn`) opens `#gallery`, a dialog with the built-in coloring pages from `GALLERY` (files in `coloring/images/`) and an "Upload or take a photo" button that opens the device picker (`#photoInput`, `accept="image/*"`). Escape, the backdrop or × close it.
    - To add a gallery picture: put it in `coloring/images/`, add `{src, name}` to `GALLERY`, add it to `PRECACHE_PATHS` and bump `CACHE_NAME`.
  - `openPicture(src)` loads either kind of picture, downscaled to at most 2200px on its longest side, and calls `usePicture()`. That shows the photo at once (`view: "photo"`), clears the letters, paint and undo history, and calls `makeLines()`.
  - `setCanvases()` resizes the canvases and calls `drawLayers()`. `drawLayers()` redraws everything except the paint, so switching view or detail keeps the coloring.
  - "Draw it!" (`generate()`) goes back to a name. Saving flattens paper, picture, paint and outline.
  - **Picture to coloring page:** the inline worker (`#convWorkerSrc`, started from a blob URL) gets the picture as stored (up to 2200px). It classifies the picture and finds edges on a copy of at most 1000px, and returns a line alpha field. `kind` is one of:
    - `lineart`: little colour, few in-between greys, mostly paper after dividing out the lighting. Traced at full resolution: the paper estimate is upsampled, and each pixel fades from line to paper across a brightness band instead of a hard cut, keeping the drawing's own antialiasing. If more than 20% is ink, it's treated as a silhouette and only its outline is kept.
    - `flat`: in-between greys under 12% (cartoons). Drawn dark lines are kept, and colour edges are added only away from them.
    - `photo`: Canny-style edges. The Detail slider keeps 5–35% of the strongest ridges. The worker caches the edges per `id`, so moving the slider only re-thresholds.
  - **Antialiasing:** the worker's `soften()` blurs the line mask into a smooth field. Line drawings get one pass with `keepPeaks`, so 1–2px strokes and narrow gaps survive. The page draws the field scaled onto the board, then `sharpenLines()` applies a smoothstep around alpha 0.5. The result is crisp lines with about 1px of antialiasing at the board's own resolution, whatever the picture's scale.
  - Lines are drawn into `#outline` in the outline colour. Results for a stale `id` are dropped. `#picTools` sits inside `#board`, at its bottom-left. It holds the Lines/Photo toggle (two icon buttons: an outline picture and a coloured-in one), the fit toggle (`#fitBtn`, pressed = contain) and the Detail slider. The fit choice carries over to the next upload (`fitPref`). Toggling fit re-maps the paint from `state.src` like a resize, so cover → contain → cover is lossless.
  - `#loader` (spinning rainbow ring and message) covers the stage from file pick until the lines arrive, via `showLoader()` and `hideLoader()`. For Detail changes it shows only after 150ms. Errors and `generate()` hide it.
  - **See-through brush in Photo view:** brush strokes are drawn at full strength on `strokeLayer`. `blendStroke()` then redraws the paint as the pre-stroke undo snapshot plus that layer at `PHOTO_BRUSH_ALPHA` (0.66), so a stroke crossing itself stays one even 66%. Stickers, the eraser, Lines view and name mode are unaffected.
  - **Stay-inside on pictures:** `findRegions()` labels the closed shapes between the lines, thickening the lines by 2px to close gaps, and records each shape's bounding box. On pointerdown with the brush, `regionMask()` sets `mask` to the shape under the pointer grown by 4px, working only inside its bounding box. Starting on a line paints freely. Stay-inside is disabled in Photo view.
  - Clear on a picture works in two steps. While anything is painted (`hasPaint()`), it clears only the paint and stickers and keeps the picture. Once there's no paint, it removes the picture and goes back to the name. The picture is snapshotted into `state.restore`, and Undo with an empty undo stack restores it with its undo history, re-fitted to the current board. `generate()` and `usePicture()` drop the snapshot.
- **Toolbar:**
  - The top row holds brush sizes, eraser, stickers and the stay-inside toggle.
  - Below it, the palette and the undo/clear/save group share one row, centred vertically.
  - At 720px wide or less, the palette is two rows of six. At 480px or less, swatches and action buttons shrink so that row still fits. At 350px or less, gaps tighten too.
  - On landscape phones (`orientation: landscape` and `max-height: 500px`), the body becomes a grid with `#tools` set to `display: contents`. `#toolGroup` becomes a column on the left, and `.tool-row` (a 2-column palette over the actions) a column on the right. The sticker panel then anchors to `#toolGroup` and opens to its right.
- **Board resize:** when the stage's aspect ratio changes by more than 15% (for example, the phone rotates), `relayout()` re-fits the name or picture (keeping the current view, lines and fit from `state.lay`) and scales the paint and undo snapshots about the centre by the ratio of the old and new `lay.size`. Once painted, it keeps the same line breaks. It always re-maps from `state.src`, the last canvas the user drew on, so rotating back restores anything clipped and repeated rotations don't add blur. Any paint edit (`pushUndo`, `undo`, `generate`) resets `state.src`. View and detail changes don't, since they leave the paint alone.
- **Sticker panel:** in portrait it's anchored to `#tools` (`position: relative`) so it stays on screen. In landscape it anchors to `#toolGroup`.
- **Sticker button:** it cycles stickers every 4s until the sticker tool is active, then shows the chosen sticker.
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
