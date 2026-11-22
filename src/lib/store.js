import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { newId, nowIso } from './utils.js';
import { randomInt } from 'node:crypto';
import { PgDatabase, PgCollectionStore, TABLES } from './pg-store.js';

/** 迁移到 PostgreSQL 后，原 JSON 集合文件被替换成这个标记，旧程序会拒绝启动而不是读到过期数据。 */
export const MIGRATED_MARKER = { migratedTo: 'postgresql', note: '数据已迁移到 PostgreSQL；原始 JSON 保存在 json-before-postgres-* 目录。' };

export function databaseUrlFrom(config = {}) {
  return process.env.DATABASE_URL || config.database?.url || '';
}

/* ------------------------------------------------------------------ *
 * 一个极简的 JSON 持久化集合。
 * 数据量级（个人/小圈子站点）下完全够用，且没有原生依赖，装完即可跑。
 * 写入走「临时文件 + rename」，避免半截文件。
 * ------------------------------------------------------------------ */
class Collection {
  constructor(name, filePath) {
    this.name = name;
    this.filePath = filePath;
    this.items = [];
    this.loaded = false;
    this.writes = Promise.resolve();
    // In-memory generation for derived indexes; never stored in user records.
    this.revision = 0;
    this.backend = null;
  }

  async load() {
    if (this.loaded) return this;
    if (this.backend) {
      this.items = await this.backend.load();
      this.loaded = true;
      return this;
    }
    if (existsSync(this.filePath)) {
      try {
        const raw = await readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.migratedTo === 'postgresql') throw new Error('数据已迁移到 PostgreSQL，请在配置里设置 database.url（或 DATABASE_URL）后再启动');
        const items = Array.isArray(parsed) ? parsed : parsed?.items;
        if (!Array.isArray(items) || items.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id)) {
          throw new Error('集合格式无效，不能把异常数据当作空库');
        }
        if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('集合存在重复 ID');
        this.items = items;
      } catch (err) {
        throw new Error(`[store] ${this.name} 无法读取，启动已停止；保留原文件，请从备份恢复：${err.message}`);
      }
    }
    this.loaded = true;
    return this;
  }

  async persist() {
    this.revision++;
    if (this.backend) return this.backend.persist(this);
    const snapshot = JSON.stringify(this.items, null, 2);
    const result = this.writes.then(async () => {
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot, 'utf8');
      for (let attempt = 0; ; attempt++) {
        try { await rename(tmp, this.filePath); break; }
        catch (err) {
          if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || attempt >= 3) throw err;
          await delay(30 * (attempt + 1));
        }
      }
    });
    this.writes = result.catch(() => {});
    return result;
  }

  all() {
    return this.items;
  }

  /** all() 的别名，读起来更直观：db.ratings.list */
  get list() {
    return this.items;
  }

  find(predicate) {
    return this.items.find(predicate) || null;
  }

  filter(predicate) {
    return this.items.filter(predicate);
  }

  get(id) {
    return this.items.find((it) => it.id === id) || null;
  }

  async insert(data) {
    const item = { id: data.id || newId(), createdAt: data.createdAt || nowIso(), ...data };
    this.items.push(item);
    await this.persist();
    return item;
  }

  async update(id, patch) {
    const item = this.get(id);
    if (!item) return null;
    Object.assign(item, patch, { updatedAt: nowIso() });
    await this.persist();
    return item;
  }

  async remove(id) {
    const idx = this.items.findIndex((it) => it.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    await this.persist();
    return true;
  }

  async replaceAll(items) {
    this.items = items;
    await this.persist();
  }
}

export class Db {
  constructor(dataDir, { databaseUrl = '' } = {}) {
    this.dataDir = dataDir;
    this.databaseUrl = databaseUrl;
    this.backend = databaseUrl ? 'postgres' : 'json';
    this.pg = null;
    this.kv = null;
    this.users = new Collection('users', path.join(dataDir, 'users.json'));
    this.sessions = new Collection('sessions', path.join(dataDir, 'sessions.json'));
    this.games = new Collection('games', path.join(dataDir, 'games.json'));
    this.ratings = new Collection('ratings', path.join(dataDir, 'ratings.json'));
    this.reviews = new Collection('reviews', path.join(dataDir, 'reviews.json'));
    this.checkins = new Collection('checkins', path.join(dataDir, 'checkins.json'));
    this.invites = new Collection('invites', path.join(dataDir, 'invites.json'));
    this.meta = new Collection('meta', path.join(dataDir, 'meta.json'));
    this.emailCodes = new Collection('emailCodes', path.join(dataDir, 'email-codes.json'));
    this.battles = new Collection('battles', path.join(dataDir, 'battles.json'));
    this.battleVotes = new Collection('battleVotes', path.join(dataDir, 'battle-votes.json'));
    this.battleCheers = new Collection('battleCheers', path.join(dataDir, 'battle-cheers.json'));
    this.assets = new Collection('assets', path.join(dataDir, 'assets.json'));
    this.audit = new Collection('audit', path.join(dataDir, 'audit.json'));
    this.memberLevels = new Collection('memberLevels', path.join(dataDir, 'member-levels.json'));
    this.pilgrimageMarks = new Collection('pilgrimageMarks', path.join(dataDir, 'pilgrimage-marks.json'));
    this.characterFollows = new Collection('characterFollows', path.join(dataDir, 'character-follows.json'));
    this.externalAccounts = new Collection('externalAccounts', path.join(dataDir, 'external-accounts.json'));
    this.reviewCommunity = new Collection('reviewCommunity', path.join(dataDir, 'review-community.json'));
    this.collections = [
      this.users,
      this.sessions,
      this.games,
      this.ratings,
      this.reviews,
      this.checkins,
      this.invites,
      this.meta,
      this.emailCodes,
      this.battles,
      this.battleVotes,
      this.battleCheers,
      this.assets,
      this.audit,
      this.memberLevels,
      this.pilgrimageMarks,
      this.characterFollows,
      this.externalAccounts,
      this.reviewCommunity,
    ];
  }

  async init({ ensureInvite } = {}) {
    await mkdir(this.dataDir, { recursive: true });
    if(existsSync(path.join(this.dataDir,'work-merge-pending.json')))throw new Error('[store] 作品合并未完成；请按 work-merge-pending.json 的备份路径恢复后再启动，禁止读取半迁移数据');
    try {
      if (this.databaseUrl) await this.connectPostgres();
      await Promise.all(this.collections.map((c) => c.load()));
      let nextUid = Math.max(10000, ...this.users.all().map(u => Number(u.uid) || 0));
      let assigned = false;
      for (const user of this.users.all()) {
        if (!user.uid) { user.uid = ++nextUid; assigned = true; }
      }
      if (assigned) await this.users.persist();
      await this.pruneSessions();
      if (ensureInvite) await this.ensureInvite(ensureInvite);
      return this;
    } catch (err) {
      await this.close();
      throw err;
    }
  }

  async connectPostgres() {
    const database = new PgDatabase(this.databaseUrl);
    try {
      await database.lock();
      await database.ensureSchema();
      const migrated = await database.metaValue('migration');
      const { rows } = await database.pool.query('select count(*)::int as n from users');
      const users = existsSync(this.users.filePath) ? JSON.parse(await readFile(this.users.filePath, 'utf8')) : null;
      if (users?.migratedTo === 'postgresql') {
        if (!users.migrationId || !migrated?.migrationId || users.migrationId !== migrated.migrationId) {
          throw new Error('[store] 已封存数据与 PostgreSQL 的迁移标识不匹配，启动已停止；请核对连接目标与备份');
        }
        if (Number(migrated.counts?.users) > 0 && rows[0].n === 0) {
          throw new Error('[store] 已迁移账号库异常为空，启动已停止；请核对连接目标与备份');
        }
      }
      // 防止配置了数据库却忘了迁移：空库 + 数据目录里仍有真实 JSON 数据时拒绝启动。
      if (!migrated && rows[0].n === 0 && existsSync(this.users.filePath)) {
        if (Array.isArray(users) ? users.length : users?.items?.length) {
          throw new Error(`[store] PostgreSQL 为空，但 ${this.users.filePath} 仍有账号数据；请先运行迁移脚本，避免网站以空库启动`);
        }
      }
    } catch (err) {
      await database.close();
      throw err;
    }
    this.pg = database;
    this.kv = database.kv();
    for (const collection of this.collections) collection.backend = new PgCollectionStore(database, TABLES[collection.name]);
  }

  /** 等待所有写入完成并断开数据库 */
  async close() {
    await Promise.all(this.collections.map(collection => collection.writes));
    await this.pg?.close();
  }

  /** 清理过期会话 */
  async pruneSessions() {
    const now = Date.now();
    const alive = this.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
    if (alive.length !== this.sessions.all().length) await this.sessions.replaceAll(alive);
  }

  /** 一张注册码是否还能用（单次码用掉即失效，多次码看剩余次数） */
  inviteUsable(invite) {
    if (!invite || invite.active === false) return false;
    if (invite.maxUses === null) return true; // 不限次数
    return (invite.uses || 0) < invite.maxUses;
  }

  usableInvites() {
    return this.invites.filter((i) => this.inviteUsable(i));
  }

  /**
   * 保证系统里至少有一张可用的注册码（用户注册必须凭码）。
   * 首次启动时会把生成的注册码打印到控制台，同时记录在 data/invites.json。
   */
  async ensureInvite(note = '首次启动自动生成') {
    const usable = this.usableInvites();
    if (usable.length > 0) return usable[0];
    const invite = await this.invites.insert({
      code: randomInviteCode(),
      note,
      active: true,
      maxUses: 1,
      uses: 0,
      usedBy: [],
      lastUsedAt: null,
    });
    return invite;
  }

  /* ---------------- 便捷查询 ---------------- */

  userByName(name) {
    const key = String(name || '').toLowerCase();
    return this.users.find((u) => u.username.toLowerCase() === key) || null;
  }

  userById(id) {
    return this.users.get(id);
  }

  userByUid(uid) {
    const value=Number(uid);
    return Number.isSafeInteger(value)&&value>0 ? this.users.find(user=>Number(user.uid)===value) : null;
  }

  gameByGid(gid) {
    const key = String(gid);
    if (!key || key === 'undefined' || key === 'null') return null;
    return this.games.find((g) => String(g.gid) === key) || this.games.find(g => String(g.ymgalGid || '') === key || g.cngalId && 'cn' + g.cngalId === key || (g.gidAliases || []).map(String).includes(key)) || null;
  }

  ratingFor(userId, gameId) {
    return this.ratings.find((r) => r.userId === userId && r.gameId === gameId) || null;
  }

  ratingsForGame(gameId) {
    return this.ratings.filter((r) => r.gameId === gameId);
  }

  ratingsForUser(userId) {
    return this.ratings.filter((r) => r.userId === userId);
  }

  reviewsForGame(gameId) {
    return this.reviews
      .filter((r) => r.gameId === gameId)
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  }

  reviewForUser(userId, gameId) {
    return this.reviewsForGame(gameId).find((r) => r.userId === userId && !r.mergedHistory) || null;
  }

  checkinsForUser(userId, gameId) {
    return this.checkins
      .filter((c) => c.userId === userId && c.gameId === gameId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  checkinsForGame(gameId) {
    return this.checkins.filter((c) => c.gameId === gameId);
  }

  /** 作品聚合：平均分 / 中位数 / 分布 / 评价数 / 打卡数 */
  gameStats(gameId) {
    const ratings = this.ratingsForGame(gameId);
    const scores = ratings.map((r) => Number(r.score)).filter((n) => Number.isFinite(n) && n > 0);
    const reviews = this.reviewsForGame(gameId);
    const checkins = this.checkinsForGame(gameId);
    const sum = scores.reduce((a, b) => a + b, 0);
    return {
      count: scores.length,
      sum,
      avg: scores.length ? sum / scores.length : 0,
      scores,
      ratings,
      reviews,
      reviewCount: reviews.length,
      checkinCount: checkins.length,
      doing: checkins.filter((c) => c.status === 'doing').length,
      done: checkins.filter((c) => c.status === 'done').length,
      wish: checkins.filter((c) => c.status === 'wish').length,
      dropped: checkins.filter((c) => c.status === 'dropped').length,
    };
  }

  /** 用户聚合：评分数量 / 平均分 / 打卡数量 */
  userStats(userId) {
    const ratings = this.ratingsForUser(userId);
    const scores = ratings.map((r) => Number(r.score)).filter((n) => Number.isFinite(n) && n > 0);
    const reviews = this.reviews.filter((r) => r.userId === userId);
    const checkins = this.checkins.filter((c) => c.userId === userId);
    const versions = this.meta.all().filter((m) => m.userId === userId && m.kind === 'version').length;
    const sum = scores.reduce((a, b) => a + b, 0);
    const groupCount = new Map();
    for (const r of ratings) groupCount.set(r.gameId, (groupCount.get(r.gameId) || 0) + 1);
    return {
      ratingCount: scores.length,
      avg: scores.length ? sum / scores.length : 0,
      reviewCount: reviews.length,
      checkinCount: checkins.length,
      versionCount: versions,
      doneCount: checkins.filter((c) => c.status === 'done').length,
      doingCount: checkins.filter((c) => c.status === 'doing').length,
      wishCount: checkins.filter((c) => c.status === 'wish').length,
      droppedCount: checkins.filter((c) => c.status === 'dropped').length,
      distinctGames: groupCount.size,
    };
  }

  /** 社区书架由实际打卡记录组成；搜索、浏览产生的资料缓存不算收录。 */
  collectedGames() {
    const members = new Set(this.users.list.map(user => user.id));
    const statuses = new Set(['wish', 'doing', 'done', 'dropped']);
    const latest = new Map();
    for (const record of this.checkins.list) {
      if (!members.has(record.userId) || !statuses.has(record.status)) continue;
      const at = String(record.updatedAt || record.createdAt || '');
      if (!latest.has(record.gameId) || at > latest.get(record.gameId)) latest.set(record.gameId, at);
    }
    return this.games.list
      .filter(game => latest.has(game.id))
      .map(game => ({ ...game, collectedAt: latest.get(game.id) }))
      .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt) || Number(b.gid) - Number(a.gid));
  }

  /** 站点总览 */
  siteStats() {
    const allScores = this.ratings.list.map((r) => Number(r.score)).filter((n) => Number.isFinite(n) && n > 0);
    const sum = allScores.reduce((a, b) => a + b, 0);
    return {
      users: this.users.list.length,
      games: this.collectedGames().length,
      ratings: allScores.length,
      reviews: this.reviews.list.length,
      checkins: this.checkins.list.length,
      avg: allScores.length ? sum / allScores.length : 0,
    };
  }

  /** 最近动态：评分 + 评价 + 打卡混排 */
  recentActivity(limit = 20) {
    const rows = [];
    for (const r of this.ratings.list) {
      rows.push({ kind: 'rating', at: r.updatedAt || r.createdAt, userId: r.userId, gameId: r.gameId, score: r.score });
    }
    for (const r of this.reviews.list) {
      rows.push({ kind: 'review', at: r.updatedAt || r.createdAt, userId: r.userId, gameId: r.gameId, text: r.content });
    }
    for (const c of this.checkins.list) {
      rows.push({ kind: 'checkin', at: c.updatedAt || c.createdAt, userId: c.userId, gameId: c.gameId, status: c.status });
    }
    return rows
      .filter((r) => r.at)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, limit);
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomInviteCode() {
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export async function removeFileQuiet(filePath) {
  await unlink(filePath).catch(() => {});
}

/** 维护脚本使用：按 CONFIG_PATH / DATA_DIR / DATABASE_URL 打开与网站相同的数据 */
export async function openConfiguredDb(root, options = {}) {
  const configFile = process.env.CONFIG_PATH || path.join(root, 'config.json');
  const config = existsSync(configFile) ? JSON.parse(await readFile(configFile, 'utf8')) : {};
  const dataDir = process.env.DATA_DIR || path.join(root, 'data');
  const db = new Db(dataDir, { databaseUrl: databaseUrlFrom(config) });
  await db.init(options);
  return db;
}
