import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { domesticIndex } from './domestic-works.js';
import { workCorrectionContext } from './work-correction-context.js';
import {workPresentationContext} from './work-presentation-context.js';
import {canonicalBrands} from './brand-names.js';

// Media is kept separate from mutable user/game records. Requests never depend
// on an upstream image API being available, and YMGal gids remain unchanged.
let cache = { games: {}, annual: [], works: {} };
let seed = { games: {}, annual: [], works: {} };
try { seed = JSON.parse(readFileSync(new URL('../data/work-media-seed.json', import.meta.url), 'utf8')); } catch {}
const dataRoot = process.env.DATA_DIR || fileURLToPath(new URL('../../data/', import.meta.url));
const cacheFile = path.join(dataRoot, 'media', 'vndb.json');
const imageDir = path.join(dataRoot, 'media-images');
try { const saved = JSON.parse(readFileSync(cacheFile, 'utf8')); cache = {...seed,...saved,games:{...seed.games,...saved.games},works:{...seed.works,...saved.works}}; }
catch { cache = structuredClone(seed); }
const publicRoot = new URL('../../public/', import.meta.url);
let safetySeed = { flags: {} }, coverPolicy = {};
try { safetySeed = JSON.parse(readFileSync(new URL('../data/cover-safety-seed.json', import.meta.url), 'utf8')); } catch {}
const policyFile = path.join(dataRoot, 'media', 'cover-policy.json');
try { coverPolicy = JSON.parse(readFileSync(policyFile, 'utf8')); } catch {}
let policyWrites = Promise.resolve();
// PostgreSQL 模式下，缓存与封面策略存入 kv 表（键沿用原相对路径）。
let kvStore = null;
let revision=0;
export const workMediaRevision=()=>revision+':'+(workPresentationContext.getStore()?.bangumi?.revision||0);
export async function useWorkMediaStore(kv) {
  revision++;
  const [saved, policy] = await Promise.all([kv.get('media/vndb.json'), kv.get('media/cover-policy.json')]);
  if (saved && typeof saved === 'object') cache = {...seed,...saved,games:{...seed.games,...saved.games},works:{...seed.works,...saved.works}};
  if (policy && typeof policy === 'object' && !Array.isArray(policy)) coverPolicy = policy;
  kvStore = kv;
}
export const coverMaskUrl = url => '/img/cover-masks/' + createHash('sha256').update('mosaic-v1|' + url).digest('hex').slice(0, 20) + '.webp';
export function coverNeedsMask(cover) {
  if (!cover?.url) return false;
  if (coverPolicy[cover.url] === 'hide') return true;
  if (coverPolicy[cover.url] === 'show') return false;
  const rating = Number.isFinite(cover.sexual) ? cover.sexual : safetySeed.flags[cover.originalUrl]?.sexual;
  // VNDB 0 = safe, 1 = suggestive, 2 = explicit. This is an image vote,
  // independent of the work's R18 tag; borderline cases remain editable.
  return Number.isFinite(rating) && rating >= 1.5;
}
function publicCover(cover) {
  return coverNeedsMask(cover) ? { url: coverMaskUrl(cover.url), dims: cover.dims, masked: true } : cover;
}
export function originalCover(game) {
  const corrected=workCorrectionContext.getStore()?.cover(game?.gid);
  if(corrected)return {url:corrected.value,sexual:2};
  const bangumi=workPresentationContext.getStore()?.bangumi?.cover(game);if(bangumi)return bangumi;
  if(game?.source==='CnGal'&&game.mainImg?.startsWith('/img/cngal/'))return {url:game.mainImg};
  const cover = cache.works[cache.games[String(game?.gid)]]?.cover;
  return available(cover) ? cover : { url: game?.ymgalImg ?? game?.mainImg ?? '' };
}
export function coverPolicyMode(game) { return coverPolicy[originalCover(game).url] || 'auto'; }
export async function setCoverPolicy(game, mode) {
  if (!['auto', 'hide', 'show'].includes(mode)) throw new Error('请选择有效的封面展示方式');
  const cover = originalCover(game);
  if (!cover.url) throw new Error('这部作品暂无封面');
  const before = coverPolicy[cover.url] || 'auto';
  if (mode === 'auto') delete coverPolicy[cover.url]; else coverPolicy[cover.url] = mode;
  revision++;
  const snapshot = JSON.stringify(coverPolicy, null, 2);
  const run = policyWrites.then(async () => {
    if (kvStore) return kvStore.set('media/cover-policy.json', JSON.parse(snapshot));
    await mkdir(path.dirname(policyFile), { recursive: true });
    await writeFile(policyFile + '.tmp', snapshot, 'utf8');
    await rename(policyFile + '.tmp', policyFile);
  });
  policyWrites = run.catch(() => {});
  await run;
  return before;
}
export function knownCovers(games = []) {
  return [...Object.values(cache.works).map(w => w.cover), ...games.map(g => ({ url: g.ymgalImg ?? g.mainImg ?? '' })),...(workCorrectionContext.getStore()?.covers()||[]),...(workPresentationContext.getStore()?.bangumi?.covers()||[])].filter(c => c?.url);
}
export function protectedCoverPath(pathname, games) {
  return knownCovers(games).some(c => c.url.toLowerCase() === pathname.toLowerCase() && coverNeedsMask(c));
}
export function maskSource(pathname, games) {
  return knownCovers(games).find(c => coverNeedsMask(c) && coverMaskUrl(c.url) === pathname) || null;
}
function available(image) {
  if (/^\/img\/work-cache\/[a-f0-9]{20}\.jpg$/.test(image?.url || '')) return existsSync(path.join(imageDir,path.basename(image.url)));
  return Boolean(image?.url?.startsWith('/img/vndb/') && existsSync(new URL(image.url.slice(1), publicRoot)));
}
export function mediaForId(id) {
  const work = cache.works[id];
  if (!work) return null;
  return { ...work, cover: available(work.cover) ? publicCover(work.cover) : null,
    screenshots: (work.screenshots || []).filter(available) };
}
export function annualMedia(index) { return mediaForId(cache.annual[index]); }
export function withWorkMedia(game) {
  if (!game) return game;
  game = domesticIndex.enrich({ ...game, vndbId: game.vndbId || cache.games[String(game.gid)] });
  game = workCorrectionContext.getStore()?.apply(game)||game;
  const media = mediaForId(cache.games[String(game.gid)]);
  const orgName = canonicalBrands(game.orgName || media?.developers?.join(' / ') || '');
  const ymgalImg = game.ymgalImg ?? game.mainImg ?? '';
  const cnCover=game.source==='CnGal'&&game.mainImg?.startsWith('/img/cngal/')?game.mainImg:'';
  const bgCover=workPresentationContext.getStore()?.bangumi?.cover(game);
  const original = originalCover(game);
  const coverRestricted = coverNeedsMask(original);
  const correctedCover=workCorrectionContext.getStore()?.cover(game.gid);
  const mainImg = coverRestricted ? coverMaskUrl(original.url) : correctedCover ? correctedCover.value : cnCover || media?.cover?.url || bgCover?.url || ymgalImg;
  const result={ ...game, orgName, media, ymgalImg, mainImg, coverRestricted, coverPolicyMode: coverPolicyMode(game), coverSource: correctedCover?'correction':bgCover?'bangumi':mainImg?.startsWith('/img/cngal/') ? 'cngal' : media?.cover?.url ? 'vndb' : mainImg ? 'ymgal' : '' };
  return workCorrectionContext.getStore()?.apply(result)||result;
}

const normalizeTitle = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
export function selectVn(game, candidates) {
  const names = [game.name, game.chineseName, ...(game.extensionName || []).map(e => e.name)].map(normalizeTitle).filter(Boolean);
  const primary=normalizeTitle(game.name);
  const primaryHits=candidates.filter(v=>[v.title,v.alttitle,...(v.titles || []).flatMap(t=>[t.title,t.latin])].some(t=>primary && normalizeTitle(t)===primary));
  if(primaryHits.length===1) return primaryHits[0];
  const exact = candidates.filter(v => [v.title, v.alttitle, ...(v.aliases || []), ...(v.titles || []).flatMap(t => [t.title, t.latin])].some(t => names.includes(normalizeTitle(t))));
  // A single exact title/alias match is safer than selecting the first search hit.
  return exact.length === 1 ? exact[0] : null;
}
export function linkedVnId(game) {
  if(/^v[1-9]\d{0,8}$/.test(game?.vndbId || '')) return game.vndbId;
  if(/^vn[1-9]\d{0,8}$/.test(String(game?.gid)))return 'v'+String(game.gid).slice(2);
  const known=cache.games[String(game?.gid)];
  if(/^v[1-9]\d{0,8}$/.test(known || '')) return known;
  const links=[...(game?.moreEntry || []).map(x=>x.value),...(game?.website || []).map(x=>x.link)];
  const ids=new Set(links.flatMap(v=>{const m=String(v || '').trim().match(/^https:\/\/(?:www\.)?vndb\.org\/(v[1-9]\d{0,8})\/?(?:[?#].*)?$/i);return m ? [m[1].toLowerCase()] : [];}));
  return ids.size===1 ? [...ids][0] : null;
}

export class WorkMediaClient {
  constructor({ enabled = true, fetcher = fetch } = {}) {
    this.enabled = enabled;
    this.fetcher = fetcher;
    this.pending = new Map();
    this.attempts = new Map();
    this.queue = Promise.resolve();
    this.saving = Promise.resolve();
  }
  async query(body) {
    const run = this.queue.then(async () => {
      const res = await this.fetcher('https://api.vndb.org/kana/vn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error('VNDB ' + res.status);
      return (await res.json()).results || [];
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
  async image(img) {
    if (!img?.url || !/^https:\/\/t\.vndb\.org\/(?:cv|sf)\//.test(img.url)) return null;
    const hash = createHash('sha256').update(img.url).digest('hex').slice(0, 20);
    const file = `img/work-cache/${hash}.jpg`;
    const target = path.join(imageDir, `${hash}.jpg`);
    if (!existsSync(target)) {
      const res = await this.fetcher(img.url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) throw new Error('Image unavailable');
      const limit = 12 * 1024 * 1024;
      if (Number(res.headers.get('content-length')) > limit) { await res.body?.cancel(); throw new Error('Image too large'); }
      const chunks = []; let size = 0;
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length;
          if (size > limit) { await reader.cancel(); throw new Error('Image too large'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      const buffer = Buffer.concat(chunks, size);
      await mkdir(imageDir, { recursive: true });
      await writeFile(target, buffer);
    }
    return { url: '/' + file, originalUrl: img.url, dims: img.dims, sexual: img.sexual, violence: img.violence, votes: img.votecount };
  }
  persist() {
    revision++;
    const snapshot = kvStore ? JSON.parse(JSON.stringify(cache)) : null;
    const run = this.saving.then(async () => {
      if (kvStore) return kvStore.set('media/vndb.json', snapshot);
      const file = cacheFile;
      const tmp = cacheFile + '.runtime.tmp';
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
      await rename(tmp, file);
    });
    this.saving = run.catch(() => {});
    return run;
  }
  needsResolve(game) { if(String(game?.gid).startsWith('bg')&&!linkedVnId(game))return false;const media=withWorkMedia(game)?.media; return !media || !media.cover; }
  signature(game) { return JSON.stringify([game.name,game.chineseName,...(game.extensionName || []).map(x=>x.name),linkedVnId(game)]); }
  willResolve(game) {
    if(!this.enabled || !game?.gid || !this.needsResolve(game) || this.pending.has(String(game.gid)) || this.pending.size>=30) return false;
    const attempt=this.attempts.get(String(game.gid));
    return !attempt || attempt.signature!==this.signature(game) || Date.now()-attempt.at>=(['unavailable','cover-unavailable'].includes(attempt.status) ? 60000 : 3600000);
  }
  async resolve(game) {
    const known = withWorkMedia(game);
    if (!this.enabled || !this.needsResolve(game) || !game?.gid) return known;
    const key = String(game.gid);
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.pending.size >= 30) return { ...known, mediaStatus: 'unavailable' };
    while (this.attempts.size > 1000) this.attempts.delete(this.attempts.keys().next().value);
    const attempt = this.attempts.get(key);
    if (!this.willResolve(game)) return { ...known, mediaStatus: attempt?.status || 'pending' };
    const run = this.lookup(game).finally(() => this.pending.delete(key));
    this.pending.set(key, run);
    return run;
  }
  async lookup(game) {
    const key = String(game.gid);
    try {
      const names = [...new Set([game.name, game.chineseName, ...(game.extensionName || []).map(e => e.name)].filter(Boolean))].slice(0, 6);
      const id=linkedVnId(game);
      if (!names.length && !id) return withWorkMedia(game);
      const fields = 'title,alttitle,titles{title,latin},aliases,released,developers{name},staff{name,original,role},image{url,dims,sexual,violence,votecount},screenshots{url,dims,sexual,violence}';
      const candidates = await this.query({ filters: id ? ['id','=',id] : names.length === 1 ? ['search', '=', names[0]] : ['or', ...names.map(n => ['search', '=', n])], fields, results: 20 });
      const v = id ? candidates.find(x=>x.id===id) : selectVn(game, candidates);
      if (!v) {
        const status = candidates.length ? 'ambiguous' : 'missing';
        this.attempts.set(key, { status, at: Date.now(), signature:this.signature(game) });
        return { ...withWorkMedia(game), mediaStatus: status };
      }
      if (mediaForId(v.id)?.cover) {
        cache.games[key] = v.id;
        await this.persist();
        return withWorkMedia(game);
      }
      const record = { id: v.id, title: v.title, originalTitle: v.alttitle, released: v.released, developers: (v.developers || []).map(d => d.name), source: `https://vndb.org/${v.id}`, cover: null, screenshots: [], syncedAt: new Date().toISOString() };
      record.writers=[...new Set((v.staff || []).filter(s=>s.role==='scenario').map(s=>s.original || s.name).filter(Boolean))];
      // Keep metadata even when an individual image is temporarily unavailable.
      record.cover = await this.image(v.image).catch(() => null);
      for (const img of (v.screenshots || []).filter(s => s.sexual === 0 && s.violence <= 0.1).slice(0, 3)) {
        const saved = await this.image(img).catch(() => null);
        if (saved) record.screenshots.push(saved);
      }
      cache.games[key] = v.id;
      cache.works[v.id] = record;
      cache.syncedAt = new Date().toISOString();
      await this.persist();
      if(!record.cover) this.attempts.set(key,{status:'cover-unavailable',at:Date.now(),signature:this.signature(game)});
      return {...withWorkMedia(game),mediaStatus:record.cover ? 'ready' : 'cover-unavailable'};
    } catch {
      this.attempts.set(key, { status: 'unavailable', at: Date.now(), signature:this.signature(game) });
      return { ...withWorkMedia(game), mediaStatus: 'unavailable' };
    }
  }
}
