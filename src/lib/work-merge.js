// Offline maintenance only. Never merges on titles or mutates user data on GET.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {domesticIndex} from './domestic-works.js';
import {linkedVnId} from './work-media.js';
import {TABLES,insertRows,readTable} from './pg-store.js';

const stamp=r=>String(r.updatedAt||r.createdAt||'');
const newest=(a,b)=>stamp(b).localeCompare(stamp(a))||a.id.localeCompare(b.id);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function planWorkMerge(db,{index=domesticIndex,identify=linkedVnId}={}){
 const original=Object.fromEntries(db.collections.map(c=>[c.name,structuredClone(c.items)])),next=structuredClone(original);
 const groups=new Map(),skipped=[];
 for(const game of original.games){
  const identified={...game,vndbId:game.vndbId||identify(game)||''},hits=index.candidates(identified);
  if(hits.length>1){skipped.push({gid:game.gid,reason:'shared-or-conflicting-identifiers'});continue;}
  if(hits.length!==1)continue;
  const source=hits[0];if(identified.vndbId&&source.vndbId&&identified.vndbId!==source.vndbId){skipped.push({gid:game.gid,reason:'explicit-vndb-conflict'});continue;}
  const group=groups.get(source.cngalId)||{source,games:[]};group.games.push(game);groups.set(source.cngalId,group);
 }
 const ids=new Map(),gids=new Map(),merges=[],archives=[];
 for(const {source,games} of groups.values()){
  // Multiple numeric chapter records are not collapsed into a single source.
  if(games.filter(g=>/^\d+$/.test(String(g.gid))).length>1){skipped.push({cngalId:source.cngalId,reason:'multiple-independent-chapters'});continue;}
  const sorted=games.slice().sort((a,b)=>Number(b.cngalId===source.cngalId)-Number(a.cngalId===source.cngalId)||Number(String(b.gid)===String(source.gid))-Number(String(a.gid)===String(source.gid))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))||a.id.localeCompare(b.id)),target=sorted[0];
  const aliases=new Set(games.flatMap(g=>[String(g.gid),...(g.gidAliases||[]).map(String),...(g.ymgalGid?[String(g.ymgalGid)]:[])]));
  aliases.add(String(source.gid));
  if(source.vndbId&&(index.byIdentity.get('vn:'+source.vndbId)||[]).length===1)aliases.add('vn'+source.vndbId.slice(1));
  aliases.delete(String(target.gid));
  const changed=games.length>1||target.source!=='CnGal'||target.cngalId!==source.cngalId||source.ymgalGid&&target.ymgalGid!==source.ymgalGid||[...aliases].some(a=>!(target.gidAliases||[]).includes(a));
  if(!changed)continue;
  const merged={...target,...source,id:target.id,gid:target.gid,createdAt:target.createdAt,source:'CnGal',gidAliases:[...aliases].sort()};
  // Preserve administrative overrides and a public history of former IDs.
  for(const g of games)for(const [k,v]of Object.entries(g))if(merged[k]==null)merged[k]=v;
  for(const game of games){ids.set(game.id,target.id);gids.set(String(game.gid),String(target.gid));}
  next.games=next.games.filter(g=>!games.some(old=>old.id===g.id)||g.id===target.id).map(g=>g.id===target.id?merged:g);
  merges.push({cngalId:source.cngalId,targetId:target.id,gid:target.gid,from:games.map(g=>({id:g.id,gid:g.gid})),aliases:merged.gidAliases});
 }
 const rewrite=value=>{
  if(Array.isArray(value))return value.map(rewrite);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='gameId'&&ids.has(v)?ids.get(v):k==='gameIds'&&Array.isArray(v)?[...new Set(v.map(id=>ids.get(id)||id))]:k==='gid'&&gids.has(String(v))?gids.get(String(v)):rewrite(v)]));
 };
 for(const c of db.collections){if(['games','audit'].includes(c.name))continue;next[c.name]=next[c.name].map(rewrite);}
 // A user counts once per work; losing alternatives are in audit and backup.
 for(const name of ['ratings','checkins','meta']){
  const groups=new Map();for(const row of next[name]){
   if(![...ids.values()].includes(row.gameId)||name==='meta'&&row.kind!=='record')continue;
   const k=JSON.stringify([row.userId,row.gameId]);const list=groups.get(k)||[];list.push(row);groups.set(k,list);
  }
  const removed=new Set();for(const rows of groups.values())for(const old of rows.sort(newest).slice(1)){removed.add(old.id);archives.push({collection:name,row:old});}
  next[name]=next[name].filter(r=>!removed.has(r.id));
 }
 // Preserve every review ID, text, and discussion thread. Only the newest
 // review is edited by the single-review composer; older posts remain readable.
 const reviews=new Map();for(const row of next.reviews){if(![...ids.values()].includes(row.gameId))continue;const k=JSON.stringify([row.userId,row.gameId]);const list=reviews.get(k)||[];list.push(row);reviews.set(k,list);}
 for(const rows of reviews.values())if(rows.length>1){rows.sort(newest);for(const old of rows.slice(1))old.mergedHistory=true;delete rows[0].mergedHistory;}
 for(const state of next.memberLevels)if(Array.isArray(state.claimed))state.claimed=[...new Set(state.claimed.map(key=>{const pos=key.indexOf(':');const id=key.slice(pos+1);return pos>=0&&ids.has(id)?key.slice(0,pos+1)+ids.get(id):key;}))];
 if(merges.length)next.audit.push({id:randomUUID(),createdAt:new Date().toISOString(),action:'works.merge',merges,archives});
 const changed=db.collections.filter(c=>JSON.stringify(original[c.name])!==JSON.stringify(next[c.name])).map(c=>c.name);
 return {version:1,original,next,changed,merges,skipped,fingerprint:hash(original)};
}

export async function applyWorkMerge(db,plan,{backupRoot=path.join(db.dataDir,'maintenance-backups')}={}){
 const current=Object.fromEntries(db.collections.map(c=>[c.name,c.items]));if(hash(current)!==plan.fingerprint)throw Error('数据已改变，请重新生成合并计划');
 if(!plan.changed.length)return {changed:0,backup:null};
 const dir=path.join(backupRoot,'work-merge-'+Date.now()+'-'+randomUUID().slice(0,8));await fs.mkdir(dir,{recursive:true,mode:0o700});
 const manifest={version:1,createdAt:new Date().toISOString(),backend:db.backend,changed:plan.changed,files:{}};
 for(const [name,items]of Object.entries(plan.original)){
  const bytes=JSON.stringify(items,null,2)+'\n',file=name+'.json';await fs.writeFile(path.join(dir,file),bytes,{mode:0o600,flag:'wx'});
  if(await fs.readFile(path.join(dir,file),'utf8')!==bytes)throw Error('备份回读失败；未执行合并');
  manifest.files[file]=createHash('sha256').update(bytes).digest('hex');
 }
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
 const journal=path.join(db.dataDir,'work-merge-pending.json');
 if(db.pg){
  await db.pg.transaction(async client=>{
   for(const name of plan.changed){const table=TABLES[name],items=plan.next[name];await client.query(`delete from ${table} where not (id = any($1::text[]))`,[items.map(r=>r.id)]);await insertRows(client,table,items.map((r,i)=>({id:r.id,seq:i+1,json:JSON.stringify(r)})));}
   for(const name of plan.changed){const rows=await readTable(client,TABLES[name]);if(JSON.stringify(rows.map(r=>r.data))!==JSON.stringify(plan.next[name]))throw Error('事务内回读比对失败');}
  });
  // Maintenance is offline; reload baselines after the committed transaction.
  for(const name of plan.changed){db[name].items=await db[name].backend.load();db[name].revision++;}
 }else{
  await fs.writeFile(journal,JSON.stringify({backup:dir,changed:plan.changed}),{mode:0o600,flag:'wx'});
  try{
   for(const name of plan.changed){db[name].items=plan.next[name];await db[name].persist();}
   for(const name of plan.changed){const saved=JSON.parse(await fs.readFile(db[name].filePath,'utf8'));if(JSON.stringify(saved)!==JSON.stringify(plan.next[name]))throw Error('合并后回读失败');}
   await fs.unlink(journal);
  }catch(e){
   let restored=true;for(const name of plan.changed)try{db[name].items=structuredClone(plan.original[name]);await db[name].persist();}catch{restored=false;}
   if(restored)await fs.unlink(journal);throw e;
  }
 }
 return {changed:plan.changed.length,backup:dir,merges:plan.merges.length};
}

// Release rollback only, before the gateway has admitted any new public writes.
export async function restoreWorkMerge(db,dir){
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
 if(manifest.version!==1)throw Error('Unknown work merge backup');
 const original=Object.fromEntries(db.collections.map(c=>[c.name,structuredClone(c.items)])),next={};
 for(const collection of db.collections){
  const file=collection.name+'.json',bytes=await fs.readFile(path.join(dir,file));
  if(createHash('sha256').update(bytes).digest('hex')!==manifest.files[file])throw Error('Backup checksum mismatch: '+collection.name);
  const items=JSON.parse(bytes);if(!Array.isArray(items)||items.some(r=>!r||typeof r.id!=='string')||new Set(items.map(r=>r.id)).size!==items.length)throw Error('Invalid backup collection');
  next[collection.name]=items;
 }
 const changed=db.collections.filter(c=>JSON.stringify(original[c.name])!==JSON.stringify(next[c.name])).map(c=>c.name);
 return applyWorkMerge(db,{original,next,changed,merges:[],fingerprint:hash(original)});
}
