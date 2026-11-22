import { isSuperAdmin } from './site-content.js';
import { displayName } from './identity.js';
import { avatarFor } from './avatars.js';
import { withWorkMedia } from './work-media.js';

const hkDate = value => {
  const stamp = Date.parse(value || '');
  return Number.isFinite(stamp) ? new Date(stamp + 8 * 3600000).toISOString().slice(0, 10) : null;
};
const currentYear = () => Number(hkDate(new Date().toISOString()).slice(0, 4));
const modified = record => record.updatedAt || record.createdAt;
const safeWork = game => {
  const work = withWorkMedia(game);
  return { gid: work.gid, title: work.chineseName || work.name || '未命名作品', brand: work.orgName || '', cover: work.mainImg || '' };
};

export class AnnualAnalysis {
  constructor(db) { this.db = db; this.queue = Promise.resolve(); }
  settings() { const row = this.db.meta.get('annual-analysis'); return { enabled: row?.enabled === true, year: Number.isInteger(row?.year) ? row.year : currentYear() }; }
  canView(user) { return !!user && (this.settings().enabled || isSuperAdmin(user)); }
  configure(user, form) {
    if (!isSuperAdmin(user)) throw Object.assign(new Error('仅超级管理员可设置年度分析开放时间'), { status: 403 });
    const year = Number(form.year);
    if (!Number.isInteger(year) || year < 2000 || year > currentYear()) throw new Error('年度须为 2000 年至当前年份');
    if (!['0', '1'].includes(form.enabled)) throw new Error('请选择开放或隐藏');
    const run = this.queue.then(async () => {
      const before = this.settings(), after = { enabled: form.enabled === '1', year };
      if (this.db.meta.get('annual-analysis')) await this.db.meta.update('annual-analysis', after);
      else await this.db.meta.insert({ id: 'annual-analysis', ...after });
      if (before.enabled !== after.enabled || before.year !== after.year) await this.db.audit.insert({ userId: user.id, action: 'annual.configure', key: 'annual-analysis', before: JSON.stringify(before), after: JSON.stringify(after) });
    });
    this.queue = run.catch(() => {}); return run;
  }
  report(user) {
    if (!this.canView(user)) throw Object.assign(new Error('年度分析尚未开放'), { status: 404 });
    const { year, enabled } = this.settings(), db = this.db;
    const games = new Map(db.games.all().map(game => [game.id, game]));
    const own = collection => collection.filter(row => row.userId === user.id && games.has(row.gameId));
    const inYear = row => Number(hkDate(modified(row))?.slice(0, 4)) === year;
    const ratings = own(db.ratings).filter(inYear).filter(r => Number(r.score) >= 1 && Number(r.score) <= 10);
    const reviews = own(db.reviews).filter(inYear);
    const checkins = own(db.checkins).filter(inYear);
    const all = [...ratings, ...reviews, ...checkins];
    const works = new Set(all.map(row => row.gameId));
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, works: new Set(), ratings: 0, reviews: 0, checkins: 0 }));
    for (const [rows, kind] of [[ratings, 'ratings'], [reviews, 'reviews'], [checkins, 'checkins']]) for (const row of rows) {
      const m = months[Number(hkDate(modified(row)).slice(5, 7)) - 1]; m.works.add(row.gameId); m[kind]++;
    }
    const scores = ratings.map(row => Number(row.score));
    const average = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null;
    const distribution = Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: scores.filter(score => score === i + 1).length }));
    const statuses = { wish: 0, doing: 0, done: 0, dropped: 0 };
    const latestCheckins = new Map();
    for (const row of checkins.slice().sort((a, b) => String(modified(a)).localeCompare(String(modified(b))))) latestCheckins.set(row.gameId, row);
    for (const row of latestCheckins.values()) if (Object.hasOwn(statuses, row.status)) statuses[row.status]++;
    const favorites = ratings.slice().sort((a, b) => b.score - a.score || String(modified(b)).localeCompare(String(modified(a)))).slice(0, 5).map(r => ({ ...safeWork(games.get(r.gameId)), score: Number(r.score) }));
    const reviewCards = reviews.slice().sort((a, b) => String(modified(b)).localeCompare(String(modified(a)))).slice(0, 3).map(r => ({ ...safeWork(games.get(r.gameId)), reviewTitle: r.title || '', excerpt: [...String(r.content || '')].slice(0, 160).join(''), date: hkDate(modified(r)) }));
    const first = all.map(row => hkDate(modified(row))).sort()[0] || null;
    const monthly = months.map(m => ({ ...m, works: m.works.size }));
    const peak = monthly.slice().sort((a, b) => b.works - a.works || a.month - b.month)[0];
    return {
      schemaVersion: 1, year, generatedAt: new Date().toISOString(), preview: !enabled,
      member: { nickname: displayName(user), uid: user.uid, avatar: avatarFor(user) },
      summary: { works: works.size, ratings: ratings.length, reviews: reviews.length, average, statuses, firstRecord: first, activeMonths: monthly.filter(m => m.works).length, peakMonth: peak.works ? peak.month : null, reviewCharacters: reviews.reduce((sum, r) => sum + [...String(r.content || '').replace(/\[星标:[^\]]+\]/g, '')].length, 0) },
      monthly, distribution, favorites, reviewCards,
      basis: '按现存评分、评价、打卡记录的最近更新时间，以北京时间归入年度；每月作品去重。记录后续修改或删除会改变回顾，不代表完整游玩历史或游玩时长。',
    };
  }
}
