import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/server.js';
import {WorkLists,listTags} from '../src/lib/work-lists.js';
import {pageAssets} from '../src/lib/browser-assets.js';
import {withWorkMedia,originalCover,setCoverPolicy} from '../src/lib/work-media.js';
import {runInNewContext} from 'node:vm';
import {avatarFor} from '../src/lib/avatars.js';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kaeto-work-lists-'));
const app=await createApp({dataDir:dir,mailer:{ready:false}});
let count=0,base;
function check(name,fn){fn();console.log('✓ '+name);count++;}
try{
 const user=await app.db.users.insert({username:'list-author',uid:19001}),other=await app.db.users.insert({username:'list-other',uid:19002}),admin=await app.db.users.insert({username:'list-admin',uid:19003,isAdmin:true});
 const a=await app.db.games.insert({gid:999701,name:'夏之回忆',extensionName:[{name:'Summer Memory'}],orgName:'夏之社'}),b=await app.db.games.insert({gid:999702,name:'海边的故事'}),c=await app.db.games.insert({gid:999703,name:'遮挡封面作品',mainImg:'/img/demo-cover.webp'});
 if(!process.env.DATA_DIR)throw new Error('请通过 npm run check 使用独立测试目录');
 await setCoverPolicy(c,'hide');
 const cookie='gr_session='+(await app.auth.createSession(user.id)).id,otherCookie='gr_session='+(await app.auth.createSession(other.id)).id,adminCookie='gr_session='+(await app.auth.createSession(admin.id)).id;
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;
 const get=(url,session='')=>fetch(base+url,{redirect:'manual',headers:{Cookie:session}});
 const post=(route,form,session=cookie,headers={})=>fetch(base+'/api/lists/'+route,{method:'POST',redirect:'manual',headers:{Cookie:session,Origin:base,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(form)});
 const token='a'.repeat(24),create={token,title:'夏日的故事',description:'海风、蝉鸣与漫长的午后。'};
 let res=await post('create',create,'');check('游客不能创建，管理入口保留登录返回地址',()=>assert.equal(res.status,401));
 res=await get('/lists/new?gid='+a.gid);check('登录后可返回带作品的新建入口',()=>assert.ok(decodeURIComponent(res.headers.get('location')).includes('next=/lists/new?gid='+a.gid)));
 res=await post('create',create,cookie,{Origin:'https://attacker.example'});check('跨站写入被拒绝',()=>assert.equal(res.status,403));
 res=await post('create',create);let data=await res.json(),id=data.id,row=app.workLists.get(id,user);check('新清单默认私密，有独立编号和编辑页',()=>{assert.equal(res.status,201);assert.equal(row.visibility,'private');assert.ok(data.location.includes('/lists/'+id+'/edit'));});
 res=await post('create',create);check('重复提交同一创建表单不会创建两份',()=>{assert.equal(res.status,201);assert.equal(app.workLists.owned(user).length,1);});
 for(const session of ['',otherCookie,adminCookie]){res=await get('/lists/'+id,session);check('私密清单对游客、他人和管理员均不泄露',()=>assert.equal(res.status,404));}
 res=await get('/lists');let html=await res.text();check('公开索引没有私密名称或描述',()=>{assert.ok(!html.includes(create.title));assert.ok(!html.includes(create.description));assert.match(res.headers.get('cache-control'),/no-store/);});
 res=await get('/me/'+user.uid);html=await res.text();check('个人公开主页不暴露私密清单',()=>assert.ok(!html.includes(create.title)));
 res=await post('change',{id,revision:row.revision,action:'update',title:'越权',visibility:'public'},otherCookie);check('不能利用清单编号修改他人的资料',()=>{assert.equal(res.status,404);assert.equal(app.workLists.get(id,user).title,create.title);});
 res=await post('change',{id,revision:0,action:'add',gid:a.gid});check('从已有作品加入，评分与打卡保持为空',()=>{assert.equal(res.status,200);assert.equal(app.db.ratings.all().length,0);assert.equal(app.db.checkins.all().length,0);});
 row=app.workLists.get(id,user);res=await post('change',{id,revision:row.revision,action:'add',gid:a.gid});check('同一作品不能重复加入',()=>{assert.equal(res.status,200);assert.equal(app.workLists.get(id,user).items.length,1);});
 const stale=row.revision;await post('change',{id,revision:stale,action:'add',gid:b.gid});res=await post('change',{id,revision:stale,action:'note',gid:a.gid,note:'旧页面'});check('旧标签页和并发编辑返回冲突，不覆盖新内容',()=>{assert.equal(res.status,409);assert.equal(app.workLists.get(id,user).items[0].note,'');});
 row=app.workLists.get(id,user);res=await post('change',{id,revision:row.revision,action:'move',gid:b.gid,position:1});check('支持移动作品到指定位置',()=>{assert.equal(res.status,200);assert.equal(app.workLists.get(id,user).items[0].gid,String(b.gid));});
 row=app.workLists.get(id,user);await post('change',{id,revision:row.revision,action:'note',gid:b.gid,note:'<script>alert(1)</script>\n海风吹过。'});
 row=app.workLists.get(id,user);await post('change',{id,revision:row.revision,action:'update',title:'夏日<script>清单',description:'<img src=x onerror=alert(1)>\n第二行',visibility:'public'});
 res=await get('/lists/'+id);html=await res.text();check('公开清单游客可读，标题、描述和推荐语安全转义',()=>{assert.equal(res.status,200);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('第二行'));assert.ok(html.includes('复制清单链接'));assert.ok(!html.includes('/api/lists/change'));});
 res=await get('/lists/'+id+'/edit',otherCookie);check('公开不等于可编辑',()=>assert.equal(res.status,404));
 res=await get('/lists?q='+encodeURIComponent('夏日'));html=await res.text();check('公开清单可按名称和描述搜索',()=>{assert.ok(html.includes('/lists/'+id));assert.ok(html.includes('夏日&lt;script&gt;清单'));});
 res=await get('/lists?author='+user.uid);html=await res.text();check('个人清单索引仅列指定成员公开清单',()=>assert.ok(html.includes('/lists/'+id)));
 res=await get('/me',cookie);html=await res.text();check('个人中心有管理入口，作品详情可直接加入',()=>assert.ok(html.includes('管理我的清单')));
 res=await get('/game/'+a.gid,cookie);html=await res.text();assert.ok(html.includes('/me/lists/add?gid='+a.gid));
 res=await get('/lists/'+id+'/edit?q=Summer',cookie);html=await res.text();check('从编辑页按别名搜索已有作品，不写入外部资料',()=>{assert.equal(res.status,200);assert.ok(html.includes(a.name));assert.ok(!html.includes(b.name+'</strong>'));assert.ok(html.includes('已加入 ✓'));});
 res=await get('/me/lists/add?gid='+a.gid,cookie);html=await res.text();check('加入选择页显示已有清单及去重状态，支持新建并加入',()=>{assert.ok(html.includes('已加入 ✓'));assert.ok(html.includes('/lists/new?gid='+a.gid));});
 row=app.workLists.get(id,user);await post('change',{id,revision:row.revision,action:'add',gid:c.gid});res=await get('/lists/'+id);html=await res.text();check('公开清单沿用原有封面保护',()=>{assert.ok(html.includes(withWorkMedia(c).mainImg));assert.ok(!html.includes(originalCover(c).url));});
 row=app.workLists.get(id,user);await post('change',{id,revision:row.revision,action:'update',title:'重新私密',description:'私密描述',visibility:'private'});res=await get('/lists/'+id);check('公开转私密后原链接立即不可访问',()=>assert.equal(res.status,404));
 row=app.workLists.get(id,user);await post('change',{id,revision:row.revision,action:'remove',gid:a.gid});check('移出只影响清单，其余作品保留',()=>{assert.equal(app.workLists.get(id,user).items.length,2);assert.ok(app.db.gameByGid(a.gid));});
 row=app.workLists.get(id,user);res=await post('change',{id,revision:row.revision,action:'delete'});check('移入回收站，停止展示但保留作品与备注',()=>{assert.equal(res.status,200);assert.equal(app.workLists.owned(user).length,0);assert.equal(app.workLists.owned(user,{deleted:true})[0].items.length,2);});
 const deleted=app.workLists.owned(user,{deleted:true})[0];res=await post('change',{id,revision:deleted.revision,action:'restore'});check('可从回收站恢复，默认私密',()=>{assert.equal(res.status,200);assert.equal(app.workLists.get(id,user).visibility,'private');});
 row=app.workLists.get(id,user);res=await post('change',{id,revision:row.revision,action:'update',title:'七月手帐',description:'海风吹过的故事。',tags:'夏日, 海辺, #成长，SUMMER, summer',visibility:'public'});
 check('清单支持标签，自动去重、去掉井号并保持顺序',()=>{assert.equal(res.status,200);assert.deepEqual(app.workLists.get(id,user).tags,['夏日','海辺','成长','SUMMER']);});
 for(const query of ['七月','海风','成长','summer','七月 成长','#成长']){const found=await(await get('/lists?q='+encodeURIComponent(query))).text();assert.ok(found.includes('/lists/'+id),query);}check('公开搜索统一匹配标题、描述和标签，忽略大小写并支持多关键词',()=>{});
 html=await(await get('/lists?q='+encodeURIComponent('七月 不存在'))).text();check('多关键词必须同时命中，不返回无关清单',()=>assert.ok(!html.includes('/lists/'+id)));
 html=await(await get('/lists/'+id)).text();check('公开清单明确显示创建者及其主页、可点击标签',()=>{assert.ok(html.includes('创建者：'));assert.ok(html.includes('class="wl-author" href="/me/'+user.uid+'"'));assert.ok(html.includes('#成长'));assert.ok(html.includes('aria-label="清单标签"'));});
 row=app.workLists.get(id,user);await post('change',{id,revision:row.revision,action:'update',title:row.title,description:row.description,visibility:row.visibility});check('旧表单没有标签字段时保留原标签',()=>assert.deepEqual(app.workLists.get(id,user).tags,row.tags));
 for(const session of ['',otherCookie,adminCookie]){res=await get('/api/lists/'+id+'/membership',session);assert.equal(res.status,session?404:401);}check('实时已加入状态接口仅清单本人可读，即使公开也不能查他人的编辑状态',()=>{});
 res=await get('/api/lists/'+id+'/membership',cookie);data=await res.json();check('状态接口只返回所属清单的编号、修订号和成员作品，且禁止缓存',()=>{assert.equal(res.status,200);assert.deepEqual(Object.keys(data).sort(),['count','gids','id','revision']);assert.equal(data.count,2);assert.match(res.headers.get('cache-control'),/no-store/);});
 row=app.workLists.get(id,user);res=await post('change',{id,revision:row.revision,action:'add',gid:a.gid,returnTo:'/lists/'+id+'/edit?searchPage=2#wl-search'});data=await res.json();check('加入响应带即时状态和最新清单正文，可保留当前搜索分页更新界面',()=>{assert.equal(data.membership.count,3);assert.ok(data.membership.gids.includes(String(a.gid)));assert.ok(data.entriesHtml.includes(a.name));assert.ok(data.location.includes('searchPage=2'));});
 html=await(await get('/lists/'+id+'/edit?q=Summer',cookie)).text();check('已加入作品首屏即有勾选标记、绿色状态类和禁用的重复加入按钮',()=>{assert.ok(html.includes('class="wl-picker-card is-added"'));assert.ok(html.includes('data-wl-selected-count>3'));assert.ok(html.includes('>✓ 已在清单</span>'));assert.ok(html.includes('disabled>已加入 ✓</button>'));});
 row=app.workLists.get(id,user);res=await post('change',{id,revision:row.revision,action:'remove',gid:a.gid});data=await res.json();check('移出响应同步撤销成员状态并更新清单正文',()=>{assert.equal(data.membership.count,2);assert.ok(!data.membership.gids.includes(String(a.gid)));assert.ok(!data.entriesHtml.includes(a.name));});
 check('标签数量、长度和控制字符受限',()=>{assert.throws(()=>listTags('x'.repeat(17)));assert.throws(()=>listTags(Array.from({length:9},(_,i)=>'tag'+i)));assert.throws(()=>listTags('bad\u0000tag'));});
 row=app.workLists.get(id,user);await post('change',{id,revision:row.revision,action:'update',title:row.title,description:row.description,tags:'只有自己知道的标签',visibility:'private'});html=await(await get('/lists?q='+encodeURIComponent('只有自己知道的标签'))).text();check('标签搜索不泄露私密清单',()=>assert.ok(!html.includes('/lists/'+id)));
 let coverRow=await app.workLists.create(user,{token:'c'.repeat(24),title:'封面测试清单',description:'拼贴验收',visibility:'public'});
 check('空清单默认绿色自动封面，显示占位图而不要求上传',()=>{assert.equal(coverRow.coverTheme,'sage');assert.equal(coverRow.coverGid,'');});
 html=await(await get('/lists/'+coverRow.id)).text();assert.ok(html.includes('wl-folder-empty'));assert.ok(!html.includes('type="file"'));
 for(const game of [a,b,c])coverRow=await app.workLists.change(user,coverRow.id,{action:'add',gid:String(game.gid),revision:coverRow.revision});
 coverRow=await app.workLists.change(user,coverRow.id,{action:'update',revision:coverRow.revision,title:coverRow.title,description:coverRow.description,visibility:'public',coverTheme:'sea',coverGid:String(c.gid)});
 html=await(await get('/lists/'+coverRow.id)).text();
 check('代表作品排在拼贴主图，其余作品补位并继续沿用封面保护',()=>{assert.ok(html.includes('data-cover-theme="sea"'));assert.match(html,new RegExp('wl-collage-book-0" data-cover-gid="'+c.gid+'"'));assert.ok(html.includes(withWorkMedia(c).mainImg));assert.ok(!html.includes(originalCover(c).url));assert.equal((html.match(/class="wl-collage-book wl-collage-book-/g)||[]).length,3);});
 check('公开清单创建者展示现有头像及昵称，头像地址来自站内预设',()=>{assert.ok(html.includes('class="wl-author-avatar" src="'+avatarFor(user)+'"'));assert.ok(html.includes('class="wl-author" href="/me/'+user.uid+'"'));});
 const beforeCover=structuredClone(coverRow);
 for(const patch of [{coverTheme:'url(evil)'},{coverGid:'999999'},{coverGid:'https://evil.test/image.png'}])await assert.rejects(app.workLists.change(user,coverRow.id,{action:'update',revision:coverRow.revision,title:coverRow.title,visibility:'public',...patch}));
 check('拒绝任意图片地址、未知配色及未加入的代表作品，失败不写入',()=>assert.deepEqual(app.workLists.get(coverRow.id,user),beforeCover));
 coverRow=await app.workLists.change(user,coverRow.id,{action:'update',revision:coverRow.revision,title:coverRow.title,description:coverRow.description,visibility:'public'});
 check('旧表单不带封面字段时保留已选择的配色和代表作',()=>{assert.equal(coverRow.coverTheme,'sea');assert.equal(coverRow.coverGid,String(c.gid));});
 html=await(await get('/lists/'+coverRow.id+'/edit',cookie)).text();check('编辑页含五种配色、代表作下拉框和实时预览，没有图片上传控件',()=>{assert.equal((html.match(/name="coverTheme"/g)||[]).length,5);assert.ok(html.includes('id="wl-cover-gid"'));assert.ok(html.includes('data-wl-cover-preview'));assert.ok(!html.includes('type="file"'));});
 res=await post('change',{id:coverRow.id,revision:coverRow.revision,action:'remove',gid:String(c.gid)});data=await res.json();coverRow=app.workLists.get(coverRow.id,user);
 check('移出代表作自动恢复选择，并返回最新的代表作候选列表',()=>{assert.equal(coverRow.coverGid,'');assert.ok(data.coverOptionsHtml.includes(a.name));assert.ok(!data.coverOptionsHtml.includes('value="'+c.gid+'"'));assert.equal(data.membership.count,2);});
 let readingRow=await app.workLists.create(user,{token:'d'.repeat(24),title:'分页阅读测试',visibility:'public'});
 for(let i=0;i<27;i++){const game=await app.db.games.insert({gid:999800+i,name:'分页作品 '+(i+1)});readingRow=await app.workLists.change(user,readingRow.id,{action:'add',gid:String(game.gid),revision:readingRow.revision});}
 readingRow=await app.workLists.change(user,readingRow.id,{action:'note',gid:readingRow.items[0].gid,revision:readingRow.revision,note:'<img src=x onerror=alert(1)>\n'+('值得慢慢阅读的推荐语。'.repeat(8))});
 html=await(await get('/lists/'+readingRow.id)).text();
 check('清单详情默认每页 12 部紧凑卡片，提供 12／24／48 和简洁列表选择',()=>{assert.equal((html.match(/class="wl-work"/g)||[]).length,12);assert.ok(html.includes('wl-reading-grid cards')||html.includes('class="wl-work-list wl-reading-grid "'));assert.ok(html.includes('name="perPage"'));assert.ok(html.includes('value="48"'));assert.ok(html.includes('紧凑卡片'));assert.ok(html.includes('简洁列表'));});
 check('长推荐语默认折叠并安全转义，无脚本也可展开阅读',()=>{assert.ok(html.includes('<details class="wl-reading-note"><summary>'));assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.ok(!html.includes('<img src=x onerror=alert(1)>'));});
 html=await(await get('/lists/'+readingRow.id+'?page=2')).text();check('第二页保留原始顺序编号且显示第 13—24 部，翻页定位作品区',()=>{assert.equal((html.match(/class="wl-work"/g)||[]).length,12);assert.ok(html.includes('显示第 13—24 部'));assert.ok(html.includes('class="wl-number">13</span>'));assert.ok(html.includes('#wl-works'));});
 html=await(await get('/lists/'+readingRow.id+'?perPage=24&view=list&page=2')).text();check('显示量与简洁列表可组合，翻页保留选择并正确处理末页',()=>{assert.equal((html.match(/class="wl-work"/g)||[]).length,3);assert.ok(html.includes('wl-reading-rows'));assert.ok(html.includes('显示第 25—27 部'));assert.ok(html.includes('perPage=24'));assert.ok(html.includes('view=list'));});
 html=await(await get('/lists/'+readingRow.id+'?perPage=999&view=unknown&page=999')).text();check('非法显示量和方式回到安全默认值，越界页自动定位末页',()=>{assert.equal((html.match(/class="wl-work"/g)||[]).length,3);assert.ok(html.includes('显示第 25—27 部'));assert.ok(!html.includes('class="wl-work-list wl-reading-grid wl-reading-rows"'));});
 const legacy=structuredClone(app.workLists.state);legacy.lists.forEach(r=>{delete r.tags;delete r.coverTheme;delete r.coverGid;});const legacyLists=await new WorkLists({...app.db,kv:{get:async()=>legacy},users:app.db.users}).init();check('没有标签和封面字段的旧清单无需迁移即可正常加载',()=>assert.equal(legacyLists.get(id,user).id,id));
 const reloaded=await new WorkLists(app.db).init();check('JSON 重启后清单、顺序和推荐语保持',()=>assert.deepEqual(reloaded.get(id,user),app.workLists.get(id,user)));
 row=app.workLists.get(id,user);for(const form of [{action:'update',title:'',visibility:'public'},{action:'update',title:'标题',visibility:'unlisted'},{action:'note',gid:b.gid,note:'x'.repeat(301)},{action:'add',gid:'https://evil.test'},{action:'move',gid:b.gid,position:999}]){res=await post('change',{id,revision:row.revision,...form});assert.ok(res.status>=400);}check('拒绝空名称、未知公开状态、超长备注、伪造编号和越界排序',()=>assert.equal(app.workLists.get(id,user).revision,row.revision));
 res=await get('/lists/'+id+'/edit?page=99999',cookie);check('编辑分页越界会回到实际页',()=>assert.equal(res.status,200));
 const untouched=JSON.stringify(app.workLists.state);await get('/lists/'+id,cookie);check('GET 浏览不修改清单或生成互动记录',()=>{assert.equal(JSON.stringify(app.workLists.state),untouched);assert.equal(app.db.reviews.all().length,0);});
 const memory=new Map(),kvDb={...app.db,kv:{get:async key=>memory.get(key),set:async(key,value)=>{memory.set(key,structuredClone(value));}},users:app.db.users};
 const pgLists=await new WorkLists(kvDb,{resolve:gid=>app.db.gameByGid(gid)}).init(),pgRow=await pgLists.create(user,{...create,token:'b'.repeat(24)});const pgReload=await new WorkLists(kvDb).init();check('PostgreSQL KV 持久化路径可重新加载',()=>assert.equal(pgReload.get(pgRow.id,user).title,create.title));
 kvDb.kv.set=async()=>{throw Error('simulated database failure');};await assert.rejects(pgLists.change(user,pgRow.id,{action:'delete',revision:0}));check('持久化失败不发布内存改动',()=>assert.equal(pgLists.get(pgRow.id,user).revision,0));
 await fs.writeFile(path.join(dir,'work-lists.json'),'{"version":1,"lists":[{}]}');await assert.rejects(new WorkLists(app.db).init());check('损坏的存储拒绝加载，不能静默当成空清单',()=>assert.equal(app.workLists.get(id,user).id,id));
 check('资源只在所需页面加载，首页不增加清单资源',()=>{assert.match(pageAssets({bodyClass:'work-lists-page'}).styles.content.toString(),/\.wl-page/);assert.match(pageAssets({bodyClass:'work-lists-page'}).scripts.content.toString(),/data-work-lists/);assert.doesNotMatch(pageAssets({active:'home'}).styles.content.toString(),/\.wl-page/);assert.doesNotMatch(pageAssets({active:'home'}).scripts.content.toString(),/data-work-lists/);});
 res=await get('/lists');html=await res.text();check('列表是独立主导航栏目，清单页使用专属 retroweb 框架',()=>{assert.match(html,/<a class="nav-link is-active"[^>]*href="\/lists">列表<\/a>/);assert.ok(html.includes('data-retroweb-lists'));assert.ok(html.includes('wl-retro-sidebar'));assert.ok(!html.includes('wl-catalog-entry'));});
 for(const [label,route,session,profile] of [['首页','/','','home'],['个人中心','/me',cookie,'profile'],['作品库','/games?local=1','','catalog'],['作品详情','/game/'+a.gid,cookie,'work']]){
   const page=await(await get(route,session)).text(),assets=profile==='profile'?pageAssets({bodyClass:'member-profile-page'}):profile==='work'?pageAssets({bodyClass:'work-detail-page'}):pageAssets({active:profile==='catalog'?'games':profile});
   check(label+'不携带列表 retroweb 正文或主题样式',()=>{assert.ok(!page.includes('data-retroweb-lists'));assert.doesNotMatch(assets.styles.content.toString(),/wl-retro-masthead|body\.work-lists-page/);});
 }
 const source=await fs.readFile(new URL('../public/js/work-lists.js',import.meta.url),'utf8');
 let submit,requested,uiReloads=0,assigned='',fail=false;
 const feedback={textContent:'',classList:{add(){},remove(){}}},button={disabled:false},form={action:{name:'action',value:'add'},dataset:{},getAttribute:key=>key==='action'?'/api/lists/change':null,querySelector:()=>null};
 const page={addEventListener:(type,fn)=>{if(type==='submit')submit=fn;},querySelector:selector=>['[data-wl-copy]','[data-wl-picker]','[data-wl-entries]'].includes(selector)?null:feedback,querySelectorAll:()=>[button]};
 const location={origin:'https://example.test',pathname:'/lists/'+id+'/edit',search:'',hash:'#wl-search',assign:value=>{assigned=value;},reload:()=>{uiReloads++;}};
 runInNewContext(source,{document:{querySelector:()=>page},window:{location,confirm:()=>true},navigator:{},URL,URLSearchParams,FormData:class{*[Symbol.iterator](){yield ['action','add'];yield ['gid',String(a.gid)];}},fetch:async(url,options)=>{requested={url,body:options.body};return {ok:!fail,json:async()=>fail?{error:'旧页面冲突'}:{location:location.pathname+location.hash}};}});
 await submit({target:{closest:()=>form},preventDefault(){}});check('真实浏览器脚本不被 action 表单字段遮蔽，保存后同页也刷新内容',()=>{assert.equal(requested.url,'/api/lists/change');assert.equal(requested.body.get('action'),'add');assert.equal(uiReloads,1);assert.equal(assigned,location.pathname+location.hash);});
 // A fresh document gets a fresh handler after the successful navigation.
 button.disabled=false;fail=true;runInNewContext(source,{document:{querySelector:()=>page},window:{location,confirm:()=>true},navigator:{},URL,URLSearchParams,FormData:class{*[Symbol.iterator](){yield ['action','note'];}},fetch:async()=>({ok:false,json:async()=>({error:'旧页面冲突'})})});await submit({target:{closest:()=>form},preventDefault(){}});check('保存冲突时不跳走、保留输入并重新启用按钮',()=>{assert.equal(feedback.textContent,'旧页面冲突');assert.equal(button.disabled,false);assert.equal(uiReloads,1);});
 // Execute the actual enhancement with a minimal DOM adapter: add/remove must
 // update the picker without navigation and preserve unsaved note drafts.
 let liveSubmit,liveFocus,liveRevision=4,joined=false,refreshState;
 const picker={dataset:{listId:id,revision:'4'}},liveFeedback={textContent:'',classList:{add(){},remove(){}}};
 const addedButton={disabled:false,textContent:'＋ 加入'},badge={hidden:true},addRevision={value:'4'},settingsRevision={value:'4'};
 const addForm={dataset:{},getAttribute:()=>'/api/lists/change',querySelector:s=>s==='button[type="submit"]'?addedButton:s==='input[name="revision"]'?addRevision:null};
 let draftInput={value:'还没保存的推荐语',defaultValue:''},draftRevision={value:'4'};
 const noteForm={dataset:{wlNoteGid:String(b.gid)},querySelector:s=>s==='textarea[name="note"]'?draftInput:draftRevision};
 const liveEntries={querySelectorAll:()=>[noteForm],set innerHTML(value){this.html=value;draftInput={value:'',defaultValue:''};draftRevision={value:String(liveRevision)};}};
 const card={dataset:{wlWorkGid:String(a.gid)},classList:{toggle:(name,value)=>{joined=value;}},querySelector:s=>s==='[data-wl-membership-badge]'?badge:addForm};
 const selectedCount={textContent:'1'},livePage={addEventListener:(type,fn)=>{if(type==='submit')liveSubmit=fn;},querySelector:s=>s==='[data-wl-picker]'?picker:s==='[data-wl-entries]'?liveEntries:s==='[data-wl-copy]'?null:liveFeedback,querySelectorAll:s=>s==='[data-wl-work-gid]'?[card]:s.includes('selected-count')?[selectedCount]:s.includes('input[name="revision"]')?[addRevision,settingsRevision,draftRevision]:[addedButton]};
 let liveAction='add',liveNavigations=0;
 runInNewContext(source,{document:{querySelector:()=>livePage,hidden:false,addEventListener(){}},window:{location:{origin:base,pathname:'/lists/'+id+'/edit',search:'?searchPage=2',hash:'#wl-search',assign(){liveNavigations++;},reload(){liveNavigations++;}},confirm:()=>true,addEventListener:(type,fn)=>{if(type==='focus')liveFocus=fn;},setInterval(){}},navigator:{},URL,URLSearchParams,FormData:class{*[Symbol.iterator](){yield ['action',liveAction];yield ['revision',addRevision.value];}},fetch:async(url,options)=>{
   if(options.method==='POST'){liveRevision++;return {ok:true,json:async()=>({location:'/lists/'+id+'/edit',membership:{id,revision:liveRevision,count:liveAction==='add'?2:1,gids:liveAction==='add'?[String(a.gid),String(b.gid)]:[String(b.gid)]},entriesHtml:'<entries>'})};}
   return {ok:true,json:async()=>refreshState||{id,revision:liveRevision,count:1,gids:[String(b.gid)]}};
 }});
 await liveFocus();await liveSubmit({target:{closest:()=>addForm},preventDefault(){}});
 check('加入后原地更新勾选、数量和版本，同时保留未保存推荐语且不跳页',()=>{assert.equal(joined,true);assert.equal(badge.hidden,false);assert.equal(addedButton.disabled,true);assert.equal(selectedCount.textContent,'2');assert.equal(settingsRevision.value,'5');assert.equal(draftInput.value,'还没保存的推荐语');assert.equal(draftRevision.value,'5');assert.equal(liveNavigations,0);});
 liveAction='remove';await liveSubmit({target:{closest:()=>addForm},preventDefault(){}});
 check('移出后立即恢复可加入按钮和数量，推荐语草稿继续保留',()=>{assert.equal(joined,false);assert.equal(badge.hidden,true);assert.equal(addedButton.disabled,false);assert.equal(selectedCount.textContent,'1');assert.equal(draftInput.value,'还没保存的推荐语');assert.equal(liveNavigations,0);});
 refreshState={id,revision:9,count:2,gids:[String(a.gid),String(b.gid)]};await liveFocus();
 check('切回窗口同步其他窗口的已加入状态，但不静默推进未保存设置的版本',()=>{assert.equal(joined,true);assert.equal(addRevision.value,'9');assert.equal(settingsRevision.value,'6');});
 refreshState={id,revision:7,count:1,gids:[]};await liveFocus();
 check('延迟返回的旧状态不能回滚较新的已加入标记和数量',()=>{assert.equal(joined,true);assert.equal(selectedCount.textContent,'2');assert.equal(picker.dataset.revision,'9');});
 check('列表标题、正文与表单统一使用自托管宋体，其他页面不加载字体声明',()=>{const css=pageAssets({bodyClass:'work-lists-page'}).styles.content.toString();const listCss=css.slice(css.indexOf('/* Retroweb'));assert.match(listCss,/--wl-font:"Kaeto List Song"/);assert.match(css,/font-family: 'Kaeto List Song'/);assert.doesNotMatch(listCss,/Microsoft YaHei|Courier New/);assert.doesNotMatch(pageAssets({active:'home'}).styles.content.toString(),/Kaeto List Song/);assert.doesNotMatch(pageAssets({bodyClass:'member-profile-page'}).styles.content.toString(),/Kaeto List Song/);});
 const fontCss=await fs.readFile(new URL('../public/css/work-list-fonts.css',import.meta.url),'utf8'),fontFiles=[...new Set([...fontCss.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1]))];let fontBytes=0;
 for(const file of fontFiles){assert.ok(file.startsWith('/fonts/list-song/'));const bytes=await fs.readFile(new URL('../public'+file,import.meta.url));assert.equal(bytes.subarray(0,4).toString(),'wOF2');fontBytes+=bytes.length;}
 check('宋体以本地 Unicode 分片按需加载，字体文件有效、总量受限且附带许可证',()=>{assert.ok(fontFiles.length>1&&fontFiles.length<150);assert.ok(fontBytes<7*1024*1024);assert.ok(!fontCss.includes('https:'));assert.ok(fontCss.includes('unicode-range:'));});
 assert.match(await fs.readFile(new URL('../public/fonts/list-song/OFL.txt',import.meta.url),'utf8'),/SIL OPEN FONT LICENSE/);
 res=await get(fontFiles[0]);const fontEtag=res.headers.get('etag');check('宋体分片真实 HTTP 地址返回字体类型与长期缓存，且支持条件请求',()=>{assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/font\/woff2/);assert.match(res.headers.get('cache-control'),/immutable/);});
 res=await fetch(base+fontFiles[0],{headers:{'If-None-Match':fontEtag}});assert.equal(res.status,304);
 html=await(await get('/lists')).text();check('文件夹、磁盘等 Win98 风格图标为本地代码绘制且不进入辅助文本',()=>{assert.ok(html.includes('class="wl-pixel-icon"'));assert.ok(html.includes('shape-rendering="crispEdges" aria-hidden="true"'));assert.ok(!html.includes('<use href="http'));});
 console.log(`${count} 项作品清单、权限与持久化检查通过；使用隔离数据。`);
}finally{await app.drain();await new Promise(r=>app.server.close(r));await app.db.close();await fs.rm(dir,{recursive:true,force:true});}
