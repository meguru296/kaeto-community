import {randomBytes} from 'node:crypto';
import {boundedText} from './external-response.js';
const endpoint='https://steamcommunity.com/openid/login';
const fault=(text,status=400)=>Object.assign(new Error(text),{status,publicMessage:text});
export const validSteamId=id=>/^\d{17}$/.test(String(id))&&BigInt(id)>=76561197960265728n&&BigInt(id)<=76561202255233023n;
export class SteamBinding{
  constructor(db,{enabled=false,origin='',fetcher=fetch,clock=()=>Date.now()}={}){this.db=db;this.enabled=enabled;this.origin=origin;this.fetcher=fetcher;this.clock=clock;this.pending=new Map();this.verifying=new Set();this.queue=Promise.resolve();}
  account(userId){return this.db.externalAccounts.find(a=>a.userId===userId&&a.provider==='steam');}
  start(user,sessionId){
    if(!this.enabled)throw fault('Steam 绑定暂未开放',404);if(!user||!sessionId)throw fault('请先登录',401);
    let root;try{root=new URL(this.origin);}catch{throw fault('尚未配置 Steam 返回地址',503);}
    if(root.protocol!=='https:'&&!(root.protocol==='http:'&&['127.0.0.1','localhost'].includes(root.hostname)))throw fault('Steam 返回地址需要 HTTPS',503);
    for(const[key,s]of this.pending)if(s.until<=this.clock()||s.userId===user.id)this.pending.delete(key);
    if(this.pending.size>=200)throw fault('请稍后再绑定',429);
    const state=randomBytes(32).toString('hex'),returnTo=new URL('/account/steam/callback',root);returnTo.searchParams.set('state',state);
    const url=new URL(endpoint);for(const[k,v]of Object.entries({'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'checkid_setup','openid.return_to':returnTo.href,'openid.realm':root.origin+'/','openid.identity':'http://specs.openid.net/auth/2.0/identifier_select','openid.claimed_id':'http://specs.openid.net/auth/2.0/identifier_select'}))url.searchParams.set(k,v);
    this.pending.set(state,{userId:user.id,sessionId,until:this.clock()+600000,returnTo:returnTo.href,authorizationUrl:url.href});
    return url.href;
  }
  authorization(user,sessionId,state){
    if(!this.enabled)throw fault('Steam 绑定暂未开放',404);
    const pending=this.pending.get(state);
    if(!user||!pending||pending.userId!==user.id||pending.sessionId!==sessionId||pending.until<=this.clock())throw fault('绑定授权已过期，请重新开始',403);
    return pending.authorizationUrl;
  }
  complete(user,sessionId,params){const job=this.verify(user,sessionId,params);this.verifying.add(job);job.finally(()=>this.verifying.delete(job)).catch(()=>{});return job;}
  async verify(user,sessionId,params){
    if(!this.enabled)throw fault('Steam 绑定暂未开放',404);
    const state=params.get('state'),s=this.pending.get(state);if(!user||!s||s.userId!==user.id||s.sessionId!==sessionId||s.until<=this.clock())throw fault('绑定授权已过期，请重新开始',403);
    this.pending.delete(state);
    if(params.get('openid.mode')==='cancel')throw fault('已取消 Steam 授权');
    for(const name of ['state',...new Set([...params.keys()].filter(k=>k.startsWith('openid.')))])if(params.getAll(name).length!==1)throw fault('授权参数重复',403);
    const id=params.get('openid.claimed_id')||'',match=id.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/),signed=new Set((params.get('openid.signed')||'').split(','));
    const nonce=params.get('openid.response_nonce')||'',at=Date.parse(nonce.slice(0,20));
    if(params.get('openid.ns')!=='http://specs.openid.net/auth/2.0'||params.get('openid.mode')!=='id_res'||params.get('openid.op_endpoint')!==endpoint||params.get('openid.return_to')!==s.returnTo||params.get('openid.identity')!==id||!match||!validSteamId(match[1])||!Number.isFinite(at)||Math.abs(this.clock()-at)>600000||!['op_endpoint','return_to','response_nonce','claimed_id','identity'].every(k=>signed.has(k)))throw fault('Steam 授权校验失败',403);
    const payload=new URLSearchParams([...params].filter(([k])=>k.startsWith('openid.')));payload.set('openid.mode','check_authentication');
    let verified=false;try{const res=await this.fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:payload,redirect:'error',signal:AbortSignal.timeout(10000)});const body=await boundedText(res,16384);if(res.ok)verified=/(?:^|\n)is_valid:true(?:\r?\n|$)/.test(body);}catch{throw fault('Steam 暂时无法验证，请稍后再试',503);}
    if(!verified)throw fault('Steam 没有确认这次授权',403);
    const steamId=match[1];
    const run=this.queue.then(async()=>{
      if(this.db.externalAccounts.find(a=>a.provider==='steam'&&a.steamId===steamId&&a.userId!==user.id))throw fault('这个 Steam 账号已绑定其他成员',409);
      const before=structuredClone(this.db.externalAccounts.items),old=this.account(user.id),patch={provider:'steam',userId:user.id,steamId,verifiedAt:new Date(this.clock()).toISOString()};
      try{if(old)await this.db.externalAccounts.update(old.id,patch);else await this.db.externalAccounts.insert(patch);}catch(error){this.db.externalAccounts.items=before;throw error;}
      return this.account(user.id);
    });this.queue=run.catch(()=>{});return run;
  }
  async unlink(user){if(!this.enabled)throw fault('Steam 绑定暂未开放',404);if(!user)throw fault('请先登录',401);const run=this.queue.then(async()=>{const old=this.account(user.id),before=structuredClone(this.db.externalAccounts.items);try{if(old)await this.db.externalAccounts.remove(old.id);}catch(error){this.db.externalAccounts.items=before;throw error;}});this.queue=run.catch(()=>{});return run;}
}
