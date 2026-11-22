import {readFileSync} from 'node:fs';
import {linkedVnId} from './work-media.js';
import {domesticSnapshot,DomesticIndex} from './domestic-works.js';
import {workKey} from './work-key.js';

export const relationshipSnapshot=JSON.parse(readFileSync(new URL('../data/work-relations.json',import.meta.url),'utf8'));
const cnPortraits=JSON.parse(readFileSync(new URL('../data/cngal-character-portraits.json',import.meta.url),'utf8'));
const protectedPortraits=new Map(relationshipSnapshot.characters.filter(c=>c.imageRestricted).map(c=>[c.imageOriginal||c.blockedImage,c.image]));
export const portraitMaskFor=pathname=>protectedPortraits.get(pathname)||'';
export function portraitOriginal(id){const c=relationshipSnapshot.characters.find(c=>c.id===id);return c?.imageRestricted&&/^\/img\/characters\/[a-f0-9]{20}\.webp$/.test(c.imageOriginal||'')&&!relationshipSnapshot.characters.some(x=>x.blockedImage===c.imageOriginal)?c.imageOriginal:'';}
const seriesTypes=new Set(['seq','preq','fan','orig','side','par','ser','alt']);
export const relationLabels={seq:'续作',preq:'前作',fan:'FD',orig:'本篇',side:'外传',par:'本篇',ser:'同系列',alt:'其他版本'};
export function workKind(node){
  if(node.remake)return '重制版';
  const types=new Set((node.relations||[]).filter(r=>r.official).map(r=>r.type));
  if(types.has('orig'))return 'FD';
  if(types.has('par'))return '外传';
  if(types.has('preq'))return '续作';
  if(types.has('alt')&&!types.has('seq')&&!types.has('fan'))return '其他版本';
  return '正传';
}

// Build once. Requests only read bounded, precomputed components and indexes.
export class WorkRelations{
  constructor(db,{snapshot=relationshipSnapshot,domestic=domesticSnapshot,identify=linkedVnId}={}){
    this.db=db;this.snapshot=snapshot;this.domestic=domestic.works;this.domesticIndex=new DomesticIndex(domestic);this.identify=identify;
    this.nodes=new Map(snapshot.nodes.map(n=>[n.id,n]));this.adjacency=new Map();this.components=new Map();this.cast=new Map();this.cnCast=new Map();
    for(const node of snapshot.nodes)for(const r of node.relations||[]){
      if(!r.official||!seriesTypes.has(r.type))continue;
      if(!this.nodes.has(r.id))this.nodes.set(r.id,{id:r.id,name:r.name,title:r.name,released:null,relations:[],links:[]});
      for(const [a,b] of [[node.id,r.id],[r.id,node.id]]){if(!this.adjacency.has(a))this.adjacency.set(a,new Set());this.adjacency.get(a).add(b);}
    }
    for(const id of this.nodes.keys()){
      if(this.components.has(id))continue;
      const group=new Set([id]),queue=[id];for(let i=0;i<queue.length;i++)for(const neighbor of this.adjacency.get(queue[i])||[])if(!group.has(neighbor)){group.add(neighbor);queue.push(neighbor);}
      const rows=[...group].map(key=>this.nodes.get(key)).sort((a,b)=>(a.released||'9999').localeCompare(b.released||'9999')||a.id.localeCompare(b.id,undefined,{numeric:true}));
      for(const key of group)this.components.set(key,rows);
    }
    for(const character of snapshot.characters)for(const work of character.works){if(!this.cast.has(work.id))this.cast.set(work.id,[]);this.cast.get(work.id).push(character);}
    for(const game of this.domestic)for(const c of game.characters||[]){
      if(!c.cngalId)continue;
      let item=this.cnCast.get(c.cngalId);if(!item){item={id:'cngal-'+c.cngalId,name:c.name,image:cnPortraits['cngal-'+c.cngalId]||c.mainImg||'',source:'https://www.cngal.org/entries/index/'+c.cngalId,works:[]};this.cnCast.set(c.cngalId,item);}
      item.works.push({cnId:game.cngalId,name:game.chineseName||game.name,gid:game.gid,role:''});
    }
  }
  refresh(){
    if(this.revision===this.db.games.revision&&this.links)return;
    this.links=new Map();
    const add=(vn,g)=>{
      if(!/^v[1-9]\d*$/.test(vn||'')||!workKey(g.gid))return;
      const local=this.db.gameByGid?.(g.gid),cn=this.domesticIndex.match({...g,vndbId:vn});
      // Old aliases are navigation to one work, not additional series entries.
      g=local||cn||g;
      let group=this.links.get(vn);if(!group){group=new Map();this.links.set(vn,group);}group.set(String(g.gid),g);
    };
    for(const [gid,vn] of Object.entries(this.snapshot.ymgal))add(vn,{gid,name:this.nodes.get(vn)?.name||vn});
    for(const g of this.domestic)add(g.vndbId,g);
    for(const g of this.db.games.all())add(this.identify(g),g);
    this.revision=this.db.games.revision;
  }
  vn(game){return this.identify(game)||game.vndbId||this.snapshot.ymgal[String(game.gid)]||'';}
  targets(id){this.refresh();return [...(this.links.get(id)?.values()||[])].map(g=>({name:g.chineseName||g.name||id,href:'/game/'+g.gid}));}
  nodeView(node){const targets=this.targets(node.id);return {...node,name:targets.length===1?targets[0].name:node.name,kind:workKind(node),targets,href:targets.length===1?targets[0].href:targets.length>1?'https://vndb.org/'+node.id:'/game/vn'+node.id.slice(1),external:targets.length>1};}
  series(id){const group=this.components.get(id);return group?.map(n=>this.nodeView(n))||[];}
  view(game){
    const id=this.vn(game),node=this.nodes.get(id),series=this.series(id);
    const characters=(this.cast.get(id)||game.vnCharacters||[]).filter(c=>c.works.some(w=>w.id===id&&['main','primary','side','appears'].includes(w.role))).map(c=>({...c,role:c.works.find(w=>w.id===id).role,works:c.works.map(w=>{const targets=this.targets(w.id);return {...w,targets,href:targets.length===1?targets[0].href:targets.length>1?'https://vndb.org/'+w.id:'/game/vn'+w.id.slice(1),external:targets.length>1};})}));
    if(!characters.length)for(const c of game.characters||[]){const item=this.cnCast.get(c.cngalId);if(item)characters.push({...item,works:item.works.map(w=>({...w,href:'/game/'+w.gid,external:false}))});}
    const rank={main:0,primary:0,side:1,appears:2};
    return {id,kind:node?workKind(node):'',series:series.length>1?series:[],characters:characters.sort((a,b)=>(rank[a.role]??1)-(rank[b.role]??1)||Number(Boolean(b.image))-Number(Boolean(a.image))||a.name.localeCompare(b.name)),syncedAt:this.snapshot.syncedAt};
  }
  steamLinks(game){
    const node=this.nodes.get(this.vn(game));
    // A shared source record may cover separate chapters: never assign its
    // whole-package Steam app to a chapter lacking its own explicit release.
    const targets=this.targets(this.vn(game));return targets.length>1?[]:node?.steamReleases||node?.links||[];
  }
}
