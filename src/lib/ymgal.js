/**
 * 月幕 Galgame 开放 API 客户端
 * 文档：https://www.ymgal.games/developer
 *
 * 设计要点：
 * - OAuth2 client_credentials 取 access_token，内存缓存，401 时失效重取（不用定时器）
 * - 全局最小请求间隔，避免触发月幕的速率限制（文档明确要求不要并发/循环调用）
 * - 搜索结果与详情都带 TTL 缓存；详情落地到本地库，之后读本地，减少对外请求
 */
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { average, nowIso } from './utils.js';

export class YmgalError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'YmgalError';
    this.code = code;
    this.status = status;
  }
}

export class YmgalClient {
  constructor(config, { db } = {}) {
    this.baseUrl = (config.baseUrl || 'https://www.ymgal.games').replace(/\/$/, '');
    this.cdnBase = (config.cdnBase || 'https://cdn.ymgal.games').replace(/\/$/, '');
    this.clientId = process.env.YMGAL_CLIENT_ID || config.clientId;
    this.clientSecret = process.env.YMGAL_CLIENT_SECRET || config.clientSecret;
    this.scope = process.env.YMGAL_SCOPE || config.scope || 'public';
    this.version = config.version || '1';
    this.detailTtl = config.detailTtlMs ?? 7 * 86400000;
    this.searchTtl = config.searchTtlMs ?? 10 * 60000;
    this.minInterval = config.minRequestIntervalMs ?? 150;
    this.timeout = config.requestTimeoutMs ?? 12000;
    this.retryDelays = Array.isArray(config.retryDelaysMs) ? config.retryDelaysMs : [800, 2200];
    this.db = db || null;
    this.token = null;
    this.tokenExpiresAt = 0;
    this.lastCall = 0;
    this.queue = Promise.resolve();
    this.searchCache = new Map();
    this.pending = new Map();
    this.discoveryWrites = Promise.resolve();
    this.discoveryFile = db ? path.join(db.dataDir, 'media', 'discovery.json') : null;
    this.discovery = [];
    try {
      const saved = JSON.parse(readFileSync(this.discoveryFile, 'utf8'));
      if (Array.isArray(saved)) this.discovery = saved.filter(g => Number.isInteger(g?.gid) && g.gid > 0 && typeof g.name === 'string').slice(0, 10);
    } catch { /* The local game cache supplies recommendations until a member discovers new works. */ }
  }

  /** PostgreSQL 模式：随机推荐缓存改存 kv 表 */
  async useStore(kv) {
    const saved = await kv.get('media/discovery.json');
    if (Array.isArray(saved)) this.discovery = saved.filter(g => Number.isInteger(g?.gid) && g.gid > 0 && typeof g.name === 'string').slice(0, 10);
    this.kv = kv;
  }

  async cached(key, load, ttl = this.searchTtl) {
    const hit = this.searchCache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.pending.size >= 30) throw new YmgalError('作品资料正在排队，请稍后再试', 'BUSY', 429);
    const run = Promise.resolve().then(load).then(value => {
      this.searchCache.delete(key);
      while (this.searchCache.size >= 500) this.searchCache.delete(this.searchCache.keys().next().value);
      this.searchCache.set(key, { at: Date.now(), value });
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, run);
    return run;
  }

  cachedRandom(num = 10) {
    if (this.discovery.length) return this.discovery.slice(0, num);
    const day = new Date().toISOString().slice(0, 10);
    const order = game => createHash('sha256').update(`${day}:${game.gid}`).digest('hex');
    return (this.db?.games.all() || []).filter(g => g.gid && g.name).slice()
      .sort((a, b) => order(a).localeCompare(order(b))).slice(0, num);
  }

  /* ----------------------------- 传输层 ----------------------------- */

  /** 串行化 + 最小间隔，所有对外请求都从这里出去 */
  schedule(fn) {
    const run = this.queue.then(async () => {
      const wait = this.minInterval - (Date.now() - this.lastCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = Date.now();
      return fn();
    });
    // 队列本身不因单次失败而中断
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async getToken(force = false) {
    if (!force && this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const url = new URL('/oauth/token', this.baseUrl);
    url.searchParams.set('grant_type', 'client_credentials');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('client_secret', this.clientSecret);
    url.searchParams.set('scope', this.scope);

    const res = await fetch(url, {
      headers: { Accept: 'application/json;charset=utf-8' },
      signal: AbortSignal.timeout(this.timeout),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new YmgalError(
        `获取月幕 access_token 失败：${body.error_description || body.error || res.status}`,
        'TOKEN',
        res.status,
      );
    }
    this.token = body.access_token;
    // 提前 5 分钟过期，避免边界
    const expiresIn = Number(body.expires_in) || 3600;
    this.tokenExpiresAt = Date.now() + Math.max(60, expiresIn - 300) * 1000;
    return this.token;
  }

  /** 调用一个开放接口，返回 data 字段 */
  async call(path, params = {}, { retry = true } = {}) {
    const token = await this.getToken();
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }

    let res = null;
    for (let attempt = 0; ; attempt += 1) {
      res = await fetch(url, {
        headers: {
          Accept: 'application/json;charset=utf-8',
          Authorization: `Bearer ${token}`,
          version: String(this.version),
        },
        signal: AbortSignal.timeout(this.timeout),
      });
      // 月幕偶尔返回 503 / 429，做有限次退避重试（不并发）
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= this.retryDelays.length) break;
      const wait = this.retryDelays[attempt];
      console.warn(`[ymgal] HTTP ${res.status}，${wait}ms 后重试 ${path}（第 ${attempt + 1} 次）`);
      await new Promise((r) => setTimeout(r, wait));
    }

    if (res.status === 401 && retry) {
      await this.getToken(true);
      return this.call(path, params, { retry: false });
    }

    const body = await res.json().catch(() => null);
    if (!body) {
      const raw = await res.text().catch(() => '');
      const contentType = res.headers.get('content-type') || '';
      const hint = raw.slice(0, 120).replace(/\s+/g, ' ');
      console.warn(`[ymgal] 无法解析响应 ${res.status} ${contentType} ${path} :: ${hint}`);
      const message =
        res.status >= 500
          ? `月幕服务暂时不可用（HTTP ${res.status}），请稍后重试`
          : `月幕接口返回了非 JSON 内容（HTTP ${res.status}${hint ? `：${hint}` : ''}）`;
      throw new YmgalError(message, res.status >= 500 ? 'UPSTREAM' : 'BAD_BODY', res.status);
    }
    if (body.success === false || body.code !== 0) {
      throw new YmgalError(body.msg || `月幕接口返回 code=${body.code}`, body.code ?? 'UNKNOWN', res.status);
    }
    return body.data;
  }

  /* ----------------------------- 接口封装 ----------------------------- */

  /** 搜索游戏列表（分页） */
  async searchGames(keyword, pageNum = 1, pageSize = 12) {
    const key = `list:${keyword}:${pageNum}:${pageSize}`;
    return this.cached(key, async () => {
      const data = await this.schedule(() =>
        this.call('/open/archive/search-game', { mode: 'list', keyword, pageNum, pageSize }),
      );
      return {
        result: Array.isArray(data?.result) ? data.result.map((g) => normalizeCompact(g, this.cdnBase)) : [],
        total: data?.total ?? 0,
        hasNext: Boolean(data?.hasNext),
        pageNum: data?.pageNum ?? pageNum,
        pageSize: data?.pageSize ?? pageSize,
      };
    });
  }

  /** 精确搜索：拿来把「搜索结果」补成完整详情 */
  async searchAccurate(keyword, similarity = 60) {
    const data = await this.schedule(() =>
      this.call('/open/archive/search-game', { mode: 'accurate', keyword, similarity }),
    );
    return normalizeDetail(data, this.cdnBase);
  }

  /**
   * 导入用：先走列表搜索（对别名、外号更宽容），命中后再取完整详情。
   * 精确搜索要求相似度阈值，常用译名常常过不了，所以这里以列表搜索为主。
   */
  async resolveByKeyword(keyword, { pageSize = 5 } = {}) {
    const list = await this.searchGames(keyword, 1, pageSize);
    const first = list.result[0];
    if (!first) return null;
    const local = this.db?.gameByGid(first.gid);
    if (local?.introduction) return local;
    const detail = await this.searchAccurate(first.name || first.chineseName, 50);
    if (detail?.gid === first.gid && detail.introduction) return detail;
    const byGid = await this.gameDetail(first.gid);
    return byGid?.gid ? byGid : detail || first;
  }

  /** 按 gid 查详情 */
  async gameDetail(gid) {
    return this.cached(`archive:${gid}`, async () => {
      const data = await this.schedule(() => this.call('/open/archive', { gid }));
      return normalizeDetail(data, this.cdnBase);
    }, 0);
  }

  async randomGames(num = 6, { fresh = false } = {}) {
    const n = Math.max(1, Math.min(10, Number(num) || 6));
    return this.cached(`random:${n}`, async () => {
      const data = await this.schedule(() => this.call('/open/archive/random-game', { num: n }));
      const games = Array.isArray(data) ? data.map(g => normalizeCompact(g, this.cdnBase)).filter(Boolean) : [];
      if (games.length) {
        this.discovery = games;
        if (this.discoveryFile) {
          const snapshot = JSON.stringify(games);
          const write = this.discoveryWrites.then(async () => {
            if (this.kv) return this.kv.set('media/discovery.json', games);
            await mkdir(path.dirname(this.discoveryFile), { recursive: true });
            await writeFile(this.discoveryFile + '.tmp', snapshot, 'utf8');
            await rename(this.discoveryFile + '.tmp', this.discoveryFile);
          });
          this.discoveryWrites = write.catch(() => console.warn('[ymgal] 随机推荐缓存暂时无法保存'));
          await this.discoveryWrites;
        }
      }
      return games;
    }, fresh ? 0 : 5 * 60000);
  }

  async gamesByOrg(orgId) {
    return this.cached(`org-games:${orgId}`, async () => {
      const data = await this.schedule(() => this.call('/open/archive/game', { orgId }));
      return Array.isArray(data) ? data.map(g => normalizeCompact(g, this.cdnBase)).filter(Boolean) : [];
    }, 3600000);
  }

  async organization(orgId) {
    const key = `org:${orgId}`;
    return this.cached(key, async () => {
      const data = await this.schedule(() => this.call('/open/archive', { orgId }));
      const org = data?.org || data?.organization || data;
      return org?.name || org?.orgName || '';
    }, 86400000);
  }

  async gamesByDateRange(start, end) {
    const data = await this.schedule(() =>
      this.call('/open/archive/game', { releaseStartDate: start, releaseEndDate: end }),
    );
    return Array.isArray(data) ? data.map((g) => normalizeCompact(g, this.cdnBase)) : [];
  }

  async topics(kind = 'news', page = 1) {
    const data = await this.schedule(() =>
      this.call(`/open/topic/${kind === 'column' ? 'column' : 'news'}`, { page }),
    );
    return Array.isArray(data) ? data : [];
  }

  /* ----------------------------- 本地库写入 ----------------------------- */

  /** 把详情写入本地 games 集合（upseat 语义），返回本地记录 */
  async cacheDetail(detail) {
    if (!this.db || !detail?.gid) return null;
    if(this.catalog)return this.catalog.save({...detail,local:false,syncedAt:nowIso()},{replace:true});
    const linked = this.domestic?.resolve(detail);
    const existing = this.db.gameByGid(detail.gid) || linked;
    if (existing && linked && existing.id !== linked.id) throw Object.assign(new Error('两份作品档案需要先核对关联，暂不覆盖'), { status: 409 });
    const patch = {
      ...detail,
      local: false,
      syncedAt: nowIso(),
    };
    if (existing) {
      if (String(existing.gid) !== String(detail.gid)) { patch.ymgalGid = detail.gid; patch.gid = existing.gid; }
      await this.db.games.update(existing.id, patch);
      return this.db.games.get(existing.id);
    }
    return this.db.games.insert({ ...patch, createdAt: nowIso() });
  }

  /** 本地库优先，缺失或过期才回头问月幕 */
  async getGame(gid, { force = false } = {}) {
    if (!this.db) return null;
    const local = this.db.gameByGid(gid);
    const fresh =
      local && !force && local.syncedAt && Date.now() - new Date(local.syncedAt).getTime() < this.detailTtl;
    if (fresh && local.introduction) return local;

    return this.cached(`loaded-game:${gid}`, async () => {
      try {
        const detail = await this.gameDetail(gid);
        if (!detail?.gid) return local;
        return (await this.cacheDetail(detail)) || local;
      } catch (err) {
        if (local) return local; // 离线也能看缓存
        throw err;
      }
    }, 0);
  }

  /** 只补一层「列表级」信息，用于搜索结果落库 */
  async cacheCompact(compact) {
    if (!this.db || !compact?.gid) return null;
    if(this.catalog)return this.catalog.save({...compact,local:false});
    const existing = this.db.gameByGid(compact.gid) || this.domestic?.resolve(compact);
    if (existing) {
      const patch = {};
      for (const [k, v] of Object.entries(compact)) {
        if (k === 'gid') continue;
        if (v === undefined || v === null || v === '') continue;
        if (existing[k] === undefined || existing[k] === '' || existing[k] === 0) patch[k] = v;
      }
      if (Object.keys(patch).length) await this.db.games.update(existing.id, patch);
      return this.db.games.get(existing.id);
    }
    return this.db.games.insert({ ...compact, local: false, syncedAt: null, createdAt: nowIso() });
  }
}

/* ------------------------------------------------------------------ *
 * 字段归一化
 * ------------------------------------------------------------------ */

export function toCdnUrl(value, cdnBase = 'https://cdn.ymgal.games') {
  if (!value) return '';
  const v = String(value).trim();
  if (!v || v === 'null') return '';
  if (/^https?:\/\//i.test(v)) {
    // 文档示例里偶尔出现 dev 域名的图片地址，统一换到 cdn
    try {
      const u = new URL(v);
      if (/dev-ymgal\.com$/i.test(u.hostname) || /store\.dev-ymgal\.com$/i.test(u.hostname)) {
        return `${cdnBase}${u.pathname}`;
      }
    } catch {
      /* ignore */
    }
    return v;
  }
  return `${cdnBase}/${v.replace(/^\/+/, '')}`;
}

function normalizeCompact(raw, cdnBase) {
  if (!raw) return null;
  const gid = raw.id ?? raw.gid;
  if (!gid) return null;
  return {
    gid: Number(gid),
    name: raw.name || '',
    chineseName: raw.chineseName || '',
    mainImg: toCdnUrl(raw.mainImg, cdnBase),
    releaseDate: raw.releaseDate || null,
    haveChinese: Boolean(raw.haveChinese),
    restricted: Boolean(raw.restricted),
    orgId: Number(raw.orgId ?? raw.developerId ?? 0) || 0,
    orgName: raw.orgName || '',
    score: raw.score ?? '',
    state: raw.state || '',
  };
}

function normalizeDetail(raw, cdnBase) {
  if (!raw) return null;
  const game = raw.game || raw;
  if (!game || (!game.gid && !game.id)) return null;

  const cidMapping = raw.cidMapping || {};
  const pidMapping = raw.pidMapping || {};

  const characters = (Array.isArray(game.characters) ? game.characters : [])
    .map((rel) => {
      const c = cidMapping[String(rel.cid)] || cidMapping[rel.cid] || null;
      if (!c) return null;
      const cv = rel.cvId ? pidMapping[String(rel.cvId)] || pidMapping[rel.cvId] : null;
      return {
        cid: Number(rel.cid),
        name: c.name || '',
        mainImg: toCdnUrl(c.mainImg, cdnBase),
        position: Number(rel.characterPosition) || 2,
        cvId: rel.cvId ? Number(rel.cvId) : null,
        cvName: cv?.name || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)
    .slice(0, 24);

  const staff = (Array.isArray(game.staff) ? game.staff : [])
    .map((s) => ({
      pid: Number(s.pid) || null,
      name: s.empName || pidMapping[String(s.pid)]?.name || '',
      job: s.jobName || '',
      desc: s.empDesc || '',
    }))
    .filter((s) => s.name)
    .slice(0, 40);

  const releases = (Array.isArray(game.releases) ? game.releases : []).map((r) => ({
    id: r.id ?? null,
    name: r.releaseName || '',
    platform: r.platform || '',
    language: r.releaseLanguage || '',
    restriction: r.restrictionLevel || '',
    releaseDate: r.releaseDate || null,
    link: r.relatedLink || '',
  }));

  return {
    gid: Number(game.gid ?? game.id),
    name: game.name || '',
    chineseName: game.chineseName || '',
    extensionName: (Array.isArray(game.extensionName) ? game.extensionName : []).map((e) => ({
      name: e.name || '',
      type: e.type || '',
      desc: e.desc || '',
    })),
    introduction: game.introduction || '',
    mainImg: toCdnUrl(game.mainImg, cdnBase),
    releaseDate: game.releaseDate || null,
    haveChinese: Boolean(game.haveChinese),
    restricted: Boolean(game.restricted),
    typeDesc: game.typeDesc || '',
    country: game.country || '',
    developerId: Number(game.developerId ?? game.orgId) || 0,
    orgName: game.orgName || raw.org?.name || raw.orgMapping?.[game.developerId]?.name || '',
    state: game.state || '',
    website: (Array.isArray(game.website) ? game.website : []).map((w) => ({
      title: w.title || '',
      link: w.link || '',
    })),
    moreEntry: (Array.isArray(game.moreEntry) ? game.moreEntry : []).map((m) => ({
      key: m.key || '',
      value: m.value || '',
    })),
    characters,
    staff,
    releases,
    ymgalUrl: `https://www.ymgal.games/ga${game.gid ?? game.id}`,
  };
}

export function distinctJobs(staff) {
  const jobs = new Map();
  for (const s of staff || []) {
    const job = s.job || '其他';
    if (!jobs.has(job)) jobs.set(job, []);
    const list = jobs.get(job);
    if (!list.includes(s.name)) list.push(s.name);
  }
  return [...jobs.entries()].map(([job, names]) => ({ job, names }));
}

export function pickCredit(staff, jobKeywords) {
  const hits = (staff || []).filter((s) => jobKeywords.some((k) => (s.job || '').includes(k)));
  return [...new Set(hits.map((h) => h.name))];
}

export function averageScoreOf(list) {
  return average(list || []);
}

export function makeTraceId() {
  return randomBytes(6).toString('hex');
}
