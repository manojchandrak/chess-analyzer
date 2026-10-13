/* Chess Game Analyzer service worker.
 * Makes the site installable and lets the board, drills and the engine work offline after a first visit.
 * It only handles this site's own files; calls to Lichess, Chess.com and Supabase always go straight to the network,
 * so loading games and logging in still need a connection and nothing about them is ever cached here. */

const VERSION = "v1";
const SHELL_CACHE = "shell-" + VERSION; // the page and the app's own scripts and styles
const STATIC_CACHE = "static-" + VERSION; // the chess engine, piece images, opening and legend data
const NAV_TIMEOUT_MS = 4000;
const ENGINE_FILES = ["engine/stockfish-19-lite-single.js", "engine/stockfish-19-lite-single.wasm"];

/** How to answer a request: "network" (leave it alone), "navigation" (the page), "cache-first" (files that never change
 * for a given name), or "stale-while-revalidate" (answer from cache, refresh it in the background). */
function strategyFor(req) {
  const { url, method, mode, origin, scope } = req;
  if (method !== "GET" || url.origin !== origin) return "network";
  const path = url.pathname;
  if (!path.startsWith(scope)) return "network";
  if (mode === "navigate") return "navigation";
  const rest = path.slice(scope.length);
  if (rest === "sw.js") return "network"; // the browser keeps this one up to date itself
  if (rest.startsWith("assets/") || rest.startsWith("engine/") || rest.startsWith("pieces/")) return "cache-first";
  return "stale-while-revalidate"; // legends, openings, icons, manifest
}

/** Only complete, same-site answers are worth keeping. */
function cacheable(res) {
  return !!res && res.status === 200 && res.type === "basic";
}

if (typeof module !== "undefined") module.exports = { strategyFor, cacheable };

if (typeof ServiceWorkerGlobalScope !== "undefined" && self instanceof ServiceWorkerGlobalScope) {
  const scopeUrl = self.registration.scope;
  const scope = new URL(scopeUrl).pathname;
  const origin = self.location.origin;

  async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await fetch(request);
    if (cacheable(res)) cache.put(request, res.clone());
    return res;
  }

  async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    const refresh = fetch(request)
      .then((res) => {
        if (cacheable(res)) cache.put(request, res.clone());
        return res;
      })
      .catch(() => null);
    return hit || (await refresh) || Response.error();
  }

  // The page: the network first (so updates arrive), the saved copy when offline or slow.
  async function navigation(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
      const res = await Promise.race([fetch(request), new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), NAV_TIMEOUT_MS))]);
      if (cacheable(res)) cache.put(scopeUrl, res.clone());
      return res;
    } catch {
      return (await cache.match(scopeUrl)) || Response.error();
    }
  }

  // Save the page, the scripts and styles it names, and the engine, so a first visit is enough to work offline.
  async function precache() {
    const shell = await caches.open(SHELL_CACHE);
    const res = await fetch(scopeUrl, { cache: "reload" });
    if (cacheable(res)) {
      await shell.put(scopeUrl, res.clone());
      const html = await res.text();
      const files = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => new URL(m[1], scopeUrl)).filter((u) => u.origin === origin && u.pathname.startsWith(scope));
      await Promise.all(files.map((u) => shell.add(u.href).catch(() => {})));
    }
    const statics = await caches.open(STATIC_CACHE);
    await Promise.all(ENGINE_FILES.map((f) => statics.add(new URL(f, scopeUrl).href).catch(() => {})));
  }

  self.addEventListener("install", (event) => {
    event.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting()));
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keep = [SHELL_CACHE, STATIC_CACHE];
        for (const name of await caches.keys()) if (!keep.includes(name)) await caches.delete(name);
        await self.clients.claim();
      })(),
    );
  });

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    const how = strategyFor({ url: new URL(request.url), method: request.method, mode: request.mode, origin, scope });
    if (how === "network") return;
    if (how === "navigation") event.respondWith(navigation(request));
    else if (how === "cache-first") event.respondWith(cacheFirst(request, request.url.includes("/assets/") ? SHELL_CACHE : STATIC_CACHE));
    else event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  });
}
