import fs from 'node:fs/promises';
import path from 'node:path';
import {boundedText} from './external-response.js';
import {validSteamId} from './steam-binding.js';

const fault=(message,status=400)=>Object.assign(new Error(message),{status,publicMessage:message});
const number=value=>Number.isSafeInteger(value)&&value>=0&&value<=1e12?value:null;
const text=value=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,'').slice(0,120):'';
const hours=games=>games.every(g=>number(g.playtime_forever)!==null)?number(games.reduce((n,g)=>n+g.playtime_forever,0)):null;
function avatar(value){try{const u=new URL(value);return u.protocol==='https:'&&['avatars.steamstatic.com','avatars.akamai.steamstatic.com','steamcdn-a.akamaihd.net','cdn.akamai.steamstatic.com'].includes(u.hostname)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function normalizeSteamProfile(steamId,{player,owned,recent,level}){
  if(!player||player.steamid!==steamId)throw fault('Steam 没有返回这个账号的公开资料',503);
  const profile={name:text(player.personaname),avatar:avatar(player.avatarmedium||player.avatarfull||player.avatar),level:null,gameCount:null,totalMinutes:null,recentMinutes:null,recentGames:[],visibility:player.communityvisibilitystate===3?'public':'private'};
  if(profile.visibility!=='public')return profile;
  profile.level=number(level?.response?.player_level);
  const data=owned?.response,count=number(data?.game_count),games=data?.games;
  if(count!==null&&(Array.isArray(games)||count===0)){
    profile.gameCount=count;
    if(count===0||games.length===count)profile.totalMinutes=hours(games||[]);
    const r=recent?.response;
    if(number(r?.total_count)===0)profile.recentMinutes=0;
    else if(Array.isArray(r?.games)&&r.games.length===r.total_count&&r.games.every(g=>number(g.playtime_2weeks)!==null)){
      profile.recentMinutes=number(r.games.reduce((n,g)=>n+g.playtime_2weeks,0));
      profile.recentGames=r.games.filter(g=>Number.isSafeInteger(g.appid)&&g.appid>0).sort((a,b)=>b.playtime_2weeks-a.playtime_2weeks).slice(0,3).map(g=>({appid:g.appid,name:text(g.name),minutes:g.playtime_2weeks}));
    }
  }
  return profile;
}

export class SteamProfile{
  #key='';
  constructor(binding,{dataDir,kv=null,apiKey='',fetcher=fetch,clock=()=>Date.now()}={}){
    this.kv=kv;this.binding=binding;this.db=binding.db;this.file=path.join(dataDir,'steam-api-key.json');this.#key=apiKey;this.fetcher=fetcher;this.clock=clock;this.pending=new Map();this.generation=0;this.keyWrites=Promise.resolve();this.lastAttempt=new Map();this.stopping=false;
  }
  async init(){
    if(this.#key)return this;
    if(this.kv){const data=await this.kv.get('steam-api-key.json');if(data?.apiKey&&!/^[a-f0-9]{32}$/i.test(data.apiKey))throw Error('Steam 密钥配置无法读取，请检查数据库 kv 表');this.#key=data?.apiKey||'';return this;}
    try{const data=JSON.parse(await fs.readFile(this.file,'utf8'));if(data.apiKey&&!/^[a-f0-9]{32}$/i.test(data.apiKey))throw Error('Invalid key format');this.#key=data.apiKey||'';}
    catch(error){if(error.code!=='ENOENT')throw Error('Steam 密钥配置无法读取，请检查私有配置文件');}
    return this;
  }
  get configured(){return Boolean(this.#key);}
  async configure(value){
    const apiKey=String(value||'').trim();if(apiKey&&!/^[a-f0-9]{32}$/i.test(apiKey))throw fault('Steam Web API Key 应为 32 位字符，请检查复制内容');
    const run=this.keyWrites.then(async()=>{
      if(this.kv){try{await this.kv.set('steam-api-key.json',{apiKey});}catch{throw fault('密钥配置未能保存，请稍后重试',503);}this.#key=apiKey;this.generation++;this.lastAttempt.clear();return;}
      await fs.mkdir(path.dirname(this.file),{recursive:true});const tmp=this.file+'.'+process.pid+'.tmp';
      try{await fs.writeFile(tmp,JSON.stringify({apiKey}),{encoding:'utf8',mode:0o600});await fs.rename(tmp,this.file);await fs.chmod(this.file,0o600);}catch{await fs.rm(tmp,{force:true}).catch(()=>{});throw fault('密钥配置未能保存，请稍后重试',503);}
      this.#key=apiKey;this.generation++;this.lastAttempt.clear();
    });this.keyWrites=run.catch(()=>{});return run;
  }
  view(userId){
    const account=this.binding.account(userId);if(!account)return null;
    return {steamId:account.steamId,profile:account.profile||null,configured:this.configured,busy:this.pending.has(account.steamId),stale:!account.profile||this.clock()-Date.parse(account.profile.syncedAt)>(account.profile.partial?300000:21600000)};
  }
  async request(method,params,key,signal){
    const url=new URL('https://api.steampowered.com/'+method);url.search=new URLSearchParams(params);
    try{
      const response=await this.fetcher(url.href,{headers:{Accept:'application/json','x-webapi-key':key},redirect:'error',signal});
      if(!response.ok){await response.body?.cancel();throw fault(response.status===401||response.status===403?'Steam 拒绝读取，请检查站点 Web API Key':response.status===429?'Steam 请求过于频繁，请稍后刷新':'Steam 资料暂时不可用',503);}
      return JSON.parse(await boundedText(response,2*1024*1024));
    }catch(error){if(error.publicMessage)throw error;throw fault('Steam 连接暂时不可用，请稍后刷新',503);}
  }
  async refresh(user,{force=false}={}){
    if(!this.binding.enabled)throw fault('Steam 绑定暂未开放',404);
    const account=this.binding.account(user?.id);if(!account)throw fault('请先绑定 Steam 账号');
    if(!this.configured)throw fault('站长尚未配置 Steam 资料接口，请稍后再试',503);
    const steamId=account.steamId;if(!validSteamId(steamId))throw fault('Steam 账号编号无效');
    if(this.pending.has(steamId))return this.pending.get(steamId);
    if(!force&&account.profile&&this.clock()-Date.parse(account.profile.syncedAt)<(account.profile.partial?300000:21600000))return Promise.resolve(account.profile);
    const previous=this.lastAttempt.get(steamId);if(previous!==undefined&&this.clock()-previous<300000)throw fault('刚刚已刷新过，请五分钟后再试',429);
    if(this.stopping||this.pending.size>=2)throw fault('正在更新其他成员的 Steam 资料，请稍后刷新',429);
    this.lastAttempt.set(steamId,this.clock());while(this.lastAttempt.size>1000)this.lastAttempt.delete(this.lastAttempt.keys().next().value);
    const key=this.#key,generation=this.generation,signal=AbortSignal.timeout(15000),accountId=account.id;
    const run=(async()=>{
      const summary=await this.request('ISteamUser/GetPlayerSummaries/v2/',{steamids:steamId},key,signal),player=summary?.response?.players?.find(p=>p.steamid===steamId);
      let values=[];
      if(player?.communityvisibilitystate===3)values=await Promise.allSettled([
        this.request('IPlayerService/GetOwnedGames/v1/',{input_json:JSON.stringify({steamid:steamId,include_appinfo:false,include_played_free_games:true})},key,signal),
        this.request('IPlayerService/GetRecentlyPlayedGames/v1/',{input_json:JSON.stringify({steamid:steamId,count:0})},key,signal),
        this.request('IPlayerService/GetSteamLevel/v1/',{input_json:JSON.stringify({steamid:steamId})},key,signal),
      ]);
      const profile={...normalizeSteamProfile(steamId,{player,owned:values[0]?.value,recent:values[1]?.value,level:values[2]?.value}),syncedAt:new Date(this.clock()).toISOString(),partial:values.some(r=>r.status==='rejected')};
      if(profile.visibility==='public'&&account.profile?.visibility==='public'){
        if(values[0]?.status==='rejected'){profile.gameCount=account.profile.gameCount;profile.totalMinutes=account.profile.totalMinutes;}
        if(values[1]?.status==='rejected'&&profile.gameCount!==null){profile.recentMinutes=account.profile.recentMinutes;profile.recentGames=account.profile.recentGames;}
        if(values[2]?.status==='rejected')profile.level=account.profile.level;
      }
      const save=this.binding.queue.then(async()=>{
        const current=this.binding.account(user.id);if(!current||current.id!==accountId||current.steamId!==steamId||this.generation!==generation)return null;
        const before=structuredClone(this.db.externalAccounts.items);try{await this.db.externalAccounts.update(current.id,{profile});}catch{this.db.externalAccounts.items=before;throw fault('Steam 资料未能保存，请稍后重试',503);}return profile;
      });this.binding.queue=save.catch(()=>{});return save;
    })();this.pending.set(steamId,run);run.finally(()=>this.pending.delete(steamId)).catch(()=>{});return run;
  }
  async stop(){this.stopping=true;await Promise.allSettled([...this.pending.values(),this.keyWrites]);}
}
