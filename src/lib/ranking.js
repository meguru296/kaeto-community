export const RANKING_REFERENCE_WEIGHT = 5;

export function rankingData(db, scope = 'all', now = Date.now()) {
  const members = new Set(db.users.all().map(u => u.id));
  const games = new Map(db.games.all().map(g => [g.id, g]));
  const latest = new Map();
  for (const rating of db.ratings.all()) {
    const score = Number(rating.score);
    if (!members.has(rating.userId) || !games.has(rating.gameId) || !Number.isInteger(score) || score < 1 || score > 10) continue;
    const at = Date.parse(rating.updatedAt || rating.createdAt || '');
    const key = JSON.stringify([rating.userId, rating.gameId]);
    const old = latest.get(key);
    if (!old || (Number.isFinite(at) ? at : 0) >= old.at) latest.set(key, { gameId: rating.gameId, score, at: Number.isFinite(at) ? at : 0 });
  }
  const valid = [...latest.values()];
  const referenceAverage = valid.length ? valid.reduce((sum, r) => sum + r.score, 0) / valid.length : 0;
  const cutoff = scope === 'month' ? now - 30 * 86400000 : 0;
  const groups = new Map();
  for (const rating of valid) {
    if (cutoff && rating.at < cutoff) continue;
    const group = groups.get(rating.gameId) || { sum: 0, count: 0, lastAt: 0 };
    group.sum += rating.score; group.count++; group.lastAt = Math.max(group.lastAt, rating.at);
    groups.set(rating.gameId, group);
  }
  const rows = [...groups.entries()].map(([id, g]) => ({
    game: games.get(id), avg: g.sum / g.count, count: g.count,
    rankingScore: (g.sum + RANKING_REFERENCE_WEIGHT * referenceAverage) / (g.count + RANKING_REFERENCE_WEIGHT),
    lastAt: g.lastAt ? new Date(g.lastAt).toISOString() : '',
  })).sort((a, b) => b.rankingScore - a.rankingScore || b.count - a.count || String(a.game.gid).localeCompare(String(b.game.gid), 'en', { numeric: true }) || a.game.id.localeCompare(b.game.id));
  return { rows, referenceAverage, referenceWeight: RANKING_REFERENCE_WEIGHT, ratingCount: valid.length };
}
