import {newId, nowIso} from './utils.js';
import {isSuperAdmin} from './site-content.js';

const fault=(message,status=400)=>Object.assign(new Error(message),{status});
const MAX_NOTICES=300;
// Do not move this baseline when preparing the next version. 1.2 predates
// notifications; each user-requested release summary is announced once.
const BASELINE_RELEASE='1.2';

export class ReviewCommunity {
  constructor(db){this.db=db;this.queue=Promise.resolve();}
  async init(release){
    const stored=this.db.reviewCommunity.get('community');
    if(!stored&&this.db.reviewCommunity.all().length)throw Error('Unknown community snapshot; original file preserved');
    this.state=stored||{id:'community',schemaVersion:1,likes:[],replies:[],notices:[],releases:[],seenReleases:[BASELINE_RELEASE]};
    if(this.state.schemaVersion!==1||!['likes','replies','notices','releases','seenReleases'].every(k=>Array.isArray(this.state[k]))||this.db.reviewCommunity.all().length>1)throw Error('Invalid review community data; original file preserved');
    if(this.state.likes.some(x=>!x||typeof x.reviewId!=='string'||typeof x.userId!=='string'||typeof x.active!=='boolean'||typeof x.notified!=='boolean')||this.state.replies.some(x=>!x||typeof x.id!=='string'||typeof x.content!=='string'||typeof x.userId!=='string'||typeof x.reviewId!=='string'||!Number.isFinite(Date.parse(x.at)))||this.state.notices.some(x=>!x||typeof x.id!=='string'||typeof x.recipientId!=='string'||!['like','reply'].includes(x.kind)||!Number.isFinite(Date.parse(x.at)))||this.state.releases.some(x=>!x||typeof x.id!=='string'||typeof x.title!=='string'||typeof x.summary!=='string'||!Array.isArray(x.audience)||!Array.isArray(x.readBy)||!Number.isFinite(Date.parse(x.at)))||this.state.seenReleases.some(x=>typeof x!=='string'))throw Error('Invalid community records; original file preserved');
    if(new Set(this.state.likes.map(x=>x.reviewId+':'+x.userId)).size!==this.state.likes.length||['replies','notices','releases'].some(k=>new Set(this.state[k].map(x=>x.id)).size!==this.state[k].length))throw Error('Duplicate community records; original file preserved');
    if(!stored)await this.db.reviewCommunity.insert(this.state);
    this.reindex();
    if(release)await this.publishRelease(release);
    return this;
  }
  reindex(){
    this.likes=new Map();this.threads=new Map();this.inboxes=new Map();this.replies=new Map();this.unreadCounts=new Map();
    for(const like of this.state.likes){if(!this.likes.has(like.reviewId))this.likes.set(like.reviewId,new Map());this.likes.get(like.reviewId).set(like.userId,like);}
    for(const reply of this.state.replies){this.replies.set(reply.id,reply);if(!this.threads.has(reply.reviewId))this.threads.set(reply.reviewId,[]);this.threads.get(reply.reviewId).push(reply);}
    for(const notice of this.state.notices){if(!this.inboxes.has(notice.recipientId))this.inboxes.set(notice.recipientId,[]);this.inboxes.get(notice.recipientId).push(notice);if(!notice.readAt)this.unreadCounts.set(notice.recipientId,(this.unreadCounts.get(notice.recipientId)||0)+1);}
  }
  serial(change){
    const run=this.queue.then(async()=>{
      const next=structuredClone(this.state);const result=await change(next);
      if(result?.unchanged)return result.value;
      const previous=this.db.reviewCommunity.items;
      try{await this.db.reviewCommunity.replaceAll([next]);}
      catch(error){this.db.reviewCommunity.items=previous;throw error;}
      this.state=next;this.reindex();return result;
    });
    this.queue=run.catch(()=>{});return run;
  }
  review(id){const review=this.db.reviews.get(String(id));if(!review||!this.db.games.get(review.gameId))throw fault('这条评价已经不存在',404);return review;}
  notice(state,values){
    if(values.recipientId===values.actorId||!this.db.users.get(values.recipientId))return;
    state.notices.push({id:newId(),...values,at:nowIso(),readAt:null});
    const owned=state.notices.filter(n=>n.recipientId===values.recipientId);
    if(owned.length>MAX_NOTICES){const drop=new Set(owned.slice(0,owned.length-MAX_NOTICES).map(n=>n.id));state.notices=state.notices.filter(n=>!drop.has(n.id));}
  }
  async like(user,reviewId,desired){
    if(!['0','1'].includes(desired))throw fault('点赞状态不正确');
    return this.serial(state=>{
      const review=this.review(reviewId);let like=state.likes.find(l=>l.reviewId===review.id&&l.userId===user.id);const active=desired==='1';
      if(Boolean(like?.active)===active)return {unchanged:true,value:{active}};
      if(!like){like={reviewId:review.id,userId:user.id,active:false,notified:false};state.likes.push(like);}
      like.active=active;
      if(active&&!like.notified){this.notice(state,{kind:'like',recipientId:review.userId,actorId:user.id,reviewId:review.id});like.notified=true;}
      return {active};
    });
  }
  async reply(user,form){
    const text=String(form.content||'').trim(),token=String(form.token||''),parentId=String(form.parentId||'');
    if(text.length<2||text.length>1000)throw fault('回复请填写 2—1000 字');
    if(!/^[a-f0-9]{24}$/.test(token))throw fault('回复表单已失效，请刷新后重试');
    return this.serial(state=>{
      const review=this.review(form.reviewId);
      const prior=state.replies.find(r=>r.userId===user.id&&r.token===token);
      if(prior){if(prior.reviewId!==review.id||prior.content!==text||prior.parentId!==parentId)throw fault('同一份回复表单不能重复提交不同内容',409);return {unchanged:true,value:prior};}
      const parent=parentId?state.replies.find(r=>r.id===parentId):null;
      if(parentId&&(!parent||parent.deletedAt||parent.reviewId!==review.id))throw fault('被回复的内容已经不存在',404);
      if(state.replies.filter(r=>r.reviewId===review.id).length>=1000)throw fault('这条评价的讨论已达到容量上限');
      const reply={id:newId(),reviewId:review.id,userId:user.id,parentId,content:text,token,at:nowIso(),deletedAt:null};state.replies.push(reply);
      for(const recipientId of new Set([review.userId,parent?.userId].filter(Boolean)))this.notice(state,{kind:'reply',recipientId,actorId:user.id,reviewId:review.id,replyId:reply.id});
      return reply;
    });
  }
  async deleteReply(user,id){
    return this.serial(state=>{
      const reply=state.replies.find(r=>r.id===id);if(!reply)throw fault('回复不存在',404);
      if(reply.userId!==user.id&&!isSuperAdmin(user))throw fault('只能删除自己的回复',403);
      if(reply.deletedAt)return {unchanged:true,value:reply};
      reply.content='';reply.deletedAt=nowIso();return reply;
    });
  }
  async publishRelease({version,title,summary}){
    if(!/^\d+\.\d+(?:\.\d+)?(?: [A-Za-z][A-Za-z0-9-]{0,19})?$/.test(version))throw fault('发布版本格式无效');
    if(this.state.seenReleases.includes(version))return false;
    return this.serial(state=>{
      if(state.seenReleases.includes(version))return {unchanged:true,value:false};
      state.seenReleases.push(version);
      state.releases.push({id:'release:'+version,kind:'release',version,title:String(title).slice(0,100),summary:String(summary).slice(0,500),at:nowIso(),audience:this.db.users.all().map(u=>u.id),readBy:[]});
      return true;
    });
  }
  unread(userId){return (this.unreadCounts.get(userId)||0)+this.state.releases.filter(n=>n.audience.includes(userId)&&!n.readBy.includes(userId)).length+(this.music?.unread(userId)||0)+(this.corrections?.unread(userId)||0)+(this.workLists?.unread(userId)||0);}
  view(reviewId,userId,{page=1,size=10}={}){
    this.review(reviewId);
    const thread=this.threads.get(reviewId)||[],pages=Math.max(1,Math.ceil(thread.length/size));page=Math.min(pages,Math.max(1,Number.parseInt(page,10)||1));
    const likes=this.likes.get(reviewId)||new Map();
    return {liked:Boolean(likes.get(userId)?.active),likeCount:[...likes.values()].filter(l=>l.active).length,replyCount:thread.filter(r=>!r.deletedAt).length,total:thread.length,page,pages,size,replies:thread.slice(Math.max(0,thread.length-page*size),Math.max(0,thread.length-(page-1)*size)).map(r=>({...r,user:this.db.users.get(r.userId),parent:r.parentId?this.replies.get(r.parentId):null,parentUser:r.parentId?this.db.users.get(this.replies.get(r.parentId)?.userId):null}))};
  }
  destination(notice){
    if(notice.kind==='release')return '/updates';
    if(!this.db.reviews.get(notice.reviewId))return '/messages';
    const thread=this.threads.get(notice.reviewId)||[],index=notice.replyId?thread.findIndex(r=>r.id===notice.replyId):-1;
    const page=index<0?1:Math.floor((thread.length-1-index)/20)+1;
    return `/reviews/${encodeURIComponent(notice.reviewId)}?page=${page}#${notice.replyId?'reply-'+notice.replyId:'review-'+notice.reviewId}`;
  }
  inbox(userId,{type='all',page=1,size=20}={}){
    if(!['all','unread','like','reply','release','correction','list'].includes(type))type='all';
    const rows=[...(this.inboxes.get(userId)||[]),...(this.music?.notices(userId)||[]),...(this.corrections?.notices(userId)||[]),...(this.workLists?.notices(userId)||[]),...this.state.releases.filter(n=>n.audience.includes(userId)).map(n=>({...n,readAt:n.readBy.includes(userId)?n.at:null}))].filter(n=>type==='all'||type==='unread'&&!n.readAt||n.kind===type).sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
    const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(pages,Math.max(1,Number.parseInt(page,10)||1));
    return {type,page,pages,total:rows.length,unread:this.unread(userId),before:nowIso(),rows:rows.slice((page-1)*size,page*size).map(n=>{
      if(n.music||n.correction||n.workList)return n;
      const review=this.db.reviews.get(n.reviewId),reply=n.replyId?this.replies.get(n.replyId):null;
      return {...n,actor:this.db.users.get(n.actorId),game:review?this.db.games.get(review.gameId):null,directReply:reply?.parentId?this.replies.get(reply.parentId)?.userId===userId:false,unavailable:n.kind!=='release'&&(!review||n.kind==='reply'&&(!reply||reply.deletedAt)),excerpt:review?(n.kind==='reply'?reply?.content:review.content)?.slice(0,150)||'':'',destination:this.destination(n)};
    })};
  }
  async read(userId,id){
    if(String(id).startsWith('list:')){if(!this.workLists)throw fault('通知不存在',404);return (await this.workLists.markRead(userId,id)).href;}
    if(String(id).startsWith('correction-'))return this.corrections?this.corrections.readNotice(userId,id):Promise.reject(fault('通知不存在',404));
    if(String(id).startsWith('music-'))return this.music?this.music.readNotice(userId,id):Promise.reject(fault('通知不存在',404));
    return this.serial(state=>{
      const notice=state.notices.find(n=>n.id===id&&n.recipientId===userId)||state.releases.find(n=>n.id===id&&n.audience.includes(userId));
      if(!notice)throw fault('通知不存在',404);
      if(notice.kind==='release'){if(!notice.readBy.includes(userId))notice.readBy.push(userId);}else notice.readAt=notice.readAt||nowIso();
      return this.destination(notice);
    });
  }
  async readAll(userId,before){
    const cutoff=Date.parse(before);if(!Number.isFinite(cutoff)||cutoff>Date.now()+5000)throw fault('请刷新消息列表后重试');
    if(this.music)await this.music.readAll(userId,before);
    if(this.corrections)await this.corrections.readAll(userId,before);
    if(this.workLists)await this.workLists.markAllRead(userId,before);
    return this.serial(state=>{for(const notice of state.notices)if(notice.recipientId===userId&&!notice.readAt&&Date.parse(notice.at)<=cutoff)notice.readAt=nowIso();for(const notice of state.releases)if(notice.audience.includes(userId)&&!notice.readBy.includes(userId)&&Date.parse(notice.at)<=cutoff)notice.readBy.push(userId);return true;});
  }
}
