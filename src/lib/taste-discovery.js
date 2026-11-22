// Recommendations use only public site scores and play states. No external
// requests, reviews, notes, contacts or linked-account data enter this index.
export class TasteDiscovery {
  constructor(db, { clock = Date.now, ttl = 86400000, cacheLimit = 500 } = {}) {
    this.db = db;
    this.clock = clock;
    this.ttl = ttl;
    this.cacheLimit = cacheLimit;
    this.generation = '';
    this.profiles = new Map();
    this.games = new Map();
    this.inverted = new Map();
    this.popularity = new Map();
    this.cache = new Map();
    this.builds = 0;
    this.comparisons = 0;
    this.queue = Promise.resolve();
  }

  enabled(user) { return user?.tasteDiscoveryEnabled === true; }

  async setEnabled(userId, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('请选择开启或关闭同好推荐');
    const run = this.queue.then(async () => {
      const user = this.db.users.get(userId);
      if (!user) throw new Error('请先登录');
      if (this.enabled(user) === enabled) return;
      const before = structuredClone(this.db.users.items);
      try { await this.db.users.update(userId, { tasteDiscoveryEnabled: enabled }); }
      catch (error) { this.db.users.items = before; throw error; }
      // Drop derived member data immediately when a member leaves.
      this.generation = '';
      this.cache.clear();
      this.refresh();
    });
    this.queue = run.catch(() => {});
    return run;
  }

  refresh() {
    const generation = ['users', 'games', 'ratings', 'checkins'].map(key => this.db[key].revision).join(':');
    if (generation === this.generation) return;
    this.profiles.clear(); this.inverted.clear(); this.popularity.clear(); this.cache.clear();
    const games = new Map(this.db.games.all().filter(g => /^(?:(?:cn|vn|bg)?[1-9]\d{0,8})$/.test(String(g.gid))).map(g => [g.id, g]));
    this.games = games;
    for (const user of this.db.users.all()) if (this.enabled(user)) this.profiles.set(user.id, { userId: user.id, records: new Map(), weight: 0 });
    // Keep the latest duplicate, like the public collection; never count an
    // imported/repeated entry as a second piece of matching evidence.
    for (const [kind, collection] of [['rating', this.db.ratings], ['checkin', this.db.checkins]]) {
      for (const item of collection.all()) {
        const profile = this.profiles.get(item.userId);
        if (!profile || !games.has(item.gameId)) continue;
        let row = profile.records.get(item.gameId);
        if (!row) { row = { gameId: item.gameId }; profile.records.set(item.gameId, row); }
        const at = item.updatedAt || item.createdAt || '';
        if (!row[kind] || at >= (row[kind].updatedAt || row[kind].createdAt || '')) row[kind] = item;
      }
    }
    for (const profile of this.profiles.values()) {
      for (const [gameId, row] of profile.records) {
        const raw = row.rating?.score;
        row.score = Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : null;
        row.status = row.checkin?.status || '';
        row.liked = row.score >= 8;
        row.played = ['done', 'doing'].includes(row.status);
        // A low score or dropped status is not evidence of liking a game.
        row.weight = row.liked ? 0.7 + (row.score - 8) * 0.15 : row.score === 7 ? 0.25 : row.score === null && row.played ? 0.1 : 0;
        if (!row.score && !row.played) { profile.records.delete(gameId); continue; }
        if (!this.inverted.has(gameId)) this.inverted.set(gameId, new Set());
        this.inverted.get(gameId).add(profile.userId);
        if (row.weight > 0) this.popularity.set(gameId, (this.popularity.get(gameId) || 0) + 1);
        delete row.rating; delete row.checkin;
      }
    }
    for (const profile of this.profiles.values()) for (const row of profile.records.values()) profile.weight += row.weight * this.rarity(row.gameId);
    this.generation = generation;
    this.builds++;
  }

  rarity(gameId) { return 1 + Math.log2(1 + this.profiles.size / (1 + (this.popularity.get(gameId) || 0))); }

  compare(first, second) {
    this.comparisons++;
    const shared = [];
    let intersection = 0, affinity = 0, ratedWeight = 0, commonLiked = 0, commonPlayed = 0, rated = 0, close = 0;
    for (const a of first.records.values()) {
      const b = second.records.get(a.gameId);
      if (!b) continue;
      const weight = this.rarity(a.gameId);
      intersection += Math.min(a.weight, b.weight) * weight;
      const bothLiked = a.liked && b.liked, bothPlayed = a.played && b.played;
      if (bothLiked) commonLiked++;
      if (bothPlayed) commonPlayed++;
      if (a.score !== null && b.score !== null) {
        rated++; ratedWeight += weight;
        affinity += Math.max(0, 1 - Math.abs(a.score - b.score) / 5) * weight;
        if (Math.abs(a.score - b.score) <= 1) close++;
      }
      shared.push({ gameId: a.gameId, myScore: a.score, theirScore: b.score, myStatus: a.status, theirStatus: b.status, bothLiked, bothPlayed });
    }
    if (!commonLiked && !(commonPlayed >= 3 && close >= 2)) return null;
    const union = first.weight + second.weight - intersection;
    const likeness = union ? intersection / union : 0;
    const agreement = ratedWeight ? affinity / ratedWeight : 0;
    const evidence = commonLiked + Math.min(commonPlayed, 10) * 0.25 + Math.min(rated, 10) * 0.25;
    const score = (0.65 * likeness + 0.35 * agreement * rated / (rated + 3)) * evidence / (evidence + 3);
    const label = commonLiked >= 3 && rated >= 3 && agreement >= 0.75 ? '偏好接近' : commonLiked >= 2 || commonPlayed >= 3 && rated >= 3 ? '值得认识' : '初步推荐';
    shared.sort((a, b) => Number(b.bothLiked) - Number(a.bothLiked) || Number(b.bothPlayed) - Number(a.bothPlayed) || a.gameId.localeCompare(b.gameId));
    return { userId: second.userId, score, label, commonLiked, commonPlayed, rated, close, sharedCount: shared.length, shared };
  }

  view(userId) {
    if (!this.enabled(this.db.users.get(userId))) return { enabled: false, recordCount: 0, participants: 0, matches: [] };
    this.refresh();
    const profile = this.profiles.get(userId);
    const info = { enabled: Boolean(profile), recordCount: profile?.records.size || 0, participants: this.profiles.size };
    if (!profile) return { ...info, matches: [] };
    const now = this.clock(), cached = this.cache.get(userId);
    if (cached && cached.expires > now) { this.cache.delete(userId); this.cache.set(userId, cached); return { ...info, matches: cached.matches }; }
    // Only compare people sharing a scored/played work, never all user pairs.
    const candidates = new Set();
    for (const gameId of profile.records.keys()) for (const id of this.inverted.get(gameId) || []) if (id !== userId) candidates.add(id);
    const matches = [...candidates].map(id => this.compare(profile, this.profiles.get(id))).filter(Boolean)
      .sort((a, b) => b.score - a.score || b.commonLiked - a.commonLiked || a.userId.localeCompare(b.userId)).slice(0, 5)
      .map(match => ({ ...match, shared: match.shared.slice(0, 3) }));
    this.cache.set(userId, { expires: now + this.ttl, matches });
    if (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
    return { ...info, matches };
  }

  detail(userId, otherId) {
    this.refresh();
    const a = this.profiles.get(userId), b = this.profiles.get(otherId);
    return a && b && userId !== otherId ? this.compare(a, b) : null;
  }
}
