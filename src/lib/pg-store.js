import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';

/* ------------------------------------------------------------------ *
 * PostgreSQL 持久化。
 * 网站仍在内存中读取集合（与 JSON 版行为一致），每次 persist() 同步计算
 * 与上次写入的差异，再在一个事务里写入 PostgreSQL。
 * 每行保存原始 JSON 文本（json 类型，保留字段顺序），seq 保存数组顺序。
 * 同一时间只允许一个进程持有写入锁，防止两个进程互相覆盖。
 * ------------------------------------------------------------------ */

export const SCHEMA_VERSION = 1;

/** 集合名 → 表名 */
export const TABLES = {
  users: 'users',
  sessions: 'sessions',
  games: 'games',
  ratings: 'ratings',
  reviews: 'reviews',
  checkins: 'checkins',
  invites: 'invites',
  meta: 'meta',
  emailCodes: 'email_codes',
  battles: 'battles',
  battleVotes: 'battle_votes',
  battleCheers: 'battle_cheers',
  assets: 'assets',
  audit: 'audit',
  memberLevels: 'member_levels',
  pilgrimageMarks: 'pilgrimage_marks',
  characterFollows: 'character_follows',
  externalAccounts: 'external_accounts',
  reviewCommunity: 'review_community',
};

/** 原先保存在数据目录里的小型 JSON 状态，迁移后以相对路径为键存入 kv 表 */
export const KV_FILES = ['media/vndb.json', 'media/cover-policy.json', 'media/discovery.json', 'steam-api-key.json'];

const LOCK_KEY = 72870331;
const TRANSIENT = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', '57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '08004', '40001', '40P01']);

export function schemaStatements() {
  return [
    'create table if not exists app_meta (key text primary key, value json not null, updated_at timestamptz not null default now())',
    'create table if not exists kv (key text primary key, value json not null, updated_at timestamptz not null default now())',
    ...Object.values(TABLES).map(table => `create table if not exists ${table} (id text primary key, seq bigint not null, data json not null, updated_at timestamptz not null default now())`),
  ];
}

export function redactUrl(url) {
  try { const u = new URL(url); if (u.password) u.password = '***'; u.search = ''; u.hash = ''; return u.toString(); } catch { return '(无法解析的连接串)'; }
}

export class PgDatabase {
  constructor(url, { applicationName = 'gal-rate' } = {}) {
    if (!url) throw new Error('[store] 缺少 PostgreSQL 连接串');
    this.url = url;
    this.applicationName = applicationName;
    this.pool = new pg.Pool({ connectionString: url, max: 4, application_name: applicationName, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
    this.pool.on('error', err => console.warn('[postgres] 空闲连接异常：' + err.message));
    this.lockClient = null;
    this.lockFailure = null;
    this.lockListeners = new Set();
    this.writeQueue = Promise.resolve();
    this.closing = false;
  }

  onLockLost(listener) {
    this.lockListeners.add(listener);
    if (this.lockFailure) queueMicrotask(() => listener(this.lockFailure));
    return () => this.lockListeners.delete(listener);
  }

  loseLock(cause) {
    if (this.closing || this.lockFailure) return;
    this.lockFailure = Object.assign(new Error('[store] PostgreSQL 写入锁已丢失，必须重启并重新加载数据'), { code: 'PG_LOCK_LOST', cause });
    for (const listener of this.lockListeners) listener(this.lockFailure);
  }

  assertWritable() {
    if (this.lockFailure) throw this.lockFailure;
    if (!this.lockClient || this.closing) throw new Error('[store] 未持有 PostgreSQL 写入锁');
  }

  /** 独占写入锁；连接保持到进程退出。 */
  async lock() {
    if (this.lockClient || this.lockFailure || this.closing) throw new Error('[store] 写入锁不能重复获取，请重新创建并加载数据库');
    const client = new pg.Client({ connectionString: this.url, application_name: this.applicationName + '-lock', connectionTimeoutMillis: 10000 });
    let acquired = false;
    client.on('error', err => { if (acquired) this.loseLock(err); });
    client.on('end', () => { if (acquired) this.loseLock(new Error('Lock connection ended')); });
    try {
      await client.connect();
      const { rows } = await client.query('select pg_try_advisory_lock($1) as ok', [LOCK_KEY]);
      if (!rows[0].ok) throw new Error('[store] 另一个网站进程或维护脚本正在使用 PostgreSQL；为避免两个进程同时写入，已停止');
      this.lockClient = client;
      acquired = true;
    } catch (err) {
      await client.end().catch(() => {});
      throw err;
    }
  }

  /** 网站是否正在使用该数据库（其他进程持有写入锁） */
  async lockedElsewhere() {
    const client = new pg.Client({ connectionString: this.url, application_name: this.applicationName + '-probe', connectionTimeoutMillis: 10000 });
    await client.connect();
    try {
      const { rows } = await client.query('select pg_try_advisory_lock($1) as ok', [LOCK_KEY]);
      if (rows[0].ok) await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
      return !rows[0].ok;
    } finally { await client.end().catch(() => {}); }
  }

  async ensureSchema() {
    await this.transaction(async client => {
      await client.query('select pg_advisory_xact_lock($1)', [LOCK_KEY + 1]);
      for (const sql of schemaStatements()) await client.query(sql);
      const { rows } = await client.query("select value from app_meta where key = 'schemaVersion'");
      const current = rows.length ? Number(rows[0].value) : 0;
      if (current > SCHEMA_VERSION) throw new Error(`[store] 数据库结构版本 ${current} 比程序支持的 ${SCHEMA_VERSION} 新，请使用更新的程序`);
      if (current < SCHEMA_VERSION) await client.query("insert into app_meta (key, value) values ('schemaVersion', $1::json) on conflict (key) do update set value = excluded.value, updated_at = now()", [JSON.stringify(SCHEMA_VERSION)]);
    });
  }

  async metaValue(key) {
    const { rows } = await this.pool.query('select value from app_meta where key = $1', [key]);
    return rows.length ? rows[0].value : undefined;
  }

  async transaction(fn) {
    // Writes use the lock-owning session itself. If it dies, its transaction
    // cannot commit through a different pooled connection after losing the lock.
    const run = this.writeQueue.then(async () => {
      this.assertWritable();
      const client = this.lockClient;
      try {
        await client.query('begin');
        const result = await fn(client);
        this.assertWritable();
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw this.lockFailure || err;
      }
    });
    this.writeQueue = run.catch(() => {});
    return run;
  }

  kv() {
    const pool = this.pool;
    const database = this;
    return {
      async get(key) {
        const { rows } = await pool.query('select value from kv where key = $1', [key]);
        return rows.length ? rows[0].value : undefined;
      },
      async set(key, value) {
        await withRetry(() => database.transaction(client => client.query('insert into kv (key, value, updated_at) values ($1, $2::json, now()) on conflict (key) do update set value = excluded.value, updated_at = now()', [key, JSON.stringify(value)])));
      },
    };
  }

  async close() {
    await this.writeQueue;
    this.closing = true;
    await this.pool.end().catch(() => {});
    await this.lockClient?.end().catch(() => {});
    this.lockClient = null;
  }
}

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (!TRANSIENT.has(err.code) || attempt >= 2) throw err;
      await delay(150 * (attempt + 1));
    }
  }
}

/** 读取一张集合表，校验每一行与 JSON 版加载时的规则一致。 */
export async function readTable(queryable, table) {
  const { rows } = await queryable.query(`select id, seq, data from ${table} order by seq, id`);
  for (const row of rows) {
    if (!row.data || typeof row.data !== 'object' || Array.isArray(row.data) || row.data.id !== row.id) {
      throw new Error(`[store] ${table} 中 ${row.id} 的数据无效，启动已停止；请从备份恢复`);
    }
  }
  return rows;
}

/** 一次插入整批行（迁移和全量同步共用） */
export async function insertRows(client, table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    await client.query(
      `insert into ${table} (id, seq, data, updated_at) select id, seq, data, now() from unnest($1::text[], $2::bigint[], $3::json[]) as r(id, seq, data)
       on conflict (id) do update set seq = excluded.seq, data = excluded.data, updated_at = now()`,
      [part.map(r => r.id), part.map(r => r.seq), part.map(r => r.json)],
    );
  }
}

export class PgCollectionStore {
  constructor(database, table) {
    this.database = database;
    this.table = table;
    this.baseline = new Map();
    this.maxSeq = 0;
    this.dirty = false;
  }

  async load() {
    const rows = await readTable(this.database.pool, this.table);
    this.baseline.clear();
    for (const row of rows) {
      this.baseline.set(row.id, { seq: Number(row.seq), json: JSON.stringify(row.data) });
      this.maxSeq = Math.max(this.maxSeq, Number(row.seq));
    }
    return rows.map(row => row.data);
  }

  /** 同步拍下当前集合的快照并算出差异；调用之后集合可以继续被修改。 */
  plan(items) {
    const ids = new Set();
    let ordered = true, last = 0, seenNew = false;
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) throw new Error(`[store] ${this.table} 含无效 ID，未写入`);
      if (ids.has(item.id)) throw new Error(`[store] ${this.table} 存在重复 ID ${item.id}，未写入`);
      ids.add(item.id);
      const base = this.baseline.get(item.id);
      if (base) { if (seenNew || base.seq <= last) ordered = false; last = base.seq; }
      else seenNew = true;
    }
    if (!ordered) this.maxSeq = 0;
    const all = [], changed = [], next = new Map();
    for (const item of items) {
      const base = this.baseline.get(item.id);
      const seq = ordered && base ? base.seq : ++this.maxSeq;
      const json = JSON.stringify(item);
      const row = { id: item.id, seq, json };
      all.push(row);
      next.set(item.id, { seq, json });
      if (!base || base.seq !== seq || base.json !== json) changed.push(row);
    }
    const removed = [...this.baseline.keys()].filter(id => !ids.has(id));
    this.baseline = next;
    return { all, changed, removed };
  }

  persist(collection) {
    let plan;
    try { plan = this.plan(collection.items); }
    catch (err) { return Promise.reject(err); }
    const run = collection.writes.then(() => this.write(plan));
    collection.writes = run.catch(() => {});
    return run;
  }

  async write({ all, changed, removed }) {
    // 之前有写入失败时，用这次的完整快照覆盖整张表，保证库内与内存一致。
    const full = this.dirty;
    if (!full && !changed.length && !removed.length) return;
    try {
      await withRetry(() => this.database.transaction(async client => {
        if (full) await client.query(`delete from ${this.table} where not (id = any($1::text[]))`, [all.map(r => r.id)]);
        else if (removed.length) await client.query(`delete from ${this.table} where id = any($1::text[])`, [removed]);
        await insertRows(client, this.table, full ? all : changed);
      }));
      this.dirty = false;
    } catch (err) {
      this.dirty = true;
      throw new Error(`[store] ${this.table} 写入 PostgreSQL 失败：${err.message}`);
    }
  }
}
