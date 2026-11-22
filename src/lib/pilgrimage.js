import { nowIso, str } from './utils.js';

const fault=(message,status=400)=>Object.assign(new Error(message),{status});
export function validPilgrimageGeo(geo){return Array.isArray(geo)&&geo.length===2&&geo.every(Number.isFinite)&&Math.abs(geo[0])<=90&&Math.abs(geo[1])<=180?geo:null;}
// Offline import only: schema documented by Anitabi's official native client.
// The static index is not a promised stable API; retain a dated snapshot and validate every tuple.
export function pilgrimageIndex(snapshot){
  if(!Array.isArray(snapshot?.[0]))throw fault('巡礼索引格式不匹配');
  return snapshot[0].slice(0,3000).filter(r=>Array.isArray(r)&&Number.isSafeInteger(r[0])&&r[0]>0).map(r=>{
    const coordinates=new Map(),flat=Array.isArray(r[12])?r[12]:[];
    for(let i=0;i+3<Math.min(flat.length,80000);i+=4){const geo=validPilgrimageGeo([flat[i+1],flat[i+2]]);if(geo&&typeof flat[i]==='string')coordinates.set(flat[i],geo);}
    return{subjectId:r[0],cn:str(r[1],120),title:str(r[3],120),city:typeof r[4]==='string'?str(r[4],80):'',kind:str(r[8],20),cover:typeof r[6]==='string'?str(r[6],500):'',coordinates};
  });
}
export function pilgrimageSnapshotPoints(raw){
  if(!Array.isArray(raw))return [];
  return raw.slice(0,10000).filter(p=>Array.isArray(p)&&!p[3]&&typeof p[1]==='string'&&p[1].trim()&&typeof p[6]==='string'&&p[6].startsWith('/')).map(p=>({id:p[0],name:p[1],image:'https://image.anitabi.cn'+p[6].replace(/^\/images/,''),ep:p[8],s:p[9],origin:typeof p[11]==='string'&&p[11]?p[11]:'Anitabi'+(Number.isSafeInteger(p[5])&&p[5]>0?' 投稿者 #'+p[5]:''),originURL:typeof p[12]==='string'?p[12]:''}));
}
export function safePilgrimageURL(value,image=false){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return '';if(image&&u.hostname!=='image.anitabi.cn')return '';return u.href;}catch{return '';}
}
export function normalizePilgrimageBook(mapping,lite,details,{fetchedAt=nowIso()}={}){
  const subjectId=Number(mapping.subjectId),gid=Number(mapping.gid);
  if(!Number.isSafeInteger(subjectId)||subjectId<1||(mapping.gid!=null&&(!Number.isSafeInteger(gid)||gid<1))||Number(lite?.id)!==subjectId)throw fault('巡礼作品关联不匹配');
  const names=new Set(),ids=new Set();const litePoints=new Map((lite.litePoints||[]).map(p=>[p.id,p]));const points=[];
  for(const raw of (Array.isArray(details)&&details.length?details:lite.litePoints||[])){
    const p={...litePoints.get(raw.id),...raw},id=String(p.id||''),name=str(p.cn||p.name,120),image=safePilgrimageURL(p.image,true);
    const locationKey=String(p.name||p.cn||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
    if(!/^[a-z0-9_-]{1,80}$/i.test(id)||!name||!image||names.has(locationKey)||ids.has(id))continue;
    const u=new URL(image);u.searchParams.set('plan','h360');
    const geo=validPilgrimageGeo(p.geo)||validPilgrimageGeo(mapping.coordinates?.get(id));
    points.push({id,name,originalName:str(p.name,120),image:u.href,geo,episode:str(p.ep,20),second:Number.isFinite(p.s)?p.s:null,origin:str(p.origin||'Anitabi',100),originURL:safePilgrimageURL(p.originURL),mapURL:`https://anitabi.cn/map?bangumiId=${subjectId}&pid=${encodeURIComponent(id)}`});
    names.add(locationKey);ids.add(id);if(points.length>=12)break;
  }
  const cover=safePilgrimageURL(lite.cover);const allowedCover=cover&&['image.anitabi.cn','bgm-api.anitabi.cn','lain.bgm.tv'].includes(new URL(cover).hostname)?cover:'';
  return {gid:mapping.gid==null?null:gid,subjectId,name:str(mapping.name||lite.cn||lite.title,120),subjectTitle:str(mapping.originalTitle||lite.cn||lite.title,120),kind:str(mapping.kind||'TV',20),edition:str(mapping.edition||'动画版取景资料',80),city:str(lite.city||'地点资料',80),cover:allowedCover,total:Number.isFinite(lite.pointsLength)?lite.pointsLength:points.length,imageTotal:Number.isFinite(lite.imagesLength)?lite.imagesLength:points.length,fetchedAt,points,mapURL:`https://anitabi.cn/map?bangumiId=${subjectId}`,sourceURL:`https://bangumi.tv/subject/${subjectId}`};
}

// Explicit mappings are curated; no name-based guessing or requests on page views.
export class AnitabiClient{
  constructor({fetcher=fetch}={}){this.fetcher=fetcher;this.pending=new Map();}
  async json(id,endpoint){
    const res=await this.fetcher(`https://api.anitabi.cn/bangumi/${id}/${endpoint}`,{signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!res.ok)throw fault('巡礼资料暂时不可用',503);
    const reader=res.body.getReader(),chunks=[];let size=0;
    try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>3*1024*1024){await reader.cancel();throw fault('巡礼资料过大',503);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
    return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
  }
  book(mapping){
    const id=Number(mapping.subjectId);if(!Number.isSafeInteger(id)||id<1)return Promise.reject(fault('无效的作品编号'));
    const key=`${mapping.gid}:${id}`;if(this.pending.has(key))return this.pending.get(key);
    const run=(async()=>{const lite=await this.json(id,'lite');const details=await this.json(id,'points/detail?haveImage=true').catch(()=>null);return normalizePilgrimageBook(mapping,lite,details);})();
    this.pending.set(key,run);run.finally(()=>this.pending.delete(key)).catch(()=>{});return run;
  }
}

export class Pilgrimage{
  constructor(db,{enabled=false,catalog=[],preview=false,featured=[363957,234]}={}){this.db=db;this.enabled=enabled===true;this.preview=preview===true;this.books=catalog.filter(b=>(b.gid==null||Number.isSafeInteger(b.gid))&&Number.isSafeInteger(b.subjectId)&&Array.isArray(b.points)&&b.points.length).slice(0,180);this.featured=this.books.filter(b=>featured.includes(b.subjectId));this.queue=Promise.resolve();}
  book(gid){return this.enabled?this.books.find(b=>b.gid===Number(gid))||null:null;}
  record(userId,subjectId,pointId){return userId?this.db.pilgrimageMarks.find(r=>r.userId===userId&&r.subjectId===subjectId&&r.pointId===pointId):null;}
  entries(userId){if(!userId)return[];const books=new Map(this.books.map(b=>[b.subjectId,b])),seen=new Set();return this.db.pilgrimageMarks.all().filter(r=>r.userId===userId&&['wish','visited'].includes(r.status)).flatMap(record=>{const book=books.get(record.subjectId),point=book?.points.find(p=>p.id===record.pointId),key=record.subjectId+'|'+record.pointId;if(!point||seen.has(key))return[];seen.add(key);return[{book,point,record}];});}
  summary(userId){const rows=this.entries(userId).map(e=>e.record);return{wish:rows.filter(r=>r.status==='wish').length,visited:rows.filter(r=>r.status==='visited').length,works:new Set(rows.filter(r=>r.status==='visited').map(r=>r.subjectId)).size};}
  recent(userId,limit=3){return this.entries(userId).sort((a,b)=>String(b.record.updatedAt||b.record.createdAt||'').localeCompare(String(a.record.updatedAt||a.record.createdAt||''))).slice(0,Math.max(0,Math.min(12,limit)));}
  async save(user,form){
    if(!this.enabled)throw fault('巡礼手账尚未开放',404);
    if(!user||!this.db.users.get(user.id))throw fault('请先登录，再留下足迹',401);
    const subjectId=Number(form.subjectId),pointId=String(form.pointId||'');
    const book=this.books.find(b=>b.subjectId===subjectId),point=book?.points.find(p=>p.id===pointId);
    if(!point)throw fault('这处地点尚未收录',404);
    const status=String(form.status||'');if(!['','wish','visited'].includes(status))throw fault('请选择想去或去过');
    const old=this.record(user.id,subjectId,pointId);
    const note=String(form.note??old?.note??'').trim();if(note.length>300)throw fault('感想最多 300 字');
    const date=String(form.date??old?.date??'').trim();
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw fault('请选择有效的到访日期');
    const run=this.queue.then(async()=>{
      const before=structuredClone(this.db.pilgrimageMarks.items),current=this.record(user.id,subjectId,pointId);
      const patch={userId:user.id,subjectId,pointId,status,note:status?note:'',date:status==='visited'?date:''};
      try{if(current)await this.db.pilgrimageMarks.update(current.id,patch);else await this.db.pilgrimageMarks.insert(patch);}catch(error){this.db.pilgrimageMarks.items=before;throw error;}
      return{record:this.record(user.id,subjectId,pointId),summary:this.summary(user.id)};
    });this.queue=run.catch(()=>{});return run;
  }
}
