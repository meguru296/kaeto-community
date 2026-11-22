import {readFileSync} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {boundedText} from './external-response.js';

export const bangumiTitleKey=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const text=(value,max=1000)=>String(value||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max);
export function wikiValues(wiki,field){
  const lines=String(wiki||'').split(/\r?\n/),start=lines.findIndex(line=>line.startsWith('|'+field+'='));
  if(start<0)return [];
  const head=lines[start].slice(field.length+2).trim();
  if(head!=='{')return head?[head]:[];
  const values=[];
  for(const line of lines.slice(start+1)){if(line.trim()==='}'||line.startsWith('|'))break;const match=line.trim().match(/^\[(.*)\]$/);if(match)values.push(match[1].replace(/^[^|]*\|/,''));}
  return values;
}
export function archiveGame(row){
  if(!Number.isSafeInteger(row.id)||row.id<1||row.id>999999999||row.type!==4||!text(row.name,300))throw Error('Invalid Bangumi game');
  const wiki=row.infobox||'',aliases=[...new Set(wikiValues(wiki,'别名').map(s=>text(s,160)).filter(Boolean))].slice(0,24);
  return {id:row.id,name:text(row.name,300),cn:text(row.name_cn,300),aliases,summary:text(row.summary,900),date:/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')?row.date:null,brand:text(wikiValues(wiki,'开发').join(' / ')||wikiValues(wiki,'制作').join(' / '),240),kind:text(wikiValues(wiki,'游戏类型').join(' / '),120),nsfw:row.nsfw===true};
}
let snapshot={version:1,works:[],syncedAt:''};
try{snapshot=JSON.parse(readFileSync(new URL('../data/bangumi-games.json',import.meta.url),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const registry=JSON.parse(readFileSync(new URL('../data/bangumi-work-links.json',import.meta.url),'utf8'));
export class BangumiCatalogue{
  constructor({seed=snapshot,links=registry.links,token='',fetcher=fetch}={}){
    if(seed.version!==1||!Array.isArray(seed.works))throw Error('Invalid Bangumi catalogue');
    this.seed=seed;this.token=token;this.fetcher=fetcher;this.byId=new Map();this.index=[];this.details=new Map();this.buckets=new Map();this.pending=new Map();this.queue=Promise.resolve();this.writes=Promise.resolve();this.coverRecords={};this.revision=0;this.last=0;this.cooldown=0;
    for(const row of seed.works){if(!Number.isSafeInteger(row.id)||row.id<1||this.byId.has(row.id)||!row.name)throw Error('Duplicate or invalid Bangumi game');this.byId.set(row.id,row);this.index.push({row,names:[row.name,row.cn,...row.aliases].map(bangumiTitleKey).filter(Boolean)});}
    this.links=structuredClone(links);const linked=new Set();for(const row of this.links){
      const target=row.target,validEvidence=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port;}catch{return false;}};
      if(!this.byId.has(row.bangumiId)||linked.has(row.bangumiId)||!target||Object.keys(target).some(k=>!['gid','vndbId','cngalId'].includes(k))||!Object.keys(target).length||target.gid!==undefined&&!/^(?:cn|vn)?[1-9]\d{0,8}$/.test(String(target.gid))||target.vndbId!==undefined&&!/^v[1-9]\d{0,8}$/.test(target.vndbId)||target.cngalId!==undefined&&(!Number.isSafeInteger(target.cngalId)||target.cngalId<1)||!Array.isArray(row.evidence)||!row.evidence.length||!row.evidence.every(validEvidence))throw Error('Invalid confirmed Bangumi link');linked.add(row.bangumiId);
    }
  }
  async init({dataDir,kv=null}){this.dir=dataDir;this.kv=kv;try{const data=kv?await kv.get('catalogue-bangumi.json'):JSON.parse(await fs.readFile(path.join(dataDir,'catalogue-bangumi.json'),'utf8'));if(data?.version===1)for(const [id,cover]of Object.entries(data.covers||{}))if(this.byId.has(Number(id))&&this.safeCover(cover?.url))this.coverRecords[id]=cover;}catch(e){if(e.code!=='ENOENT')throw Error('Bangumi 图片缓存无法读取');}return this;}
  safeCover(url){return /^https:\/\/lain\.bgm\.tv\/(?:r\/[1-9]\d{0,3}\/)?pic\/cover\/[lmscg]\/[a-f0-9]{2}\/[a-f0-9]{2}\/[A-Za-z0-9_]+\.(?:jpg|png|webp)$/.test(url||'');}
  cover(game){if(game?.source!=='Bangumi')return null;const id=game.bangumiId||String(game.gid).slice(2),cover=this.coverRecords[id];return cover&&this.safeCover(cover.url)?{url:cover.url,sexual:2}:null;}
  covers(){return Object.values(this.coverRecords).filter(c=>this.safeCover(c.url)).map(c=>({url:c.url,sexual:2}));}
  async saveCovers(){if(!this.dir&&!this.kv)return;const task=this.writes.then(async()=>{const rows=Object.entries(this.coverRecords);if(rows.length>5000)this.coverRecords=Object.fromEntries(rows.sort((a,b)=>b[1].at-a[1].at).slice(0,5000));const data={version:1,covers:this.coverRecords};if(this.kv)return this.kv.set('catalogue-bangumi.json',data);await fs.mkdir(this.dir,{recursive:true});const file=path.join(this.dir,'catalogue-bangumi.json');await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.rename(file+'.tmp',file);});this.writes=task.catch(()=>{});await task;}
  identify(game){
    const namespaceId=/^bg[1-9]\d*$/.test(String(game.gid))?Number(String(game.gid).slice(2)):0;
    if(namespaceId&&game.bangumiId&&namespaceId!==game.bangumiId)return {...game,identityPending:true};
    const bgId=Number(game.bangumiId||(/^bg[1-9]\d*$/.test(String(game.gid))?String(game.gid).slice(2):0));
    const matches=this.links.filter(row=>row.bangumiId===bgId||row.target.gid&&String(row.target.gid)===String(game.gid)||row.target.vndbId&&row.target.vndbId===game.vndbId||row.target.cngalId&&row.target.cngalId===game.cngalId);
    if(matches.length>1)return {...game,identityPending:true};
    if(!matches.length)return bgId?{...game,bangumiId:bgId}:game;
    const row=matches[0];if(bgId&&bgId!==row.bangumiId||game.vndbId&&row.target.vndbId&&game.vndbId!==row.target.vndbId||game.cngalId&&row.target.cngalId&&game.cngalId!==row.target.cngalId)return {...game,identityPending:true};
    return {...row.target,...game,bangumiId:row.bangumiId,...(row.target.vndbId?{vndbId:row.target.vndbId}:{}),...(row.target.cngalId?{cngalId:row.target.cngalId}:{}),...(row.target.gid?{bangumiTargetGid:String(row.target.gid)}:{})};
  }
  summary(row){
    if(typeof row.summary==='string')return row.summary;
    const bucket=Math.floor(row.id/2000),file=this.seed.details?.[bucket];if(!file)return '';
    if(!/^\d+-[a-f0-9]{20}\.json$/.test(file))throw Error('Invalid Bangumi detail shard');
    let data=this.buckets.get(file);if(!data){data=JSON.parse(readFileSync(new URL('../data/bangumi-game-details/'+file,import.meta.url),'utf8'));this.buckets.set(file,data);while(this.buckets.size>4)this.buckets.delete(this.buckets.keys().next().value);}
    return data[row.id]||'';
  }
  game(row,full=false){return {gid:'bg'+row.id,bangumiId:row.id,name:row.name,chineseName:row.cn,extensionName:row.aliases.map(name=>({name})),introduction:full?this.summary(row):'',releaseDate:row.date,orgName:row.brand,typeDesc:row.kind,restricted:row.nsfw,haveChinese:null,mainImg:'',source:'Bangumi',bangumiUrl:'https://bgm.tv/subject/'+row.id,bangumiSyncedAt:this.seed.syncedAt,website:[{title:'Bangumi 作品档案',link:'https://bgm.tv/subject/'+row.id}],characters:[],staff:[],releases:[]};}
  find(gid){const id=/^bg[1-9]\d{0,8}$/.test(String(gid))?Number(String(gid).slice(2)):0,row=this.byId.get(id);return row?this.game(row,true):null;}
  search(query,limit=3000){const key=bangumiTitleKey(query);if(!key)return [];const found=[];for(const item of this.index)if(item.names.some(n=>n.includes(key)))found.push(item);found.sort((a,b)=>Number(b.names.includes(key))-Number(a.names.includes(key))||a.row.id-b.row.id);return found.slice(0,limit).map(item=>this.game(item.row));}
  // Metadata enrichment is optional. The verified archive remains available
  // when anonymous NSFW requests return 404, a token expires or a source fails.
  async detail(gid){
    const base=this.find(gid);if(!base)return null;
    if(!this.token)return base;
    const hit=this.details.get(gid);if(hit&&Date.now()-hit.at<86400000)return {...base,...hit.value};
    if(Date.now()<this.cooldown||this.pending.size>=4)return base;
    if(this.pending.has(gid))return this.pending.get(gid);
    const task=this.queue.then(async()=>{
      if(Date.now()<this.cooldown)return base;
      const wait=500-(Date.now()-this.last);if(wait>0)await new Promise(r=>setTimeout(r,wait));this.last=Date.now();
      try{
        const response=await this.fetcher('https://api.bgm.tv/v0/subjects/'+base.bangumiId,{headers:{Accept:'application/json','User-Agent':'KaetoSite/1.5 (https://github.com/meguru296/kaeto-community; game catalogue)',...(this.token?{Authorization:'Bearer '+this.token}:{})},redirect:'error',signal:AbortSignal.timeout(5000)});
        if(!response.ok){await response.body?.cancel();if(response.status===429)this.cooldown=Date.now()+300000;return base;}
        const row=JSON.parse(await boundedText(response,1024*1024));if(row.id!==base.bangumiId||row.type!==4)return base;
        const image=row.images?.common||row.images?.medium;
        // Unknown image-level ratings stay masked by default. Raw cover URLs
        // remain in this private cache, never in public work records or JSON.
        if(this.safeCover(image)){if(this.coverRecords[base.bangumiId]?.url!==image)this.revision++;this.coverRecords[base.bangumiId]={url:image,at:Date.now()};await this.saveCovers();}
        const value={introduction:text(row.summary,900)||base.introduction};this.details.set(gid,{at:Date.now(),value});while(this.details.size>200)this.details.delete(this.details.keys().next().value);return {...base,...value};
      }catch{return base;}
    });this.pending.set(gid,task);this.queue=task.catch(()=>{});try{return await task;}finally{this.pending.delete(gid);}
  }
  async stop(){await Promise.allSettled([...this.pending.values(),this.writes]);}
}
