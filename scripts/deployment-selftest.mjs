import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Db, randomInviteCode } from '../src/lib/store.js';
import { WorkMediaClient } from '../src/lib/work-media.js';
import { createApp } from '../src/server.js';
import { browserStyles, browserScripts, browserTheme, pageAssets } from '../src/lib/browser-assets.js';
import { Script } from 'node:vm';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gal-deploy-'));
let count = 0, app;
try {
  for (const value of [{}, null, { items: {} }, [null], [{ id: 'a' }, { id: 'a' }]]) {
    const bytes = JSON.stringify(value); await fs.writeFile(path.join(dir, 'users.json'), bytes);
    await assert.rejects(new Db(dir).init(), /无法读取/);
    assert.equal(await fs.readFile(path.join(dir, 'users.json'), 'utf8'), bytes); count++;
  }
  await fs.writeFile(path.join(dir, 'users.json'), '{"items":[]}');
  await new Db(dir).init(); count++;
  assert.match(randomInviteCode(), /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/); count++;
  let cancelled = false;
  const image = { url: 'https://t.vndb.org/cv/00/99999999.jpg' };
  const client = new WorkMediaClient({ fetcher: async (_, options) => {
    assert.equal(options.redirect, 'error');
    return new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'image/jpeg' } });
  } });
  await assert.rejects(client.image(image), /Image too large/); assert.equal(cancelled, true); count++;
  const advertised = new WorkMediaClient({ fetcher: async () => new Response('', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '999999999' } }) });
  await assert.rejects(advertised.image(image), /Image too large/); count++;
  app = await createApp({ dataDir: dir, mailer: { ready: false } });
  app.ymgal.randomGames = async () => [];
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  new Script(browserScripts.content.toString()); count++;
  new Script(browserTheme.content.toString()); count++;
  const homepage = await (await fetch(base + '/')).text();
  const homeAssets=pageAssets({active:'home'});
  assert.ok(homepage.includes(homeAssets.styles.url) && homepage.includes(homeAssets.scripts.url) && homepage.includes(browserTheme.url));
  assert.ok(homepage.indexOf(browserTheme.url) < homepage.indexOf(homeAssets.styles.url));
  assert.equal((homepage.match(/<link rel="stylesheet"/g) || []).length, 1);
  assert.equal((homepage.match(/<script src=/g) || []).length, 2); count++;
  for (const asset of [browserStyles, browserScripts, browserTheme]) {
    const first = await fetch(base + asset.url);
    assert.equal(first.status, 200); assert.match(first.headers.get('cache-control'), /immutable/);
    assert.equal(await first.text(), asset.content.toString());
    const unchanged = await fetch(base + asset.url, { headers: { 'If-None-Match': first.headers.get('etag') } });
    assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), '');
    const head = await fetch(base + asset.url, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), ''); count++;
  }
  const staticImage = await fetch(base + '/img/community/avatar.webp', { method: 'HEAD' });
  assert.equal(staticImage.status, 200);
  const cachedImage = await fetch(base + '/img/community/avatar.webp', { headers: { 'If-None-Match': staticImage.headers.get('etag') } });
  assert.equal(cachedImage.status, 304); count++;
  const about = await (await fetch(base + '/about')).text();
  assert.ok(about.includes('data-site-video="about.video"'));
  assert.ok(!about.includes('<video') && !about.includes('/media/recruitment.mp4')); count++;
  // External catalog budgets are covered by guest-access-selftest. Public
  // cached browsing intentionally no longer spends that external budget.
  console.log(`${count} 项数据格式、注册码、缓存及图片下载边界检查通过（隔离数据）`);
} finally { if (app) await new Promise(resolve => app.server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); }
