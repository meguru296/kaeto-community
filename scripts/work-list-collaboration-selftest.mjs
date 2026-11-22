import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/server.js';
import {WorkLists} from '../src/lib/work-lists.js';
import {newId} from '../src/lib/utils.js';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kaeto-collaboration-'));
const app=await createApp({dataDir:dir,mailer:{ready:false}});
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('✓ '+name);};
try{
 const users=[];for(let i=0;i<13;i++)users.push(await app.db.users.insert({username:'collab-'+i,nickname:'清单成员'+i,uid:19200+i}));
 const [owner,alice,bob,eve]=users,cookies=new Map();for(const u of users)cookies.set(u.id,'gr_session='+(await app.auth.createSession(u.id)).id);
 const game=await app.db.games.insert({gid:999601,name:'共同整理的故事'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 const get=(url,user)=>fetch(base+url,{redirect:'manual',headers:{Cookie:cookies.get(user?.id)||''}});
 const post=(route,data,user=owner,origin=base)=>fetch(base+'/api/'+route,{method:'POST',redirect:'manual',headers:{Cookie:cookies.get(user?.id)||'',Origin:origin,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});
 let row=await app.workLists.create(owner,{title:'协作清单',description:'私密描述不能出现在邀请页面',token:newId(12),gid:String(game.gid)}),id=row.id;
 const current=()=>app.workLists.get(id,owner);
 const collaborate=(user,action,fields={})=>app.workLists.collaborate(user,id,{action,revision:current().revision,...fields});
 let response=await post('lists/collaborate',{id,action:'invite',revision:0,uid:alice.uid},null);check('游客不能邀请',()=>assert.equal(response.status,401));
 response=await post('lists/collaborate',{id,action:'invite',revision:0,uid:alice.uid},owner,'https://evil.example');check('协作写入拒绝跨站请求',()=>assert.equal(response.status,403));
 response=await post('lists/collaborate',{id,action:'invite',revision:0,uid:alice.uid});check('创建者可按 UID 邀请，接受前不授予权限',()=>{assert.equal(response.status,200);assert.equal(app.workLists.canEdit(current(),alice),false);});
 let invite=current().invitations[0];const notice=app.workLists.notices(alice.id)[0];
 check('邀请进入现有消息中心和未读计数',()=>{assert.equal(app.workLists.unread(alice.id),1);assert.equal(app.reviewCommunity.unread(alice.id),1);assert.ok(notice.href.endsWith(invite.id));});
 response=await get('/messages?type=list',alice);check('消息中心可筛选协作邀请',()=>assert.equal(response.status,200));const inbox=await response.text();assert.ok(inbox.includes('协作清单'));assert.ok(inbox.includes('查看协作邀请'));
 for(const u of [alice,eve]){assert.equal((await get('/lists/'+id,u)).status,404);assert.equal((await get('/lists/'+id+'/edit',u)).status,404);}
 check('待接受邀请不能读取私密内容或编辑',()=>{});
 response=await get('/lists/invitations/'+invite.id,alice);let html=await response.text();check('邀请页只展示名称和权限说明，不泄露私密描述和作品',()=>{assert.equal(response.status,200);assert.ok(html.includes('接受邀请'));assert.ok(!html.includes(row.description));assert.ok(!html.includes(game.name));assert.match(response.headers.get('cache-control'),/no-store/);});
 assert.equal((await get('/lists/invitations/'+invite.id,eve)).status,404);
 response=await get('/lists/invitations/'+invite.id);check('登录可返回准确的邀请地址',()=>assert.ok(decodeURIComponent(response.headers.get('location')).includes('/lists/invitations/'+invite.id)));
 response=await post('lists/collaborate',{id,action:'accept',invitationId:invite.id},eve);check('其他成员不能代接受邀请',()=>assert.equal(response.status,404));
 const sameRevision=current().revision;await collaborate(owner,'invite',{uid:alice.uid});check('同一待接受邀请不会重复发消息',()=>{assert.equal(current().revision,sameRevision);assert.equal(app.workLists.notices(alice.id).length,1);});
 response=await post('lists/collaborate',{id,action:'accept',invitationId:invite.id},alice);check('接受邀请后私密清单和编辑接口立即可用',()=>{assert.equal(response.status,200);assert.equal(app.workLists.canEdit(current(),alice),true);assert.equal(app.workLists.unread(alice.id),0);});
 for(const route of ['/lists/'+id,'/lists/'+id+'/edit','/api/lists/'+id+'/membership'])assert.equal((await get(route,alice)).status,200);
 const acceptedRevision=current().revision;await collaborate(alice,'accept',{invitationId:invite.id});assert.equal(current().revision,acceptedRevision);
 html=await(await get('/me/lists',alice)).text();check('协作清单出现在我的清单，可从编辑页进入协作管理',()=>assert.ok(html.includes('/lists/'+id)));
 html=await(await get('/lists/'+id+'/edit',alice)).text();check('协作者界面不显示邀请和删除操作，可主动退出',()=>{assert.ok(html.includes('退出协作'));assert.ok(!html.includes('发送邀请'));assert.ok(!html.includes('移入回收站'));assert.match(html,/fieldset[^>]*disabled/);});
 response=await post('lists/change',{id,revision:current().revision,action:'update',title:'一起写的清单',description:'共同编辑',tags:'夏日, RPG'},alice);check('协作者可修改名称描述与标签，未提交公开状态仍保留私密',()=>{assert.equal(response.status,200);assert.equal(current().visibility,'private');assert.equal(current().title,'一起写的清单');assert.deepEqual(current().tags,['夏日','RPG']);});
 for(const fields of [{action:'update',visibility:'public',title:'越权'},{action:'delete'}]){response=await post('lists/change',{id,revision:current().revision,...fields},alice);assert.equal(response.status,403);}
 for(const action of ['invite','remove','revoke']){response=await post('lists/collaborate',{id,revision:current().revision,action,uid:bob.uid,userId:owner.id,invitationId:invite.id},alice);assert.equal(response.status,403);}
 check('只有创建者能改可见范围、删除及管理协作者',()=>assert.equal(current().visibility,'private'));
 const stale=current().revision;await app.workLists.change(alice,id,{action:'note',revision:stale,gid:String(game.gid),note:'协作者的推荐语'});
 response=await post('lists/change',{id,revision:stale,action:'note',gid:String(game.gid),note:'旧页覆盖'});check('多人同时编辑不会覆盖先保存的内容',()=>{assert.equal(response.status,409);assert.equal(current().items[0].note,'协作者的推荐语');});
 await collaborate(owner,'invite',{uid:bob.uid});invite=current().invitations.at(-1);await collaborate(owner,'revoke',{invitationId:invite.id});await assert.rejects(collaborate(bob,'accept',{invitationId:invite.id}),e=>e.status===409);check('撤回的邀请无法再接受',()=>{});
 await collaborate(owner,'invite',{uid:bob.uid});invite=current().invitations.at(-1);await collaborate(bob,'decline',{invitationId:invite.id});assert.equal(app.workLists.canEdit(current(),bob),false);check('婉拒邀请不授予访问权限',()=>{});
 await collaborate(owner,'invite',{uid:bob.uid});invite=current().invitations.at(-1);
 await app.workLists.serial(state=>{const r=state.lists.find(x=>x.id===id);r.invitations.at(-1).expiresAt='2000-01-01T00:00:00.000Z';return {row:r};});await assert.rejects(collaborate(bob,'accept',{invitationId:invite.id}),e=>e.status===409);check('过期邀请需要创建者重新发送',()=>{});
 // Acceptance order is deliberate: Carol-like third user joins before Bob.
 for(const u of [eve,bob,...users.slice(4)]){await collaborate(owner,'invite',{uid:u.uid});await collaborate(u,'accept',{invitationId:current().invitations.at(-1).id});}
 check('协作者超过十人仍可接受，不设置人数上限',()=>assert.equal(current().collaborators.length,12));
 await app.workLists.change(owner,id,{action:'update',revision:current().revision,title:current().title,description:'公开后可分享',visibility:'public'});
 html=await(await get('/lists/'+id)).text();const groupStart=html.indexOf('<span class="wl-collaborator-avatars"'),group=html.slice(groupStart,html.indexOf('</span></span>',html.indexOf('<span class="wl-more-collaborators"',groupStart))+14);
 check('公开头像最多三位：创建者、最早接受的两位，余下显示 +N',()=>{assert.equal((group.match(/<a href=/g)||[]).length,3);assert.ok(group.indexOf('/me/'+owner.uid)<group.indexOf('/me/'+alice.uid));assert.ok(group.indexOf('/me/'+alice.uid)<group.indexOf('/me/'+eve.uid));assert.ok(!group.includes('/me/'+bob.uid));assert.ok(group.includes('+10'));});
 await app.workLists.change(owner,id,{action:'update',revision:current().revision,title:current().title,visibility:'private'});await collaborate(owner,'remove',{userId:alice.id});
 for(const route of ['/lists/'+id,'/lists/'+id+'/edit','/api/lists/'+id+'/membership'])assert.equal((await get(route,alice)).status,404);
 response=await post('lists/change',{id,revision:current().revision,action:'note',gid:String(game.gid),note:'撤销后写入'},alice);check('移除成员立即撤销私密访问和所有写入',()=>assert.equal(response.status,404));
 await collaborate(owner,'invite',{uid:alice.uid});await collaborate(alice,'accept',{invitationId:current().invitations.at(-1).id});check('移除后重新邀请接受，排在新加入顺序末尾',()=>assert.equal(current().collaborators.at(-1).userId,alice.id));
 await collaborate(alice,'leave');check('协作者可退出，创建者不能退出自己的清单',()=>assert.equal(app.workLists.canEdit(current(),alice),false));await assert.rejects(collaborate(owner,'leave'));
 const seen=app.workLists.unread(owner.id);assert.ok(seen>0);await post('notifications/read-all',{before:new Date().toISOString()},owner);check('消息中心一键已读包括协作结果',()=>assert.equal(app.workLists.unread(owner.id),0));
 const reloaded=await new WorkLists(app.db).init();check('重启保留邀请、成员顺序和私密权限',()=>assert.deepEqual(reloaded.state,app.workLists.state));
 const legacy=structuredClone(app.workLists.state);delete legacy.notices;for(const r of legacy.lists){delete r.collaborators;delete r.invitations;}const old=await new WorkLists({...app.db,kv:{get:async()=>legacy}}).init();check('旧清单无需迁移或重写即可继续使用',()=>{assert.equal(old.get(id,owner).id,id);assert.equal(old.canEdit(old.get(id,owner),bob),false);});
 const failing=new WorkLists({...app.db,kv:{get:async()=>app.workLists.state,set:async()=>{throw Error('database unavailable');}}});await failing.init();const before=structuredClone(failing.state);await assert.rejects(failing.collaborate(owner,id,{action:'remove',revision:current().revision,userId:bob.id}));check('存储失败不发布成员变更，权限保持原样',()=>assert.deepEqual(failing.state,before));
 await app.workLists.change(owner,id,{action:'delete',revision:current().revision});assert.equal((await get('/lists/'+id,bob)).status,404);await assert.rejects(app.workLists.collaborate(bob,id,{action:'leave'}),e=>e.status===404);check('移入回收站后协作者不能读取、修改或接受旧邀请',()=>{});
 console.log(`${checks} 项协作、权限、通知与持久化检查通过；全部使用隔离数据。`);
}finally{await app.drain();await new Promise(r=>app.server.close(r));await app.db.close();await fs.rm(dir,{recursive:true,force:true});}
