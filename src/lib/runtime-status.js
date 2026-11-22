import os from 'node:os';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {access,open,statfs} from 'node:fs/promises';
import {constants} from 'node:fs';

const LIMITS=[5,10,25,50,100,250,500,1000,2500,5000,10000,30000,Infinity];
const STATES=new Set(['active','inactive','failed','activating','deactivating','unknown']);
const number=(v,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.min(v,max):null;
const stamp=(v,now)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=now+30000?new Date(v).toISOString():null;
export function sanitizeOperations(raw,now=Date.now()){
 if(raw?.schema!==1)return {state:'unavailable',collectedAt:null,services:null,gateway:null,backup:null};
 const collectedAt=stamp(raw.collectedAt,now);
 if(!collectedAt)return {state:'unavailable',collectedAt:null,services:null,gateway:null,backup:null};
 const services={};for(const key of ['website','gateway','proxy','database'])services[key]=STATES.has(raw.services?.[key])?raw.services[key]:'unknown';
 const backup=raw.backup&&typeof raw.backup==='object'?{
  state:['ok','running','failed','unknown'].includes(raw.backup.state)?raw.backup.state:'unknown',
  lastSuccess:stamp(raw.backup.lastSuccess,now),
  restoreVerified:raw.backup.restoreVerified===true,
  timer:STATES.has(raw.backup.timer)?raw.backup.timer:'unknown',
  timerEnabled:typeof raw.backup.timerEnabled==='boolean'?raw.backup.timerEnabled:null,
  nextRun:stampFuture(raw.backup.nextRun),
 }:null;
 if(backup){backup.overdue=backup.lastSuccess?now-Date.parse(backup.lastSuccess)>36*3600000:null;backup.restoreVerified=backup.restoreVerified&&!!backup.lastSuccess;}
 return {state:now-Date.parse(collectedAt)>180000?'stale':'fresh',collectedAt,services,
  gateway:typeof raw.gateway?.holding==='boolean'?{holding:raw.gateway.holding,active:number(raw.gateway.active,1e6),queued:number(raw.gateway.queued,1e6)}:null,backup};
}
function stampFuture(v){return typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;}
export async function readOperations(file,now=Date.now()){
 if(!file)return {state:'not-configured',collectedAt:null,services:null,gateway:null,backup:null};
 let handle;
 try{handle=await open(file,'r');const stat=await handle.stat();if(!stat.isFile()||stat.size>16384)throw Error('invalid report');return sanitizeOperations(JSON.parse(await handle.readFile('utf8')),now);}
 catch{return {state:'unavailable',collectedAt:null,services:null,gateway:null,backup:null};}
 finally{await handle?.close();}
}

export class RuntimeStatus{
 constructor({db,dataDir,version,statusFile,clock=Date.now}){
  Object.assign(this,{db,dataDir,version,statusFile,clock});this.startedAt=clock();this.started=performance.now();this.buckets=new Map();this.active=0;this.total=0;
  this.cached=null;this.pending=null;this.cpuUsage=process.cpuUsage();this.cpuAt=performance.now();this.cpuPercent=null;
  this.loop=monitorEventLoopDelay({resolution:20});this.loop.enable();
 }
 bucket(at=this.clock()){
  const minute=Math.floor(at/60000);for(const key of this.buckets.keys())if(key<minute-14)this.buckets.delete(key);
  if(!this.buckets.has(minute))this.buckets.set(minute,{requests:0,errors:0,clientErrors:0,aborted:0,totalMs:0,histogram:LIMITS.map(()=>0)});
  return this.buckets.get(minute);
 }
 observe(req,res,pathname){
  if(pathname==='/healthz'||pathname.startsWith('/admin/runtime')||pathname.startsWith('/api/admin/runtime')||/^\/(?:css|js|img|media)\//.test(pathname)||['/favicon.ico','/resource-cache.js'].includes(pathname))return;
  const start=performance.now();this.active++;let completed=false;
  const end=aborted=>{if(completed)return;completed=true;this.active=Math.max(0,this.active-1);this.record(res.statusCode,performance.now()-start,aborted);};
  res.once('finish',()=>end(false));res.once('close',()=>end(!res.writableFinished));
 }
 record(status,ms,aborted=false){const b=this.bucket();this.total++;b.requests++;if(aborted)b.aborted++;else if(status>=500)b.errors++;else if(status>=400)b.clientErrors++;b.totalMs+=Math.max(0,ms);b.histogram[LIMITS.findIndex(max=>ms<=max)]++;}
 traffic(){
  this.bucket();const minute=Math.floor(this.clock()/60000),series=Array.from({length:15},(_,i)=>{const at=minute-14+i,b=this.buckets.get(at);return {at:new Date(at*60000).toISOString(),observed:at>=Math.floor(this.startedAt/60000),requests:b?.requests||0,errors:b?.errors||0};});
  const sum={requests:0,errors:0,clientErrors:0,aborted:0,totalMs:0,histogram:LIMITS.map(()=>0)};
  for(const b of this.buckets.values()){for(const key of ['requests','errors','clientErrors','aborted','totalMs'])sum[key]+=b[key];b.histogram.forEach((n,i)=>sum.histogram[i]+=n);}
  let target=Math.ceil(sum.requests*.95),seen=0,p95=null;for(let i=0;i<LIMITS.length;i++){seen+=sum.histogram[i];if(target&&seen>=target){p95=Number.isFinite(LIMITS[i])?LIMITS[i]:null;break;}}
  return {requests:sum.requests,errors:sum.errors,clientErrors:sum.clientErrors,aborted:sum.aborted,errorRate:sum.requests?sum.errors/sum.requests:0,averageMs:sum.requests?sum.totalMs/sum.requests:null,p95UpperMs:p95,active:this.active,totalSinceStart:this.total,series};
 }
 async database(){
  const start=performance.now();
  if(!this.db.pg){try{await access(this.dataDir,constants.R_OK|constants.W_OK);return {mode:'json',state:'accessible',latencyMs:null,pool:null};}catch{return {mode:'json',state:'unavailable',latencyMs:null,pool:null};}}
  const pg=this.db.pg;let timer;
  try{pg.assertWritable();await Promise.race([pg.pool.query({text:'select 1',query_timeout:1200}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),1500);})]);return {mode:'postgresql',state:'connected',latencyMs:performance.now()-start,pool:{total:number(pg.pool.totalCount,100),idle:number(pg.pool.idleCount,100),waiting:number(pg.pool.waitingCount,10000)}};}
  catch{return {mode:'postgresql',state:'unavailable',latencyMs:null,pool:null};}finally{clearTimeout(timer);}
 }
 async collect(){
  const now=this.clock(),cpu=process.cpuUsage(),elapsed=performance.now()-this.cpuAt;
  if(elapsed>=1000){this.cpuPercent=((cpu.user-this.cpuUsage.user+cpu.system-this.cpuUsage.system)/1000)/elapsed*100;this.cpuUsage=cpu;this.cpuAt=performance.now();}
  const [database,operations,disk]=await Promise.all([this.database(),readOperations(this.statusFile,now),statfs(this.dataDir).then(s=>({total:Number(s.blocks)*Number(s.bsize),available:Number(s.bavail)*Number(s.bsize)})).catch(()=>null)]);
  const memory=process.memoryUsage(),total=os.totalmem(),available=os.freemem(),cores=os.availableParallelism?.()||os.cpus().length;
  return {generatedAt:new Date(now).toISOString(),application:{version:this.version,node:process.version,uptimeSeconds:Math.floor((performance.now()-this.started)/1000),startedAt:new Date(this.startedAt).toISOString(),platform:process.platform},database,operations,
   resources:{cpuPercent:this.cpuPercent,cores,load1m:process.platform==='win32'?null:os.loadavg()[0],processMemory:memory.rss,heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,systemMemory:{total,available},disk,eventLoopP95Ms:Number.isFinite(this.loop.percentile(95))?this.loop.percentile(95)/1e6:null},
   records:{members:this.db.users.all().length,games:this.db.games.all().length,ratings:this.db.ratings.all().length,reviews:this.db.reviews.all().length,checkins:this.db.checkins.all().length},traffic:this.traffic()};
 }
 async snapshot(){if(this.cached&&this.clock()-Date.parse(this.cached.generatedAt)<10000)return {...this.cached,traffic:this.traffic()};if(!this.pending)this.pending=this.collect().then(value=>{this.cached=value;this.loop.reset();return value;}).finally(()=>{this.pending=null;});return this.pending;}
 close(){this.loop.disable();}
}
