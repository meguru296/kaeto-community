import {boundedText} from './external-response.js';
import {StoryCharacterPortraits} from './story-character-portraits.js';
const fault=(message,status=503)=>Object.assign(new Error(message),{status});
const text=(value,max=160)=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
export function bangumiCharacterImage(value){
  try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='lain.bgm.tv'&&!u.port&&!u.username&&!u.password&&/^\/(?:r\/[1-9]\d{0,3}\/)?pic\/crt\/[lmsg]\/[a-f0-9]{2}\/[a-f0-9]{2}\/[A-Za-z0-9_]+\.(?:jpg|png|webp)$/.test(u.pathname))return u.origin+u.pathname;}catch{}return '';
}
export class BangumiCharacters{
  constructor({token='',fetcher=fetch,imageFetcher=fetch,clock=Date.now,interval=500}={}){Object.assign(this,{token,fetcher,imageFetcher,clock,interval});this.characters=new Map();this.searches=new Map();this.pending=new Map();this.queue=Promise.resolve();this.last=0;this.cooldown=0;this.portraits=new StoryCharacterPortraits((url,options)=>this.imageFetcher(url,options));}
  remember(row){
    if(!Number.isSafeInteger(row?.id)||row.id<1||row.id>999999999||!text(row.name))throw fault('Bangumi 角色返回格式发生变化');
    const cn=row.infobox?.find(i=>['简体中文名','中文名'].includes(i.key)&&typeof i.value==='string')?.value;
    const old=this.characters.get(row.id),value={id:'bgm-character-'+row.id,bangumiId:row.id,name:text(cn||row.name),original:text(row.name),image:bangumiCharacterImage(row.images?.medium||row.images?.large),sensitive:row.nsfw!==false,work:old?.value.work||'',source:'https://bgm.tv/character/'+row.id,provider:'Bangumi'};
    this.characters.delete(row.id);this.characters.set(row.id,{at:this.clock(),value,subjectsLoaded:old?.subjectsLoaded||false});while(this.characters.size>1000)this.characters.delete(this.characters.keys().next().value);return value;
  }
  public(row){return {...row,image:row.image?'/api/me/story-card/character-image/'+row.bangumiId:''};}
  knownCharacter(id) { return this.characters.get(id)?.value; }
  async request(path,{keyword}={}){
    const key=path+'|'+(keyword||'');if(this.pending.has(key))return this.pending.get(key);
    if(this.pending.size>=12||this.clock()<this.cooldown)throw fault('Bangumi 请求较多，请稍后再试；已选角色不受影响',429);
    const started=this.clock(),task=this.queue.then(async()=>{
      if(this.clock()-started>10000)throw fault('Bangumi 连接较慢，请稍后重试');
      const wait=this.interval-(this.clock()-this.last);if(wait>0)await new Promise(r=>setTimeout(r,wait));this.last=this.clock();
      try{const response=await this.fetcher('https://api.bgm.tv/v0/'+path,{method:keyword?'POST':'GET',headers:{Accept:'application/json','User-Agent':'KaetoSite/1.5 (https://github.com/meguru296/kaeto-community; story-card characters)',...(keyword?{'Content-Type':'application/json'}:{}),...(this.token?{Authorization:'Bearer '+this.token}:{})},...(keyword?{body:JSON.stringify({keyword})}:{}),redirect:'error',signal:AbortSignal.timeout(6500)});
        if(!response.ok){await response.body?.cancel();if(response.status===429)this.cooldown=this.clock()+60000;throw fault(response.status===429?'Bangumi 请求过于频繁，请稍后重试':'Bangumi 角色资料暂不可用',response.status===429?429:503);}return JSON.parse(await boundedText(response,1024*1024));
      }catch(error){if(error.status)throw error;throw fault('Bangumi 角色查询暂时失败，已选内容已保留');}
    });this.pending.set(key,task);this.queue=task.catch(()=>{});try{return await task;}finally{this.pending.delete(key);}
  }
  async search(query,page=1){
    const q=text(query,80);if(!q)throw fault('请先输入角色名称',400);if(!Number.isSafeInteger(page)||page<1||page>50)throw fault('页码无效',400);
    const key=q.normalize('NFKC').toLowerCase()+'|'+page,cached=this.searches.get(key);if(cached&&this.clock()-cached.at<600000)return cached.value;
    const result=await this.request('search/characters?limit=12&offset='+((page-1)*12),{keyword:q});if(!Array.isArray(result.data)||!Number.isSafeInteger(result.total)||result.total<0)throw fault('Bangumi 角色搜索格式发生变化');
    const seen=new Set(),rows=result.data.slice(0,12).flatMap(r=>{try{const row=this.remember(r);if(seen.has(row.id))return [];seen.add(row.id);return [this.public(row)];}catch{return [];}}),value={rows,page,hasNext:page<50&&page*12<result.total,total:result.total};
    if(result.data.length&&!rows.length)throw fault('Bangumi 角色搜索格式发生变化，请稍后重试');
    this.searches.set(key,{at:this.clock(),value});while(this.searches.size>200)this.searches.delete(this.searches.keys().next().value);return value;
  }
  async character(id,{subjects=false}={}){
    if(!Number.isSafeInteger(id)||id<1||id>999999999)throw fault('角色编号无效',400);
    let cached=this.characters.get(id);if(!cached||this.clock()-cached.at>3600000){const row=await this.request('characters/'+id);if(row.id!==id)throw fault('角色编号不匹配');this.remember(row);cached=this.characters.get(id);}
    if(subjects&&!cached.subjectsLoaded){const rows=await this.request('characters/'+id+'/subjects');if(!Array.isArray(rows))throw fault('角色关联作品格式发生变化');cached.value.work=rows.slice().sort((a,b)=>Number(b.type===4)-Number(a.type===4)).map(r=>text(r.name_cn||r.name)).filter(Boolean).slice(0,2).join(' / ');cached.subjectsLoaded=true;}
    return cached.value;
  }
  async image(id,showOriginal=false){return this.portraits.get(await this.character(id),showOriginal);}
  async stop(){await Promise.allSettled([...this.pending.values(),this.portraits.stop()]);}
}
