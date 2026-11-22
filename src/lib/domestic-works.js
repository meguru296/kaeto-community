import { readFileSync } from 'node:fs';

const snapshot = JSON.parse(readFileSync(new URL('../data/domestic-works.json', import.meta.url), 'utf8'));
export const domesticSnapshot = snapshot;
const titleKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
export function workIdentifiers(game) {
  const ids = new Set();
  if (/^bg[1-9]\d*$/.test(String(game.gid))) ids.add('bg:' + String(game.gid).slice(2));
  if (Number.isSafeInteger(game.bangumiId) && game.bangumiId > 0) ids.add('bg:' + game.bangumiId);
  if (/^vn[1-9]\d*$/.test(String(game.gid))) ids.add('vn:v' + String(game.gid).slice(2));
  if (/^cn[1-9]\d*$/.test(String(game.gid))) ids.add('cn:' + String(game.gid).slice(2));
  else if (/^[1-9]\d*$/.test(String(game.gid))) ids.add('ym:' + game.gid);
  if (game.cngalId) ids.add('cn:' + game.cngalId);
  if (game.ymgalGid) ids.add('ym:' + game.ymgalGid);
  if (/^v[1-9]\d*$/.test(game.vndbId || '')) ids.add('vn:' + game.vndbId);
  for (const alias of game.gidAliases || []) {
    if (/^vn[1-9]\d*$/.test(String(alias))) ids.add('vn:v' + String(alias).slice(2));
    else if (/^cn[1-9]\d*$/.test(String(alias))) ids.add('cn:' + String(alias).slice(2));
    else if (/^[1-9]\d*$/.test(String(alias))) ids.add('ym:' + alias);
  }
  for (const link of [game.ymgalUrl, ...(game.moreEntry || []).map(x => x.value), ...(game.website || []).map(x => x.link)]) {
    let url; try { url = new URL(link); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) continue;
    let m;
    if (/^(?:www\.)?vndb\.org$/.test(url.hostname) && (m = url.pathname.match(/^\/(v[1-9]\d*)\/?$/))) ids.add('vn:' + m[1]);
    if (['bgm.tv','bangumi.tv','chii.in'].includes(url.hostname) && (m = url.pathname.match(/^\/subject\/([1-9]\d*)\/?$/))) ids.add('bg:' + m[1]);
    if (/^(?:www\.)?ymgal\.games$/.test(url.hostname) && (m = url.pathname.match(/^\/ga([1-9]\d*)\/?$/))) ids.add('ym:' + m[1]);
    if (/^(?:www\.)?cngal\.org$/.test(url.hostname) && (m = url.pathname.match(/^\/entries\/index\/([1-9]\d*)\/?$/))) ids.add('cn:' + m[1]);
    if (url.hostname === 'store.steampowered.com' && (m = url.pathname.match(/^\/app\/([1-9]\d*)(?:\/|$)/))) ids.add('steam:' + m[1]);
  }
  return ids;
}

export class DomesticIndex {
  constructor(data = snapshot) {
    this.works = data.works;
    this.byIdentity = new Map();
    this.byTitle = new Map();
    this.byKey = new Map();
    for (const work of this.works) {
      this.byKey.set('cn' + work.cngalId, work);
      if (!this.byKey.has(String(work.gid))) this.byKey.set(String(work.gid), work);
      if (work.ymgalGid && !this.byKey.has(String(work.ymgalGid))) this.byKey.set(String(work.ymgalGid), work);
      for (const name of new Set([work.name, work.chineseName, ...(work.extensionName || []).map(x => x.name)].map(titleKey).filter(Boolean))) {
        const list = this.byTitle.get(name) || []; list.push(work); this.byTitle.set(name, list);
      }
    }
    for (const work of this.works) for (const id of workIdentifiers(work)) {
      const list = this.byIdentity.get(id) || []; list.push(work); this.byIdentity.set(id, list);
    }
  }
  candidates(game) {
    const ids = workIdentifiers(game), strong = new Set(), all = new Set();
    for (const id of ids) for (const hit of this.byIdentity.get(id) || []) { all.add(hit); if (/^(?:cn|ym):/.test(id)) strong.add(hit); }
    if (strong.size === 1) {
      const selected = [...strong][0];
      // A shared VNDB ID does not erase distinct chapter identities. An
      // unrelated explicit reference still remains a conflict.
      for (const id of ids) { const hits=this.byIdentity.get(id)||[]; if(hits.length && !hits.includes(selected)) return [...all]; }
      return [selected];
    }
    return [...all];
  }
  titleMatches(game) {
    const hits = new Set();
    for (const name of [game.name, game.chineseName, ...(game.extensionName || []).map(x=>x.name)]) for (const hit of this.byTitle.get(titleKey(name)) || []) hits.add(hit);
    return [...hits];
  }
  match(game) {
    const hits = this.candidates(game);
    // Conflicting links or shared VNDB IDs (e.g. multiple chapters) must not
    // select an arbitrary record. A maintenance review is required instead.
    return hits.length === 1 ? hits[0] : null;
  }
  enrich(game) {
    if (!game) return game;
    const source = this.match(game), result = { ...game };
    if (source) {
      for (const [key, value] of Object.entries(source)) if (!['gid', 'id', 'createdAt', 'updatedAt'].includes(key) && (result[key] == null || result[key] === '' || Array.isArray(result[key]) && !result[key].length)) result[key] = value;
      result.cngalId = source.cngalId;
      result.cngalUrl = source.cngalUrl;
      result.cngalSyncedAt = source.cngalSyncedAt;
      // One public CnGal presentation, keeping the database ID and all records.
      for (const field of ['name','chineseName','mainImg','introduction','releaseDate','orgName','characters','releases','website']) if(source[field]?.length) result[field]=source[field];
      result.source='CnGal';
    }
    result.domestic = typeof game.domesticOverride === 'boolean' ? game.domesticOverride : Boolean(source || game.cngalId);
    result.domesticSource = result.domestic ? game.domesticOverride === true ? '管理员标注' : 'CnGal' : '';
    return result;
  }
}
export const domesticIndex = new DomesticIndex();

export class DomesticWorks {
  constructor(db, index = domesticIndex, { identify = game => game } = {}) { this.db = db; this.index = index; this.identify = identify; this.revision = -1; this.writes = Promise.resolve(); }
  refresh() {
    if (this.revision === this.db.games.revision) return;
    this.revision = this.db.games.revision;
    this.resolved = new Map(); this.pending = new Set();
    const matches = new Map(), nameConflicts = new Set();
    for (const game of this.db.games.all()) {
      const source = this.index.match(this.identify(game));
      if (source) { const hits=matches.get(source.cngalId)||[];hits.push(game);matches.set(source.cngalId,hits); }
      else {
        const identified=this.identify(game);
        for (const candidate of this.index.titleMatches(game)) {
          if(identified.vndbId && candidate.vndbId && identified.vndbId!==candidate.vndbId)continue;
          nameConflicts.add(candidate.cngalId);
        }
      }
    }
    for (const source of this.index.works) {
      const hits = matches.get(source.cngalId) || [];
      if (hits.length === 1) this.resolved.set(source.cngalId, hits[0]);
      else if (hits.length > 1) this.pending.add(source.cngalId);
      else if (nameConflicts.has(source.cngalId)) this.pending.add(source.cngalId);
    }
  }
  resolve(game) {
    if (this.index.candidates(game).length > 1) throw Object.assign(new Error('跨站编号指向不同作品，请先核对版本'), { status: 409 });
    const source = this.index.match(this.identify(game));
    this.refresh();
    if (!source) {
      const collisions=this.index.titleMatches(game).filter(w=>this.resolved.has(w.cngalId));
      if(collisions.length)throw Object.assign(new Error('可能与已有国产作品重复，需要管理员核对编号'),{status:409});
      return null;
    }
    if (this.pending.has(source.cngalId)) throw Object.assign(new Error('作品关联存在同名或多版本记录，需要管理员核对后再收录'), { status: 409 });
    return this.resolved.get(source.cngalId) || null;
  }
  find(key) {
    const source = this.index.byKey.get(String(key));
    if (!source) return null;
    return this.index.enrich(this.resolve(source) || source);
  }
  async load(key, { persist = false } = {}) {
    this.refresh();
    const source = this.index.byKey.get(String(key));
    if(source && this.pending.has(source.cngalId))return {...this.index.enrich(source),identityPending:true};
    if (!persist) return this.find(key);
    const run = this.writes.then(async () => {
      const game = this.find(key);
      if (!game || game.id) return game;
      return this.db.games.insert({ ...game, local: false, createdAt: new Date().toISOString() });
    });
    this.writes = run.catch(() => {}); return run;
  }
  list(query = '') {
    this.refresh();
    const items = new Map();
    for (const source of this.index.works) {
      const game = {...this.index.enrich(this.resolved.get(source.cngalId) || source),identityPending:this.pending.has(source.cngalId)};
      if (game.domestic) items.set(String(game.gid), game);
    }
    for (const original of this.db.games.all()) {
      const game = this.index.enrich(original);
      if (game.cngalId && this.pending.has(game.cngalId)) continue;
      if (game.domestic && !items.has(String(game.gid))) items.set(String(game.gid), game);
    }
    const q = titleKey(query);
    return [...items.values()].filter(g => !q || [g.name, g.chineseName, g.orgName, ...(g.extensionName || []).map(n => n.name)].some(n => titleKey(n).includes(q)));
  }
}
