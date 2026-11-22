import {randomBytes} from 'node:crypto';import {saveRecord} from './records.js';import {boundedText} from './external-response.js';
import {workKey} from './work-key.js';
const fault=(text,status=400)=>Object.assign(new Error(text),{status,publicMessage:text});
const key=name=>String(name||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
export function bangumiUsername(value){let name=String(value||'').trim();if(name.includes('://')){let u;try{u=new URL(name);}catch{throw fault('请输入 Bangumi 用户名或个人主页链接');}if(u.protocol!=='https:'||!['bgm.tv','bangumi.tv','chii.in'].includes(u.hostname)||u.username||u.password||u.port||!/^\/user\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname))throw fault('只支持 Bangumi 官方个人主页链接');name=u.pathname.split('/')[2];}if(!/^[a-zA-Z0-9_-]{1,40}$/.test(name)||name==='-')throw fault('请输入有效的 Bangumi 用户名');return name;}
export function normalizeBangumiRows(rows){if(!Array.isArray(rows))throw fault('Bangumi 返回格式发生变化',503);const seen=new Set();return rows.slice(0,200).flatMap(r=>{if(!r||r.subject_type!==4||r.private!==false||!Number.isSafeInteger(r.subject_id)||r.subject_id<1||r.subject?.id!==r.subject_id||!r.subject.name||seen.has(r.subject_id)||![1,2,3,4,5].includes(r.type))return [];seen.add(r.subject_id);return [{id:r.subject_id,name:String(r.subject.name).slice(0,200),nameCn:String(r.subject.name_cn||'').slice(0,200),status:({1:'wish',2:'done',3:'doing',5:'dropped'})[r.type]||'',sourceStatus:r.type,score:Number.isInteger(r.rate)&&r.rate>=1&&r.rate<=10?r.rate:null,comment:typeof r.comment==='string'?r.comment.replace(/\r\n/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,2001):''}];});}
export class BangumiImport{
  constructor(db,{enabled=false,fetcher=fetch,clock=()=>Date.now()}={}){this.db=db;this.enabled=enabled;this.fetcher=fetcher;this.clock=clock;this.stages=new Map();this.cache=new Map();this.pending=new Map();}
  matches(row){const games=this.db.games.all();for(const title of [row.name,row.nameCn].filter(Boolean)){const hits=games.filter(g=>[g.name,g.chineseName].some(n=>key(n)===key(title)));if(hits.length)return {games:hits,kind:'exact'};}const names=[row.name,row.nameCn].map(key).filter(Boolean),aliases=games.filter(g=>(g.extensionName||[]).some(n=>names.includes(key(n.name))));return {games:aliases,kind:'alias'};}
  async readPage(url,deadline){
    for(let attempt=0;attempt<2;attempt++){
      const remaining=deadline-Date.now();if(remaining<=0)throw fault('Bangumi 连接超时，请稍后重新读取；已有记录不受影响',503);
      try{
        const res=await this.fetcher(url,{headers:{Accept:'application/json','User-Agent':'KaetoSite/1.1 (https://github.com/meguru296/kaeto-community; public collection import)'},redirect:'error',signal:AbortSignal.timeout(Math.min(8000,remaining))});
        if(!res.ok){
          if(res.status>=500&&attempt===0){await res.body?.cancel();await new Promise(r=>setTimeout(r,300));continue;}
          await res.body?.cancel();throw fault(res.status===404?'没有找到这个 Bangumi 账号':res.status===429?'Bangumi 请求过于频繁，请稍后再试':'Bangumi 公开记录暂时不可用，请稍后重新读取',res.status===404?404:res.status===429?429:503);
        }
        let data;try{data=JSON.parse(await boundedText(res,1024*1024));}catch(error){if(error instanceof SyntaxError||error.message==='外部响应过大')throw fault('Bangumi 返回格式发生变化，请稍后重试',503);throw error;}
        if(!Array.isArray(data.data)||!Number.isSafeInteger(data.total)||data.total<0)throw fault('Bangumi 返回格式发生变化',503);
        return data;
      }catch(error){
        if(error.publicMessage)throw error;
        if(attempt===1||Date.now()>=deadline)throw fault('Bangumi 暂时无法连接，请稍后重新读取；已有记录不受影响',503);
        await new Promise(r=>setTimeout(r,300));
      }
    }
  }
  async fetchBatch(username,offset){
    const cacheKey=username+'|'+offset,cached=this.cache.get(cacheKey);if(cached&&cached.until>this.clock())return structuredClone(cached.data);if(this.pending.has(cacheKey))return this.pending.get(cacheKey);
    if(this.pending.size>=2)throw fault('正在读取其他成员的记录，请稍后重试',429);
    const run=(async()=>{let rows=[],total=0;const deadline=Date.now()+20000;for(let page=0;page<4;page++){
      const u=new URL('https://api.bgm.tv/v0/users/'+encodeURIComponent(username)+'/collections');u.search=new URLSearchParams({subject_type:4,limit:50,offset:offset+page*50});
      const data=await this.readPage(u.href,deadline);total=data.total;rows.push(...data.data);if(data.data.length<50||offset+(page+1)*50>=total)break;await new Promise(r=>setTimeout(r,300));
    }const data={rows:normalizeBangumiRows(rows),total,offset,nextOffset:offset+rows.length};this.cache.set(cacheKey,{until:this.clock()+300000,data});while(this.cache.size>10)this.cache.delete(this.cache.keys().next().value);return structuredClone(data);})();this.pending.set(cacheKey,run);try{return await run;}finally{this.pending.delete(cacheKey);}
  }
  async prepare(user,sessionId,{username,offset='0'}){
    if(!this.enabled)throw fault('记录导入暂未开放',404);if(!user||!sessionId)throw fault('请先登录',401);const name=bangumiUsername(username),start=Number(offset);if(!Number.isInteger(start)||start<0||start>20000)throw fault('读取位置不合法');
    const data=await this.fetchBatch(name,start);for(const[k,s]of this.stages)if(s.until<=this.clock()||s.userId===user.id)this.stages.delete(k);if(this.stages.size>=20)throw fault('导入预览暂时繁忙，请稍后重试',429);
    let selected=0;const rows=data.rows.map(row=>{const match=this.matches(row),game=match.games.length===1?match.games[0]:null,existing=game?{status:Boolean(this.db.checkinsForUser(user.id,game.id)[0]),score:Boolean(this.db.ratingFor(user.id,game.id)),comment:Boolean(this.db.reviewForUser(user.id,game.id))}:{};const ready=game&&match.kind==='exact'&&((row.status&&!existing.status)||(row.score&&!existing.score));return {...row,gid:game?.gid||'',matchKind:match.kind,ambiguous:match.games.length>1,existing,selected:Boolean(ready&&selected++<25)};});
    const token=randomBytes(24).toString('hex'),stage={...data,rows,username:name,userId:user.id,sessionId,token,until:this.clock()+900000};this.stages.set(token,stage);return stage;
  }
  stage(user,sessionId,token){const s=this.stages.get(token);if(!user||!s||s.userId!==user.id||s.sessionId!==sessionId||s.until<=this.clock())throw fault('导入预览已过期，请重新读取',403);return s;}
  async apply(user,sessionId,form){
    if(!this.enabled)throw fault('记录导入暂未开放',404);const s=this.stage(user,sessionId,form.token);if(s.result)return s.result;if(form.ownRecords!=='1')throw fault('请确认这些是你自己的记录');
    const selected=s.rows.filter(r=>form['select_'+r.id]==='1');if(!selected.length||selected.length>25)throw fault('每次请选择 1—25 部作品');
    const seen=new Set(),plans=selected.map(row=>{const gid=workKey(form['gid_'+row.id]),game=this.db.gameByGid(gid),status=form['status_'+row.id]??row.status;if(!game||!gid)throw fault('请为所选条目关联本站已有作品');if(seen.has(game.id))throw fault('多条记录指向同一作品，请保留一条');seen.add(game.id);if(!['','wish','doing','done','dropped'].includes(status))throw fault('游玩状态不合法');return {row,game,status};});
    let imported=0,skipped=0,failed=0;for(const{row,game,status}of plans){
      const patch={};if(form.useStatus==='1'&&status&&!this.db.checkinsForUser(user.id,game.id)[0])patch.status=status;if(form.useScore==='1'&&row.score&&!this.db.ratingFor(user.id,game.id))patch.score=String(row.score);if(form.useComments==='1'&&row.comment.length>=2&&row.comment.length<=2000&&!this.db.reviewForUser(user.id,game.id))patch.content=row.comment;
      if(!Object.keys(patch).length){skipped++;continue;}
      try{if(await saveRecord(this.db,user.id,game.id,patch))imported++;else skipped++;}catch{failed++;break;}
    }
    s.result={imported,skipped,failed,remaining:plans.length-imported-skipped-failed,username:s.username};return s.result;
  }
}
