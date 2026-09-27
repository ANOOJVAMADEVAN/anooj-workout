/* Anooj Workout — offline cache
   Precaches the app shell on install. Coach audio is cached as you use it,
   or all at once when Offline.saveAll() runs (Save for offline on My week).
   YouTube demos always need the network. */
const CACHE = "anooj-workout-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./library.js",
  "./plan.js",
  "./programs.js",
  "./prompt.js",
  "./speech.js",
  "./manifest.webmanifest",
  "./sw.js",
  "./vendor/umami.js",
  "./figures/male.json",
  "./figures/female.json",
  "./audio/manifest.json",
  "./icons/icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache what we can; skip missing files so install never fails hard.
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(url); } catch (e) { /* ignore */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache YouTube / third-party — demos need live network.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      // Refresh shell files in the background when online.
      if (navigator.onLine && isShell(url.pathname)) {
        event.waitUntil(updateCache(req));
      }
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res.ok && shouldCache(url.pathname)) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      if (url.pathname.endsWith("/") || url.pathname.endsWith(".html")) {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      throw e;
    }
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CACHE_URLS") {
    event.waitUntil(cacheUrls(data.urls || [], event.source));
  }
  if (data.type === "SKIP_WAITING") self.skipWaiting();
});

function isShell(pathname) {
  const base = pathname.split("/").pop() || "index.html";
  return ["", "index.html", "styles.css", "app.js", "library.js", "plan.js", "programs.js", "prompt.js", "speech.js", "sw.js", "manifest.webmanifest"].includes(base)
    || pathname.includes("/icons/") || pathname.includes("/figures/");
}

function shouldCache(pathname) {
  return (
    pathname.includes("/audio/") ||
    pathname.includes("/photos/") ||
    pathname.includes("/figures/") ||
    pathname.includes("/icons/") ||
    pathname.includes("/vendor/") ||
    /\.(html|js|css|webmanifest|json|svg|png|jpg|jpeg|m4a|mp3)$/i.test(pathname) ||
    pathname.endsWith("/")
  );
}

async function updateCache(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
  } catch (e) { /* offline */ }
}

async function cacheUrls(urls, client) {
  const cache = await caches.open(CACHE);
  let done = 0;
  const total = urls.length;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) await cache.put(url, res.clone());
    } catch (e) { /* skip one bad file */ }
    done += 1;
    if (client) client.postMessage({ type: "CACHE_PROGRESS", done, total });
  }
  if (client) client.postMessage({ type: "CACHE_DONE", done, total });
}
