import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {newId,nowIso} from './utils.js';

const fault=(message,status=400)=>Object.assign(new Error(message),{status});
const idPattern=/^[a-f0-9]{24}$/;
const gidPattern=/^(?:cn|vn|bg)?[1-9]\d{0,8}$/;
export const listCoverThemes=[['sage','鼠尾草绿'],['sea','海盐蓝'],['cream','奶油黄'],['berry','莓果粉'],['night','夜幕紫']];
const clean=(value,max)=>{
  if(typeof value!=='string'||[...value].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value))throw fault(`内容格式有误，或超过 ${max} 字`);
  return value.replace(/\r\n?/g,'\n').trim();
};
export function listTags(value=''){
  const parts=Array.isArray(value)?value:clean(value,200).split(/[,，、;；\n]+/u),tags=[],seen=new Set();
  for(const part of parts){const tag=clean(part,32).normalize('NFKC').replace(/^#+/u,'').replace(/\s+/gu,' ').trim();if(!tag)continue;if([...tag].length>16)throw fault('每个标签最多 16 字');const key=tag.toLocaleLowerCase();if(!seen.has(key)){seen.add(key);tags.push(tag);}}
  if(tags.length>8)throw fault('每份清单最多填写 8 个标签');return tags;
}
function metadata(form){
  const title=clean(form.title??'',60),description=clean(form.description??'',2000);
  if(!title||/[\r\n]/.test(title))throw fault('请填写清单名称（最多 60 字，不含换行）');
  const visibility=form.visibility??'private';
  if(!['private','public'].includes(visibility))throw fault('请选择公开或私密');
  const coverTheme=form.coverTheme??'sage',coverGid=form.coverGid??'';
  if(!listCoverThemes.some(([key])=>key===coverTheme)||typeof coverGid!=='string'||(coverGid&&!gidPattern.test(coverGid)))throw fault('请选择有效的封面配色和代表作品');
  return {title,description,visibility,tags:listTags(form.tags??[]),coverTheme,coverGid};
}
function validate(state){
  if(state?.version!==1||!Array.isArray(state.lists))throw Error('作品清单格式无效，原件已保留');
  const ids=new Set();
  for(const r of state.lists){
    if(!r||!idPattern.test(r.id)||ids.has(r.id)||typeof r.userId!=='string'||!r.userId||!idPattern.test(r.token)||!Number.isSafeInteger(r.revision)||r.revision<0||!Array.isArray(r.items)||r.items.length>200||![r.createdAt,r.updatedAt,...(r.deletedAt?[r.deletedAt]:[])].every(x=>typeof x==='string'&&Number.isFinite(Date.parse(x))))throw Error('作品清单记录无效，原件已保留');
    ids.add(r.id);metadata(r);if(r.coverGid&&!r.items.some(item=>item.gid===r.coverGid))throw Error('清单代表作品不在清单内，原件已保留');if(r.tags!==undefined&&(!Array.isArray(r.tags)||JSON.stringify(listTags(r.tags))!==JSON.stringify(r.tags)))throw Error('清单标签格式无效，原件已保留');const gids=new Set();
    for(const item of r.items){if(!item||!gidPattern.test(item.gid)||gids.has(item.gid)||typeof item.addedAt!=='string'||!Number.isFinite(Date.parse(item.addedAt)))throw Error('清单作品格式无效，原件已保留');clean(item.note,300);gids.add(item.gid);}
    if(r.editingMode!==undefined&&!['invited','open'].includes(r.editingMode))throw Error('清单编辑范围无效');
    const removed=new Set();for(const m of r.removedEditors||[]){if(!m||typeof m.userId!=='string'||!m.userId||m.userId===r.userId||removed.has(m.userId)||!Number.isFinite(Date.parse(m.at)))throw Error('已移除协作者无效');removed.add(m.userId);}
    const members=new Set([r.userId]);for(const member of r.collaborators||[]){if(!member||typeof member.userId!=='string'||members.has(member.userId)||removed.has(member.userId)||!Number.isFinite(Date.parse(member.joinedAt)))throw Error('清单协作者格式无效，原件已保留');members.add(member.userId);}
    const invites=new Set();for(const invite of r.invitations||[]){if(!invite||!idPattern.test(invite.id)||invites.has(invite.id)||typeof invite.userId!=='string'||invite.invitedBy!==r.userId||!['pending','accepted','declined','revoked','removed'].includes(invite.status)||![invite.at,invite.expiresAt].every(t=>Number.isFinite(Date.parse(t))))throw Error('清单邀请格式无效，原件已保留');invites.add(invite.id);}
    const requests=new Set();for(const request of r.requests||[]){if(!request||!idPattern.test(request.id)||requests.has(request.id)||typeof request.userId!=='string'||!request.userId||request.userId===r.userId||!['pending','approved','declined','withdrawn'].includes(request.status)||!Number.isFinite(Date.parse(request.at)))throw Error('清单申请格式无效');clean(request.note,300);requests.add(request.id);}
    const likes=new Set();for(const like of r.likes||[]){if(!like||typeof like.userId!=='string'||!like.userId||likes.has(like.userId)||!Number.isFinite(Date.parse(like.at)))throw Error('清单点赞格式无效');likes.add(like.userId);}
  }
  const notices=new Set();for(const notice of state.notices||[]){if(typeof notice.id!=='string'||notices.has(notice.id)||typeof notice.userId!=='string'||!idPattern.test(notice.listId)||!(idPattern.test(notice.invitationId)||idPattern.test(notice.requestId)||notice.listNotice===true)||typeof notice.title!=='string'||typeof notice.summary!=='string'||!Number.isFinite(Date.parse(notice.at))||notice.readAt&&!Number.isFinite(Date.parse(notice.readAt)))throw Error('清单通知格式无效，原件已保留');notices.add(notice.id);}
  return state;
}

// One atomic state snapshot, in the existing PostgreSQL KV store or isolated JSON.
// Publish in-memory changes only after persistence succeeds; serialize revision checks.
export class WorkLists{
  constructor(db,{resolve}={}){this.db=db;this.resolve=resolve||((gid)=>db.gameByGid(gid));this.state={version:1,lists:[]};this.queue=Promise.resolve();}
  async init(){let saved;try{saved=this.db.kv?await this.db.kv.get('work-lists.json'):JSON.parse(await fs.readFile(path.join(this.db.dataDir,'work-lists.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(saved!=null)this.state=validate(saved);return this;}
  async serial(change){
    const task=this.queue.then(async()=>{
      const next=structuredClone(this.state),result=change(next);
      if(result.unchanged)return structuredClone(result.row);
      validate(next);
      if(this.db.kv)await this.db.kv.set('work-lists.json',next);
      else{
        const file=path.join(this.db.dataDir,'work-lists.json'),temp=file+'.'+newId(12)+'.tmp';
        try{await fs.writeFile(temp,JSON.stringify(next)+'\n',{flag:'wx',mode:0o600});for(let i=0;;i++){try{await fs.rename(temp,file);break;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||i>=3)throw e;await delay(30*(i+1));}}}
        finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
      }
      this.state=next;return structuredClone(result.row);
    });this.queue=task.catch(()=>{});return task;
  }
  get(id,user,{edit=false,deleted=false}={}){
    const r=this.state.lists.find(x=>x.id===id),owner=Boolean(user&&r?.userId===user.id),editor=this.canEdit(r,user);
    if(!r||Boolean(r.deletedAt)!==deleted||!this.db.users.get(r.userId)||(!owner&&deleted)||(!editor&&(edit||r.visibility!=='public')))throw fault('清单不存在或未公开',404);
    return structuredClone(r);
  }
  isRemoved(row,user){return Boolean(user&&(row.removedEditors||[]).some(m=>m.userId===user.id));}
  canEdit(row,user){return Boolean(row&&user&&this.db.users.get(row.userId)&&this.db.users.get(user.id)&&(row.userId===user.id||!this.isRemoved(row,user)&&((row.collaborators||[]).some(m=>m.userId===user.id)||row.visibility==='public'&&row.editingMode==='open')));}
  members(row){return [{userId:row.userId,joinedAt:row.createdAt,owner:true},...(row.collaborators||[])].filter(m=>this.db.users.get(m.userId));}
  editable(user){return this.state.lists.filter(r=>!r.deletedAt&&this.canEdit(r,user)&&(r.userId===user.id||(r.collaborators||[]).some(m=>m.userId===user.id))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(r=>structuredClone(r));}
  invitations(user){return this.state.lists.flatMap(r=>r.deletedAt?[]:(r.invitations||[]).filter(i=>i.userId===user?.id&&i.status==='pending'&&Date.parse(i.expiresAt)>Date.now()).map(i=>({id:i.id,listId:r.id,title:r.title,owner:this.db.users.get(r.userId),at:i.at})));}
  invitation(id,user){const r=this.state.lists.find(row=>(row.invitations||[]).some(i=>i.id===id)),i=r?.invitations.find(i=>i.id===id);if(!r||r.deletedAt||!user||![i.userId,r.userId].includes(user.id))throw fault('邀请不存在或已失效',404);return {list:structuredClone(r),invite:structuredClone(i),owner:this.db.users.get(r.userId),expired:Date.parse(i.expiresAt)<=Date.now()};}
  notice(state,userId,row,event,summary){const at=nowIso(),ref=event.request?{requestId:event.id}:event.list?{listNotice:true}:{invitationId:event.id};(state.notices||=[]).push({id:'list:'+newId(12),userId,listId:row.id,...ref,title:row.title,summary,at,readAt:null});const own=state.notices.filter(n=>n.userId===userId).sort((a,b)=>b.at.localeCompare(a.at));if(own.length>300){const keep=new Set(own.slice(0,300).map(n=>n.id));state.notices=state.notices.filter(n=>n.userId!==userId||keep.has(n.id));}}
  noticeHref(n){return n.requestId?'/lists/requests/'+n.requestId:n.invitationId?'/lists/invitations/'+n.invitationId:'/lists/'+n.listId;}
  addMember(row,userId){row.collaborators||=[];if(!row.collaborators.some(m=>m.userId===userId))row.collaborators.push({userId,joinedAt:nowIso()});row.removedEditors=(row.removedEditors||[]).filter(m=>m.userId!==userId);for(const r of row.requests||[])if(r.userId===userId&&r.status==='pending'){r.status='approved';r.respondedAt=nowIso();}}
  request(id,user){const row=this.state.lists.find(r=>(r.requests||[]).some(x=>x.id===id)),request=row?.requests.find(x=>x.id===id);if(!row||row.deletedAt||!user||![row.userId,request.userId].includes(user.id)||row.visibility==='private'&&!this.canEdit(row,user))throw fault('协作申请不存在或不可查看',404);return {list:structuredClone(row),request:structuredClone(request),applicant:this.db.users.get(request.userId),owner:this.db.users.get(row.userId)};}
  searchMembers(id,user,query){const row=this.get(id,user,{edit:true});if(row.userId!==user.id)throw fault('只有创建者可以搜索邀请成员',403);const key=String(query||'').normalize('NFKC').toLocaleLowerCase().trim().slice(0,60);if([...key].length<2)return [];const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase();return this.db.users.all().filter(u=>u.id!==user.id&&[u.username,u.nickname,String(u.uid)].some(v=>norm(v).includes(key))).sort((a,b)=>{const score=u=>String(u.uid)===key||norm(u.username)===key?3:norm(u.nickname)===key?2:1;return score(b)-score(a)||Number(a.uid)-Number(b.uid);}).slice(0,8).map(u=>({uid:u.uid,username:u.username,nickname:u.nickname||u.username,avatarId:u.avatarId,state:(row.collaborators||[]).some(m=>m.userId===u.id)?'member':(row.invitations||[]).some(i=>i.userId===u.id&&i.status==='pending'&&Date.parse(i.expiresAt)>Date.now())?'invited':this.isRemoved(row,u)?'removed':'available'}));}
  async collaborate(user,id,form){
    if(!user)throw fault('请先登录',401);
    return this.serial(state=>{
      const row=state.lists.find(r=>r.id===id);if(!row||row.deletedAt||!this.db.users.get(row.userId))throw fault('清单不存在或未公开',404);
      const owner=row.userId===user.id,action=form.action;row.collaborators||=[];row.invitations||=[];
      if(['invite','revoke','remove','remove-members','policy','approve-request','decline-request'].includes(action)){
        if(!owner)throw fault('只有创建者可以管理协作者',403);
        if(String(form.revision)!==String(row.revision))throw fault('清单已更新，请刷新后再管理协作者',409);
      }
      if(action==='invite'){
        const query=String(form.recipient||'').normalize('NFKC').trim(),matches=this.db.users.all().filter(u=>u.username?.toLocaleLowerCase()===query.toLocaleLowerCase()),recipient=form.uid?this.db.userByUid(form.uid):/^[1-9]\d{0,14}$/.test(query)?this.db.userByUid(query):matches.length===1?matches[0]:null;if(!recipient)throw fault('请从搜索结果选择成员，或输入完整用户名／UID',400);if(recipient.id===user.id)throw fault('创建者已经拥有编辑权限');
        const prior=row.invitations.find(i=>i.userId===recipient.id&&i.status==='pending'&&Date.parse(i.expiresAt)>Date.now());if(prior||row.collaborators.some(m=>m.userId===recipient.id))return {unchanged:true,row};
        const hour=Date.now()-3600000,total=state.lists.flatMap(r=>r.invitations||[]).filter(i=>i.invitedBy===user.id&&Date.parse(i.at)>hour).length;if(total>=30)throw fault('邀请发送较多，请稍后再试',429);
        const at=nowIso(),invite={id:newId(12),userId:recipient.id,invitedBy:user.id,at,expiresAt:new Date(Date.now()+7*86400000).toISOString(),status:'pending'};row.invitations.push(invite);this.notice(state,recipient.id,row,invite,'你收到「'+row.title+'」的共同编辑邀请。接受后可查看并编辑此清单。');
      }else if(['accept','decline'].includes(action)){
        const invite=row.invitations.find(i=>i.id===form.invitationId&&i.userId===user.id);if(!invite)throw fault('邀请不存在或已失效',404);
        if(action==='accept'&&invite.status==='accepted'&&row.collaborators.some(m=>m.userId===user.id))return {unchanged:true,row};
        if(invite.status!=='pending'||Date.parse(invite.expiresAt)<=Date.now())throw fault('邀请已失效，请联系创建者重新邀请',409);
        invite.status=action==='accept'?'accepted':'declined';invite.respondedAt=nowIso();if(action==='accept')this.addMember(row,user.id);
        for(const notice of state.notices||[])if(notice.invitationId===invite.id&&notice.userId===user.id&&!notice.readAt)notice.readAt=nowIso();this.notice(state,row.userId,row,invite,action==='accept'?'有成员接受了「'+row.title+'」的协作邀请。':'有成员婉拒了「'+row.title+'」的协作邀请。');
      }else if(action==='revoke'){
        const invite=row.invitations.find(i=>i.id===form.invitationId&&i.status==='pending');if(!invite)throw fault('邀请已处理，请刷新',409);invite.status='revoked';
      }else if(['remove','remove-members','leave'].includes(action)){
        const targets=[...new Set(action==='leave'?[user.id]:form.userId?[String(form.userId)]:Object.entries(form).filter(([k,v])=>k.startsWith('removeUser_')&&v==='on').map(([k])=>k.slice(11)))];if(!targets.length)throw fault('请先选择要移除的协作者');
        for(const target of targets){if(target===row.userId)throw fault('创建者不能移除自己');if(!row.collaborators.some(m=>m.userId===target))throw fault('成员名单已改变，请刷新后重新选择',409);}
        for(const target of targets){row.collaborators=row.collaborators.filter(m=>m.userId!==target);for(const invite of row.invitations)if(invite.userId===target&&invite.status==='accepted')invite.status='removed';if(action!=='leave'){row.removedEditors||=[];if(!row.removedEditors.some(m=>m.userId===target))row.removedEditors.push({userId:target,at:nowIso()});for(const request of row.requests||[])if(request.userId===target&&request.status==='pending')request.status='declined';this.notice(state,target,row,{list:true},'创建者已移除你的协作权限；你之前整理的作品和推荐语仍保留。');}}
      }else if(action==='policy'){
        if(!['invited','open'].includes(form.editingMode))throw fault('请选择有效的编辑范围');if(form.editingMode==='open'&&row.visibility!=='public')throw fault('请先把清单设为公开，再允许所有登录成员编辑');row.editingMode=form.editingMode;
      }else if(action==='request'){
        if(row.visibility!=='public')throw fault('清单不存在或未公开',404);if(this.isRemoved(row,user))throw fault('你的协作权限已被移除，请等待创建者重新邀请',403);if(this.canEdit(row,user))return {unchanged:true,row};
        row.requests||=[];if(row.requests.some(r=>r.userId===user.id&&r.status==='pending'))return {unchanged:true,row};
        const previous=row.requests.findLast(r=>r.userId===user.id);if(previous&&Date.now()-Date.parse(previous.at)<86400000)throw fault('你已提交过申请，请稍后再试或等待创建者邀请',429);
        const recent=state.lists.flatMap(r=>r.requests||[]).filter(r=>r.userId===user.id&&Date.parse(r.at)>Date.now()-3600000);if(recent.length>=10)throw fault('申请发送较多，请稍后再试',429);
        const request={id:newId(12),userId:user.id,at:nowIso(),note:clean(form.note||'',300),status:'pending'};row.requests.push(request);this.notice(state,row.userId,row,{id:request.id,request:true},'有成员申请共同编辑「'+row.title+'」，请查看申请并决定是否允许。');
      }else if(['approve-request','decline-request','withdraw-request'].includes(action)){
        const request=(row.requests||[]).find(r=>r.id===form.requestId);if(!request||action==='withdraw-request'&&request.userId!==user.id)throw fault('申请不存在',404);if(request.status!=='pending')throw fault('申请已处理，请刷新查看',409);
        request.status=action==='approve-request'?'approved':action==='withdraw-request'?'withdrawn':'declined';request.respondedAt=nowIso();
        if(action==='approve-request')this.addMember(row,request.userId);
        for(const n of state.notices||[])if(n.requestId===request.id&&n.userId===user.id&&!n.readAt)n.readAt=nowIso();
        if(action!=='withdraw-request')this.notice(state,request.userId,row,{id:request.id,request:true},action==='approve-request'?'创建者已批准你的协作申请，现在可以共同编辑这份清单。':'创建者暂未通过你的协作申请。');
      }else throw fault('协作操作无效');
      row.revision++;row.updatedAt=nowIso();return {row};
    });
  }
  notices(userId){return (this.state.notices||[]).filter(n=>n.userId===userId).map(n=>({...n,kind:'list',workList:true,href:this.noticeHref(n)}));}
  unread(userId){return (this.state.notices||[]).filter(n=>n.userId===userId&&!n.readAt).length;}
  async markRead(userId,id){return this.serial(state=>{const n=(state.notices||[]).find(x=>x.id===id&&x.userId===userId);if(!n)throw fault('通知不存在',404);if(n.readAt)return {unchanged:true,row:{href:this.noticeHref(n)}};n.readAt=nowIso();return {row:{href:this.noticeHref(n)}};});}
  async markAllRead(userId,before){return this.serial(state=>{for(const n of state.notices||[])if(n.userId===userId&&!n.readAt&&Date.parse(n.at)<=Date.parse(before))n.readAt=nowIso();return {row:{ok:true}};});}
  likeState(row,user){const likes=(row.likes||[]).filter(l=>this.db.users.get(l.userId));return {id:row.id,count:likes.length,liked:likes.some(l=>l.userId===user?.id)};}
  async like(user,id,value){if(!user||!this.db.users.get(user.id))throw fault('请先登录后点赞',401);if(!['on','off'].includes(value))throw fault('点赞操作无效');return this.serial(state=>{const row=state.lists.find(r=>r.id===id);if(!row||row.deletedAt||row.visibility!=='public'||!this.db.users.get(row.userId))throw fault('清单不存在或未公开',404);const before=this.likeState(row,user);if(before.liked===(value==='on'))return {unchanged:true,row:before};row.likes=(row.likes||[]).filter(l=>l.userId!==user.id);if(value==='on')row.likes.push({userId:user.id,at:nowIso()});return {row:this.likeState(row,user)};});}
  sorted(rows,sort='updated'){return [...rows].sort((a,b)=>(sort==='likes'?this.likeState(b).count-this.likeState(a).count:sort==='newest'?b.createdAt.localeCompare(a.createdAt):0)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));}
  owned(user,{deleted=false}={}){return this.state.lists.filter(r=>r.userId===user?.id&&Boolean(r.deletedAt)===deleted).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(r=>structuredClone(r));}
  publicRows({userId='',q=''}={}){const terms=String(q).normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/u).map(s=>s.replace(/^#+/u,'')).filter(Boolean);return this.state.lists.filter(r=>{const text=[r.title,r.description,...(r.tags||[])].join(' ').normalize('NFKC').toLocaleLowerCase();return !r.deletedAt&&r.visibility==='public'&&this.db.users.get(r.userId)&&(!userId||r.userId===userId)&&terms.every(term=>text.includes(term));}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(r=>structuredClone(r));}
  work(gid){if(!gidPattern.test(String(gid)))throw fault('作品编号无效');const game=this.resolve(String(gid));if(!game||game.identityPending||!gidPattern.test(String(game.gid)))throw fault('作品暂不可用，请先从作品库打开这部作品',404);return game;}
  entries(row){return row.items.map((item,index)=>{let game=null;try{game=this.work(item.gid);}catch{}return {...item,index,game};});}
  async create(user,form){
    if(!user)throw fault('请先登录',401);const meta=metadata(form),token=String(form.token||'');if(!idPattern.test(token))throw fault('表单已失效，请刷新后重试');
    const initial=form.gid?this.work(form.gid):null;
    if(meta.coverGid&&meta.coverGid!==String(initial?.gid))throw fault('代表作品须先加入这份清单');
    return this.serial(state=>{
      const prior=state.lists.find(r=>r.userId===user.id&&r.token===token);if(prior){if(prior.deletedAt)throw fault('这份表单已使用，请刷新后新建',409);return {unchanged:true,row:prior};}
      const mine=state.lists.filter(r=>r.userId===user.id);if(mine.filter(r=>!r.deletedAt).length>=50||mine.length>=100)throw fault('最多创建 50 份清单（含回收站共 100 份）',429);
      const at=nowIso(),row={id:newId(12),userId:user.id,token,...meta,revision:0,items:initial?[{gid:String(initial.gid),note:'',addedAt:at}]:[],createdAt:at,updatedAt:at,deletedAt:null};state.lists.push(row);return {row};
    });
  }
  async change(user,id,form){
    if(!user)throw fault('请先登录',401);
    return this.serial(state=>{
      const old=this.get(id,user,{edit:true,deleted:form.action==='restore'}),r=state.lists.find(x=>x.id===old.id);
      if(String(r.revision)!==String(form.revision))throw fault('清单已在别处更新，请刷新后再修改；当前输入尚未保存',409);
      const owner=r.userId===user.id;
      if(!owner&&(['delete','restore'].includes(form.action)||Object.hasOwn(form,'visibility')&&form.visibility!==r.visibility))throw fault('只有创建者可以更改可见范围、删除或恢复清单',403);
      if(form.action==='update'){
        const meta=metadata({...form,visibility:owner?form.visibility:r.visibility,tags:Object.hasOwn(form,'tags')?form.tags:r.tags||[],coverTheme:Object.hasOwn(form,'coverTheme')?form.coverTheme:r.coverTheme??'sage',coverGid:Object.hasOwn(form,'coverGid')?form.coverGid:r.coverGid??''});
        if(meta.coverGid&&!r.items.some(item=>item.gid===meta.coverGid))throw fault('代表作品须先加入这份清单');
        Object.assign(r,meta);
        if(r.visibility==='private'&&r.editingMode==='open')r.editingMode='invited';
      }
      else if(form.action==='delete')r.deletedAt=nowIso();
      else if(form.action==='restore'){if(state.lists.filter(x=>x.userId===user.id&&!x.deletedAt).length>=50)throw fault('清单已达上限，请先移入回收站一份');r.deletedAt=null;r.visibility='private';}
      else if(form.action==='add'){
        const g=this.work(form.gid),gid=String(g.gid);
        if(r.items.some(x=>{try{return String(this.work(x.gid).gid)===gid;}catch{return x.gid===gid;}}))return {unchanged:true,row:r};
        if(r.items.length>=200)throw fault('每份清单最多放入 200 部作品');r.items.push({gid,note:'',addedAt:nowIso()});
      }else if(['remove','note','move'].includes(form.action)){
        const index=r.items.findIndex(x=>x.gid===form.gid);if(index<0)throw fault('这部作品已不在清单里，请刷新',409);
        if(form.action==='remove'){r.items.splice(index,1);if(r.coverGid===form.gid)r.coverGid='';}
        if(form.action==='note')r.items[index].note=clean(form.note??'',300);
        if(form.action==='move'){
          if(!/^[1-9]\d{0,2}$/.test(String(form.position)))throw fault('请填写有效的排序位置');
          const target=Number(form.position)-1;if(target>=r.items.length)throw fault('排序位置超出范围');const [item]=r.items.splice(index,1);r.items.splice(target,0,item);
        }
      }else throw fault('操作无效');
      if(!owner&&!(r.collaborators||[]).some(m=>m.userId===user.id)){this.addMember(r,user.id);this.notice(state,r.userId,r,{list:true},'有成员通过开放编辑参与了「'+r.title+'」的整理。');}
      r.revision++;r.updatedAt=nowIso();return {row:r};
    });
  }
}
