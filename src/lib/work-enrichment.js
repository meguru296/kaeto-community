// Supplementary work data must never hold the initial HTML response open.
// Jobs are shared by work, bounded globally, and contain only public work data.
export class WorkEnrichment {
  constructor(load,{limit=2,capacity=200,ttl=60000,clock=Date.now}={}) {
    Object.assign(this,{load,limit,capacity,ttl,clock});this.jobs=new Map();this.active=0;this.closed=false;
  }
  request(gid,authorize) {
    const now=this.clock(),known=this.jobs.get(gid);
    if(known&&(known.state==='pending'||now-known.at<this.ttl))return known;
    if(this.closed||this.active>=this.limit)return {state:'busy'};
    authorize();
    for(const [key,job]of this.jobs)if(job.state!=='pending'&&(now-job.at>=this.ttl||this.jobs.size>=this.capacity))this.jobs.delete(key);
    const job={state:'pending',at:now,result:null};this.jobs.set(gid,job);this.active++;
    job.promise=Promise.resolve().then(()=>this.load(gid)).then(result=>{job.result=result;job.state='ready';},()=>{job.state='unavailable';}).finally(()=>{job.at=this.clock();this.active--;});
    return job;
  }
  async stop(){this.closed=true;await Promise.allSettled([...this.jobs.values()].map(job=>job.promise).filter(Boolean));}
}
