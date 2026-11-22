import { esc } from './utils.js';
import { annualCollection } from './annual-collection.js';
import { recordsFor } from './records.js';
export const LEVELS = [
  { level:1, xp:0, name:'初见故事' }, { level:2, xp:60, name:'翻开新页' },
  { level:3, xp:180, name:'故事同行' }, { level:4, xp:420, name:'留下回声' },
  { level:5, xp:900, name:'收藏星光' }, { level:6, xp:1800, name:'故事守望' },
];
export const memberDay = (at=Date.now()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
export function levelFor(xp) {
  const earned = Math.max(0, Number(xp) || 0);
  const current = LEVELS.findLast(l=>earned>=l.xp);
  const next = LEVELS[current.level] || null;
  return { ...current, earned, next, percent:next ? Math.min(100,Math.round((earned-current.xp)/(next.xp-current.xp)*100)) : 100 };
}
export function levelBadge(progress) {
  const l = levelFor(progress?.xp || 0);
  return `<span class="ml-level ml-level-${l.level}" title="${l.name} · ${l.earned} EXP">LV${l.level}</span>`;
}
export class MemberLevels {
  constructor(db,{clock=Date.now}={}) { this.db=db; this.clock=clock; this.queue=Promise.resolve(); }
  state(userId) { return this.db.memberLevels.find(x=>x.userId===userId); }
  credits(userId) {
    const marks = new Map();
    for (const c of this.db.checkins.filter(x=>x.userId===userId)) {
      if (['wish','doing','done','dropped'].includes(c.status)) marks.set('mark:'+c.gameId,5);
      if (c.status==='done') marks.set('done:'+c.gameId,10);
    }
    for (const r of this.db.ratings.filter(x=>x.userId===userId)) marks.set('rate:'+r.gameId,5);
    for (const r of this.db.reviews.filter(x=>x.userId===userId && String(x.content||'').trim().length>=20)) marks.set('review:'+r.gameId,20);
    return marks;
  }
  view(userId) {
    const state=this.state(userId); const claimed=new Set(state?.claimed || []);
    const extra=[...this.credits(userId)].filter(([key])=>!claimed.has(key)).reduce((sum,[,xp])=>sum+xp,0);
    const annual=annualCollection(recordsFor(this.db,userId));
    return { xp:(state?.xp || 0)+extra, signedToday:state?.lastSignDay===memberDay(this.clock()), signDays:state?.signDays || 0,annual:{...annual,earned:annual.count===12 || Boolean(state?.badges?.includes('twelve-2025'))} };
  }
  sync(userId, sign=false) {
    const run=this.queue.then(async()=>{
      if (!this.db.users.get(userId)) throw new Error('请先登录');
      const state=this.state(userId); const claimed=new Set(state?.claimed || []);
      let gain=0;
      for (const [key,xp] of this.credits(userId)) if (!claimed.has(key)) {claimed.add(key);gain+=xp;}
      const today=memberDay(this.clock()); const signed=sign && state?.lastSignDay!==today;
      const badges=new Set(state?.badges || []);
      const earnedAnnual=this.view(userId).annual.count===12 && !badges.has('twelve-2025');
      if(earnedAnnual) badges.add('twelve-2025');
      if (signed) gain+=10;
      if (gain || !state || earnedAnnual) {
        const patch={userId,xp:(state?.xp || 0)+gain,claimed:[...claimed],badges:[...badges],lastSignDay:signed ? today : state?.lastSignDay || '',signDays:(state?.signDays || 0)+(signed ? 1 : 0)};
        // One persistent ledger per account; repeat edits and re-created records
        // cannot award a game twice. A failed write restores in-memory state.
        const before=structuredClone(this.db.memberLevels.items);
        try { if(state) await this.db.memberLevels.update(state.id,patch); else await this.db.memberLevels.insert(patch); }
        catch(error) {this.db.memberLevels.items=before;throw error;}
      }
      return { ...this.view(userId), signed, gain };
    });
    this.queue=run.catch(()=>{}); return run;
  }
}
export function levelPanel(progress) {
  const l=levelFor(progress?.xp || 0);
  return `<section class="ml-panel" aria-label="我的等级与每日签到"><div class="ml-heading">${levelBadge(progress)}<div><strong>${l.name}</strong><small>${l.earned} EXP${l.next ? ` · 距 LV${l.next.level} 还需 ${l.next.xp-l.earned}` : ' · 已达最高等级'}</small></div><form method="post" action="/api/member/sign-in"><input type="hidden" name="redirect" value="/me"><button type="submit" ${progress?.signedToday ? 'disabled' : ''}>${progress?.signedToday ? '✓ 今日已签到' : '每日签到 ＋10 EXP'}</button></form></div><div class="ml-track" role="progressbar" aria-label="等级进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${l.percent}"><i style="width:${l.percent}%"></i></div><details><summary>经验规则与等级说明 ↓</summary><p>每天签到 +10；每部作品首次打卡 +5、首次标记玩过 +10、首次评分 +5、首次写满 20 字评价 +20。已有记录也会计入；重复修改、删除后重建不重复加分。签到按北京时间每天重置。</p><div class="ml-ladder">${LEVELS.map(x=>`<span>${levelBadge({xp:x.xp})}<small>${x.xp} EXP</small></span>`).join('')}</div><p>经验是留下故事的纪念，不影响权限，也不要求连续签到。</p></details></section>`;
}
export function annualBadgePanel(progress,owner=false) {
  const a=progress?.annual;
  if(!a) return '';
  return `<section class="ml-annual-badge ${a.earned ? 'is-earned' : ''}" aria-label="十二江器收集徽章"><div class="ml-annual-heading"><span class="ml-twelve-mark"><img src="/img/badges/twelve-2025.webp" width="64" height="64" alt="视觉小说社区 Galgame 交流会群徽" loading="lazy">${a.earned ? '<b class="ml-badge-check" aria-hidden="true">✓</b>' : ''}</span><div><strong class="ml-annual-title"><span>十二江器</span><span>全收集</span></strong><span class="ml-annual-state">${a.earned ? '已获得' : '待点亮'}</span></div></div><p class="ml-annual-progress">${a.earned ? '<span class="ml-annual-count">2025 全收集纪念</span><span class="ml-annual-rule">十二席完整纪念已达成，徽章永久保留。</span>' : `<span class="ml-annual-count">${a.count} / 12 席完整纪念</span><span class="ml-annual-rule">留下游玩、评分与评价，点亮这枚群徽。</span>`}</p><details><summary>查看作品清单 ↓</summary><div class="ml-twelve-list">${a.items.map(w=>`<a href="${w.gid ? '/game/'+w.gid : '/games?q='+encodeURIComponent('兰斯')}"><span>${w.complete ? '✓' : '○'}</span><span class="ml-twelve-name">${esc(w.name)}${w.series ? '<small>任意一部完整纪念即可</small>' : ''}</span></a>`).join('')}</div><p>按专题的 12 席分别核对；获得后永久保留。</p></details><a class="ml-annual-link" href="/annual/2025">年度名单 ↗</a></section>`;
}
