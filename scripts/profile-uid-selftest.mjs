import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/server.js';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kaeto-profile-uid-'));
const app=await createApp({dataDir:dir,mailer:{ready:false}});let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('✓ '+name);};
try{
 const first=await app.db.users.insert({username:'sharing',nickname:'分享测试',uid:10001,email:'private@example.test',passwordHash:'private-hash'});
 const second=await app.db.users.insert({username:'10001',nickname:'另一个人',uid:10002});
 const game=await app.db.games.insert({gid:990201,name:'个人主页测试作品'});
 for(let i=0;i<16;i++){const g=i===0?game:await app.db.games.insert({gid:990201+i,name:'分页作品 '+i});await app.db.checkins.insert({userId:first.id,gameId:g.id,status:'done'});}
 const cookie='gr_session='+(await app.auth.createSession(first.id)).id;
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 const shared=await fetch(base+'/me/10001'),html=await shared.text();
 check('游客能访问 UID 公开主页，不能看到本人编辑、绑定和私密信息',()=>{assert.equal(shared.status,200);assert.match(html,/分享测试/);assert.doesNotMatch(html,/private@example.test|private-hash|data-bio-open|data-avatar-open|data-collection-stamp|data-steam-connect/);});
 const ownShared=await (await fetch(base+'/me/10001',{headers:{Cookie:cookie}})).text();
 check('本人访问分享链接也只展示公开视图',()=>assert.doesNotMatch(ownShared,/data-bio-open|data-avatar-open|data-collection-stamp/));
 const own=await (await fetch(base+'/me',{headers:{Cookie:cookie}})).text();
 check('个人中心保留编辑功能并提供固定 UID 分享入口',()=>{assert.match(own,/data-share-profile="\/me\/10001"/);assert.match(own,/data-bio-open/);});
 const page=await (await fetch(base+'/me/10001?page=2')).text();
 check('UID 主页的筛选和分页继续使用 UID 路径',()=>{assert.match(page,/\/me\/10001\?filter=/);assert.match(page,/第 2 \/ 2 页/);});
 await app.db.users.update(first.id,{username:'renamed'});
 const renamed=await (await fetch(base+'/me/10001')).text();
 check('修改登录用户名不改变 UID 分享链接',()=>assert.match(renamed,/分享测试/));
 const legacy=await (await fetch(base+'/u/renamed')).text(),numericName=await (await fetch(base+'/u/10001')).text();
 check('旧用户名链接保留，数字用户名与 UID 不混淆',()=>{assert.match(legacy,/分享测试/);assert.match(numericName,/另一个人/);});
 const missing=await fetch(base+'/me/999999'),bad=await fetch(base+'/me/00010001'),privateMe=await fetch(base+'/me',{redirect:'manual'});
 check('未知或格式错误 UID 返回 404，未登录的个人中心仍要求登录',()=>{assert.equal(missing.status,404);assert.equal(bad.status,404);assert.equal(privateMe.status,303);});
 console.log(checks+' 项 UID 主页检查通过（隔离数据）');
}finally{if(app.server.listening)await new Promise(resolve=>app.server.close(resolve));await app.drain();await fs.rm(dir,{recursive:true,force:true});}
