import { isSuperAdmin } from './site-content.js';

export const ROUND_NAMES = ['32 进 16', '16 进 8', '八强赛', '半决赛', '决赛'];
const copy = value => structuredClone(value);
const text = (value, max, label) => {
  const s = String(value || '').trim();
  if ([...s].length > max) throw new Error(`${label}最多 ${max} 字`);
  return s;
};
export function imageUrl(value) {
  const s = text(value, 1000, '图片地址');
  if (!s) return '';
  if (/^\/img\/[A-Za-z0-9_./%-]+$/.test(s) && !s.includes('..')) return s;
  try { const u = new URL(s); if (u.protocol === 'https:' && !u.username && !u.password) return u.href; } catch {}
  throw new Error('角色图片请使用 HTTPS 图片地址或本站 /img/ 路径');
}
function instant(value) {
  if (!value) return null;
  // Administrator datetime fields use the site's China/Hong Kong time zone.
  const raw = /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) ? value + ':00+08:00' : value;
  const stamp = Date.parse(raw);
  if (!Number.isFinite(stamp)) throw new Error('赛程时间格式不正确');
  return new Date(stamp).toISOString();
}
export function blankBattle() {
  return {
    id: 'main', title: '视觉小说社区 · 群友萌战', subtitle: '下一次心动，为她而来。', published: false, publicVisible: false,
    characters: Array.from({ length: 32 }, (_, i) => ({ id: `c${i + 1}`, name: '', work: '', image: '', intro: '' })),
    rounds: ROUND_NAMES.map((name, i) => ({ id: i + 1, name, start: null, end: null, settledAt: null, winners: [] })),
  };
}

export class Battle {
  constructor(db, { clock = Date.now } = {}) { this.db = db; this.clock = clock; this.queue = Promise.resolve(); }
  serial(fn) { const run = this.queue.then(fn); this.queue = run.catch(() => {}); return run; }
  event() { return this.db.battles.get('main') || blankBattle(); }
  canView(user) { return this.event().publicVisible === true || isSuperAdmin(user); }
  setVisibility(user, visible) {
    if (!isSuperAdmin(user)) throw Object.assign(new Error('只有超级管理员可以开关萌战入口'), { status: 403 });
    if (visible !== '0' && visible !== '1') throw new Error('请选择开启或关闭萌战入口');
    return this.serial(async () => {
      const event = copy(this.event());
      const before = event.publicVisible === true;
      event.publicVisible = visible === '1';
      await this.save(event);
      if (before !== event.publicVisible) await this.db.audit.insert({ userId: user.id, action: 'battle.visibility', key: 'battle.publicVisible', before, after: event.publicVisible });
    });
  }
  async save(event) {
    if (this.db.battles.get('main')) await this.db.battles.update('main', event);
    else await this.db.battles.insert(event);
  }
  matches(roundNumber, userId, at = this.clock()) {
    const e = this.event(); const round = e.rounds[roundNumber - 1];
    if (!round) return [];
    const previous = e.rounds[roundNumber - 2];
    const seeds = roundNumber === 1 ? e.characters.map(c => c.id) : previous?.settledAt ? previous.winners : [];
    return Array.from({ length: 16 / 2 ** (roundNumber - 1) }, (_, i) => {
      const id = `r${roundNumber}m${i + 1}`;
      const ids = seeds.slice(i * 2, i * 2 + 2);
      const characters = [0, 1].map(j => e.characters.find(c => c.id === ids[j]) || null);
      const votes = this.db.battleVotes.filter(v => v.matchId === id);
      const counts = characters.map(c => c ? votes.filter(v => v.characterId === c.id).length : 0);
      const winner = round.settledAt ? round.winners[i] : null;
      let status = !e.published ? 'draft' : round.settledAt ? 'settled' : !characters.every(c => c?.name) || !round.start || !round.end ? 'waiting' : at < Date.parse(round.start) ? 'scheduled' : at >= Date.parse(round.end) ? 'closed' : 'open';
      return { id, number: i + 1, round: roundNumber, characters, counts, total: votes.length, winner, status, start: round.start, end: round.end, voted: votes.find(v => v.userId === userId)?.characterId || null };
    });
  }
  view(userId) {
    const event = this.event();
    const rounds = event.rounds.map(r => ({ ...r, matches: this.matches(r.id, userId) }));
    const current = rounds.find(r => !r.settledAt) || rounds[4];
    const supporters = new Set(this.db.battleVotes.all().map(v => v.userId));
    const champion = rounds[4].settledAt ? event.characters.find(c => c.id === rounds[4].winners[0]) : null;
    return { event, rounds, current, champion, supporters: supporters.size, totalVotes: this.db.battleVotes.all().length };
  }
  configure(form) {
    return this.serial(async () => {
      const before = this.event(); const e = copy(before); const now = this.clock();
      e.title = text(form.title, 60, '活动名称') || before.title;
      e.subtitle = text(form.subtitle, 120, '活动介绍');
      const published = form.published === '1';
      const rosterLocked = before.published && before.rounds[0].start && now >= Date.parse(before.rounds[0].start);
      for (const c of e.characters) {
        const next = { ...c, name: text(form[`${c.id}_name`], 30, '角色名'), work: text(form[`${c.id}_work`], 80, '所属作品'), image: imageUrl(form[`${c.id}_image`]), intro: text(form[`${c.id}_intro`], 300, '角色介绍') };
        if (rosterLocked && (next.name !== c.name || next.work !== c.work)) throw new Error('首轮开始后，角色与配对已锁定；仍可更新图片与介绍');
        Object.assign(c, next);
      }
      for (let i = 0; i < 5; i++) {
        const r = e.rounds[i]; const old = before.rounds[i];
        r.start = instant(form[`r${i + 1}_start`]); r.end = instant(form[`r${i + 1}_end`]);
        if (Boolean(r.start) !== Boolean(r.end) || (r.start && Date.parse(r.start) >= Date.parse(r.end))) throw new Error(`${r.name}需要同时填写起止时间，截止时间须晚于开始时间`);
        if (before.published && old.start && now >= Date.parse(old.start) && (r.start !== old.start || r.end !== old.end)) throw new Error(`${r.name}已经开始，不能再修改时间`);
        if (r.start && (i > 0 && (!e.rounds[i - 1].end || Date.parse(r.start) < Date.parse(e.rounds[i - 1].end)))) throw new Error('下一轮开始时间不能早于上一轮截止时间');
      }
      if (published && (!e.characters.every(c => c.name && c.work) || !e.rounds[0].start)) throw new Error('开放活动前，请填写全部 32 位角色及所属作品，并设置首轮时间');
      if (!before.published && published && Date.parse(e.rounds[0].start) <= now) throw new Error('首次开放时，请把首轮开始时间设置在未来');
      if (rosterLocked && !published) throw new Error('投票开始后不能退回筹备状态');
      e.published = published;
      await this.save(e);
    });
  }
  vote(userId, form) {
    return this.serial(async () => {
      const round = Number(form.round); const m = this.matches(round, userId).find(m => m.id === form.matchId);
      if (!m || m.status !== 'open') throw new Error('这场对阵当前不能投票，请查看赛程与截止时间');
      if (!m.characters.some(c => c.id === form.characterId)) throw new Error('请选择这场对阵中的角色');
      const old = this.db.battleVotes.find(v => v.userId === userId && v.matchId === m.id);
      if (old) await this.db.battleVotes.update(old.id, { characterId: form.characterId });
      else await this.db.battleVotes.insert({ userId, matchId: m.id, characterId: form.characterId });
    });
  }
  settle(form) {
    return this.serial(async () => {
      const e = copy(this.event()); const n = Number(form.round); const r = e.rounds[n - 1];
      if (!r || r.settledAt || !e.published || !r.end || this.clock() < Date.parse(r.end)) throw new Error('只有已截止且未结算的轮次可以确认晋级');
      const matches = this.matches(n);
      if (!matches.every(m => m.characters.every(c => c?.name))) throw new Error('请先确认上一轮晋级结果');
      r.winners = matches.map(m => {
        if (m.counts[0] !== m.counts[1]) return m.characters[m.counts[0] > m.counts[1] ? 0 : 1].id;
        const choice = form[m.id];
        if (!m.characters.some(c => c.id === choice)) throw new Error(`${m.id} 票数持平，请按活动约定处理平票并选择晋级者`);
        return choice;
      });
      r.settledAt = new Date(this.clock()).toISOString(); await this.save(e);
    });
  }
  cheer(userId, form) {
    return this.serial(async () => {
      const c = this.event().characters.find(c => c.id === form.characterId && c.name);
      if (!c) throw new Error('这位角色尚未加入阵容');
      const content = text(form.content, 500, '应援留言');
      if ([...content].length < 2) throw new Error('应援留言请填写 2—500 字');
      const recent = this.db.battleCheers.filter(c => c.userId === userId).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (recent && this.clock() - Date.parse(recent.createdAt) < 30000) throw new Error('留言已收到，请等待 30 秒再发布');
      await this.db.battleCheers.insert({ userId, characterId: c.id, content, createdAt: new Date(this.clock()).toISOString() });
    });
  }
  removeCheer(user, id) {
    return this.serial(async () => {
      const item = this.db.battleCheers.get(id);
      if (!item || (item.userId !== user.id && !user.isAdmin)) throw new Error('不能删除这条留言');
      await this.db.battleCheers.remove(id);
    });
  }
  cheers(characterId, page = 1) {
    const all = this.db.battleCheers.filter(c => !characterId || c.characterId === characterId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    const pages = Math.max(1, Math.ceil(all.length / 12)); const p = Math.min(pages, Math.max(1, Number.parseInt(page) || 1));
    return { page: p, pages, total: all.length, rows: all.slice((p - 1) * 12, p * 12).map(c => ({ ...c, user: this.db.userById(c.userId), character: this.event().characters.find(char => char.id === c.characterId) })) };
  }
}
