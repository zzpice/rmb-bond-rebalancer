const VERSION = "2.1.1";
const CACHE_PREFIX = "rmb-rebalancer-";
const LEGACY_CACHE_PREFIX = "bond-rebalancer-";
const CACHE_NAME = `${CACHE_PREFIX}v${VERSION}`;
const resolve = path => new URL(path, self.location.href).href;
const INDEX_URL = resolve("./index.html");
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/app.css",
  "./src/app.js",
  "./src/portfolio.js",
  "./src/rebalance.js",
  "./src/format.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
].map(resolve);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => (
            key !== CACHE_NAME
            && (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX))
          ))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(INDEX_URL, copy)));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return await cache.match(request)
            || await cache.match(INDEX_URL)
            || await cache.match(resolve("./"));
        })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(async response => {
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
      .catch(async () => (await caches.open(CACHE_NAME)).match(request))
  );
});
