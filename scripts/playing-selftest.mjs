import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {playingWorks} from '../src/lib/playing.js';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kaeto-playing-'));
process.env.DATA_DIR=dir;
const {createApp}=await import('../src/server.js');
let app;
try{
 app=await createApp({dataDir:dir,mailer:{ready:false}});
 const a=await app.db.users.insert({username:'playing-a',uid:19001}),b=await app.db.users.insert({username:'playing-b',uid:19002});
 const games=[];
 for(let i=0;i<26;i++){
  const game=await app.db.games.insert({gid:995000+i,name:'在玩作品'+i,introduction:'简介'});games.push(game);
  await app.db.checkins.insert({userId:a.id,gameId:game.id,status:i===25?'done':'doing',updatedAt:'2026-10-'+String(i+1).padStart(2,'0')});
 }
 await app.db.checkins.insert({userId:b.id,gameId:games[0].id,status:'doing',updatedAt:'2026-10-01'});
 await app.db.checkins.insert({userId:'deleted-member',gameId:games[24].id,status:'doing',updatedAt:'2026-12-01'});
 await app.db.checkins.insert({userId:b.id,gameId:'missing-game',status:'doing'});
 const decorate=(db,g)=>({...g,stats:db.gameStats(g.id)});
 const rows=playingWorks(app.db,decorate);
 assert.equal(rows.length,25);assert.equal(rows[0].id,games[0].id);assert.equal(rows[0].stats.doing,2);assert.equal(rows.find(g=>g.id===games[24].id).stats.doing,1);
 assert.equal(playingWorks(app.db,decorate,'recent')[0].id,games[24].id);
 console.log('✓ 仅当前在玩作品；排除离站成员、失效作品和已完成状态，人数去重与排序一致');
 assert.equal(rows[0].playingMembers.length,2);assert.equal(rows[0].playingMembers[0].href,'/me/19001');assert.deepEqual(Object.keys(rows[0].playingMembers[0]).sort(),['avatar','href','name']);
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 const get=async route=>{const r=await fetch(base+route);assert.equal(r.status,200);return r.text();};
 const home=await get('/');assert.match(home,/href="\/playing">查看全部在玩/);
 const first=await get('/playing?sort=recent');assert.equal((first.match(/class="game-card"/g)||[]).length,24);assert.match(first,/共 <strong>25<\/strong>/);assert.match(first,/sort=recent&amp;page=2|sort=recent&pages?=2/);
 const second=await get('/playing?sort=recent&page=2');assert.equal((second.match(/class="game-card"/g)||[]).length,1);
 assert.match(second,/class="playing-member" href="\/me\/19001"/);assert.match(second,/playing-a/);assert.ok(!second.includes('deleted-member'));console.log('✓ 在玩群友头像昵称可进公开主页，不输出邮箱或内部 ID');
 assert.match(await get('/playing?page=999999'),/第 2 \/ 2 页/);
 assert.ok(!(await get('/playing?sort=%3Cscript%3E')).includes('<script>'));
 console.log('✓ 首页专属入口、游客可读、24 部翻页、排序保留和越界页保护');
 for(const c of app.db.checkins.list.filter(c=>c.status==='doing'))await app.db.checkins.update(c.id,{status:'done'});
 assert.match(await get('/playing'),/还没有群友标记在玩/);assert.ok(!(await get('/playing')).includes('class="game-card"'));
 console.log('✓ 完成打卡后立即移出；空列表不回填其他作品，不访问外部资料源');
}finally{if(app?.server.listening)await new Promise(resolve=>app.server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
