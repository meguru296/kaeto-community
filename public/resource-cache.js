'use strict';

// Only public resources and a fixed anonymous offline shell are cached.
// Navigations go to the network; a failed connection shows the offline shell.
const CACHE = 'kaeto-public-assets-v2';
const PREFIX = 'kaeto-public-assets-';
const SHELL_PREFIX = 'kaeto-pwa-shell-';
const SHELL = SHELL_PREFIX + (typeof PWA_BUILD === 'string' ? PWA_BUILD : 'development');
const OFFLINE_FILES = ['/offline.html', '/css/pwa-offline.css', '/js/pwa-offline.js', '/img/site/icon-192.png'];
const MAX_ENTRIES = 160;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const REFRESH_AFTER = 24 * 60 * 60 * 1000;
const inFlight = new Map();
let writeQueue = Promise.resolve();
let storedSizes;

function resourceKind(request) {
  if (request.method !== 'GET' || request.mode === 'navigate' || request.headers.has('range')) return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.search.length > 128) return null;
  if (/^\/(css|js)\/site-[a-f0-9]{20}\.(css|js)$/.test(url.pathname)) return 'immutable';
  if (/^\/img\/[a-zA-Z0-9_/-]+\.(?:webp|png|jpe?g|gif|svg)$/.test(url.pathname)) return 'image';
  return null;
}

function save(request, response, kind) {
  const task = writeQueue.then(async () => {
    if (response.status === 404 || response.status === 410) { await (await caches.open(CACHE)).delete(request); storedSizes?.delete(request.url); return; }
    if (!response.ok || response.status !== 200 || response.redirected || /(?:no-store|private)/i.test(response.headers.get('cache-control') || '')) return;
    const mime = response.headers.get('content-type') || '';
    if ((response.headers.get('vary') || '').split(',').some(name => name.trim() && name.trim().toLowerCase() !== 'accept-encoding')) return;
    if (kind === 'image' ? !mime.startsWith('image/') : !/^(?:text\/css|text\/javascript|application\/javascript)/.test(mime)) return;
    if (Number(response.headers.get('content-length')) > MAX_FILE_BYTES) return;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_FILE_BYTES) return;
    const headers = new Headers(response.headers);
    headers.delete('content-encoding'); headers.delete('content-length'); headers.delete('vary');
    headers.set('x-kaeto-cached-at', String(Date.now()));
    headers.set('x-kaeto-cache-bytes', String(bytes.byteLength));
    const cache = await caches.open(CACHE);
    if (!storedSizes) {
      const keys = await cache.keys();
      storedSizes = new Map(await Promise.all(keys.map(async key => [key.url, Number((await cache.match(key))?.headers.get('x-kaeto-cache-bytes')) || 0])));
    }
    // Reinsert refreshed entries last, so eviction favors older resources.
    await cache.delete(request);
    await cache.put(request, new Response(bytes, { status: 200, headers }));
    storedSizes.delete(request.url); storedSizes.set(request.url, bytes.byteLength);
    let total = [...storedSizes.values()].reduce((sum, size) => sum + size, 0);
    for (const [url, size] of storedSizes) {
      if (storedSizes.size <= MAX_ENTRIES && total <= MAX_BYTES) break;
      await cache.delete(url); storedSizes.delete(url); total -= size;
    }
  });
  writeQueue = task.catch(() => {}); // Quota/private-mode failures never block a page.
  return writeQueue;
}

function download(request, kind, revalidate = false) {
  const key = request.url;
  if (inFlight.has(key)) return inFlight.get(key);
  const pending = (async () => {
    const response = await fetch(request, revalidate ? { cache: 'no-cache' } : undefined);
    const persisted = save(request, response.clone(), kind);
    persisted.finally(() => inFlight.delete(key));
    return { response, persisted };
  })().catch(error => { inFlight.delete(key); throw error; });
  inFlight.set(key, pending);
  return pending;
}

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(SHELL);
  // Never activate a partial offline shell. No cookies or account HTML enter it.
  for (const file of OFFLINE_FILES) {
    const request = new Request(new URL(file, self.location.origin), { credentials: 'omit', cache: 'reload' });
    const response = await fetch(request);
    if (response.status !== 200 || response.redirected) throw new Error('Offline shell unavailable');
    await cache.put(request, response);
  }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if ((name.startsWith(PREFIX) && name !== CACHE) || (name.startsWith(SHELL_PREFIX) && name !== SHELL)) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method === 'GET' && requestUrl.origin === self.location.origin) {
    if (event.request.mode === 'navigate' && !requestUrl.pathname.startsWith('/api/')) {
      // Server errors and redirects keep their real behavior; only a network
      // failure falls back. Account pages and API responses are never stored.
      event.respondWith(fetch(event.request).catch(async () => {
        const cached = await (await caches.open(SHELL)).match(new URL('/offline.html', self.location.origin).href);
        return cached || new Response('暂时无法连接视觉小说社区，请联网后重试。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
      }));
      return;
    }
    if (OFFLINE_FILES.includes(requestUrl.pathname) && !requestUrl.search && !event.request.headers.has('range')) {
      event.respondWith((async () => (await (await caches.open(SHELL)).match(event.request)) || fetch(event.request))());
      return;
    }
  }
  const kind = resourceKind(event.request);
  if (!kind) return;
  // Register the lifetime promise synchronously, including delayed refreshes.
  let finish;
  event.waitUntil(new Promise(resolve => { finish = resolve; }));
  event.respondWith((async () => {
    let cached;
    try { cached = await (await caches.open(CACHE)).match(event.request); } catch { /* Use the network if storage is unavailable. */ }
    if (cached) {
      if (kind === 'image' && Date.now() - Number(cached.headers.get('x-kaeto-cached-at') || 0) > REFRESH_AFTER) {
        download(event.request, kind, true).then(result => result.persisted).catch(() => {}).finally(finish);
      } else finish();
      return cached;
    }
    try {
      const result = await download(event.request, kind);
      result.persisted.finally(finish);
      return result.response.clone();
    } catch (error) { finish(); throw error; }
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    if (event.source?.type === 'window' && new URL(event.source.url).origin === self.location.origin) event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type !== 'WARM_PUBLIC_ASSETS' || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls)].slice(0, 40);
  event.waitUntil((async () => {
    // Populate resources already displayed, reusing the browser HTTP cache.
    // No bulk gallery downloads or speculative fetching of other pages.
    for (const value of urls) {
      try {
        const request = new Request(new URL(value, self.location.origin), { credentials: 'same-origin' });
        const kind = resourceKind(request);
        if (kind && !await (await caches.open(CACHE)).match(request)) await (await download(request, kind)).persisted;
      } catch { /* Best effort only. */ }
    }
  })());
});
