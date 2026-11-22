import {readFileSync} from 'node:fs';
import {domesticIndex} from './domestic-works.js';
const fault=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=value=>typeof value==='string'?value.trim().slice(0,160):'';
const key=value=>clean(value).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'numeric'});
export function validBirthday(month,day){return Number.isInteger(month)&&Number.isInteger(day)&&month>=1&&month<=12&&day>=1&&day<=new Date(Date.UTC(2000,month,0)).getUTCDate();}
export function recordedBirthday(month,day){return Number.isInteger(month)&&Number.isInteger(day)&&month>=1&&month<=12&&day>=1&&day<=31;}
export function birthdayDate(date=new Date()){
  const parts=dateFormatter.formatToParts(date);
  const value=type=>Number(parts.find(p=>p.type===type).value);
  return{year:value('year'),month:value('month'),day:value('day')};
}
export function daysUntilBirthday(month,day,today){
  const start=Date.UTC(today.year,today.month-1,today.day);
  for(let year=today.year;year<=today.year+8;year++){
    const next=new Date(Date.UTC(year,month-1,day));
    if(next.getUTCMonth()===month-1&&next.getUTCDate()===day&&next.getTime()>=start)return Math.round((next.getTime()-start)/86400000);
  }
  return Infinity;
}
export function normalizeBirthdays(snapshot){
  if(snapshot?.version!==1||!Array.isArray(snapshot.characters)||snapshot.characters.length>50000)throw Error('角色生日快照格式错误');
  const seen=new Set();return snapshot.characters.flatMap(raw=>{
    if(!/^(?:vndb-c[1-9]\d{0,8}|cngal-[1-9]\d{0,9})$/.test(raw?.id||'')||seen.has(raw.id)||!clean(raw.name)||!recordedBirthday(raw.month,raw.day))return[];
    const works=(Array.isArray(raw.works)?raw.works:[]).flatMap(w=>{
      if(!clean(w?.name))return[];
      if(/^v[1-9]\d{0,8}$/.test(w.vndbId||''))return[{name:clean(w.name),vndbId:w.vndbId,source:'https://vndb.org/'+w.vndbId}];
      if(Number.isSafeInteger(w.cngalId)&&w.cngalId>0)return[{name:clean(w.name),cngalId:w.cngalId,source:'https://www.cngal.org/entries/index/'+w.cngalId}];
      return[];
    });
    seen.add(raw.id);const vn=raw.id.startsWith('vndb-');
    return[{id:raw.id,name:clean(raw.name),aliases:(Array.isArray(raw.aliases)?raw.aliases:[]).map(clean).filter(Boolean),month:raw.month,day:raw.day,calendarDate:validBirthday(raw.month,raw.day),image:/^\/img\/characters\/[a-f0-9]{20}\.webp$/.test(raw.image||'')?raw.image:'',provider:vn?'VNDB':'CnGal',source:vn?'https://vndb.org/'+raw.id.slice(5):'https://www.cngal.org/entries/index/'+raw.id.slice(6),works}];
  }).sort((a,b)=>a.month-b.month||a.day-b.day||a.name.localeCompare(b.name,'zh-CN'));
}
export class CharacterBirthdays{
  constructor(db,{snapshot,clock=()=>new Date()}={}){
    const data=snapshot||JSON.parse(readFileSync(new URL('../data/character-birthdays.json',import.meta.url),'utf8'));
    this.characters=normalizeBirthdays(data);this.byId=new Map(this.characters.map(c=>[c.id,c]));this.db=db;this.clock=clock;this.queue=Promise.resolve();this.syncedAt=data.syncedAt||'';
    this.byMonth=new Map();this.byDate=new Map();this.searchKeys=new Map();
    for(const character of this.characters){
      if(!this.byMonth.has(character.month))this.byMonth.set(character.month,[]);this.byMonth.get(character.month).push(character);
      const date=character.month+'/'+character.day;if(!this.byDate.has(date))this.byDate.set(date,[]);this.byDate.get(date).push(character);
      this.searchKeys.set(character.id,[character.name,...character.aliases,...character.works.map(w=>w.name)].map(key).join('\0'));
    }
    this.monthCounts=Array.from({length:12},(_,i)=>this.byMonth.get(i+1)?.length||0);this.calendarCache=null;
    // Exact curated VNDB mappings. Do not pick an arbitrary chapter when a
    // source combines several site entries, or guess from similar titles.
    const media=JSON.parse(readFileSync(new URL('../data/work-media-seed.json',import.meta.url),'utf8'));
    this.vnGids=new Map();for(const[gid,vn]of Object.entries(media.games)){const list=this.vnGids.get(vn)||[];list.push(Number(gid));this.vnGids.set(vn,list);}
  }
  followed(userId){return new Set(userId&&this.db.users.get(userId)?this.db.characterFollows.filter(r=>r.userId===userId&&this.byId.has(r.characterId)).map(r=>r.characterId):[]);}
  workLinks(character){return character.works.map(work=>{
    const domestic=domesticIndex.match({cngalId:work.cngalId,vndbId:work.vndbId});
    if(domestic)return {...work,href:'/game/'+(this.db.gameByGid(domestic.gid)?.gid||domestic.gid)};
    let candidates=[];if(work.vndbId){candidates=(this.vnGids.get(work.vndbId)||[]).map(gid=>this.db.gameByGid(gid)).filter(Boolean);}
    if(!candidates.length){const name=key(work.name);candidates=this.db.games.filter(g=>[g.name,g.chineseName,...(g.extensionName||[]).map(n=>n.name)].some(n=>key(n)===name));}
    return{...work,href:candidates.length===1?'/game/'+candidates[0].gid:'/games?scope=all&q='+encodeURIComponent(work.name)};
  });}
  next(userId,limit=4,{unique=true}={}){
    const today=birthdayDate(this.clock()),followed=this.followed(userId);
    const dateKey=today.year+'/'+today.month+'/'+today.day;
    if(this.calendarCache?.key!==dateKey)this.calendarCache={key:dateKey,groups:[...this.byDate.values()].map(rows=>({rows,days:daysUntilBirthday(rows[0].month,rows[0].day,today)})).filter(group=>Number.isFinite(group.days)).sort((a,b)=>a.days-b.days)};
    // Compact birthday reminders show a name once; keep distinct source
    // records and favorites intact for characters with different VN versions.
    const seen=new Set(),result=[];
    for(const group of this.calendarCache.groups){
      const ordered=followed.size?[...group.rows.filter(c=>followed.has(c.id)),...group.rows.filter(c=>!followed.has(c.id))]:group.rows;
      for(const character of ordered){const id=key(character.name)+'|'+character.month+'|'+character.day;if(unique&&seen.has(id))continue;seen.add(id);result.push({...character,days:group.days,followed:followed.has(character.id)});if(result.length>=limit)return result;}
    }
    return result;
  }
  favorites(userId){const today=birthdayDate(this.clock());return [...this.followed(userId)].map(id=>this.byId.get(id)).map(c=>({...c,days:daysUntilBirthday(c.month,c.day,today),followed:true})).sort((a,b)=>a.days-b.days||a.name.localeCompare(b.name,'zh-CN'));}
  view(params=new URLSearchParams(),userId){
    const today=birthdayDate(this.clock()),followed=this.followed(userId),q=clean(params.get('q')),wanted=params.get('month');
    const month=/^(?:0|[1-9]|1[0-2])$/.test(wanted||'')?Number(wanted):(q||params.get('mine')==='1'?0:today.month);
    const day=/^\d{1,2}$/.test(params.get('day')||'')&&recordedBirthday(month,Number(params.get('day')))&&(validBirthday(month,Number(params.get('day')))||this.byDate.has(month+'/'+Number(params.get('day'))))?Number(params.get('day')):0;
    const provider=['VNDB','CnGal'].includes(params.get('source'))?params.get('source'):'';
    const mine=params.get('mine')==='1'&&Boolean(userId),needle=key(q);
    const pool=mine?[...followed].map(id=>this.byId.get(id)):month&&!needle?(this.byMonth.get(month)||[]):this.characters;
    const rows=pool.filter(c=>(!provider||c.provider===provider)&&(!needle||this.searchKeys.get(c.id).includes(needle)));
    const monthly=rows.filter(c=>!month||c.month===month),matched=monthly.filter(c=>!day||c.day===day),pages=Math.max(1,Math.ceil(matched.length/18));
    const page=Math.min(pages,Math.max(1,Number.parseInt(params.get('page'),10)||1));
    return{today,month,day,q,provider,mine,followed,total:this.characters.length,followCount:followed.size,monthly,matchedCount:matched.length,pages,page,rows:matched.slice((page-1)*18,page*18).map(c=>({...c,works:this.workLinks(c),followed:followed.has(c.id),days:daysUntilBirthday(c.month,c.day,today)})),upcoming:this.next(userId),syncedAt:this.syncedAt};
  }
  async save(user,form){
    if(!user||!this.db.users.get(user.id))throw fault('请先登录，再收藏角色',401);
    if(!this.byId.has(form.characterId))throw fault('生日簿中没有这位角色',404);
    if(!['0','1'].includes(form.selected))throw fault('请选择有效的收藏状态');
    const run=this.queue.then(async()=>{
      const selected=form.selected==='1',old=this.db.characterFollows.find(r=>r.userId===user.id&&r.characterId===form.characterId);
      if(selected&&!old&&this.followed(user.id).size>=200)throw fault('最多收藏 200 位角色');
      const before=structuredClone(this.db.characterFollows.items);
      try{if(selected&&!old)await this.db.characterFollows.insert({userId:user.id,characterId:form.characterId});if(!selected&&old)await this.db.characterFollows.remove(old.id);}catch(error){this.db.characterFollows.items=before;throw error;}
      return{characterId:form.characterId,selected,count:this.followed(user.id).size};
    });this.queue=run.catch(()=>{});return run;
  }
}
