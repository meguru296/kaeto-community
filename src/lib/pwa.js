import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { browserAssets } from './browser-assets.js';

// A release changes the worker even when only a page or bundled asset changed.
// This also gives each waiting worker its own complete offline shell.
const sources = ['public/resource-cache.js', 'public/offline.html', 'public/css/pwa-offline.css', 'public/js/pwa-offline.js', 'public/manifest.webmanifest', 'public/img/site/icon-192.png', 'src/pages.js', 'src/pwa-design.js', 'src/server.js'];
const hash = createHash('sha256');
for (const asset of browserAssets.values()) hash.update(asset.content);
for (const file of sources) hash.update(readFileSync(new URL('../../' + file, import.meta.url)));
const build = hash.digest('hex').slice(0, 20);
const content = Buffer.concat([Buffer.from(`const PWA_BUILD = '${build}';\n`), readFileSync(new URL('../../public/resource-cache.js', import.meta.url))]);
export const pwaWorker = { content, etag: `"${build}"`, type: 'text/javascript; charset=utf-8' };
