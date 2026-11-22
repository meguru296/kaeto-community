import sharp from 'sharp';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverMaskUrl } from './work-media.js';

const publicRoot = fileURLToPath(new URL('../../public/', import.meta.url));
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 40 * 1000 * 1000;
export class CoverImages {
  constructor(dataDir) { this.dataDir = dataDir; this.pending = new Map(); this.originals=new Map();this.originalPending=new Map();this.originalBytes=0; }
  async original(cover) {
    // Raw bytes are private and bounded; several cards requesting the same
    // newly discovered cover share one upstream download and image validation.
    const key=cover?.url||'';
    if(!key.startsWith('https://lain.bgm.tv/'))return this.readOriginal(cover);
    const cached=this.originals.get(key);
    if(cached&&Date.now()-cached.at<3600000){this.originals.delete(key);this.originals.set(key,cached);return cached.image;}
    if(this.originalPending.has(key))return this.originalPending.get(key);
    if(this.originalPending.size>=12)throw Error('封面正在加载，请稍后再试');
    const task=this.readOriginal(cover).then(image=>{
      if(cached){this.originalBytes-=cached.image.bytes.length;this.originals.delete(key);}
      this.originals.set(key,{at:Date.now(),image});this.originalBytes+=image.bytes.length;
      while(this.originalBytes>32*1024*1024){const [old,value]=this.originals.entries().next().value;this.originals.delete(old);this.originalBytes-=value.image.bytes.length;}
      return image;
    }).finally(()=>this.originalPending.delete(key));this.originalPending.set(key,task);return task;
  }
  async readOriginal(cover) {
    const url = cover?.url || '';
    let bytes;
    if (/^\/img\/work-cache\/[a-f0-9]{20}\.jpg$/.test(url)) {
      bytes = await readFile(path.join(this.dataDir, 'media-images', path.basename(url)));
    } else if (/^\/img\/[A-Za-z0-9_/-]+\.(?:webp|png|jpe?g)$/.test(url) && !url.includes('..')) {
      bytes = await readFile(path.join(publicRoot, url.slice(1)));
    } else {
      const upstream = new URL(url);
      const allowed=/^(?:cdn|image)\.ymgal\.games$/.test(upstream.hostname)||upstream.hostname==='t.vndb.org'&&/^\/cv\/\d+\/\d+\.(?:jpe?g|png|webp)$/.test(upstream.pathname)||upstream.hostname==='lain.bgm.tv'&&/^\/(?:r\/[1-9]\d{0,3}\/)?pic\/cover\/[lmscg]\/[a-f0-9]{2}\/[a-f0-9]{2}\/[A-Za-z0-9_]+\.(?:jpg|png|webp)$/.test(upstream.pathname);
      if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.port || !allowed) throw new Error('不支持的封面来源');
      const response = await fetch(upstream, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('封面暂时不可用');
      if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('封面过大'); }
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_BYTES) throw new Error('封面过大');
        chunks.push(Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks, size);
    }
    if (bytes.length > MAX_BYTES) throw new Error('封面过大');
    const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
    const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[metadata.format];
    if (!mime) throw new Error('不支持的封面格式');
    return { bytes, mime, width: metadata.width, height: metadata.height };
  }
  async masked(cover) {
    const file = path.join(this.dataDir, 'cover-masks', path.basename(coverMaskUrl(cover.url)));
    try { return await readFile(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    if (this.pending.has(file)) return this.pending.get(file);
    const task = (async () => {
      const original = await this.original(cover);
      // Destroy image detail before upscaling. The browser receives only these
      // coarse colour blocks; the uncensored bytes never reach public HTML.
      const tiny = await sharp(original.bytes, { limitInputPixels: MAX_PIXELS }).resize(6, 8, { fit: 'fill' }).png().toBuffer();
      const height = 480, width = Math.max(220, Math.min(480, Math.round(height * original.width / original.height)));
      const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#3e263d" opacity=".58"/><g transform="translate(${width / 2 - 24},210)" stroke="#fff7fc" stroke-width="4" fill="none"><rect x="4" y="22" width="40" height="32" rx="7"/><path d="M14 22v-8a10 10 0 0 1 20 0v8"/><path d="M24 34v10"/></g></svg>`);
      const bytes = await sharp(tiny).resize(width, height, { kernel: 'nearest' }).composite([{ input: overlay }]).webp({ quality: 75 }).toBuffer();
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file + '.tmp', bytes);
      await rename(file + '.tmp', file);
      return bytes;
    })().finally(() => this.pending.delete(file));
    this.pending.set(file, task);
    return task;
  }
}
