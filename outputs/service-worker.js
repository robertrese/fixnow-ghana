const CACHE_NAME = "fixnow-ghana-static-v43";
const ASSETS = [
  "./fixnow-ghana.html",
  "./emergency-contacts.js",
  "./map-foundation.js",
  "./vendor/markerclusterer-2.6.2.min.js",
  "./vendor/MARKERCLUSTERER-LICENSE.txt",
  "./manifest.webmanifest",
  "./privacy.html",
  "./terms.html",
  "./support.html",
  "./icon.svg",
  "./icon-maskable.svg",
  "./apple-touch-icon.png",
  "./favicon-32.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./illustrations/ghana-map.svg",
  "./illustrations/category-flooding.svg",
  "./illustrations/category-road.svg",
  "./illustrations/category-waste.svg",
  "./illustrations/category-water.svg",
  "./illustrations/category-electricity.svg",
  "./illustrations/category-unsafe.svg",
  "./illustrations/ghana-outline.svg",
  "./fonts/bricolage-grotesque-latin-wght.woff2",
  "./fonts/atkinson-hyperlegible-next-latin-400.woff2",
  "./fonts/atkinson-hyperlegible-next-latin-700.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const canonicalRequest = new Request(`${url.origin}${url.pathname}`);
            caches.open(CACHE_NAME).then((cache) => cache.put(canonicalRequest, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(`${url.origin}${url.pathname}`))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const refresh = fetch(event.request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      });
      return cached || refresh;
    })
  );
});
