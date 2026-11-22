import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { newId } from './utils.js';
import { musicFault } from './music-sharing.js';

const clean = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const numericId = value => /^[1-9]\d{0,18}$/.test(String(value || '')) ? String(value) : '';
export function musicCover(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !/^p\d+\.music\.126\.net$/.test(url.hostname) || url.username || url.password || url.port) return '';
    url.protocol = 'https:'; return url.href;
  } catch { return ''; }
}
export function musicThumbnail(value,size=160) {
  const cover=musicCover(value);if(!cover)return '';
  const url=new URL(cover);url.searchParams.set('param',`${size}y${size}`);return url.href;
}
export function normalizeMusicSong(raw) {
  if (!raw || raw.privateCloudSong === true) return null;
  const providerId = clean(String(raw.id || ''), 80), title = clean(raw.name || raw.title);
  if (!/^(?:[a-fA-F0-9]{32}|[1-9]\d{0,18})$/.test(providerId) || !title) return null;
  const sourceId = numericId(raw.originalId || raw.originalSongId || raw.songOriginalId) || numericId(providerId);
  const artists = (Array.isArray(raw.fullArtists) && raw.fullArtists.length ? raw.fullArtists : Array.isArray(raw.artists) ? raw.artists : Array.isArray(raw.ar) ? raw.ar : [raw.artistName || raw.artist || '']).map(artist => clean(typeof artist === 'string' ? artist : artist?.name, 120)).filter(Boolean).slice(0, 20);
  const duration = Number(raw.duration || raw.dt || 0);
  return { id: sourceId ? 'netease-song-' + sourceId : 'netease-api-' + providerId.toLowerCase(), providerId, sourceId, title, artists, album: clean(raw.album?.name || raw.al?.name || raw.albumName || (typeof raw.album === 'string' ? raw.album : '')), cover: musicCover(raw.coverImgUrl || raw.cover || raw.album?.picUrl || raw.al?.picUrl), duration: Number.isFinite(duration) && duration >= 0 ? Math.min(duration, 86400000) : 0, url: sourceId ? 'https://music.163.com/song?id=' + sourceId : '' };
}

export function cliSearchResult(output, offset = null) {
  // The CLI may emit status lines before its JSON response. Parse complete
  // objects/arrays rather than extracting arbitrary provider text as HTML.
  const text = String(output).replace(/\x1b\[[0-9;]*m/g, '');
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    for (let start = 0; start < text.length && !parsed; start++) {
      if (!['{', '['].includes(text[start])) continue;
      let depth = 0, quoted = false, escaped = false;
      for (let end = start; end < text.length; end++) {
        const c = text[end];
        if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
        if (c === '"') quoted = true;
        else if (c === '{' || c === '[') depth++;
        else if (c === '}' || c === ']') { depth--; if (!depth) { try { parsed = JSON.parse(text.slice(start, end + 1)); } catch {} break; } }
      }
    }
  }
  if (!parsed) throw musicFault('暂时无法读取歌曲资料，请稍后重试', 422);
  if (parsed.code != null && Number(parsed.code) !== 200 || parsed.success === false) throw musicServiceError(parsed.code);
  const data = parsed.data ?? parsed.result ?? parsed;
  const rows = Array.isArray(data) ? data : data.records || data.songs || data.songList || data.results;
  if (!Array.isArray(rows)) throw musicFault('暂时无法读取歌曲资料，请站长检查音乐服务', 422);
  const songs=[...new Map(rows.map(normalizeMusicSong).filter(Boolean).map(song => [song.id, song])).values()].slice(0, 30);
  if(offset===null)return songs;
  const nextOffset=offset+30,total=Number(data.recordCount);
  return {rows:songs,nextOffset,hasMore:rows.length>=30 && nextOffset<300 && (!Number.isFinite(total)||total>nextOffset)};
}

export function musicServiceError(code) {
  const value=Number(code);
  if ([1406,1407,1408].includes(value)) return Object.assign(musicFault('音乐服务授权已失效，请站长重新授权；草稿不受影响',422),{musicCode:'authorization'});
  if (value===-461) return Object.assign(musicFault('网易云今日请求额度已用完，稍后仍可浏览音乐库',429),{musicCode:'quota'});
  if ([-444,-445,-446].includes(value)) return Object.assign(musicFault('网易云请求繁忙，请稍后重试；草稿已保留',429),{musicCode:'busy'});
  if (value===300) return Object.assign(musicFault('音乐服务暂未开放歌曲搜索，请站长检查授权范围',422),{musicCode:'permission'});
  return Object.assign(musicFault('网易云搜索暂时不可用，请稍后重试；草稿已保留',422),{musicCode:'unavailable'});
}

export class MusicSource {
  constructor({ root, curated = [], runner } = {}) {
    this.root = root; this.curated = curated; this.runner = runner;
    this.entry = process.env.MUSIC_CLI_ENTRY || [path.join(root, 'tools/music-cli/node_modules/@music163/ncm-cli/dist/index.js'), path.join(root, 'node_modules/@music163/ncm-cli/dist/index.js')].find(existsSync) || '';
    this.selections = new Map(); this.cache = new Map(); this.pending = new Map(); this.active = false; this.stopping = false;
    this.health = {state:'unchecked',message:'搜索服务尚未在本次启动后验证',checkedAt:null,retryAt:0};
  }
  publicCurated(q = '') {
    q = q.toLocaleLowerCase();
    return this.curated.filter(item => item.kind === 'song' && [item.title, item.artist].some(v => v?.toLocaleLowerCase().includes(q))).map(item => ({ id: item.id, providerId: item.sourceId, sourceId: item.sourceId, title: item.title, artists: item.artist ? [item.artist] : [], album: '', cover: '', duration: 0, url: item.url }));
  }
  stage(song, userId, sessionId) {
    const token = newId(20), now = Date.now();
    for (const [key, item] of this.selections) if (item.until < now) this.selections.delete(key);
    while (this.selections.size >= 1000) this.selections.delete(this.selections.keys().next().value);
    this.selections.set(token, { userId, sessionId, until: now + 30 * 60000, song: structuredClone(song) });
    return { song, token, expiresAt: now + 30 * 60000 };
  }
  selected(token, userId, sessionId) {
    const selection = this.selections.get(token);
    if (!selection || selection.userId !== userId || selection.sessionId !== sessionId || selection.until <= Date.now()) throw Object.assign(musicFault('选歌已过期，需要重新确认歌曲；正文和关联作品已保留', 409), {musicCode:'selection-expired'});
    return structuredClone(selection.song);
  }
  async search(q, userId, sessionId, offset = 0) {
    q = clean(q, 100);
    if (q.length < 1) throw musicFault('请输入歌名或歌手');
    if(!Number.isInteger(offset)||offset<0||offset>270||offset%30)throw musicFault('歌曲搜索分页无效');
    if (this.stopping) throw musicFault('音乐搜索正在关闭，请稍后再试', 503);
    let page, notice = '', source = 'netease';
    try { page = await this.remote(q,offset); }
    catch (error) {
      if (!error.status) throw error;
      page = {rows:offset?[]:this.publicCurated(q),hasMore:false,nextOffset:offset}; notice = error.message; source = 'curated';
    }
    return { ...page,offset,rows: page.rows.map(song => this.stage(song, userId, sessionId)), notice, source, status: {state:this.health.state,retryAt:this.health.retryAt} };
  }
  async remote(q,offset=0) {
    const key = JSON.stringify([q.toLocaleLowerCase(),offset]), before = this.cache.get(key);
    if (before && before.until > Date.now()) return structuredClone(before.page);
    if (this.health.retryAt>Date.now()) throw Object.assign(musicFault(this.health.message,429),{musicCode:this.health.state});
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.active) throw musicFault('音乐搜索正在处理其他请求，请稍后再试', 429);
    if (!this.runner && !this.entry) {
      this.health={state:'unconfigured',message:'网易云搜索尚未连接，可先浏览已收录音乐',checkedAt:new Date().toISOString(),retryAt:0};
      throw musicFault(this.health.message,422);
    }
    this.active = true;
    const request = (async () => {
      let page;
      try {
        const output = this.runner ? await this.runner(q,offset) : await this.run(q,offset);
        page = cliSearchResult(output,offset);
        this.health = {state:'ready',message:'歌曲搜索可用',checkedAt:new Date().toISOString(),retryAt:0};
      } catch (error) {
        const state=error.musicCode || 'unavailable';
        const retryAt=state==='quota'?Math.floor((Date.now()+8*3600000)/86400000)*86400000+86400000-8*3600000:Date.now()+60000;
        this.health={state,message:error.status?error.message:'网易云搜索暂时不可用，请稍后重试',checkedAt:new Date().toISOString(),retryAt};
        throw error.status?error:musicServiceError();
      }
      this.cache.set(key, { page, until: Date.now() + 10 * 60000 });
      while (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value);
      return structuredClone(page);
    })().finally(() => { this.pending.delete(key); this.active = false; });
    this.pending.set(key, request); return request;
  }
  run(q,offset=0) {
    // Fixed executable and argv, no shell, no playback/upload/account commands.
    return new Promise((resolve, reject) => {
      execFile(process.execPath, [this.entry, 'search', 'song', '--keyword', q, '--limit', '30', '--offset', String(offset), '--output', 'json'], { cwd: this.root, timeout: 18000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, NO_COLOR: '1' } }, (error, stdout, stderr) => {
        const output = String(stdout || '') + '\n' + String(stderr || '');
        // Structured provider codes distinguish a missing scope from an expired
        // login even when both diagnostic messages contain “未授权”.
        try { cliSearchResult(stdout); } catch(failure) { if(failure.musicCode)return reject(failure); }
        if (/API key 未设置|API Key.*未|privateKey.*未|appId.*未/.test(output)) return reject(Object.assign(musicFault('网易云搜索尚未配置，可先浏览已收录音乐',422),{musicCode:'unconfigured'}));
        if (/未登录|请先登录|未授权|token.*过期/i.test(output)) return reject(musicServiceError(1406));
        if (/请求总量超限/.test(output)) return reject(musicServiceError(-461));
        if (/请求太过频繁/.test(output)) return reject(musicServiceError(-444));
        if (error) return reject(musicServiceError());
        resolve(stdout);
      });
    });
  }
  async stop() { this.stopping = true; await Promise.allSettled([...this.pending.values()]); }
}
