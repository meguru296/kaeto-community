import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/server.js';
import { pwaWorker } from '../src/lib/pwa.js';

let checks = 0;
function check(name, test) { test(); checks++; console.log('✓ ' + name); }
const source = await fs.readFile(new URL('../public/resource-cache.js', import.meta.url), 'utf8');
function workerHarness(build = 'test') {
  const handlers = new Map(), stores = new Map(), fetches = [];
  let offline = false, status = 200, skipped = 0, claimed = 0, failShell = false;
  const key = value => typeof value === 'string' ? value : value.url;
  const open = async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return { match: async req => data.get(key(req))?.clone(), put: async (req, res) => data.set(key(req), res.clone()), delete: async req => data.delete(key(req)), keys: async () => [...data.keys()].map(url => new Request(url)) };
  };
  vm.runInNewContext(`const PWA_BUILD = '${build}';\n` + source, {
    URL, Request, Response, Headers, Map, Promise, Date,
    self: { location: { origin: 'https://gal.example.com' }, addEventListener: (name, fn) => handlers.set(name, fn), skipWaiting: async () => { skipped++; }, clients: { claim: async () => { claimed++; } } },
    caches: { open, keys: async () => [...stores.keys()], delete: async name => stores.delete(name) },
    fetch: async request => {
      fetches.push(request);
      if (offline) throw new Error('offline');
      const pathname = new URL(request.url).pathname;
      const resultStatus = failShell && pathname === '/css/pwa-offline.css' ? 500 : status;
      return new Response(pathname === '/offline.html' ? 'ANONYMOUS OFFLINE PAGE' : 'NETWORK: ' + pathname, { status: resultStatus, headers: { 'Content-Type': pathname.endsWith('.html') ? 'text/html' : 'image/png' } });
    },
  });
  const lifecycle = async (name, extra = {}) => {
    const tasks = []; handlers.get(name)({ waitUntil: task => tasks.push(task), ...extra }); await Promise.all(tasks);
  };
  const navigation = url => ({ url: new URL(url, 'https://gal.example.com').href, method: 'GET', mode: 'navigate', headers: new Headers() });
  const request = async value => {
    const tasks = []; let promise;
    handlers.get('fetch')({ request: value, waitUntil: task => tasks.push(task), respondWith: response => { promise = response; } });
    const response = promise ? await promise : undefined;
    await Promise.all(tasks); return response;
  };
  return { stores, fetches, lifecycle, navigation, request, setOffline: value => { offline = value; }, setStatus: value => { status = value; }, failShell: () => { failShell = true; }, skipped: () => skipped, claimed: () => claimed };
}
const worker = workerHarness();
await worker.lifecycle('install');
check('安装只预存四个公开离线资源，且不携带账号 cookie', () => {
  assert.equal(worker.fetches.length, 4);
  assert.ok(worker.fetches.every(req => req.credentials === 'omit'));
  assert.equal(worker.skipped(), 0);
});
let response = await worker.request(worker.navigation('/me'));
check('联网始终读取服务器页面，不保存私人 HTML', () => {
  assert.equal(response.status, 200);
  assert.ok([...worker.stores.values()].every(store => !store.has('https://gal.example.com/me')));
});
worker.setOffline(true);
response = await worker.request(worker.navigation('/me'));
check('账号页面断网只显示匿名离线页，不显示旧账号内容', () => assert.equal(response.status, 200));
assert.equal(await response.text(), 'ANONYMOUS OFFLINE PAGE');
for (const file of ['/css/pwa-offline.css', '/js/pwa-offline.js', '/img/site/icon-192.png']) assert.equal((await worker.request(new Request('https://gal.example.com' + file))).status, 200);
check('断网提示的样式、脚本、图标也能离线读取', () => assert.equal(worker.fetches.length, 6));
check('API、写入、跨站请求不由离线回退接管', () => {});
assert.equal(await worker.request(worker.navigation('/api/me')), undefined);
assert.equal(await worker.request(new Request('https://gal.example.com/api/record', { method: 'POST' })), undefined);
assert.equal(await worker.request(new Request('https://other.example/page')), undefined);
worker.setOffline(false); worker.setStatus(503);
response = await worker.request(worker.navigation('/me'));
check('真实的服务器错误保留原状态，不被假离线页掩盖', () => assert.equal(response.status, 503));
worker.setStatus(200);
await worker.lifecycle('message', { data: { type: 'ACTIVATE_UPDATE' }, source: { type: 'window', url: 'https://other.example/' } });
assert.equal(worker.skipped(), 0);
await worker.lifecycle('message', { data: { type: 'ACTIVATE_UPDATE' }, source: { type: 'window', url: 'https://gal.example.com/install' } });
check('更新必须收到本站窗口的明确确认', () => assert.equal(worker.skipped(), 1));
worker.stores.set('kaeto-pwa-shell-old', new Map()); worker.stores.set('unrelated', new Map());
await worker.lifecycle('activate');
check('升级清理旧离线壳，保留其他缓存', () => { assert.equal(worker.stores.has('kaeto-pwa-shell-old'), false); assert.equal(worker.stores.has('kaeto-pwa-shell-test'), true); assert.equal(worker.stores.has('unrelated'), true); assert.equal(worker.claimed(), 1); });
const broken = workerHarness('broken'); broken.failShell();
await assert.rejects(broken.lifecycle('install'), /Offline shell unavailable/);
check('离线壳不完整时安装失败，不强行接替旧版', () => assert.equal(broken.skipped(), 0));

// Exercise browser lifecycle decisions without requiring OS-level installation.
const clientSource = await fs.readFile(new URL('../public/js/resource-cache.js', import.meta.url), 'utf8');
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); }
  async emit(name, event = {}) { for (const fn of this.listeners.get(name) || []) await fn(event); }
}
class Element extends Target {
  constructor() { super(); this.hidden = true; this.disabled = false; this.textContent = ''; this.value = ''; this.isConnected = true; }
  matches(selector) { return selector.startsWith('[readonly]') ? false : this.editor === true; }
}
class HTMLFormElement extends Element { constructor() { super(); this.method = 'post'; } }
async function clientHarness({ controlled = true, waiting = true } = {}) {
  const window = new Target(), document = new Target(), sw = new Target(), reg = new Target();
  const elements = new Map(['install', 'install-status', 'update', 'update-text', 'update-apply', 'update-later', 'connection', 'connection-text', 'connection-dismiss', 'back'].map(name => ['[data-pwa-' + name + ']', new Element()]));
  let reloads = 0, confirms = 0, allowConfirm = true, timers = [];
  const messages = [];
  reg.waiting = waiting ? { postMessage: msg => messages.push(msg) } : null;
  reg.active = { postMessage() {} };
  sw.controller = controlled ? {} : null;
  sw.register = async () => reg; sw.ready = Promise.resolve(reg);
  const navigator = { serviceWorker: sw, onLine: true };
  document.documentElement = { dataset: {}, toggleAttribute() {} };
  document.readyState = 'complete'; document.images = [];
  document.querySelector = selector => elements.get(selector);
  document.querySelectorAll = selector => selector === '[data-pwa-install]' ? [elements.get(selector)] : [];
  window.isSecureContext = true; window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.requestIdleCallback = fn => fn(); window.confirm = () => { confirms++; return allowConfirm; };
  const location = { origin: 'https://gal.example.com', pathname: '/install', reload: () => { reloads++; } };
  vm.runInNewContext(clientSource, { window, document, navigator, location, history: {}, Element, HTMLFormElement, URL, Map, Array, Boolean, Date, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} });
  await new Promise(resolve => setImmediate(resolve));
  return { window, document, navigator, sw, reg, elements, messages, reloads: () => reloads, confirms: () => confirms, denyConfirm: () => { allowConfirm = false; } };
}
let client = await clientHarness();
check('浏览器未提供安装能力时不显示无效安装按钮', () => assert.equal(client.elements.get('[data-pwa-install]').hidden, true));
check('已等待的新版显示提醒，但不刷新页面', () => { assert.equal(client.elements.get('[data-pwa-update]').hidden, false); assert.equal(client.reloads(), 0); });
await client.sw.emit('controllerchange');
check('其他窗口激活新版不会强制刷新本页', () => assert.equal(client.reloads(), 0));
await client.elements.get('[data-pwa-update-apply]').emit('click');
check('点击更新后才请求激活新版', () => assert.equal(client.messages[0].type, 'ACTIVATE_UPDATE'));
await client.sw.emit('controllerchange');
check('主动更新的窗口在激活完成后重新打开', () => assert.equal(client.reloads(), 1));
client = await clientHarness();
let prompted = 0, prevented = 0;
await client.window.emit('beforeinstallprompt', { preventDefault: () => { prevented++; }, prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
assert.equal(client.elements.get('[data-pwa-install]').hidden, false);
await client.elements.get('[data-pwa-install]').emit('click');
check('安装使用真实浏览器提示，取消后隐藏已消耗的按钮', () => { assert.equal(prompted, 1); assert.equal(prevented, 1); assert.equal(client.elements.get('[data-pwa-install]').hidden, true); assert.match(client.elements.get('[data-pwa-install-status]').textContent, /取消/); });
const editor = new Element(); editor.editor = true;
await client.document.emit('focusin', { target: editor }); editor.value = '还在写的评价'; client.denyConfirm();
await client.elements.get('[data-pwa-update-apply]').emit('click');
check('有未保存编辑时取消更新，内容和当前页面都保留', () => { assert.equal(client.confirms(), 1); assert.equal(client.messages.length, 0); assert.equal(client.reloads(), 0); assert.equal(editor.value, '还在写的评价'); });
client.navigator.onLine = false; let blocked = false, stopped = false;
await client.document.emit('submit', { target: new HTMLFormElement(), preventDefault: () => { blocked = true; }, stopImmediatePropagation: () => { stopped = true; } });
check('明确断网时阻止表单提交并提示保留编辑内容', () => { assert.ok(blocked && stopped); assert.equal(client.elements.get('[data-pwa-connection]').hidden, false); });
client = await clientHarness({ controlled: false, waiting: false });
await client.sw.emit('controllerchange');
check('首次安装接管不误报更新也不重载', () => { assert.equal(client.reloads(), 0); assert.equal(client.elements.get('[data-pwa-update]').hidden, true); });

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kaeto-pwa-')); let app;
try {
  app = await createApp({ dataDir: dir, mailer: { ready: false } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  response = await fetch(base + '/manifest.webmanifest'); const manifest = await response.json();
  check('应用清单可公开读取，作用域与独立窗口入口正确', () => { assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/manifest\+json/); assert.equal(manifest.id, '/'); assert.equal(manifest.scope, '/'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.display, 'standalone'); });
  for (const icon of manifest.icons) {
    response = await fetch(base + icon.src); const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(`${meta.width}x${meta.height}`, icon.sizes);
  }
  check('192、512 与 maskable 图标均存在且尺寸正确', () => assert.equal(manifest.icons.length, 3));
  for (const route of ['/', '/install', '/login']) {
    response = await fetch(base + route); const html = await response.text();
    assert.equal(response.status, 200); assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/); assert.match(html, /href="\/install"/); assert.match(response.headers.get('cache-control'), /no-store/);
  }
  check('首页、安装页和登录页都接入清单与入口，HTML 仍不缓存', () => {});
  response = await fetch(base + '/resource-cache.js');
  assert.equal(await response.text(), pwaWorker.content.toString());
  const etag = response.headers.get('etag');
  response = await fetch(base + '/resource-cache.js', { headers: { 'If-None-Match': etag } });
  check('Worker 有内容指纹、更新头与条件读取支持', () => { assert.equal(response.status, 304); assert.equal(response.headers.get('cache-control'), 'no-cache'); assert.equal(response.headers.get('service-worker-allowed'), '/'); });
  for (const route of ['/offline.html', '/css/pwa-offline.css', '/js/pwa-offline.js']) assert.equal((await fetch(base + route)).status, 200);
  response = await fetch(base + '/config.json');
  check('新增公开资源没有放开配置文件访问', () => assert.equal(response.status, 404));
} finally { if (app) await new Promise(resolve => app.server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); }
console.log(`${checks} 项 PWA 检查通过；无真实写入、发信或生产访问。`);
