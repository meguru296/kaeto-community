import { readFile, writeFile, mkdir, chmod, rename, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Db, MIGRATED_MARKER } from './store.js';
import { PgDatabase, TABLES, KV_FILES, readTable, insertRows } from './pg-store.js';

/* ------------------------------------------------------------------ *
 * JSON 数据目录 ⇄ PostgreSQL 的迁移、校验与导出。
 * 迁移在单个事务内完成：写入、逐行回读比对、记录迁移信息，全部通过才提交。
 * ------------------------------------------------------------------ */

class DryRun extends Error {}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** 按网站的加载规则读取数据目录里的全部集合与 kv 文件 */
export async function readJsonDataDir(dataDir) {
  const db = new Db(dataDir);
  const collections = [];
  for (const collection of db.collections) {
    const file = path.basename(collection.filePath);
    const exists = existsSync(collection.filePath);
    await collection.load();
    collections.push({ name: collection.name, table: TABLES[collection.name], file, exists, items: collection.items, sha256: exists ? sha256(await readFile(collection.filePath)) : null });
  }
  const kv = [];
  for (const key of KV_FILES) {
    const file = path.join(dataDir, key);
    if (!existsSync(file)) continue;
    const bytes = await readFile(file);
    let value;
    try { value = JSON.parse(bytes.toString('utf8')); }
    catch (err) { throw new Error(`${key} 不是有效 JSON：${err.message}`); }
    kv.push({ key, value, sha256: sha256(bytes) });
  }
  return { collections, kv };
}

function fingerprint(source) {
  return JSON.stringify([source.collections.map(c => c.sha256), source.kv.map(k => [k.key, k.sha256])]);
}

async function tableCounts(client) {
  const counts = {};
  for (const table of [...Object.values(TABLES), 'kv']) {
    const { rows } = await client.query(`select count(*)::int as n from ${table}`);
    counts[table] = rows[0].n;
  }
  return counts;
}

/** 逐行比对：数量、顺序与每行 JSON 完全一致 */
async function compare(client, source) {
  const problems = [];
  for (const collection of source.collections) {
    const rows = await readTable(client, collection.table);
    if (rows.length !== collection.items.length) { problems.push(`${collection.table}: 数据库 ${rows.length} 行，JSON ${collection.items.length} 条`); continue; }
    collection.items.forEach((item, i) => {
      if (rows[i].id !== item.id) problems.push(`${collection.table}: 第 ${i + 1} 行顺序不同（${rows[i].id} ≠ ${item.id}）`);
      else if (JSON.stringify(rows[i].data) !== JSON.stringify(item)) problems.push(`${collection.table}: ${item.id} 内容不同`);
    });
  }
  const { rows } = await client.query('select key, value from kv');
  const stored = new Map(rows.map(row => [row.key, row.value]));
  for (const entry of source.kv) {
    if (!stored.has(entry.key)) problems.push(`kv: 缺少 ${entry.key}`);
    else if (JSON.stringify(stored.get(entry.key)) !== JSON.stringify(entry.value)) problems.push(`kv: ${entry.key} 内容不同`);
  }
  return problems;
}

function summary(source) {
  return Object.fromEntries([...source.collections.map(c => [c.table, c.items.length]), ['kv', source.kv.length]]);
}

/**
 * 把 JSON 数据目录导入 PostgreSQL。
 * 目标库必须为空（replace=true 时先清空）；dryRun=true 时完成全部写入与校验后回滚。
 */
export async function importDataDir({ dataDir, databaseUrl, dryRun = false, replace = false, log = () => {} }) {
  const source = await readJsonDataDir(dataDir);
  const before = fingerprint(source);
  const database = new PgDatabase(databaseUrl, { applicationName: 'gal-rate-migrate' });
  try {
    await database.lock();
    await database.ensureSchema();
    const result = await database.transaction(async client => {
      const existing = await tableCounts(client);
      const nonEmpty = Object.entries(existing).filter(([, n]) => n > 0);
      if (nonEmpty.length && !replace) {
        throw new Error('目标数据库已有数据（' + nonEmpty.map(([t, n]) => `${t} ${n}`).join('、') + '）；为避免覆盖较新的记录已停止。确认要用 JSON 覆盖时加 --replace');
      }
      if (replace) {
        await client.query(`truncate ${[...Object.values(TABLES), 'kv'].join(', ')}`);
        await client.query("delete from app_meta where key = 'migration'");
      }
      for (const collection of source.collections) {
        log(`写入 ${collection.table}：${collection.items.length} 条`);
        await insertRows(client, collection.table, collection.items.map((item, i) => ({ id: item.id, seq: i + 1, json: JSON.stringify(item) })));
      }
      for (const entry of source.kv) {
        await client.query('insert into kv (key, value) values ($1, $2::json)', [entry.key, JSON.stringify(entry.value)]);
      }
      const problems = await compare(client, source);
      if (problems.length) throw new Error('回读校验失败，已回滚：\n  ' + problems.slice(0, 20).join('\n  '));
      const after = fingerprint(await readJsonDataDir(dataDir));
      if (after !== before) throw new Error('迁移期间 JSON 文件发生了变化（网站可能仍在运行），已回滚；请先停止网站');
      const info = {
        migrationId: randomUUID(),
        migratedAt: new Date().toISOString(),
        from: path.resolve(dataDir),
        counts: summary(source),
        sha256: Object.fromEntries([...source.collections.filter(c => c.exists).map(c => [c.file, c.sha256]), ...source.kv.map(k => [k.key, k.sha256])]),
      };
      await client.query("insert into app_meta (key, value) values ('migration', $1::json) on conflict (key) do update set value = excluded.value, updated_at = now()", [JSON.stringify(info)]);
      if (dryRun) throw new DryRun();
      return info;
    }).catch(err => {
      if (err instanceof DryRun) return { dryRun: true, counts: summary(source) };
      throw err;
    });
    return result;
  } finally {
    await database.close();
  }
}

/** 比对 PostgreSQL 与某个 JSON 目录（迁移后检查、或检查导出结果） */
export async function verifyAgainst({ dataDir, databaseUrl }) {
  const source = await readJsonDataDir(dataDir);
  const database = new PgDatabase(databaseUrl, { applicationName: 'gal-rate-verify' });
  try {
    const client = await database.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const problems = await compare(client, source);
      await client.query('commit');
      return { ok: problems.length === 0, problems, counts: summary(source) };
    } finally { client.release(); }
  } finally { await database.close(); }
}

/**
 * 把 PostgreSQL 导出为与网站 JSON 模式相同格式的数据目录（备份或回退用）。
 * 只读快照，网站运行时也可执行。
 */
export async function exportDatabase({ databaseUrl, outDir }) {
  if (existsSync(outDir)) throw new Error(`${outDir} 已存在；请指定一个新的目录`);
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  const database = new PgDatabase(databaseUrl, { applicationName: 'gal-rate-export' });
  const counts = {};
  try {
    const client = await database.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const files = new Db(outDir).collections.map(c => [c.name, path.basename(c.filePath)]);
      for (const [name, file] of files) {
        const rows = await readTable(client, TABLES[name]);
        counts[TABLES[name]] = rows.length;
        await writeFile(path.join(outDir, file), JSON.stringify(rows.map(r => r.data), null, 2), { mode: 0o600, flag: 'wx' });
      }
      const { rows } = await client.query('select key, value from kv order by key');
      for (const row of rows) {
        if (!KV_FILES.includes(row.key)) continue;
        const file = path.join(outDir, row.key);
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, JSON.stringify(row.value, null, 2), { mode: 0o600, flag: 'wx' });
      }
      counts.kv = rows.length;
      await client.query('commit');
    } finally { client.release(); }
  } finally { await database.close(); }
  await chmod(outDir, 0o700);
  return { outDir, counts };
}

/** 清空网站数据表（仅用于迁移失败后的回退；网站正在使用该库时拒绝） */
export async function discardImport({ databaseUrl }) {
  const database = new PgDatabase(databaseUrl, { applicationName: 'gal-rate-migrate' });
  try {
    await database.lock();
    await database.ensureSchema();
    await database.transaction(async client => {
      await client.query(`truncate ${[...Object.values(TABLES), 'kv'].join(', ')}`);
      await client.query("delete from app_meta where key = 'migration'");
    });
  } finally { await database.close(); }
}

export async function databaseStatus({ databaseUrl }) {
  const database = new PgDatabase(databaseUrl, { applicationName: 'gal-rate-status' });
  try {
    const inUse = await database.lockedElsewhere();
    const { rows } = await database.pool.query("select to_regclass('public.users') is not null as ready");
    if (!rows[0].ready) return { inUse, schema: false };
    return { inUse, schema: true, migration: await database.metaValue('migration') || null, counts: await tableCounts(database.pool) };
  } finally { await database.close(); }
}

/**
 * 迁移校验通过后封存 JSON：原文件移入 json-before-postgres-<时间>/，原位置写入迁移标记。
 * 旧版程序（不支持 PostgreSQL）读到标记会拒绝启动，而不是用过期数据继续服务。
 */
export async function sealDataDir({ dataDir, databaseUrl, archive: requestedArchive, io = { rename, writeFile } }) {
  const database = new PgDatabase(databaseUrl, { applicationName: 'gal-rate-seal' });
  try {
    await database.lock();
    const source = await readJsonDataDir(dataDir);
    const migration = await database.metaValue('migration');
    if (!migration?.migrationId) throw new Error('缺少迁移标识，未封存；请先完成迁移');
    const problems = await compare(database.pool, source);
    if (problems.length) throw new Error('数据库与 JSON 不一致，未封存：\n  ' + problems.slice(0, 20).join('\n  '));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
    const archive = path.resolve(requestedArchive || path.join(dataDir, `json-before-postgres-${stamp}-${randomUUID().slice(0, 8)}`));
    if (path.dirname(archive) !== path.resolve(dataDir)) throw new Error('封存目录必须是数据目录中一个新的直接子目录');
    const entries = [
      ...source.collections.filter(c => c.exists).map(c => ({ rel: c.file, sha256: c.sha256, marker: true })),
      ...source.kv.map(k => ({ rel: k.key, sha256: k.sha256, marker: false })),
    ];
    await mkdir(archive, { mode: 0o700 });
    const info = { sealedAt: new Date().toISOString(), migrationId: migration.migrationId, entries, moved: entries.map(e => e.rel), state: 'sealing', restore: 'node scripts/postgres-migrate.mjs unseal --archive <本目录>' };
    // Journal the complete plan before moving any original file. Recovery checks
    // archive files and their hashes, so a crash between rename and journaling is safe.
    await io.writeFile(path.join(archive, 'archive-info.json'), JSON.stringify(info, null, 2), { mode: 0o600, flag: 'wx' });
    try {
      for (const entry of entries) {
        database.assertWritable();
        const file = path.join(dataDir, entry.rel), saved = path.join(archive, entry.rel);
        if (sha256(await readFile(file)) !== entry.sha256) throw new Error('封存期间源文件变化，已停止：' + entry.rel);
        await mkdir(path.dirname(saved), { recursive: true, mode: 0o700 });
        await io.rename(file, saved);
        if (entry.marker) {
          const marker = { ...MIGRATED_MARKER, migrationId: migration.migrationId };
          const next = file + '.postgres-next';
          try {
            await io.writeFile(next, JSON.stringify(marker, null, 2) + '\n', { mode: 0o640, flag: 'wx' });
            await io.rename(next, file);
          } finally { await rm(next, { force: true }).catch(() => {}); }
        }
      }
      info.state = 'sealed';
      await io.writeFile(path.join(archive, 'archive-info.next'), JSON.stringify(info, null, 2), { mode: 0o600, flag: 'wx' });
      await io.rename(path.join(archive, 'archive-info.next'), path.join(archive, 'archive-info.json'));
      return { archive, moved: info.moved };
    } catch (cause) {
      try { await unsealDataDir({ dataDir, archive }); }
      catch (restoreError) {
        throw new Error(`封存失败，自动恢复未完成；保留数据库与归档 ${archive}，请用 unseal 重试。原因：${cause.message}；恢复：${restoreError.message}`, { cause });
      }
      throw new Error(`封存失败，原 JSON 已恢复（归档 ${archive}）：${cause.message}`, { cause });
    }
  } finally { await database.close(); }
}

/** 撤销封存：把原 JSON 放回数据目录（只覆盖迁移标记） */
export async function unsealDataDir({ dataDir, archive }) {
  const info = JSON.parse(await readFile(path.join(archive, 'archive-info.json'), 'utf8'));
  const allowed = new Set([...new Db(dataDir).collections.map(c => path.basename(c.filePath)), ...KV_FILES]);
  const entries = info.entries || info.moved?.map(rel => ({ rel }));
  if (!Array.isArray(entries) || entries.some(e => !allowed.has(e.rel))) throw new Error('封存清单含无效路径，未恢复');
  // Validate every candidate before replacing anything, preserve newer files.
  const actions = [];
  for (const entry of entries) {
    const rel = entry.rel;
    const target = path.join(dataDir, rel);
    const saved = path.join(archive, rel);
    if (!existsSync(saved)) {
      if (!existsSync(target) || (entry.sha256 && sha256(await readFile(target)) !== entry.sha256)) throw new Error(`${target} 缺少可确认的原文件，未恢复`);
      continue; // Already restored, or never moved. Makes recovery resumable.
    }
    if (entry.sha256 && sha256(await readFile(saved)) !== entry.sha256) throw new Error(`${saved} 校验失败，未恢复`);
    if (existsSync(target)) {
      const current = JSON.parse(await readFile(target, 'utf8'));
      if (current?.migratedTo !== 'postgresql') throw new Error(`${target} 不是迁移标记，可能已有新数据；未覆盖`);
      if (info.migrationId && current.migrationId !== info.migrationId) throw new Error(`${target} 迁移标识不匹配，未覆盖`);
    }
    actions.push({ target, saved });
  }
  for (const { target, saved } of actions) {
    await mkdir(path.dirname(target), { recursive: true });
    await rename(saved, target);
  }
  return { restored: entries.map(e => e.rel) };
}
