'use strict';

// One service worker for the whole repo, registered from every page with a
// relative URL, so its scope is the repo root wherever the site is hosted
// (a domain root or a sub-path like /apps/).
//
// Bump CACHE_NAME whenever sw.js or any precached file changes - the new
// string is what makes browsers install the update and drop the old cache.
// Versioned by the PR that ships the change, so two PRs can't collide.
var CACHE_NAME = 'apps-v16';

// How long a page navigation waits on the network before falling back to
// the cached copy (see the fetch handler).
var NAVIGATION_TIMEOUT_MS = 1500;

// Relative to this file. Every app needs both its directory URL and its
// index.html, plus its manifest and icons. Add a new app's files here in the
// same PR that adds the app.
var PRECACHE_PATHS = [
  './',
  'index.html',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',

  'smoking-log/',
  'smoking-log/index.html',
  'smoking-log/manifest.json',
  'smoking-log/icons/icon.svg',
  'smoking-log/icons/icon-192.png',
  'smoking-log/icons/icon-512.png',
  'smoking-log/icons/apple-touch-icon.png',

  'fridge-tracker/',
  'fridge-tracker/index.html',
  'fridge-tracker/manifest.json',
  'fridge-tracker/icons/icon.svg',
  'fridge-tracker/icons/icon-192.png',
  'fridge-tracker/icons/icon-512.png',
  'fridge-tracker/icons/apple-touch-icon.png',

  'coloring/',
  'coloring/index.html',
  'coloring/manifest.json',
  'coloring/icons/icon.svg',
  'coloring/icons/icon-192.png',
  'coloring/icons/icon-512.png',
  'coloring/icons/apple-touch-icon.png',

  // Self-hosted so the coloring book's font works offline.
  'vendor/fredoka/fredoka-latin.woff2',
  'vendor/fredoka/fredoka-latin-ext.woff2',
];

function abs(path) {
  return new URL(path, self.registration.scope).href;
}

function log() {
  console.log.apply(console, ['[SW]'].concat(Array.prototype.slice.call(arguments)));
}

function warn() {
  console.warn.apply(console, ['[SW]'].concat(Array.prototype.slice.call(arguments)));
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // cache: 'reload' skips the HTTP cache so a new CACHE_NAME never
        // precaches a stale copy the browser had lying around.
        return cache.addAll(PRECACHE_PATHS.map(function (p) {
          return new Request(abs(p), { cache: 'reload' });
        }));
      })
      .then(function () {
        log('installed', CACHE_NAME);
        return self.skipWaiting();
      })
      .catch(function (err) {
        // addAll is all-or-nothing: one failed URL means this version never
        // activates and the previous one stays in control. Keep it loud.
        warn('install FAILED - previous version stays in control:', err && err.message, err);
        throw err;
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        // Only touch this repo's caches, in case other apps share the origin.
        var stale = keys.filter(function (k) { return k.indexOf('apps-') === 0 && k !== CACHE_NAME; });
        if (stale.length) log('deleting stale caches:', stale);
        return Promise.all(stale.map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  // Same-origin only. A cross-origin no-cors response is opaque, and caching
  // a bad one would serve it forever. Everything precached is same-origin.
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event, request, url));
    return;
  }

  // Static assets: cache-first, filling the cache on a miss.
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});

// Pages: race the network against a short timeout, so online visitors get
// the latest version but a slow connection doesn't hold up first paint. The
// network fetch keeps going in the background and refreshes the cache.
function navigate(event, request, url) {
  var network = fetch(request)
    .then(function (response) {
      if (response.ok) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    })
    .catch(function (err) {
      warn('navigation fetch failed for', request.url, '-', err && err.message);
      return null;
    });
  event.waitUntil(network);

  var timeout = new Promise(function (resolve) {
    setTimeout(function () { resolve(null); }, NAVIGATION_TIMEOUT_MS);
  });

  return Promise.race([network, timeout]).then(function (response) {
    if (response) return response;
    return caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return network.then(function (late) {
        if (late) return late;
        // Offline there's no host redirect from /coloring to /coloring/.
        // Redirect rather than serve the page here: the pages use relative
        // URLs, which only resolve correctly from the trailing-slash form.
        var slashUrl = url.origin + url.pathname + '/';
        var slash = url.pathname.slice(-1) === '/'
          ? Promise.resolve(null)
          : caches.match(slashUrl);
        return slash.then(function (hit) {
          if (hit) return Response.redirect(slashUrl + url.search, 301);
          warn('nothing cached for', request.url, '- serving the index page');
          return caches.match(abs('./'));
        });
      });
    });
  });
}
