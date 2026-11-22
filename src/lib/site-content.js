import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { esc } from './utils.js';

export const isSuperAdmin = user => user?.isAdmin === true && user?.isSuperAdmin === true;
const gallery = ['sunset'];
const galleryNames = ['示例封面'];
export const contentFields = [
  ['home.greeting', '首页短句', 'text', 80], ['home.intro', '首页介绍', 'text', 250],
  ['festival.intro', '拜年祭专题介绍', 'text', 250], ['festival.status', '拜年祭状态', 'text', 40],
  ['battle.title', '萌战主标题', 'text', 60], ['battle.note', '萌战主视觉说明', 'text', 100],
  ['footer.slogan', '页脚短句', 'text', 120],
  ['about.video', '招新视频 · 哔哩哔哩链接（留空暂不展示）', 'bilibili'],
  ['home.art', '首页星标图片', 'image'], ['festival.art', '拜年祭主视觉', 'image'],
  ...gallery.flatMap((name, i) => [[`gallery.${name}.title`, `画廊 · ${galleryNames[i]} · 名称`, 'text', 80], [`gallery.${name}.image`, `画廊 · ${galleryNames[i]} · 图片`, 'image']]),
];
const fields = new Map(contentFields.map(f => [f[0], f]));
const localImage = value => /^\/img\/[A-Za-z0-9_/-]+\.(webp|png|jpe?g|gif)$/.test(value);

export function bilibiliVideoUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname) && /^\/video\/(?:BV[a-zA-Z0-9]{10}|av\d+)\/?$/.test(url.pathname)) return `https://www.bilibili.com${url.pathname.replace(/\/?$/, '/')}`;
    if (url.hostname === 'b23.tv' && /^\/[a-zA-Z0-9]{3,20}$/.test(url.pathname)) return `https://b23.tv${url.pathname}`;
  } catch { /* Reject malformed URLs rather than reflecting them into HTML. */ }
  return null;
}

export function applySiteContent(html, overrides = {}) {
  const video = bilibiliVideoUrl(overrides['about.video']);
  if (video) {
    const recruitment = false;
    const picture = '<span class="community-video-fallback" aria-hidden="true">COMMUNITY VIDEO</span>';
    const card = `<div class="community-video-card jx-video" data-site-video="about.video"><a class="jx-video-picture" href="${esc(video)}" target="_blank" rel="noopener noreferrer" aria-label="在哔哩哔哩观看视觉小说社区 Galgame 交流会招新视频">${picture}<span class="jx-video-play" aria-hidden="true"><b>▶</b></span><small>${recruitment ? '00:49 · ' : ''}BILIBILI</small></a><div class="jx-video-copy"><p class="eyebrow">MEET YOUR NEXT STORY / COMMUNITY VIDEO</p><h2>在这里，<br>遇见懂你的同好。</h2><p class="jx-video-description">${recruitment ? '2026 · 视觉小说社区 · 视觉小说社区<br>Galgame 交流会招新' : '认识视觉小说社区 Galgame 交流会。<br>在哔哩哔哩，看看我们的故事与创作。'}</p><p class="jx-video-credit">${recruitment ? '编辑 · 49 秒 · ' : ''}外站播放</p><a class="text-link" href="${esc(video)}" target="_blank" rel="noopener noreferrer">前往哔哩哔哩观看 ↗</a></div></div>`;
    html = html.replace(/<div\b[^>]*data-site-video="about.video"[^>]*>[\s\S]*?<\/div>/, () => card);
  }
  html = html.replace(/<(\w+)([^>]*\bdata-site-text="([\w.-]+)"[^>]*)>([\s\S]*?)<\/\1>/g, (all, tag, attrs, key) => Object.hasOwn(overrides, key) ? `<${tag}${attrs}>${esc(overrides[key])}</${tag}>` : all);
  html = html.replace(/<img\b[^>]*\bdata-site-image="([\w.-]+)"[^>]*>/g, (all, key) => localImage(overrides[key] || '') ? all.replace(/\bsrc="[^"]*"/, `src="${esc(overrides[key])}"`) : all);
  html = html.replace(/<button\b[^>]*data-site-gallery="([\w-]+)"[^>]*>/g, (all, name) => {
    const image = overrides[`gallery.${name}.image`], title = overrides[`gallery.${name}.title`];
    if (localImage(image || '')) all = all.replace(/data-poster="[^"]*"/, `data-poster="${esc(image)}"`);
    if (title !== undefined) all = all.replace(/data-poster-label="[^"]*"/, `data-poster-label="${esc(title)}"`);
    return all;
  });
  return html;
}

export class SiteContent {
  constructor(db, uploadDir) { this.db = db; this.uploadDir = uploadDir; this.queue = Promise.resolve(); }
  values() { return this.db.meta.get('site-content')?.values || {}; }
  serial(fn) { const run = this.queue.then(fn); this.queue = run.catch(() => {}); return run; }
  async save(user, { key, value = '', reset }) {
    if (!isSuperAdmin(user)) throw Object.assign(new Error('仅超级管理员可以编辑站点内容'), { status: 403 });
    return this.serial(async () => {
      const field = fields.get(key);
      if (!field) throw new Error('这个内容暂不开放编辑');
      let text = String(value).trim();
      if (field[2] === 'bilibili' && reset !== '1') {
        text = bilibiliVideoUrl(text);
        if (text === null) throw new Error('请填写 HTTPS 哔哩哔哩视频地址或 b23.tv 分享链接，也可留空暂不展示');
      }
      if (field[2] === 'image' && reset !== '1' && !localImage(text)) throw new Error('请使用上传后的本站图片路径');
      if (field[2] === 'image' && text.startsWith('/img/uploads/') && !this.db.assets.find(a => a.url === text)) throw new Error('上传图片不存在');
      if (field[2] === 'text' && ([...text].length > field[3] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))) throw new Error(`内容最多 ${field[3]} 字，请勿使用控制字符`);
      const before = this.values()[key], values = { ...this.values() };
      if (reset === '1') delete values[key]; else values[key] = text;
      await this.db.audit.insert({ userId: user.id, action: 'content.edit', key, before: before ?? null, after: values[key] ?? null });
      if (this.db.meta.get('site-content')) await this.db.meta.update('site-content', { values });
      else await this.db.meta.insert({ id: 'site-content', values });
    });
  }
  async upload(user, req) { return this.serial(() => this.storeUpload(user, req)); }
  async storeUpload(user, req) {
    if (!isSuperAdmin(user)) throw Object.assign(new Error('仅超级管理员可以上传素材'), { status: 403 });
    const boundary = /boundary=(?:"([^"\r\n]+)"|([^;\s]+))/.exec(req.headers['content-type'] || '');
    const mark = boundary && (boundary[1] || boundary[2]);
    if (!mark || mark.length > 100) throw new Error('上传表单不正确');
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 5 * 1024 * 1024 + 16384) throw Object.assign(new Error('图片不能超过 5MB'), { status: 413 }); chunks.push(chunk); }
    const body = Buffer.concat(chunks), start = body.indexOf('\r\n\r\n'), end = body.indexOf(Buffer.from(`\r\n--${mark}`), start + 4);
    if (!body.subarray(0, 150).includes(Buffer.from(`--${mark}\r\n`)) || start < 0 || start > 8192 || end < 0) throw new Error('上传表单不完整');
    const header = body.subarray(0, start).toString('utf8');
    if (!/name="image";\s*filename="[^"\r\n]*"/.test(header)) throw new Error('请选择图片文件');
    const data = body.subarray(start + 4, end);
    if (!data.length || data.length > 5 * 1024 * 1024) throw new Error('图片大小需为 1B—5MB');
    const ext = sniffImage(data);
    if (!ext) throw new Error('仅支持真实的 PNG / JPEG / WebP / GIF 图片，不支持 SVG 或其他文件');
    if (this.db.assets.all().reduce((sum,a) => sum + (a.bytes || 0), 0) + data.length > 250 * 1024 * 1024) throw new Error('素材库已达到 250MB 上限，请先由站长整理');
    await mkdir(this.uploadDir, { recursive: true });
    const name = `${randomBytes(16).toString('hex')}.${ext}`, target = path.join(this.uploadDir, name);
    await writeFile(target, data, { flag: 'wx', mode: 0o640 });
    const url = `/img/uploads/${name}`;
    try {
      await this.db.assets.insert({ url, bytes: data.length, type: ext, userId: user.id });
      await this.db.audit.insert({ userId: user.id, action: 'asset.upload', key: url });
    } catch (err) { await unlink(target).catch(() => {}); throw err; }
    return url;
  }
}

export function sniffImage(data) {
  if (data.length < 20) return null;
  if (data.length >= 33 && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && data.subarray(12,16).toString() === 'IHDR' && data.includes(Buffer.from('IEND')) && data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0 && data.readUInt32BE(16) * data.readUInt32BE(20) <= 40000000) return 'png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255 && data.at(-2) === 255 && data.at(-1) === 217) return 'jpg';
  if (/^GIF8[79]a$/.test(data.subarray(0,6).toString()) && data.at(-1) === 59 && data.readUInt16LE(6) * data.readUInt16LE(8) > 0 && data.readUInt16LE(6) * data.readUInt16LE(8) <= 40000000) return 'gif';
  if (data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP' && data.readUInt32LE(4) + 8 === data.length && /^VP8[ LX]$/.test(data.subarray(12,16).toString())) return 'webp';
  return null;
}
