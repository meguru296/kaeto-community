import fs from 'node:fs/promises';
import path from 'node:path';
import {boundedText} from './external-response.js';

export const priceRegions={CN:{name:'中国大陆',currency:'CNY'},HK:{name:'中国香港',currency:'HKD'},JP:{name:'日本',currency:'JPY'},US:{name:'美国',currency:'USD'}};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function purchaseURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?value:'';}catch{return '';}}
export function steamApp(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='store.steampowered.com'&&!u.username&&!u.password&&!u.port?u.pathname.match(/^\/app\/([1-9]\d{0,9})(?:\/|$)/)?.[1]||'':'';}catch{return '';}}
export function purchaseOptions(game,extra=[]){
  const rows=new Map();
  const add=(url,label)=>{if(!purchaseURL(url))return;const appid=steamApp(url);if(appid)rows.set(appid,{appid,label:label||'Steam 版',url:'https://store.steampowered.com/app/'+appid+'/'});};
  const demo=r=>/(?:demo|试玩|体験|体验)/i.test([r.name,r.title,r.type].filter(Boolean).join(' '));
  const excluded=new Set((game.releases||[]).filter(demo).map(r=>steamApp(r.link||r.url)).filter(Boolean));
  const releases=(game.releases||[]).filter(r=>!demo(r));
  for(const r of releases)add(r.link||r.url,r.name||r.platform);
  for(const r of game.website||[])if(!demo(r)&&!excluded.has(steamApp(r.link)))add(r.link,r.title);
  if(!rows.size)for(const link of extra)add(typeof link==='string'?link:link.url,link.name||'Steam 版');
  return [...rows.values()].slice(0,12);
}
function money(value,currency){return value&&Number.isFinite(value.amount)&&value.amount>=0&&value.amount<=1e8&&value.currency===currency?{amount:value.amount,currency}:null;}
export function normalizeOffers(data,id,region,now=Date.now()){
  if(!Array.isArray(data))throw Error('Invalid price response');
  const row=data.find(r=>r.id===id);if(!row)return {deals:[],historyLow:null};
  const currency=priceRegions[region].currency;
  const deals=(row.deals||[]).flatMap(d=>{
    const price=money(d.price,currency),url=purchaseURL(d.url),expiry=d.expiry?Date.parse(d.expiry):null;
    if(!price||!url||(d.expiry&&(!Number.isFinite(expiry)||expiry<=now))||typeof d.shop?.name!=='string')return [];
    const regular=money(d.regular,currency),cut=Number.isFinite(d.cut)&&d.cut>0&&d.cut<=100&&regular?.amount>price.amount?d.cut:0;
    return [{shop:d.shop.name.slice(0,100),price,regular,cut,url,expiry:d.expiry||null,drm:(d.drm||[]).map(x=>String(x.name||'')).filter(Boolean).slice(0,8),timestamp:d.timestamp||null}];
  }).sort((a,b)=>a.price.amount-b.price.amount).slice(0,5);
  return {deals,historyLow:money(row.historyLow?.all,currency)};
}

// Public prices only. No OAuth token, user library or visitor-specific pricing.
export class WorkOffers{
  #key='';
  constructor({dataDir,kv=null,apiKey='',fetcher=fetch,clock=()=>Date.now(),interval=1100}={}){
    this.#key=apiKey;this.dir=dataDir;this.kv=kv;this.fetcher=fetcher;this.clock=clock;this.interval=interval;this.cache={lookups:{},prices:{}};this.pending=new Map();this.queue=Promise.resolve();this.writes=Promise.resolve();this.requests=[];this.last=0;this.cooldown=0;this.stopping=false;
  }
  async init(){
    if(!this.#key){let privateConfig;try{privateConfig=this.kv?await this.kv.get('itad-api-key.json'):JSON.parse(await fs.readFile(path.join(this.dir,'itad-api-key.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('ITAD 私有配置无法读取');}this.#key=privateConfig?.apiKey||'';}
    if(this.#key&&!/^[a-f0-9]{40}$/i.test(this.#key))throw Error('ITAD API Key 格式无效');
    try{const data=this.kv?await this.kv.get('work-offers.json'):JSON.parse(await fs.readFile(path.join(this.dir,'work-offers.json'),'utf8'));if(data?.version===1&&data.lookups&&data.prices)this.cache={lookups:data.lookups,prices:data.prices};}catch(e){if(e.code!=='ENOENT')throw Error('作品价格缓存无法读取');}
    return this;
  }
  get configured(){return Boolean(this.#key);}
  view(appid,region='CN'){
    if(!priceRegions[region]||!/^\d{1,10}$/.test(String(appid)))return {status:'unsupported',deals:[],historyLow:null};
    const cached=this.cache.prices[appid+':'+region],now=this.clock();
    if(cached)return {...cached,deals:(cached.deals||[]).filter(d=>!d.expiry||Date.parse(d.expiry)>now),region,stale:now-cached.checkedAt>21600000,status:'ready'};
    const lookup=this.cache.lookups[appid];
    return {status:!this.configured?'unconfigured':lookup?.id===null&&now-lookup.checkedAt<86400000?'unavailable':'pending',region,deals:[],historyLow:null};
  }
  async save(){
    const task=this.writes.then(async()=>{
      for(const [key,max] of [['lookups',10000],['prices',6000]]){const rows=Object.entries(this.cache[key]);if(rows.length>max)this.cache[key]=Object.fromEntries(rows.sort((a,b)=>b[1].checkedAt-a[1].checkedAt).slice(0,max));}
      const data={version:1,...this.cache};
      if(this.kv)return this.kv.set('work-offers.json',data);
      await fs.mkdir(this.dir,{recursive:true});const file=path.join(this.dir,'work-offers.json');await fs.writeFile(file+'.tmp',JSON.stringify(data));await fs.rename(file+'.tmp',file);
    });this.writes=task.catch(()=>{});await task;
  }
  async request(endpoint,{body,params={}}={}){
    const now=this.clock();this.requests=this.requests.filter(t=>now-t<300000);
    if(now<this.cooldown||this.requests.length>=60||this.stopping)throw Error('budget');
    const wait=Math.max(0,this.interval-(now-this.last));if(wait)await new Promise(r=>setTimeout(r,wait));
    this.last=this.clock();this.requests.push(this.last);
    const url=new URL('https://api.isthereanydeal.com/'+endpoint);url.search=new URLSearchParams(params);
    const response=await this.fetcher(url.href,{method:body?'POST':'GET',headers:{'ITAD-API-Key':this.#key,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!response.ok){if(response.status===429){const value=response.headers.get('retry-after');const seconds=Number(value);this.cooldown=this.clock()+Math.max(300000,Number.isFinite(seconds)&&seconds>0?seconds*1000:(Date.parse(value)-this.clock())||0);}else if([401,403].includes(response.status))this.cooldown=this.clock()+300000;await response.body?.cancel();throw Error('provider');}
    return JSON.parse(await boundedText(response,1024*1024));
  }
  async refresh(appid,region='CN'){
    const current=this.view(appid,region),now=this.clock(),key=appid+':'+region;
    if(!priceRegions[region]||!/^\d{1,10}$/.test(String(appid)))return current;
    if((current.status==='ready'&&!current.stale)||current.status==='unavailable'||!this.configured||this.stopping)return current;
    if(this.pending.has(key))return this.pending.get(key);
    if(this.pending.size>=8||now<this.cooldown)return {...current,temporarilyUnavailable:true};
    const attempt=this.cache.prices[key]?.attemptAt;if(attempt&&now-attempt<300000)return {...current,temporarilyUnavailable:true};
    const queuedAt=now;
    const run=this.queue.then(async()=>{
      try{
        if(this.clock()-queuedAt>12000)throw Error('queue expired');
        let lookup=this.cache.lookups[appid];
        if(!lookup||this.clock()-lookup.checkedAt>(lookup.id?2592000000:86400000)){
          const data=await this.request('games/lookup/v1',{params:{appid}});
          if(data.found!==true&&data.found!==false)throw Error('Invalid lookup');
          if(data.found===true&&!uuid(data.game?.id))throw Error('Invalid lookup ID');
          lookup={id:data.found?data.game.id:null,checkedAt:this.clock()};this.cache.lookups[appid]=lookup;
        }
        if(!lookup.id){await this.save();return this.view(appid,region);}
        const data=await this.request('games/prices/v3',{params:{country:region,deals:'false',vouchers:'false',capacity:'5'},body:[lookup.id]});
        this.cache.prices[key]={...normalizeOffers(data,lookup.id,region,this.clock()),checkedAt:this.clock()};await this.save();return this.view(appid,region);
      }catch{
        // Never surface upstream exceptions or request headers to a client.
        const cached=this.cache.prices[key];if(cached)cached.attemptAt=this.clock();
        else this.cache.prices[key]={deals:[],historyLow:null,checkedAt:0,attemptAt:this.clock()};
        return {...this.view(appid,region),temporarilyUnavailable:true};
      }
    });this.pending.set(key,run);this.queue=run.catch(()=>{});run.finally(()=>this.pending.delete(key)).catch(()=>{});return run;
  }
  async stop(){this.stopping=true;await Promise.allSettled([...this.pending.values(),this.writes]);}
}
