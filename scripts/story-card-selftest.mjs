import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApp} from '../src/server.js';
import {layout} from '../src/pages.js';
import {pageAssets} from '../src/lib/browser-assets.js';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kaeto-story-'));let app,checks=0;
const check=(name,fn)=>{fn();checks++;console.log('✓ '+name);};
try{
 const configPath=path.join(dir,'config.json');await fs.writeFile(configPath,JSON.stringify({site:{name:'测试',host:'127.0.0.1',port:0},ymgal:{},security:{ensureInviteOnBoot:false}}));app=await createApp({configPath,dataDir:path.join(dir,'data'),mailer:{ready:false}});
 const member=await app.db.users.insert({uid:19888,username:'card-member',nickname:'卡片<script>',email:'private@example.com',passwordHash:'private-hash',bio:'只分享我选的故事',joinedAt:'2022-10-31T16:30:00.000Z'}),other=await app.db.users.insert({username:'other'});
 const games=[];for(let i=0;i<5;i++){games.push(await app.db.games.insert({gid:998800+i,name:i?'作品 '+i:'长标题 </script><script>evil</script>',mainImg:'/img/community/avatar.webp'}));await app.db.checkins.insert({userId:member.id,gameId:games[i].id,status:['done','done','doing','wish','dropped'][i]});}
 const privateGame=await app.db.games.insert({gid:998899,name:'别人的作品',mainImg:'/img/community/avatar.webp'});await app.db.checkins.insert({userId:other.id,gameId:privateGame.id,status:'done'});
 await app.db.ratings.insert({userId:member.id,gameId:games[0].id,score:9});await app.db.reviews.insert({userId:member.id,gameId:games[0].id,content:'不要进入资历卡数据的长评'});
 await app.db.characterFollows.insert({userId:member.id,characterId:'vndb-c999999999'});
 const recordsSnapshot=()=>JSON.stringify([app.db.games.all(),app.db.checkins.all(),app.db.ratings.all(),app.db.reviews.all(),app.db.characterFollows.all()]);
 const before=recordsSnapshot();
 app.bangumiCharacters.interval=0;app.bangumiCharacters.token='private-character-test-token';app.bangumiCharacters.fetcher=async url=>url.endsWith('/subjects')?Response.json([{name:'无生日作品',type:4}]):Response.json({total:1,data:[{id:99988,name:'无生日角色',nsfw:false,images:{},infobox:[]}]});
 const {cngal,vndb,portraits}=app.storyCharacters;
 cngal.api.interval=vndb.api.interval=0;
 const cnRole={id:99988,type:'Role',name:'无生日角色',mainImage:'https://tucang.cngal.top/api/image/show/abcd?https://image.cngal.org/images/a.png',addInfors:[{modifier:'登场游戏',contents:[{displayName:'国产原作'}]}]};
 const vnRole={id:'c99988',name:'Role name',original:'无生日角色',image:{url:'https://t.vndb.org/ch/11/111.jpg',sexual:1.5,violence:0},vns:[{title:'剧透关联',spoiler:1},{title:'视觉小说原作',spoiler:0,role:'primary'}]};
 cngal.fetcher=async input=>{
   const url=new URL(input);assert.equal(url.hostname,'api.cngal.org');
   if(url.pathname.endsWith('/99988'))return Response.json({...cnRole,thumbnail:cnRole.mainImage});
   assert.equal(url.searchParams.get('Types'),'Role');
   assert.equal(url.searchParams.get('Page'),'1');
   return Response.json({pagedResultDto:{totalCount:1,totalPages:1,data:[{entry:cnRole}]}});
 };
 let failVndb=false;
 vndb.fetcher=async (url,options)=>{
   assert.equal(url,'https://api.vndb.org/kana/character');
   assert.equal(options.headers.Authorization,undefined);
   if(failVndb)return new Response(null,{status:503});
   const query=JSON.parse(options.body);
   if(query.filters[0]==='id')return Response.json({results:[vnRole],more:false});
   return Response.json({results:query.page===1?[vnRole]:[{...vnRole,id:'c99989'}],more:query.page===1});
 };
 const png=await sharp({create:{width:96,height:96,channels:3,background:'#4c8'}}).png().toBuffer();
 const portraitRequests=[];
 portraits.fetchImage=async (url,options)=>{
   portraitRequests.push(url);assert.equal(options.redirect,'error');
   return new Response(png,{headers:{'Content-Type':'image/png'}});
 };
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port,cookie='gr_session='+(await app.auth.createSession(member.id)).id,get=(url,auth=true)=>fetch(base+url,{redirect:'manual',headers:auth?{Cookie:cookie}:{}});
 let r=await get('/me/story-card',false);assert.equal(r.status,303);assert.match(r.headers.get('location'),/login.*next=/);checks++;
 const parseCard=html=>JSON.parse(html.match(/data-story-data>(.*?)<\/script>/s)[1]);
 r=await get('/me/story-card');const html=await r.text(),data=parseCard(html);
 check('游玩含玩过与在玩，注册日期按香港时区显示，旧草稿有默认外观',()=>{assert.equal(data.played,3);assert.equal(data.registeredDate,'2022-11-01');assert.equal(data.draft.name,member.nickname);assert.ok(data.level>=1);assert.equal(data.draft.appearance.palette,'pine');assert.deepEqual(data.draft.characters,[]);});
 check('独立生成页与数据转义，页面不缓存',()=>{assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(html,/data-story-canvas/);assert.match(html,/不上传生成的图片/);assert.ok(!html.includes('卡片<script>'));assert.ok(!html.includes('</script><script>evil'));});
 check('不序列化邮箱、密码、评论、内部 ID 和其他成员记录',()=>{const json=JSON.stringify(data);for(const secret of ['private@example.com','private-hash','不要进入资历卡数据的长评',member.id,other.id,'别人的作品'])assert.ok(!json.includes(secret),secret);});
 r=await get('/api/me/story-card/cover/998803');check('未打卡为玩过的作品封面也可选，受登录保护且不缓存',()=>{assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^image\//);assert.match(r.headers.get('cache-control'),/private, no-store/);});await r.arrayBuffer();
 assert.equal((await get('/api/me/story-card/cover/998800',false)).status,401);
 assert.equal((await get('/api/me/story-card/cover/998888')).status,404);
 const searchWorks=await (await get('/api/me/story-card/works?q='+encodeURIComponent('作品 3'))).json();
 check('从网站资料库搜索并选取作品',()=>assert.ok(searchWorks.rows.some(work=>work.gid==='998803')));
 r=await get('/api/me/story-card/characters?q=无生日');const search=await r.json();check('Bangumi 角色无生日仍可检索，不改动角色收藏或暴露令牌',()=>{assert.equal(r.status,200);assert.equal(search.rows[0].id,'bgm-character-99988');assert.ok(!JSON.stringify(search).includes(app.bangumiCharacters.token));});r=await get('/api/me/story-card/character/99988');assert.equal((await r.json()).character.work,'无生日作品');
 for(const route of ['/api/me/story-card/works?q=test','/api/me/story-card/characters?source=all&q=test','/api/me/story-card/character/99988','/api/me/story-card/character/vndb-c99988','/api/me/story-card/character-image/cngal-99988']){r=await get(route,false);assert.equal(r.status,401);}checks++;console.log('✓ 作品与角色搜索、详情、图片仅限登录');
 const mixed=await (await get('/api/me/story-card/characters?source=all&q=无生日')).json();
 check('全部来源并列显示，按正式编号区分同名和同编号角色',()=>{
   assert.deepEqual(mixed.rows.map(row=>row.id),['bgm-character-99988','cngal-99988','vndb-c99988']);
   assert.deepEqual(mixed.rows.map(row=>row.provider),['Bangumi','CnGal','VNDB']);
   assert.deepEqual(mixed.rows.map(row=>row.work),['','国产原作','视觉小说原作']);
   assert.ok(mixed.hasNext);
   assert.match(html,/data-story-character-source/);
 });
 const next=await (await get('/api/me/story-card/characters?source=vndb&q=无生日&page=2')).json();
 assert.deepEqual(next.rows.map(row=>row.id),['vndb-c99989']);
 assert.equal(next.hasNext,false);
 assert.equal((await get('/api/me/story-card/characters?source=unknown&q=test')).status,400);
 failVndb=true;
 const partial=await (await get('/api/me/story-card/characters?source=all&q=新查询')).json();
 check('单一来源故障时仍返回其他来源并提示',()=>{
   assert.deepEqual(partial.unavailable,['VNDB']);
   assert.deepEqual(partial.rows.map(row=>row.provider),['Bangumi','CnGal']);
 });
 failVndb=false;
 cngal.characters.clear();
 const detail=await (await get('/api/me/story-card/character/cngal-99988')).json();
 assert.equal(detail.character.id,'cngal-99988');
 for(const row of mixed.rows.slice(1)){
   const image=await get(row.image);
   assert.equal(image.status,200);
   assert.match(image.headers.get('cache-control'),/private, no-store/);
   assert.equal(Buffer.from(await image.arrayBuffer()).subarray(8,12).toString(),'WEBP');
 }
 const original=await app.storyCharacters.image({source:'vndb',number:99988,id:'vndb-c99988'},true);
 check('画像同源代理，只访问验证的图片域名，高敏感 VNDB 图保留遮挡',()=>{
   assert.deepEqual(portraitRequests,['https://image.cngal.org/images/a.png','https://t.vndb.org/ch/11/111.jpg']);
   assert.equal(original.subarray(8,12).toString(),'WEBP');
 });
 const post=(draft,{session=cookie,origin=base,type='application/json'}={})=>fetch(base+'/api/me/story-card',{method:'POST',headers:{Cookie:session,Origin:origin,'Content-Type':type},body:JSON.stringify(draft)});
 const voiceActors=['声优甲','声优乙','声优丙','声优丁','声优戊'];
 const draft={revision:'',name:'独有的资历卡名字',startYear:2019,note:'海风</script><script>evil</script>',socials:{bilibili:'@ 潮汐书架',xiaohongshu:'书架来信',x:'story_shelf'},appearance:{palette:'custom',background:'#F9EFE9',accent:'#A24D59',font:'serif',weight:'bold',size:'large'},preferences:{genres:['日常'],artists:['画师甲'],writers:['编剧甲'],voiceActors,brands:['厂商甲'],songs:['歌曲甲'],traits:['反差']},characters:[99988,'cngal-99988','vndb-c99988'],works:{favorite:'998803',first:'998800',replay:'998801',regret:'998802',worst:'998804'}};
 assert.equal((await post(draft,{session:''})).status,401);
 assert.equal((await post(draft,{origin:'https://outside.example'})).status,403);
 assert.equal((await post(draft,{type:'text/plain'})).status,415);
 for(const invalid of [{note:'甲'.repeat(51)},{startYear:data.currentYear+1},{characters:Array.from({length:11},(_,i)=>i+1)},{characters:['cngal-0']},{preferences:{songs:['甲','乙','丙','丁','戊','己']}},{preferences:{voiceActors:[...voiceActors,'声优己']}},{works:{favorite:'998888'}},{appearance:{font:'unknown'}},{appearance:{accent:'url(/img/logo.svg)'}},{socials:{x:'甲'.repeat(49)}}]){
   assert.equal((await post({...draft,...invalid})).status,400);
 }
 check('无效草稿不会写进账号',()=>assert.equal(app.db.users.get(member.id).storyCard,undefined));
 const response=await post({...draft,played:99999,image:'never-store-an-image'});
 assert.equal(response.status,200);
 const saved=await response.json();
 const readback=await (await get('/me/story-card')).text();
 const disk=JSON.parse(await fs.readFile(path.join(dir,'data','users.json'),'utf8')).find(user=>user.id===member.id).storyCard;
 check('可手动填写五位声优，保存后可读回且提供给长图',()=>{
   assert.match(html,/data-story-preference="voiceActors"/);
   assert.deepEqual(disk.preferences.voiceActors,voiceActors);
   const card=parseCard(readback);
   assert.ok(card.preferences.some(([key,label])=>key==='voiceActors'&&label==='最喜欢的声优'));
   assert.deepEqual(card.draft.preferences.voiceActors,voiceActors);
 });
 check('刷新可读回云端草稿，持久层仅保存资料与标识',()=>{
   assert.deepEqual(parseCard(readback).draft,saved.draft);
   assert.equal(parseCard(readback).played,3);
   assert.ok(!readback.includes('</script><script>evil'));
   assert.equal(disk.revision,saved.revision);
   assert.equal(Object.keys(disk.works).length,5);
   assert.equal(disk.characters[0].bangumiId,99988);
   assert.equal(saved.draft.characters[0].name,'无生日角色');
   assert.deepEqual(disk.characters.map(row=>row.id),mixed.rows.map(row=>row.id));
   assert.ok(disk.characters.every(row=>!row.image&&!row.source));
   assert.deepEqual(saved.draft.appearance,{...draft.appearance,background:'#f9efe9',accent:'#a24d59'});
   assert.deepEqual(saved.draft.socials,{...draft.socials,bilibili:'潮汐书架'});
   assert.equal(disk.image,undefined);
   assert.equal(disk.played,undefined);
 });
 for(const icon of ['bilibili','xiaohongshu','x']){
   const logo=await get('/img/story-card/'+icon+'.svg',false);
   assert.equal(logo.status,200);
   assert.match(logo.headers.get('content-type'),/^image\/svg\+xml/);
 }
 const otherSession='gr_session='+(await app.auth.createSession(other.id)).id;
 const otherPage=await (await fetch(base+'/me/story-card',{headers:{Cookie:otherSession}})).text();
 check('其他账号看不到草稿，已知他人的草稿版本也无法修改',()=>assert.ok(!otherPage.includes(draft.name)));
 assert.equal((await post({...draft,revision:saved.revision},{session:otherSession})).status,409);
 delete disk.characters[0].id;
 await app.db.users.update(member.id,{storyCard:disk});
 check('旧版草稿的 Bangumi 数字编号仍能加载',()=>assert.equal(disk.characters[0].bangumiId,99988));
 const legacy=parseCard(await (await get('/me/story-card')).text());
 assert.equal(legacy.draft.characters[0].id,'bgm-character-99988');
 app.bangumiCharacters.characters.clear();cngal.characters.clear();vndb.characters.clear();
 app.bangumiCharacters.fetcher=async()=>{throw new Error('Upstream offline');};
 cngal.fetcher=vndb.fetcher=app.bangumiCharacters.fetcher;
 const conflicting=await Promise.all([post({...draft,revision:saved.revision,note:'更新甲'}),post({...draft,revision:saved.revision,note:'更新乙'})]);
 check('角色来源暂不可用时仍可保存已选角色，并保护并发的较新版本',()=>assert.deepEqual(conflicting.map(response=>response.status).sort(),[200,409]));
 check('个人中心与菜单都有资历卡入口',()=>{assert.ok(html.includes('href="/me/story-card"'));});const me=await get('/me');assert.ok((await me.text()).includes('mr-story-card-entry'));
 for(const [user,allowed,superAllowed]of [[null,false,false],[member,false,false],[{...member,isAdmin:true},true,false],[{...member,isAdmin:true,isSuperAdmin:true},true,true]]){const h=layout({config:app.config,user,title:'测试',body:''});assert.equal(h.includes('nav-admin-shortcut'),allowed);assert.equal(h.includes('href="/admin/runtime"'),superAllowed);if(allowed)assert.ok(h.includes('href="/admin"'));}checks++;console.log('✓ 后台入口按管理员权限显示，普通成员与游客不出现');
 const assets=pageAssets({body:html}),homeAssets=pageAssets({active:'home'});check('生成脚本仅在生成页加载，生成使用本地 PNG 而非上传',()=>{const exportPng=/canvas\.toBlob\(resolve,\s*'image\/png'\)/;assert.match(assets.scripts.content.toString(),exportPng);assert.doesNotMatch(homeAssets.scripts.content.toString(),exportPng);});
 check('编辑资历卡未改变作品、打卡、评分、评论、收藏',()=>assert.equal(recordsSnapshot(),before));
 console.log(checks+' 组资历卡与入口检查通过（隔离数据）');
}finally{if(app){if(app.server.listening)await new Promise(resolve=>app.server.close(resolve));await app.drain();}await fs.rm(dir,{recursive:true,force:true});}
