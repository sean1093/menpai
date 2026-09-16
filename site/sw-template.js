/*
 * Precache service worker. `site/vite.config.ts` fills in the version and the
 * file list below at build time, with the real hashed asset names, and emits the
 * result as sw.js next to the app. (Placeholder names are deliberately not
 * repeated in this comment: the substitution is literal.)
 *
 * Everything this app needs is in the bundle — there are no runtime API calls —
 * and the moments it is most wanted (abroad, at a post office, in an airport
 * before buying a data plan) are exactly the ones with no network. So the
 * strategy is the simple one: cache the whole build on install, serve from
 * cache, and drop every older cache on activate so nobody is stranded on a
 * stale dictionary.
 */
const VERSION = "__VERSION__";
const CACHE = `menpai-${VERSION}`;
const PRECACHE = __PRECACHE__;
const SHELL = PRECACHE[0];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch((cause) => {
        // addAll is atomic: one bad URL and nothing is cached, install fails,
        // and the app silently has no offline support. Say so somewhere.
        console.warn("menpai: could not precache, offline support is off", cause);
        throw cause;
      })
      // Take over straight away: the alternative is waiting for every tab to
      // close, which can leave someone on an out-of-date address dictionary.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // menpai is one page. Every in-scope navigation — including a deep link like
  // ?q=<address>, which is a different URL but the same page — resolves to the
  // cached shell. If a second page is ever added, this needs to match on path.
  if (request.mode === "navigate") {
    event.respondWith(caches.match(SHELL).then((hit) => hit ?? fetch(request)));
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        // Anything hashed is immutable, so it is worth keeping for next time.
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
