import {setTimeout as delay} from 'node:timers/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {existsSync} from 'node:fs';
import {newId,nowIso} from './utils.js';
import {isSuperAdmin} from './site-content.js';
import {workCorrectionContext} from './work-correction-context.js';

export const correctionFields={name:'原名',chineseName:'中文名称',extensionName:'别名',introduction:'作品简介',releaseDate:'首发日期',orgName:'制作品牌',website:'官方与相关网站',cover:'封面错配／失效',domestic:'国产标记',characters:'角色串作',series:'系列关系',duplicate:'重复作品',identifiers:'跨站编号关联',images:'其他图片失效'};
export const specialFields=new Set(['characters','series','duplicate','identifiers','images']);
export const correctionStatuses={pending:'待审核',information:'待补充',accepted:'已采纳',resolved:'专项已处理',rejected:'暂不采纳',withdrawn:'已撤回'};
const open=s=>['pending','information'].includes(s);
const fault=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
const clean=(v,max)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v))throw fault('内容格式无效或超过长度限制');return v.replace(/\r\n?/g,'\n').trim();};
export function correctionURL(value){
  const text=clean(value,1000);let u;try{u=new URL(text);}catch{throw fault('请填写完整的 http 或 https 参考链接');}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||isIP(u.hostname.replace(/^\[|\]$/g,''))||!u.hostname.includes('.')||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname)||u.port&&!['80','443'].includes(u.port))throw fault('参考链接必须是公开网页，不支持本机地址、凭据或特殊端口');
  return u.href;
}
export function correctionValue(field,value,{allowMissing=false}={}){
  if(!Object.hasOwn(correctionFields,field))throw fault('请选择可纠错的字段');
  const text=clean(value,field==='introduction'?12000:3000);
  if(specialFields.has(field)){if(text.length<2)throw fault('请说明需要核对的角色、关系或作品');return text;}
  if(field==='domestic'){if(!['yes','no'].includes(text))throw fault('请选择正确的国产标记');return text==='yes';}
  if(field==='releaseDate'){
    if(text&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text))throw fault('首发日期请填写有效的 YYYY-MM-DD，未知可留空');return text;
  }
  if(field==='extensionName'){const rows=[...new Set(text.split('\n').map(x=>x.trim()).filter(Boolean))];if(rows.length>20||rows.some(x=>x.length>120))throw fault('别名最多 20 个，每行一个、每个最多 120 字');return rows.map(name=>({name}));}
  if(field==='website'){
    const rows=text.split('\n').filter(x=>x.trim()).map(x=>{const pieces=x.split('|');if(pieces.length>2)throw fault('网站格式为「名称 | 完整链接」，每行一个');const link=correctionURL(pieces.at(-1).trim());return {title:pieces.length===2?clean(pieces[0],100)||new URL(link).hostname:new URL(link).hostname,link};});
    if(rows.length>10)throw fault('相关网站最多 10 个');return rows;
  }
  if(field==='cover'){
    if(!text)return '';
    if(/^\/img\/[\w\-/]+\.(?:webp|png|jpe?g)$/i.test(text)&&(allowMissing||existsSync(new URL('../../public'+text,import.meta.url))))return text;
    const url=correctionURL(text);if(!/^https:\/\/(?:t\.vndb\.org\/cv\/\d+\/\d+\.(?:webp|png|jpe?g)|(?:cdn|image)\.ymgal\.games\/[^\s?#]+\.(?:webp|png|jpe?g))$/i.test(url))throw fault('封面请使用已有本站图片，或 VNDB／月幕的 https 图片链接；其他图片请用「其他图片失效」提交核对');return url;
  }
  if(field!=='introduction'&&(text.length>300||field==='name'&&!text))throw fault('名称或品牌最多 300 字，原名不能为空');
  return text;
}
export function correctionText(field,value){
  if(field==='domestic')return value?'国产作品':'非国产作品';
  if(field==='extensionName')return (value||[]).map(x=>x.name).join('\n');
  if(field==='website')return (value||[]).map(x=>(x.title?x.title+' | ':'')+x.link).join('\n');
  return typeof value==='string'?value:'';
}
const storedValue=(field,value)=>field==='domestic'?(value?'yes':'no'):correctionText(field,value);
function validateValue(field,value){const checked=correctionValue(field,storedValue(field,value),{allowMissing:true});if(JSON.stringify(checked)!==JSON.stringify(value))throw Error('校订值格式无效，原件已保留');}
export function correctionFieldValue(game,field){
  if(specialFields.has(field))return JSON.stringify({gid:game.gid,ymgalGid:game.ymgalGid,cngalId:game.cngalId,vndbId:game.vndbId,syncedAt:game.syncedAt,updatedAt:game.updatedAt,website:game.website,characters:field==='characters'?[game.characters,game.vnCharacters]:undefined});
  if(field==='cover')return game.mainImg||'';
  return field==='domestic'?Boolean(game.domestic):game[field]??(field==='extensionName'||field==='website'?[]:'');
}
const valueOf=correctionFieldValue;
function validate(state){
  if(state?.version!==1||!['requests','overrides','notices'].every(k=>Array.isArray(state[k])))throw Error('纠错资料格式无效，原件已保留');
  const ids=new Set();
  for(const r of state.requests){if(!r||!/^\w{24}$/.test(r.id)||ids.has(r.id)||!/^((cn|vn|bg)?[1-9]\d{0,8})$/.test(r.gid)||typeof r.userId!=='string'||!Object.hasOwn(correctionFields,r.field)||!Object.hasOwn(correctionStatuses,r.status)||!Number.isSafeInteger(r.revision)||!Array.isArray(r.events)||!Array.isArray(r.links)||typeof r.reason!=='string'||!Number.isFinite(Date.parse(r.at)))throw Error('纠错记录格式无效，原件已保留');validateValue(r.field,r.value);ids.add(r.id);}
  const keys=new Set();for(const o of state.overrides){const key=o.gid+':'+o.field;if(!o||keys.has(key)||!Object.hasOwn(correctionFields,o.field)||specialFields.has(o.field)||typeof o.active!=='boolean'||!Number.isSafeInteger(o.revision)||!Array.isArray(o.history))throw Error('本地修正格式无效，原件已保留');validateValue(o.field,o.value);keys.add(key);}
  const noticeIds=new Set(),requestsById=new Map(state.requests.map(r=>[r.id,r]));
  for(const r of state.requests){if(!/^[a-f0-9]{24}$/.test(r.id)||r.revision<0||typeof r.token!=='string'||!/^[a-f0-9]{24}$/.test(r.token)||!/^\w{64}$/.test(r.fingerprint)||r.links.length>5||!Number.isFinite(Date.parse(r.updatedAt))||clean(r.reason,2000).length<8)throw Error('纠错记录格式无效，原件已保留');r.links.forEach(correctionURL);for(const e of r.events){if(!['supplement','withdraw','accept','reject','information','resolve'].includes(e.kind)||typeof e.actorId!=='string'||!Number.isFinite(Date.parse(e.at)))throw Error('纠错历史格式无效，原件已保留');clean(e.note,2000);if(e.links){if(!Array.isArray(e.links)||e.links.length>5)throw Error('纠错依据格式无效');e.links.forEach(correctionURL);}}}
  for(const o of state.overrides){if(!/^(?:cn|vn|bg)?[1-9]\d{0,8}$/.test(o.gid)||o.revision<1||!Number.isFinite(Date.parse(o.updatedAt))||!((r=>r&&r.gid===o.gid&&r.field===o.field&&r.status==='accepted')(requestsById.get(o.requestId))))throw Error('本地修正关联无效，原件已保留');for(const e of o.history){if(!['apply','revoke'].includes(e.kind)||typeof e.actorId!=='string'||!Number.isFinite(Date.parse(e.at)))throw Error('修正历史格式无效');validateValue(o.field,e.value);clean(e.note,2000);if(e.publicReference)correctionURL(e.publicReference);}}
  for(const n of state.notices){const r=requestsById.get(n?.requestId);if(!n||!/^correction-[a-f0-9]{24}$/.test(n.id)||noticeIds.has(n.id)||n.kind!=='correction'||!r||n.recipientId!==r.userId||n.destination!=='/me/corrections/'+r.id||typeof n.title!=='string'||typeof n.summary!=='string'||!Number.isFinite(Date.parse(n.at))||n.readAt&&!Number.isFinite(Date.parse(n.readAt)))throw Error('纠错通知格式无效，原件已保留');noticeIds.add(n.id);}
  const reads=new Set();
  if(state.reviewReads!==undefined&&!Array.isArray(state.reviewReads))throw Error('审核提醒已读记录无效，原件已保留');
  for(const n of state.reviewReads||[]){const key=n.recipientId+':'+n.requestId+':'+n.revision;if(!requestsById.has(n.requestId)||typeof n.recipientId!=='string'||!n.recipientId||!Number.isSafeInteger(n.revision)||n.revision<0||n.revision>requestsById.get(n.requestId).revision||!Number.isFinite(Date.parse(n.readAt))||reads.has(key))throw Error('审核提醒已读记录无效，原件已保留');reads.add(key);}
  return state;
}
export class WorkCorrections{
  constructor(db,{resolve,clock=Date.now}={}){this.db=db;this.resolve=resolve;this.clock=clock;this.secret=randomBytes(32);this.queue=Promise.resolve();this.state={version:1,requests:[],overrides:[],notices:[]};this.index=new Map();this.revision=0;}
  async init(){let saved;try{saved=this.db.kv?await this.db.kv.get('work-corrections.json'):JSON.parse(await fs.readFile(path.join(this.db.dataDir,'work-corrections.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(saved!=null)this.state=validate(saved);this.reindex();return this;}
  reindex(){this.revision++;this.index=new Map();for(const o of this.state.overrides)if(o.active){if(!this.index.has(o.gid))this.index.set(o.gid,[]);this.index.get(o.gid).push(o);}}
  async serial(change){const task=this.queue.then(async()=>{const next=structuredClone(this.state),result=await change(next);if(result?.unchanged)return result.value;
    if(this.db.kv)await this.db.kv.set('work-corrections.json',next);else{await fs.mkdir(this.db.dataDir,{recursive:true});const file=path.join(this.db.dataDir,'work-corrections.json'),temp=file+'.'+newId(12)+'.tmp';try{await fs.writeFile(temp,JSON.stringify(next)+'\n',{flag:'wx',mode:0o600});for(let attempt=0;;attempt++){try{await fs.rename(temp,file);break;}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=3)throw error;await delay(30*(attempt+1));}}}finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
    this.state=next;this.reindex();return result;});this.queue=task.catch(()=>{});return task;}
  source(gid){const raw=workCorrectionContext.run(null,()=>this.resolve(String(gid)));if(!raw||String(raw.gid)!==String(gid))throw fault('作品资料不可用，请从作品详情重新进入',404);return raw;}
  apply(game){
    const rows=this.index.get(String(game.gid));if(!rows?.length)return game;
    const result={...game};for(const o of rows){if(o.field==='cover')continue;if(o.field==='domestic'){result.domestic=o.value;result.domesticSource='本站校订';}else result[o.field]=structuredClone(o.value);}
    result.correctionInfo={fields:rows.map(o=>correctionFields[o.field]),at:rows.map(o=>o.updatedAt).sort().at(-1)};return result;
  }
  cover(gid){return (this.index.get(String(gid))||[]).find(o=>o.field==='cover');}
  covers(){return this.state.overrides.filter(o=>o.active&&o.field==='cover'&&o.value).map(o=>({url:o.value,sexual:2}));}
  ticket(user,gid){const source=this.source(gid),effective=this.apply(source),fields={};for(const key of Object.keys(correctionFields))fields[key]=[hash(valueOf(source,key)),hash(key==='cover'&&this.cover(gid)?this.cover(gid).value:valueOf(effective,key))];
    const data=Buffer.from(JSON.stringify({uid:user.id,gid:String(gid),expires:this.clock()+86400000,fields})).toString('base64url');return data+'.'+createHmac('sha256',this.secret).update(data).digest('base64url');}
  verify(ticket,user,gid,fields){const [data,sig,...extra]=String(ticket||'').split('.');if(!data||!sig||extra.length||data.length>8000)throw fault('表单已失效，请刷新后重新对照',409);const expected=createHmac('sha256',this.secret).update(data).digest(),received=Buffer.from(sig,'base64url');if(expected.length!==received.length||!timingSafeEqual(expected,received))throw fault('表单已失效，请刷新后重新对照',409);
    let signed;try{signed=JSON.parse(Buffer.from(data,'base64url'));}catch{throw fault('表单已失效，请刷新',409);}if(signed.uid!==user.id||signed.gid!==String(gid)||signed.expires<this.clock())throw fault('表单已失效，请刷新后重新对照',409);
    const source=this.source(gid),effective=this.apply(source);for(const key of fields){const displayed=key==='cover'&&this.cover(gid)?this.cover(gid).value:valueOf(effective,key);if(hash(valueOf(source,key))!==signed.fields?.[key]?.[0]||hash(displayed)!==signed.fields?.[key]?.[1])throw fault('资料或本地修正已变化，请刷新页面重新对照后再提交',409);}return {source,effective};}
  row(id,user,{admin=false}={}){const row=this.state.requests.find(r=>r.id===id);if(!row)throw fault('纠错记录不存在',404);if(!user||!admin&&row.userId!==user.id||admin&&!this.canReview(user))throw fault('没有查看这条纠错的权限',403);return row;}
  canReview(user){return Boolean(user&&(user.isAdmin||isSuperAdmin(user)));}
  links(text){const rows=[...new Set(clean(text||'',5000).split('\n').map(x=>x.trim()).filter(Boolean))];if(rows.length>5)throw fault('参考链接最多 5 个，每行一个');return rows.map(correctionURL);}
  notify(state,r,message,title=correctionStatuses[r.status]){state.notices.push({id:'correction-'+newId(12),kind:'correction',correction:true,requestId:r.id,recipientId:r.userId,title:correctionFields[r.field]+' · '+title,summary:message,at:nowIso(),readAt:null,destination:'/me/corrections/'+r.id});const owned=state.notices.filter(n=>n.recipientId===r.userId);if(owned.length>300){const drop=new Set(owned.slice(0,owned.length-300).map(n=>n.id));state.notices=state.notices.filter(n=>!drop.has(n.id));}}
  async submit(user,form){if(!user)throw fault('请先登录',401);const fields=Object.keys(correctionFields).filter(key=>form['include_'+key]==='1');if(!fields.length)throw fault('请至少选择一项需要纠错的资料');const token=clean(form.token||'',24);if(!/^[a-f0-9]{24}$/.test(token))throw fault('提交表单无效，请刷新');const reason=clean(form.reason||'',2000),links=this.links(form.links);if(reason.length<8)throw fault('请用至少 8 字说明问题与依据');const values=Object.fromEntries(fields.map(key=>[key,correctionValue(key,form['value_'+key]||'')]));const fingerprint=hash([form.gid,values,reason,links]);
    return this.serial(state=>{const prior=state.requests.filter(r=>r.userId===user.id&&r.token===token);if(prior.length){if(prior[0].fingerprint!==fingerprint)throw fault('这份表单已经提交，请勿重复提交不同内容',409);return {unchanged:true,value:prior};}
      if(state.requests.length+fields.length>10000||state.requests.filter(r=>r.userId===user.id&&open(r.status)).length+fields.length>30)throw fault('待处理纠错较多，请先等待或补充已有纠错',429);
      const {source,effective}=this.verify(form.ticket,user,form.gid,fields),at=nowIso();const rows=fields.map(field=>{const value=values[field],before=valueOf(effective,field);if(!specialFields.has(field)&&hash(value)===hash(field==='cover'&&this.cover(form.gid)?this.cover(form.gid).value:before))throw fault(correctionFields[field]+'与现有资料相同，无需重复提交');if(state.requests.some(r=>r.userId===user.id&&r.gid===String(form.gid)&&r.field===field&&open(r.status)))throw fault('你已有这一字段的待处理纠错，请从「我的纠错」补充',409);
        return {id:newId(12),token,fingerprint,gid:String(source.gid),workTitle:source.chineseName||source.name,userId:user.id,field,value,beforeSource:valueOf(source,field),beforeEffective:field==='cover'&&this.cover(form.gid)?this.cover(form.gid).value:before,reason,links,status:'pending',revision:0,events:[],at,updatedAt:at};});state.requests.push(...rows);return rows;});}
  async memberChange(user,id,form){return this.serial(state=>{const r=state.requests.find(x=>x.id===this.row(id,user).id);if(String(r.revision)!==String(form.revision))throw fault('这条纠错已更新，请刷新',409);if(!open(r.status))throw fault('这条纠错已处理，不能再修改',409);const note=clean(form.note||'',2000),links=form.action==='supplement'?this.links(form.links||''):[];if(form.action==='withdraw'){r.status='withdrawn';}else if(form.action==='supplement'){if(note.length<8)throw fault('补充说明至少 8 字');r.status='pending';}else throw fault('操作无效');r.events.push({kind:form.action,note,links,actorId:user.id,at:nowIso()});r.revision++;r.updatedAt=nowIso();return r;});}
  async review(user,id,form){if(!this.canReview(user))throw fault('只有管理员可以审核纠错',403);return this.serial(state=>{const r=state.requests.find(x=>x.id===this.row(id,user,{admin:true}).id);if(String(r.revision)!==String(form.revision))throw fault('其他审核员已处理，请刷新',409);if(!open(r.status))throw fault('这条纠错已经处理',409);if(!['accept','information','reject','resolve'].includes(form.action))throw fault('审核操作无效');const note=clean(form.note||'',2000);if(note.length<2)throw fault('请填写处理原因');
      if(form.action==='accept'||form.action==='resolve'){
        if(specialFields.has(r.field)!==(form.action==='resolve'))throw fault('关联与图片问题需要专项核对，不能直接覆盖资料');
        const {source,effective}=this.verify(form.ticket,user,r.gid,[r.field]);const changed=hash(valueOf(source,r.field))!==hash(r.beforeSource)||hash(r.field==='cover'&&this.cover(r.gid)?this.cover(r.gid).value:valueOf(effective,r.field))!==hash(r.beforeEffective);
        if(changed&&form.ackChanged!=='1')throw fault('提交后资料已有变化，请对照最新资料并勾选确认',409);
        if(form.action==='accept'){
          const value=correctionValue(r.field,form.adoptValue??storedValue(r.field,r.value));let o=state.overrides.find(x=>x.gid===r.gid&&x.field===r.field);if(!o){o={gid:r.gid,field:r.field,active:false,revision:0,history:[]};state.overrides.push(o);}
          const publicReference=form.publicReference?correctionURL(form.publicReference):'';
          o.history.push({id:newId(12),kind:'apply',value,sourceValue:valueOf(source,r.field),requestId:r.id,actorId:user.id,note,publicReference,at:nowIso()});Object.assign(o,{value,active:true,revision:o.revision+1,updatedAt:nowIso(),requestId:r.id});r.status='accepted';
        }else{if(!form.resolutionLink)throw fault('专项处理请附核对结果或处理记录链接');r.resolutionLink=correctionURL(form.resolutionLink);r.status='resolved';}
      }else r.status=form.action==='information'?'information':'rejected';
      r.events.push({kind:form.action,note,actorId:user.id,at:nowIso()});r.revision++;r.updatedAt=nowIso();this.notify(state,r,note);return r;});}
  async revoke(user,gid,field,form){if(!this.canReview(user))throw fault('只有管理员可以撤销修正',403);return this.serial(state=>{const o=state.overrides.find(x=>x.gid===gid&&x.field===field);if(!o?.active)throw fault('该字段没有启用的修正',409);if(String(o.revision)!==String(form.revision))throw fault('修正已经变化，请刷新后重试',409);this.verify(form.ticket,user,gid,[field]);const note=clean(form.note||'',2000);if(note.length<2)throw fault('请填写撤销原因');o.history.push({id:newId(12),kind:'revoke',value:o.value,actorId:user.id,note,at:nowIso()});o.active=false;o.revision++;o.updatedAt=nowIso();const r=state.requests.find(x=>x.id===o.requestId);if(r)this.notify(state,r,'本地修正已撤销，恢复使用最新源站资料。原因：'+note,'修正已撤销');return o;});}
  pendingReviewRows(state=this.state){return state.requests.filter(r=>r.status==='pending').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id)).slice(0,300);}
  reviewer(userId){return this.canReview(this.db.users?.get(userId));}
  reviewNotices(userId){
    if(!this.reviewer(userId))return [];
    const reads=new Map((this.state.reviewReads||[]).filter(n=>n.recipientId===userId).map(n=>[n.requestId+':'+n.revision,n.readAt]));
    // Existing pending requests become visible without a data migration or
    // modifying their contents. Each new revision has an independent reminder.
    return this.pendingReviewRows().map(r=>({id:'correction-review-'+r.id+'-'+r.revision,kind:'correction',correction:true,review:true,requestId:r.id,recipientId:userId,title:r.workTitle+' · '+correctionFields[r.field],summary:(r.events.some(e=>e.kind==='supplement')?'成员已补充这条资料纠错，请重新核对。':'有成员提交了资料纠错，等待管理员审核。'),at:r.updatedAt,readAt:reads.get(r.id+':'+r.revision)||null,destination:'/admin/corrections/'+r.id}));
  }
  reviewEntry(userId){return this.reviewer(userId)?{pending:this.state.requests.filter(r=>r.status==='pending').length}:null;}
  markReviewRead(state,userId,requestId,revision,at=nowIso()){
    const pending=new Map(state.requests.filter(r=>r.status==='pending').map(r=>[r.id,r.revision]));
    state.reviewReads=(state.reviewReads||[]).filter(n=>pending.get(n.requestId)===n.revision&&this.reviewer(n.recipientId));
    if(!state.reviewReads.some(n=>n.recipientId===userId&&n.requestId===requestId&&n.revision===revision))state.reviewReads.push({recipientId:userId,requestId,revision,readAt:at});
    const own=state.reviewReads.filter(n=>n.recipientId===userId).sort((a,b)=>b.readAt.localeCompare(a.readAt));
    if(own.length>300){const keep=new Set(own.slice(0,300));state.reviewReads=state.reviewReads.filter(n=>n.recipientId!==userId||keep.has(n));}
  }
  notices(userId){return [...this.state.notices.filter(n=>n.recipientId===userId),...this.reviewNotices(userId)];}
  unread(userId){return this.notices(userId).filter(n=>!n.readAt).length;}
  async readNotice(userId,id){return this.serial(state=>{
    const review=String(id).match(/^correction-review-([a-f0-9]{24})-(\d+)$/);
    if(review){const r=state.requests.find(r=>r.id===review[1]),revision=Number(review[2]);if(!this.reviewer(userId)||!r||!Number.isSafeInteger(revision)||revision>r.revision)throw fault('通知不存在',404);if(r.status!=='pending'||r.revision!==revision)return {unchanged:true,value:'/admin/corrections/'+r.id};this.markReviewRead(state,userId,r.id,revision);return '/admin/corrections/'+r.id;}
    const n=state.notices.find(x=>x.id===id&&x.recipientId===userId);if(!n)throw fault('通知不存在',404);n.readAt||=nowIso();return n.destination;});}
  async readAll(userId,before){return this.serial(state=>{for(const n of state.notices)if(n.recipientId===userId&&n.at<=before)n.readAt||=nowIso();if(this.reviewer(userId))for(const r of this.pendingReviewRows(state))if(r.updatedAt<=before)this.markReviewRead(state,userId,r.id,r.revision);return true;});}
}
