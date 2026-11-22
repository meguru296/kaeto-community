import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,stat,readdir,unlink,rename} from 'node:fs/promises';
import path from 'node:path';
import {safePilgrimageURL} from './pilgrimage.js';

// Public screenshots only. There is deliberately no photo-upload endpoint.
const DAY=86400000,MAX_DISK=128*1024*1024,MAX_MEMORY=16*1024*1024;
export class PilgrimageImages{
  constructor({fetcher=fetch,dir=null}={}){this.fetcher=fetcher;this.dir=dir?path.resolve(dir):null;this.cache=new Map();this.pending=new Map();this.failures=new Map();this.waiting=[];this.active=0;this.memoryBytes=0;this.prunedAt=0;this.pruning=null;this.controller=new AbortController();this.stats={downloads:0,diskHits:0,memoryHits:0};}
  async stop(){this.controller.abort();await Promise.allSettled([...this.pending.values()]);if(this.pruning)await this.pruning;}
  remember(key,bytes){const old=this.cache.get(key);if(old)this.memoryBytes-=old.bytes.length;this.cache.delete(key);this.cache.set(key,{bytes,until:Date.now()+3600000});this.memoryBytes+=bytes.length;while(this.memoryBytes>MAX_MEMORY||this.cache.size>128){const [k,v]=this.cache.entries().next().value;this.cache.delete(k);this.memoryBytes-=v.bytes.length;}return bytes;}
  async slot(){if(this.active>=2)await new Promise(r=>this.waiting.push(r));else this.active++;}
  release(){if(this.waiting.length)this.waiting.shift()();else this.active--;}
  async hasCached(source,kind){
    const url=safePilgrimageURL(source);if(!url)return false;const key=createHash('sha256').update(kind+'|'+url).digest('hex');
    if(this.cache.has(key))return true;
    if(this.dir){try{const f=await stat(path.join(this.dir,key+'.webp'));return f.size>0&&f.size<2*1024*1024;}catch{}}
    return false;
  }
  async prune(){
    if(!this.dir||this.pruning||Date.now()-this.prunedAt<60000)return;
    this.prunedAt=Date.now();this.pruning=(async()=>{const names=(await readdir(this.dir)).filter(n=>/^[a-f0-9]{64}\.webp$/.test(n));const files=await Promise.all(names.map(async n=>({name:n,...await stat(path.join(this.dir,n))})));let size=files.reduce((s,f)=>s+f.size,0);for(const f of files.sort((a,b)=>a.mtimeMs-b.mtimeMs)){if(size<=MAX_DISK)break;await unlink(path.join(this.dir,f.name));size-=f.size;}})().catch(()=>{}).finally(()=>{this.pruning=null;});return this.pruning;
  }
  async image(source,kind='scene'){
    const url=safePilgrimageURL(source);if(!url||!['image.anitabi.cn','bgm-api.anitabi.cn','lain.bgm.tv'].includes(new URL(url).hostname)||!['scene','cover'].includes(kind))throw Object.assign(new Error('图片暂不可用'),{status:404});
    const key=createHash('sha256').update(kind+'|'+url).digest('hex'),hit=this.cache.get(key);if(hit&&hit.until>Date.now()){this.stats.memoryHits++;return hit.bytes;}
    if(this.pending.has(key))return this.pending.get(key);
    if((this.failures.get(key)||0)>Date.now())throw Object.assign(new Error('图片暂时没能加载，请稍后重试'),{status:503});
    if(this.pending.size>=80)throw Object.assign(new Error('图片正在准备，请稍后再试'),{status:503});
    const work=(async()=>{
      const file=this.dir?path.join(this.dir,key+'.webp'):null;let stale=null;
      if(file){try{const info=await stat(file);if(info.size>0&&info.size<2*1024*1024){stale=await readFile(file);if(Date.now()-info.mtimeMs<7*DAY){this.stats.diskHits++;return this.remember(key,stale);}}}catch{}}
      await this.slot();try{
        if(this.controller.signal.aborted)throw Error('Image service stopping');
        this.stats.downloads++;const response=await this.fetcher(url,{redirect:'error',signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(12000)])});
        if(!response.ok||!/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('Invalid image');
        const reader=response.body.getReader(),chunks=[];let size=0;
        try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();throw Error('Image too large');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
        const bytes=await sharp(Buffer.concat(chunks,size),{limitInputPixels:12000000}).rotate().resize({width:kind==='cover'?180:640,height:kind==='cover'?260:720,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();
        if(file){try{await mkdir(this.dir,{recursive:true});await writeFile(file+'.tmp',bytes);await rename(file+'.tmp',file);await this.prune();}catch{/* Storage failures must not prevent public image viewing. */}}
        return this.remember(key,bytes);
      }catch(error){if(stale)return this.remember(key,stale);throw error;}finally{this.release();}
    })();
    this.pending.set(key,work);try{const bytes=await work;this.failures.delete(key);return bytes;}catch{this.failures.delete(key);this.failures.set(key,Date.now()+30000);while(this.failures.size>128)this.failures.delete(this.failures.keys().next().value);throw Object.assign(new Error('图片暂时没能加载，请稍后重试'),{status:503});}finally{this.pending.delete(key);}
  }
  async screenshot(point){return this.image(point?.image,'scene');}
}
