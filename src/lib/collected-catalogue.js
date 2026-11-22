import {withWorkMedia,workMediaRevision} from './work-media.js';
import {workCorrectionContext} from './work-correction-context.js';
import {brandsFor,writersFor} from './catalog-filters.js';
import {canonicalBrand} from './brand-names.js';
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const options=(rows,key)=>{
  const counts=new Map();for(const row of rows)for(const name of row[key])counts.set(name,(counts.get(name)||0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-CN')).map(([name,count])=>({name,count}));
};
export class CollectedCatalogue {
  constructor(db,corrections,{clock=Date.now}={}){Object.assign(this,{db,corrections,clock});this.snapshot=null;}
  view(query,params,{domesticOnly=false}={}){
    const key=[this.db.games.revision,this.db.users.revision,this.db.checkins.revision,workMediaRevision(),this.corrections.revision].join(':');
    if(!this.snapshot||this.snapshot.key!==key||this.clock()-this.snapshot.at>30000){
      const rows=workCorrectionContext.run(this.corrections,()=>this.db.collectedGames().map(withWorkMedia)).map(game=>({game,brands:brandsFor(game),writers:writersFor(game),search:[game.name,game.chineseName,...(game.extensionName||[]).map(e=>e.name)].filter(Boolean).join(' ').toLowerCase()}));
      this.snapshot={key,at:this.clock(),rows,brands:options(rows,'brands'),writers:options(rows,'writers')};
    }
    const brand=canonicalBrand(String(params.get('brand')||'').trim().slice(0,80)),writer=String(params.get('writer')||'').trim().slice(0,80),q=String(query||'').trim().toLowerCase();
    const selected=this.snapshot.rows.filter(row=>(!brand||row.brands.some(n=>normalize(n)===normalize(brand)))&&(!writer||row.writers.some(n=>normalize(n)===normalize(writer))));
    return {filters:{brand,writer,brands:this.snapshot.brands,writers:this.snapshot.writers},games:selected.filter(row=>(!q||row.search.includes(q))&&(!domesticOnly||row.game.domestic)).map(row=>row.game)};
  }
}
