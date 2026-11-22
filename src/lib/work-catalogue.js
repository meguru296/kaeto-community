import fs from 'node:fs/promises';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {boundedText} from './external-response.js';
import {workIdentifiers} from './domestic-works.js';
import {linkedVnId} from './work-media.js';
import {BangumiCatalogue} from './bangumi-catalogue.js';

const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const names=g=>[g.name,g.chineseName,...(g.extensionName||[]).map(n=>n.name)].filter(Boolean);
const namespace=g=>/^\d+$/.test(String(g.gid))?'ym':String(g.gid).startsWith('cn')?'cn':String(g.gid).startsWith('bg')?'bg':'vn';
export function sameSearchWork(a,b){
 if(String(a.gid)===String(b.gid))return true;
 const ai=workIdentifiers(a),bi=workIdentifiers(b);
 // Separate CnGal entries or YMGal chapters remain separate even when VNDB
 // collects them together. No fuzzy title or shared VN identifier overrides it.
 if(namespace(a)===namespace(b)&&namespace(a)!=='vn')return false;
 if(a.vndbId&&b.vndbId&&a.vndbId!==b.vndbId)return false;
 const exactTitleDate=Boolean(a.releaseDate&&a.releaseDate===b.releaseDate&&/^\d{4}-\d{2}-\d{2}$/.test(a.releaseDate)&&key(a.name)===key(b.name));
 // Display grouping is not evidence for migrating or aliasing user records.
 if(a.identityPending||b.identityPending)return Boolean(exactTitleDate&&Boolean(a.cngalId)!==Boolean(b.cngalId));
 return [...ai].some(id=>bi.has(id))||exactTitleDate;
}
const safeImage=image=>image?.sexual<1.5&&/^https:\/\/t\.vndb\.org\/cv\/\d+\/\d+\.(?:jpg|png|webp)$/.test(image.url||'')?image.url:'';
export const vnCatalogueFields='title,alttitle,titles{title,lang},aliases,description,released,languages,developers{name,original},image{url,sexual,violence}';
const fields=vnCatalogueFields;
let publicSeed={version:1,works:{}};
try{publicSeed=JSON.parse(readFileSync(new URL('../data/work-catalogue.json',import.meta.url),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
export function vnGame(v){
 const chinese=v.titles?.find(t=>t.lang==='zh-Hans')?.title||v.titles?.find(t=>t.lang==='zh-Hant')?.title||'';
 return {gid:'vn'+v.id.slice(1),vndbId:v.id,name:v.alttitle||v.title,chineseName:chinese,extensionName:[...new Set([v.title,...(v.aliases||[]),...(v.titles||[]).map(t=>t.title)])].map(name=>({name})),introduction:v.description||'',releaseDate:v.released||null,orgName:(v.developers||[]).map(d=>d.original||d.name).join(' / '),haveChinese:(v.languages||[]).some(l=>l.startsWith('zh')),restricted:null,mainImg:safeImage(v.image),website:[{title:'VNDB',link:'https://vndb.org/'+v.id}],source:'VNDB',characters:[],releases:[],staff:[],vndbSyncedAt:new Date().toISOString()};
}

export class VnCatalogue{
 constructor({dataDir,kv=null,fetcher=fetch,clock=()=>Date.now(),interval=1000,enabled=true,seed=publicSeed}={}){this.enabled=enabled;this.seed=seed.works||{};this.dir=dataDir;this.kv=kv;this.fetcher=fetcher;this.clock=clock;this.interval=interval;this.works={};this.cache=new Map();this.pending=new Map();this.queue=Promise.resolve();this.writes=Promise.resolve();this.requests=[];this.last=0;this.cooldown=0;}
 localWorks(){return [...Object.values(this.seed),...Object.values(this.works).map(x=>x.game)];}
 async init(){try{const d=this.kv?await this.kv.get('catalogue-vndb.json'):JSON.parse(await fs.readFile(path.join(this.dir,'catalogue-vndb.json'),'utf8'));if(d?.version===1)this.works=d.works||{};}catch(e){if(e.code!=='ENOENT')throw Error('VNDB 作品缓存无法读取');}return this;}
 async save(){const task=this.writes.then(async()=>{const pairs=Object.entries(this.works);if(pairs.length>1000)this.works=Object.fromEntries(pairs.sort((a,b)=>b[1].at-a[1].at).slice(0,1000));const data={version:1,works:this.works};if(this.kv)return this.kv.set('catalogue-vndb.json',data);await fs.mkdir(this.dir,{recursive:true});const file=path.join(this.dir,'catalogue-vndb.json');await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.rename(file+'.tmp',file);});this.writes=task.catch(()=>{});return task;}
 async query(kind,body){
  if(!this.enabled)return {results:[],more:false};
  const id=kind+JSON.stringify(body),now=this.clock(),cached=this.cache.get(id);if(cached&&now-cached.at<600000)return cached.data;if(this.pending.has(id))return this.pending.get(id);if(this.pending.size>=8)throw Error('VNDB 正在更新其他作品，请稍后重试');
  const task=this.queue.then(async()=>{const current=this.clock();this.requests=this.requests.filter(t=>current-t<300000);if(current<this.cooldown||this.requests.length>=60||current-now>12000)throw Error('VNDB 查询繁忙，请稍后再试');const wait=this.interval-(current-this.last);if(wait>0)await new Promise(r=>setTimeout(r,wait));this.last=this.clock();this.requests.push(this.last);
   const res=await this.fetcher('https://api.vndb.org/kana/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!res.ok){if(res.status===429)this.cooldown=this.clock()+Math.max(300000,(Number(res.headers.get('retry-after'))||0)*1000);await res.body?.cancel();throw Error('VNDB 资料暂时不可用');}const data=JSON.parse(await boundedText(res,2*1024*1024));if(!Array.isArray(data.results)||typeof data.more!=='boolean')throw Error('VNDB 返回格式无效');this.cache.set(id,{at:this.clock(),data});while(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);return data;
  });this.pending.set(id,task);this.queue=task.catch(()=>{});task.finally(()=>this.pending.delete(id)).catch(()=>{});return task;
 }
 async search(q,page=1){const data=await this.query('vn',{filters:['search','=',q],fields,results:24,page,sort:'searchrank'});const rows=data.results.map(v=>vnGame(v));for(const game of rows)this.works[game.vndbId]={at:this.clock(),game};await this.save();return {result:rows,hasNext:data.more};}
 async get(id){if(this.seed[id])return structuredClone(this.seed[id]);let item=this.works[id];if(!item||this.clock()-item.at>604800000){const data=await this.query('vn',{filters:['id','=',id],fields,results:1});if(!data.results[0])return null;item={at:this.clock(),game:vnGame(data.results[0])};this.works[id]=item;await this.save();}return structuredClone(item.game);}
 async characters(id){const data=await this.query('character',{filters:['vn','=', ['id','=',id]],fields:'name,original,image{url,sexual,violence},vns{id,title,alttitle,role,spoiler}',results:100,sort:'id'});return data.results.flatMap(c=>{const works=c.vns.filter(w=>w.spoiler===0).map(w=>({id:w.id,name:w.alttitle||w.title,role:w.role}));if(!works.some(w=>w.id===id))return [];return [{id:'vndb-'+c.id,name:c.original||c.name,image:c.image?.sexual===0&&c.image.violence===0&&/^https:\/\/t\.vndb\.org\/ch\/\d+\/\d+\.(?:jpg|png|webp)$/.test(c.image.url||'')?c.image.url:'',source:'https://vndb.org/'+c.id,works}];});}
 async stop(){await Promise.allSettled([...this.pending.values(),this.writes]);}
}

export class WorkCatalogue{
 constructor(db,{domestic,ymgal,relations,vndb,bangumi=new BangumiCatalogue()}){Object.assign(this,{db,domestic,ymgal,relations,vndb,bangumi});this.states=new Map();this.queue=Promise.resolve();this.sourceCooldown={ym:0,vn:0};}
 identity(g){const vn=linkedVnId(g)||this.relations.snapshot.ymgal[String(g.gid)];return this.bangumi.identify({...g,vndbId:g.vndbId||vn||''});}
 resolve(game){
  const identified=this.identity(game),exact=this.db.gameByGid(game.gid),target=identified.bangumiTargetGid&&this.db.gameByGid(identified.bangumiTargetGid),domestic=this.domestic.resolve(identified);
  if(identified.identityPending)throw Object.assign(Error('来源编号存在冲突，请先核对作品版本'),{status:409});
  if(!String(game.gid).startsWith('bg')){if(exact)return exact;if(domestic)return domestic;}
  if(this.revision!==this.db.games.revision){this.revision=this.db.games.revision;this.byIdentity=new Map();for(const g of this.db.games.all())for(const id of workIdentifiers(this.identity(g))){if(!this.byIdentity.has(id))this.byIdentity.set(id,new Set());this.byIdentity.get(id).add(g);}}
  const ids=workIdentifiers(identified);const matches=[...new Set([exact,target,domestic,...[...ids].flatMap(id=>[...(this.byIdentity.get(id)||[])])].filter(Boolean))];
  if(matches.length>1)throw Object.assign(Error('跨来源作品包含多个独立章节，需要先核对版本'),{status:409});return matches[0]||null;
 }
 canonical(game){
  const identified=this.identity(game);try{const existing=this.resolve(identified);if(existing)return this.domestic.index.enrich({...identified,...existing});}catch{return {...game,identityPending:true};}
  const source=this.domestic.index.match(identified);if(source){try{return {...identified,...this.domestic.find(source.gid)};}catch{return {...source,identityPending:true};}}
  if(String(game.gid).startsWith('vn')){const targets=this.relations.targets(game.vndbId);if(targets.length===1)return {...game,gid:targets[0].href.slice(6)};if(targets.length>1)return {...game,identityPending:true};}
  if(String(game.gid).startsWith('bg')){
    if(identified.bangumiTargetGid&&!this.db.gameByGid(identified.bangumiTargetGid)){
      const target=this.domestic.find(identified.bangumiTargetGid)||this.vndb.localWorks().find(g=>String(g.gid)===identified.bangumiTargetGid);
      if(target)return {...identified,...target,bangumiId:identified.bangumiId};
      return {...identified,identityPending:true};
    }
    const candidates=this.possibleBangumiDuplicates(identified);if(candidates.length)return {...identified,identityPending:true,identityCandidates:candidates.map(g=>({gid:String(g.gid),name:g.chineseName||g.name})).slice(0,8)};
  }
  return identified;
 }
 possibleBangumiDuplicates(game){
  const count=Object.keys(this.vndb.works||{}).length;
  if(!this.titleIndex||this.titleRevision!==this.db.games.revision||this.titleCount!==count){
    this.titleRevision=this.db.games.revision;this.titleCount=count;this.titleIndex=new Map();
    for(const g of [...this.db.games.all(),...this.domestic.list(),...this.vndb.localWorks()]){if(String(g.gid).startsWith('bg'))continue;for(const n of names(g)){const k=key(n);if(k.length<2)continue;if(!this.titleIndex.has(k))this.titleIndex.set(k,new Map());this.titleIndex.get(k).set(String(g.gid),g);}}
  }
  return [...new Map(names(game).flatMap(n=>[...(this.titleIndex.get(key(n))?.entries()||[])])).values()];
 }
 async loadBangumi(gid,{persist=false}={}){
  const base=this.bangumi.find(gid);if(!base)return null;
  const game=this.canonical(base);if(game.identityPending)return game;
  if(persist)return this.save(game);return game;
 }
 async save(game,{replace=false}={}){
  const task=this.queue.then(async()=>{if(String(game.gid).startsWith('bg')&&this.canonical(game).identityPending)throw Object.assign(Error('这份资料与已有作品的对应关系还需核对，原有记录保持不变'),{status:409});const existing=this.resolve(game),{id,createdAt,updatedAt,stats,media,...data}=game;
   if(existing){const patch={};for(const [k,v]of Object.entries(data))if(k!=='gid'&&v!==undefined&&(replace||existing[k]==null||existing[k]===''||Array.isArray(existing[k])&&!existing[k].length))patch[k]=v;if(/^\d+$/.test(String(game.gid))&&String(game.gid)!==String(existing.gid))patch.ymgalGid=Number(game.gid);if(Object.keys(patch).length)await this.db.games.update(existing.id,patch);return this.domestic.index.enrich(this.db.games.get(existing.id));}
   return this.db.games.insert({...data,createdAt:new Date().toISOString()});
  });this.queue=task.catch(()=>{});return task;
 }
 async loadVn(gid,{persist=false}={}){
  const id=/^vn[1-9]\d*$/.test(gid)?'v'+gid.slice(2):this.relations.snapshot.ymgal[gid];if(!id)return null;
  const existing=this.resolve({gid,vndbId:id});if(existing)return existing;
  const data=await this.vndb.get(id);if(!data)return null;
  if(!this.relations.cast.has(id)&&!this.domestic.index.match(data))data.vnCharacters=await this.vndb.characters(id).catch(()=>[]);
  const game=this.canonical(data);if(persist&&!game.identityPending)return this.save(game);return game;
 }
 add(state,rows){
  // Only compare candidates sharing an identifier or an exact title/date.
  // A broad archive search must not scan every preceding result for each row.
  const keys=g=>['gid:'+g.gid,...[...workIdentifiers(g)].map(id=>'id:'+id),...(g.releaseDate&&/^\d{4}-\d{2}-\d{2}$/.test(g.releaseDate)?['title:'+key(g.name)+'|'+g.releaseDate]:[])];
  const register=g=>{for(const id of keys(this.identity(g))){if(!state.matchIndex.has(id))state.matchIndex.set(id,new Set());state.matchIndex.get(id).add(g);}};
  if(!state.matchIndex){state.matchIndex=new Map();for(const g of state.rows)register(g);}
  for(const original of rows){const game=this.canonical(original),identified=this.identity(game),candidates=new Set(keys(identified).flatMap(k=>[...(state.matchIndex.get(k)||[])]));let duplicate=[...candidates].find(g=>sameSearchWork(this.identity(g),identified));
   // Search cards may share one display only when the exact original title AND
   // full release date agree. This never writes or merges underlying records.
   if(!duplicate){state.rows.push(game);register(game);}
   else if(game.source==='CnGal'&&duplicate.source!=='CnGal'){Object.assign(duplicate,game);register(duplicate);}
  }
 }
 async search(q,page=1){
  const id=key(q),now=Date.now();let state=this.states.get(id);if(!state||!state.pending&&now-state.at>(state.errors.length?60000:600000)){
   state={at:now,rows:[],ymPage:0,vnPage:0,ymMore:true,vnMore:true,errors:[],pending:null};this.states.set(id,state);while(this.states.size>50)this.states.delete(this.states.keys().next().value);
   const local=[...this.db.games.all(),...(this.vndb.localWorks?.()||Object.values(this.vndb.works).map(x=>x.game))].filter(g=>names(g).some(n=>key(n).includes(id)));
   const archiveMatches=this.bangumi.search(q,3001);state.capped=archiveMatches.length>3000;
   this.add(state,[...this.domestic.list(q),...local,...archiveMatches.slice(0,3000)]);
  }
  const previous=state.pending||Promise.resolve();
  const task=previous.then(async()=>{
   let rounds=0;
   while((!state.ymPage||state.rows.length<page*24)&&(state.ymMore||state.vnMore)&&rounds++<6){
    const initial=!state.ymPage&&!state.vnPage;
    const jobs=[state.ymMore?(Date.now()<this.sourceCooldown.ym?Promise.reject(Error('cooldown')):this.ymgal.searchGames(q,state.ymPage+1,20)):Promise.resolve(null),state.vnMore?(Date.now()<this.sourceCooldown.vn?Promise.reject(Error('cooldown')):this.vndb.search(q,state.vnPage+1)):Promise.resolve(null)];
    const results=await Promise.allSettled(jobs);
    for(const [i,r]of results.entries()){const prefix=i?'vn':'ym';if(r.status==='fulfilled'&&r.value){state[prefix+'Page']++;state[prefix+'More']=!!r.value.hasNext;this.add(state,r.value.result);}else if(r.status==='rejected'){state[prefix+'More']=false;state[prefix+'Page']++;state.errors.push(i?'VNDB':'月幕');this.sourceCooldown[prefix]=Date.now()+60000;}}
    if(initial){const score=g=>Math.max(...names(g).map(n=>{const k=key(n);return k===id?100:id.length/Math.max(k.length,1);}));state.rows.sort((a,b)=>score(b)-score(a));}
    if(state.rows.length>3000){state.rows=state.rows.slice(0,3000);delete state.matchIndex;state.capped=true;state.ymMore=state.vnMore=false;}
   }
  });state.pending=task;
  task.finally(()=>{if(state.pending===task)state.pending=null;}).catch(()=>{});
  // Known catalogue matches do not wait indefinitely for live source searches.
  // The shared bounded job continues; a repeat search reuses its results.
  let timer;try{if(state.rows.length)await Promise.race([task,new Promise(r=>{timer=setTimeout(r,1800);})]);else await task;}finally{clearTimeout(timer);}
  page=Math.min(page,Math.max(1,Math.ceil(state.rows.length/24)));

  return {result:state.rows.slice((page-1)*24,page*24),total:state.rows.length,hasNext:page*24<state.rows.length||!state.pending&&(state.ymMore||state.vnMore),pageNum:page,pageSize:24,partial:state.errors,updating:Boolean(state.pending),moreSources:state.ymMore||state.vnMore,capped:state.capped===true};
 }
 async stop(){await Promise.allSettled([this.queue,...[...this.states.values()].map(s=>s.pending).filter(Boolean)]);await Promise.all([this.vndb.stop(),this.bangumi.stop()]);}
}
