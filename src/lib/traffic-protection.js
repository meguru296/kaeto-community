import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import os from 'node:os';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';

export const busyMessage='访问较多，暂时使用本站已收录资料，外部搜索与资料更新稍后恢复。登录、评分、评价和收藏仍可正常使用。';
const fault=(status,message)=>Object.assign(new Error(message),{status});
const MODES=['auto','normal','busy'];
export const trafficRules=Object.freeze({interval:2000,warmup:10000,enter:20000,recover:120000,hold:180000,window:30000,minRequests:20,activeHigh:40,activeLow:10,latencyHigh:1000,latencyLow:500,loopHigh:150,loopLow:50});
function validate(state){
  if(state?.version!==1||!['normal','busy'].includes(state.mode)||!Number.isSafeInteger(state.revision)||state.revision<0||!Array.isArray(state.history)||state.history.length>30)throw Error('访问保护设置无法读取，原数据已保留');
  if(state.policy!=null&&!MODES.includes(state.policy))throw Error('访问保护设置无法读取，原数据已保留');
  return {...state,policy:state.policy??state.mode};
}
export class TrafficProtection {
  constructor(db,{clock=()=>performance.now(),wallClock=()=>Date.now()}={}){
    this.db=db;this.clock=clock;this.wallClock=wallClock;this.file=path.join(db.dataDir,'traffic-protection.json');this.queue=Promise.resolve();
    // Keep the v1 mode field readable by the previous release during rollback.
    this.state={version:1,mode:'normal',policy:'auto',revision:0,updatedAt:null,history:[]};
    this.effective='normal';this.active=0;this.samples=[];this.events=[];this.metrics=null;this.closed=false;
    const budget=Math.min(os.totalmem(),process.constrainedMemory?.()||1024**3,1024**3);
    this.memoryHigh=Math.floor(budget*.75);this.memoryLow=Math.floor(budget*.6);
    this.reset();
  }
  async init(){
    let saved;
    try{saved=this.db.kv?await this.db.kv.get('traffic-protection.json'):JSON.parse(await fs.readFile(this.file,'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(saved!=null)this.state=validate(saved);
    this.effective=this.state.policy==='busy'?'busy':'normal';
    return this;
  }
  reset(){this.since=this.clock();this.lastTick=null;this.highSince=null;this.healthySince=null;}
  get busy(){return this.effective==='busy';}
  view(){return {mode:this.effective,policy:this.state.policy,revision:this.state.revision,updatedAt:this.changedAt||this.state.updatedAt,monitoring:Boolean(this.timer)&&!this.closed,metrics:this.metrics?{...this.metrics,stale:this.clock()-this.metrics.at>trafficRules.interval*3}:null,highSeconds:this.highSince==null?0:Math.floor((this.clock()-this.highSince)/1000),healthySeconds:this.healthySince==null?0:Math.floor((this.clock()-this.healthySince)/1000)};}
  start(){
    if(this.timer||this.closed)return;
    this.reset();this.loop=monitorEventLoopDelay({resolution:20});this.loop.enable();
    this.timer=setInterval(()=>{
      const now=this.clock();this.samples=this.samples.filter(s=>now-s.at<=trafficRules.window);
      const durations=this.samples.map(s=>s.ms).sort((a,b)=>a-b);
      const loopMs=this.loop.count?this.loop.percentile(95)/1e6:0;this.loop.reset();
      this.sample({active:this.active,requests:durations.length,p95:durations.length?durations[Math.ceil(durations.length*.95)-1]:0,loopMs,rss:process.memoryUsage().rss});
    },trafficRules.interval);this.timer.unref();
  }
  observe(req,res,pathname){
    if(this.closed||pathname==='/healthz'||pathname.startsWith('/admin')||pathname.startsWith('/api/admin')||/^\/(?:css|js|img|media)\//.test(pathname)||['/favicon.ico','/resource-cache.js','/manifest.webmanifest','/offline.html','/apple-touch-icon.png'].includes(pathname))return;
    const start=this.clock();this.active++;let completed=false;
    const end=()=>{
      if(completed)return;completed=true;this.active=Math.max(0,this.active-1);
      // Deliberately paused external requests must not keep protection enabled.
      if(this.closed||res.statusCode>=400||!res.writableFinished)return;
      this.samples.push({at:this.clock(),ms:Math.max(0,this.clock()-start)});
      if(this.samples.length>2048)this.samples.splice(0,this.samples.length-2048);
    };
    res.once('finish',end);res.once('close',end);
  }
  sample(metrics){
    if(this.closed)return;
    const now=this.clock(),r=trafficRules;
    const valid=['active','requests','p95','loopMs','rss'].every(key=>Number.isFinite(metrics[key])&&metrics[key]>=0);
    const gap=this.lastTick==null||now-this.lastTick>r.interval*3||now<this.lastTick;this.lastTick=now;
    if(!valid){this.highSince=null;this.healthySince=null;this.metrics=null;return;}
    const reasons=[];
    if(metrics.active>=r.activeHigh)reasons.push('处理中请求较多');
    if(metrics.requests>=r.minRequests&&metrics.p95>=r.latencyHigh)reasons.push('动态页面响应偏慢');
    if(metrics.loopMs>=r.loopHigh)reasons.push('事件循环延迟偏高');
    if(metrics.rss>=this.memoryHigh)reasons.push('网站进程内存偏高');
    this.metrics={...metrics,at:now,collectedAt:new Date(this.wallClock()).toISOString(),reasons};
    if(gap){this.highSince=null;this.healthySince=null;}
    if(this.state.policy!=='auto'||now-this.since<r.warmup)return;
    if(!this.busy){
      this.healthySince=null;
      if(!reasons.length){this.highSince=null;return;}
      this.highSince??=now;
      if(now-this.highSince>=r.enter)this.transition('busy',reasons.join('、'));
    }else{
      this.highSince=null;
      const healthy=metrics.active<=r.activeLow&&metrics.loopMs<r.loopLow&&metrics.rss<this.memoryLow&&(metrics.requests<r.minRequests||metrics.p95<r.latencyLow);
      if(!healthy){this.healthySince=null;return;}
      this.healthySince??=now;
      if(now-this.healthySince>=r.recover&&now-this.since>=r.hold)this.transition('normal','服务器持续稳定，自动恢复外部功能');
    }
  }
  transition(mode,reason){
    const from=this.effective;this.effective=mode;this.changedAt=new Date(this.wallClock()).toISOString();this.reset();
    // Automatic decisions stay in memory: no database writes on a stressed server.
    this.events.unshift({from,to:mode,at:this.changedAt,reason});this.events.length=Math.min(this.events.length,30);
  }
  close(){clearInterval(this.timer);this.timer=null;this.loop?.disable();this.closed=true;}
  set(mode,revision,userId){
    const task=this.queue.then(async()=>{
      if(!MODES.includes(mode)||!/^\d{1,12}$/.test(String(revision)))throw fault(400,'请选择有效的访问模式');
      if(Number(revision)!==this.state.revision)throw fault(409,'其他页面已修改访问模式，请刷新后重新确认');
      if(mode===this.state.policy)return this.view();
      const at=new Date(this.wallClock()).toISOString(),next={version:1,mode:mode==='busy'?'busy':'normal',policy:mode,revision:this.state.revision+1,updatedAt:at,history:[{from:this.state.policy,to:mode,at,userId},...this.state.history].slice(0,30)};
      if(this.db.kv)await this.db.kv.set('traffic-protection.json',next);
      else {
        await fs.mkdir(this.db.dataDir,{recursive:true});
        const temp=this.file+'.'+randomUUID()+'.tmp';
        try{await fs.writeFile(temp,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});await fs.rename(temp,this.file);}
        finally{await fs.unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
      }
      this.state=next;if(mode!=='auto')this.effective=mode;this.changedAt=at;this.reset();return this.view();
    });
    this.queue=task.catch(()=>{});return task;
  }
}
