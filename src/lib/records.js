import { withWorkMedia } from './work-media.js';
import { nowIso, newId } from './utils.js';

export function recordsFor(db, userId = null) {
  const map = new Map();
  for (const [kind, list] of [['rating', db.ratings.all()], ['review', db.reviews.all()], ['checkin', db.checkins.all()]]) {
    for (const item of list) {
      if (userId && item.userId !== userId) continue;
      const game = db.games.get(item.gameId);
      const user = db.users.get(item.userId);
      if (!game || !user) continue;
      const key = `${item.userId}:${item.gameId}`;
      const at = item.updatedAt || item.createdAt || '';
      let row = map.get(key);
      if (!row) { row = { user, game: withWorkMedia(game), at: '', kind: '' }; map.set(key, row); }
      if (!row[kind] || at > (row[kind].updatedAt || row[kind].createdAt || '')) row[kind] = item;
      if (at >= row.at) { row.at = at; row.kind = kind; }
    }
  }
  for (const item of db.meta.all().filter(m => m.kind === 'record')) {
    const row = map.get(`${item.userId}:${item.gameId}`);
    if (row && item.updatedAt >= row.at) { row.at = item.updatedAt; row.kind = item.event || 'record'; }
  }
  return [...map.values()].sort((a, b) => b.at.localeCompare(a.at));
}

export function recordPage(rows, params, size = 12) {
  const allowed = ['all', 'rated', 'reviewed', 'unreviewed', 'wish', 'doing', 'done', 'dropped'];
  const filter = allowed.includes(params.get('filter')) ? params.get('filter') : 'all';
  const sort = params.get('sort') === 'score' ? 'score' : 'recent';
  const filtered = rows.filter(r => filter === 'all' || (filter === 'rated' ? r.rating : filter === 'reviewed' ? r.review : filter === 'unreviewed' ? r.checkin?.status === 'done' && !r.review : r.checkin?.status === filter));
  if (sort === 'score') filtered.sort((a, b) => (b.rating?.score || 0) - (a.rating?.score || 0) || b.at.localeCompare(a.at));
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.get('page'), 10) || 1));
  return { rows: filtered.slice((page - 1) * size, page * size), total: filtered.length, overall: rows.length, page, pages, size, filter, sort,
    counts: { rated: rows.filter(r => r.rating).length, reviewed: rows.filter(r => r.review).length, doing: rows.filter(r => r.checkin?.status === 'doing').length, done: rows.filter(r => r.checkin?.status === 'done').length },
    collection: collectionProgress(rows) };
}

export function collectionProgress(rows) {
  const collected = rows.filter(r => ['wish','doing','done','dropped'].includes(r.checkin?.status)).length;
  const done = rows.filter(r => r.checkin?.status === 'done').length;
  const reviews = rows.filter(r => r.review).length;
  const complete = rows.filter(r => r.checkin?.status === 'done' && r.rating && r.review).length;
  const unreviewed = rows.filter(r => r.checkin?.status === 'done' && !r.review).length;
  const goal = [1,5,10,20,50,100,200].find(n => n > collected) || (Math.floor(collected / 100) + 1) * 100;
  return { collected, done, reviews, complete, unreviewed, goal,
    badges: [
      { name: '第一格故事', icon: '▣', unlocked: collected >= 1, hint: '标记 1 部作品' },
      { name: '抵达结局', icon: '✓', unlocked: done >= 1, hint: '玩过 1 部作品' },
      { name: '留下回声', icon: '✎', unlocked: reviews >= 1, hint: '写下 1 篇评价' },
      { name: '完整纪念', icon: '✦', unlocked: complete >= 1, hint: '同一作品玩过、评分、评价' },
      { name: '小小收藏家', icon: '▥', unlocked: collected >= 20, hint: '标记 20 部作品' },
      { name: '故事分享者', icon: '❞', unlocked: reviews >= 10, hint: '写下 10 篇评价' },
    ] };
}

// Validate the complete patch before touching any existing record. Omitted fields
// preserve their values; explicit blank values clear only that field.
export async function saveRecord(db, userId, gameId, form) {
  const own = key => Object.hasOwn(form, key);
  const score = own('score') && form.score !== '' ? Number(form.score) : null;
  if (score !== null && (!Number.isInteger(score) || score < 1 || score > 10)) throw new Error('评分请选择 1—10 分');
  const status = own('status') ? String(form.status) : undefined;
  if (status !== undefined && !['', 'wish', 'doing', 'done', 'dropped'].includes(status)) throw new Error('游玩状态不合法');
  const content = own('content') ? String(form.content).trim() : undefined;
  if (content !== undefined && content !== '' && (content.length < 2 || content.length > 2000)) throw new Error('评价请填写 2—2000 字');
  if (String(form.note || '').length > 120 || String(form.title || '').length > 60) throw new Error('进度备注或评价标题过长');
  const collections = [db.ratings, db.reviews, db.checkins, db.meta];
  const previous = collections.map(c => structuredClone(c.items));
  const before = { rating: db.ratingFor(userId, gameId), review: db.reviewForUser(userId, gameId), checkin: db.checkinsForUser(userId, gameId)[0] };
  if (String(form.note || '').trim() && !(status === undefined ? before.checkin?.status : status)) throw new Error('填写进度备注时，请选择游玩状态');
  const at = nowIso();
  let changed = false;
  let changedReview = false;
  let changedStatus = false;
  function update(collection, old, patch) {
    if (old && Object.entries(patch).every(([key, value]) => old[key] === value)) return false;
    if (old) Object.assign(old, patch, { updatedAt: at });
    else collection.items.push({ id: newId(), userId, gameId, createdAt: at, updatedAt: at, ...patch });
    changed = true;
    return true;
  }
  function remove(collection, old) { if (old) { collection.items = collection.items.filter(i => i.id !== old.id); changed = true; } }
  if (own('score')) {
    if (score === null) remove(db.ratings, before.rating);
    else update(db.ratings, before.rating, { score });
  }
  if (status !== undefined) {
    changedStatus = status !== (before.checkin?.status || '');
    if (!status) {
      for (const item of db.checkinsForUser(userId, gameId)) remove(db.checkins, item);
    } else update(db.checkins, before.checkin, { status, note: own('note') ? String(form.note).trim() : before.checkin?.note || '' });
  } else if (own('note') && before.checkin) update(db.checkins, before.checkin, { note: String(form.note).trim() });
  if (content !== undefined) {
    if (!content) { changedReview = Boolean(before.review); remove(db.reviews, before.review); }
    else changedReview = update(db.reviews, before.review, { content, title: own('title') ? String(form.title).trim() : before.review?.title || '', score: db.ratingFor(userId, gameId)?.score || null });
  } else if (before.review && own('score')) before.review.score = score;
  if (!changed) return false;
  const event = changedStatus ? 'checkin' : changedReview ? 'review' : 'record';
  const meta = db.meta.find(m => m.kind === 'record' && m.userId === userId && m.gameId === gameId);
  update(db.meta, meta, { kind: 'record', event });
  if (meta) meta.updatedAt = at;
  try { for (const c of collections) await c.persist(); }
  catch (error) {
    collections.forEach((c, i) => { c.items = previous[i]; });
    await Promise.allSettled(collections.map(c => c.persist()));
    throw error;
  }
  return true;
}
