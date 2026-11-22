import fs from 'node:fs/promises';
import path from 'node:path';
import { isSuperAdmin } from './site-content.js';

const seed = JSON.parse(await fs.readFile(new URL('../data/music-selection.json', import.meta.url), 'utf8'));
const error = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const musicCategories = { op: 'OP', ed: 'ED', bgm: 'BGM', vocal: '歌曲', album: '专辑', playlist: '歌单' };
export function musicPlayerSource(value) {
  try {
    if (typeof value !== 'string' || value.length > 1000) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'music.163.com' || url.port || url.username || url.password) return null;
    const route = url.hash.startsWith('#/') ? new URL(url.hash.slice(1), url.origin) : url;
    const kind = route.pathname.match(/^\/(song|album|playlist)\/?$/)?.[1], id = route.searchParams.get('id');
    if (!kind || !/^[1-9]\d{0,15}$/.test(id || '')) return null;
    return { kind, sourceId: id, url: `https://music.163.com/${kind}?id=${id}`, embed: `https://music.163.com/outchain/player?type=${({ song: 2, album: 1, playlist: 0 })[kind]}&id=${id}&auto=0&height=${kind === 'song' ? 66 : 430}` };
  } catch { return null; }
}
export function musicSelection(input) {
  const source = musicPlayerSource(input?.url), title = text(input?.title, 120);
  if (!source) throw error(400, '请填写完整的网易云歌曲、专辑或歌单 HTTPS 链接');
  if (!title) throw error(400, '请填写精选名称');
  const category = source.kind === 'album' ? 'album' : source.kind === 'playlist' ? 'playlist' : Object.hasOwn(musicCategories, input.category) && !['album', 'playlist'].includes(input.category) ? input.category : 'vocal';
  return { id: `netease-${source.kind}-${source.sourceId}`, title, artist: text(input.artist, 120), work: text(input.work, 120), note: text(input.note, 240), category, ...source };
}
function validate(saved) {
  if (saved?.version !== 1 || !Array.isArray(saved.items) || saved.items.length > 100 || new Set(saved.items.map(i => i.id)).size !== saved.items.length) throw Error('精选音乐列表格式无效，原文件已保留');
  return { version: 1, items: saved.items.map(item => { const result = musicSelection(item); if (result.id !== item.id) throw Error('精选音乐编号不一致，原文件已保留'); return result; }) };
}
export class MusicPlayer {
  constructor(db, { dataDir = db.dataDir, kv = db.kv } = {}) {
    this.dir = dataDir; this.kv = kv; this.state = validate(seed); this.queue = Promise.resolve(); this.stopping = false;
  }
  async init() {
    let saved;
    try { saved = this.kv ? await this.kv.get('music-player.json') : JSON.parse(await fs.readFile(path.join(this.dir, 'music-player.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw Error('精选音乐列表无法读取，原文件已保留'); }
    if (saved != null) this.state = validate(saved);
    return this;
  }
  items() { return this.state.items; }
  async edit(user, form) {
    if (!isSuperAdmin(user)) throw error(403, '只有超级管理员可以维护精选音乐');
    if (this.stopping) throw error(503, '播放器正在关闭，请稍后再试');
    if (!['save', 'remove', 'up', 'down'].includes(form.action)) throw error(400, '未知的精选操作');
    const item = form.action === 'save' ? musicSelection(form) : null;
    const run = this.queue.then(async () => {
      const next = structuredClone(this.state), index = next.items.findIndex(i => i.id === (item?.id || form.id));
      if (item) {
        if (index >= 0) next.items[index] = item;
        else { if (next.items.length >= 100) throw error(400, '精选列表最多保留 100 项'); next.items.push(item); }
      } else {
        if (index < 0) throw error(404, '这条精选已不存在');
        if (form.action === 'remove') next.items.splice(index, 1);
        else {
          const target = index + (form.action === 'up' ? -1 : 1);
          if (target >= 0 && target < next.items.length) [next.items[target], next.items[index]] = [next.items[index], next.items[target]];
        }
      }
      if (this.kv) await this.kv.set('music-player.json', next);
      else {
        await fs.mkdir(this.dir, { recursive: true });
        const file = path.join(this.dir, 'music-player.json'), tmp = file + '.' + process.pid + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(next), { mode: 0o600 }); await fs.rename(tmp, file);
      }
      this.state = next;
    });
    this.queue = run.catch(() => {}); return run;
  }
  async stop() { this.stopping = true; await this.queue; }
}
