const CACHE_NAME = "noterplus-v9";
const ASSETS = ["./", "./index.html", "./styles.css", "./fakehome.js", "./manifest.webmanifest",
  "./src/app.js", "./src/crypt.js", "./src/link.js", "./src/font.js", "./src/known.js",
  "./home/page1.webp", "./home/page2.webp", "./home/page3.webp",
  "./home/dots1.png", "./home/dots2.png", "./home/dots3.png",
  "./home/dock.webp", "./home/noter.png",
  "./favicon.png", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png",
  "./icons/checklist.png", "./icons/clip.png", "./icons/markup.png", "./icons/writing.png", "./icons/compose.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

/* Netværk først (højst 2,5 sek.), så en ny version slår igennem; cachen bruges offline.
   Relæet (andet domæne) går aldrig gennem cachen. */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    new Promise((resolve) => {
      let done = false;
      const fallback = () => caches.match(event.request, { ignoreSearch: true }).then((r) => r || fetch(event.request));
      const timer = setTimeout(() => { if (!done) { done = true; resolve(fallback()); } }, 2500);
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          if (!done) { done = true; clearTimeout(timer); resolve(response); }
        })
        .catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(fallback()); } });
    }),
  );
});
