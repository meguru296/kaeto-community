import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {layout} from '../src/pages.js';
const html=xp=>layout({config:{site:{name:'菜单验收',tagline:'测试'}},user:{id:'fixture',uid:19990,username:'menu-fixture',nickname:'<测试昵称>',progress:{xp}},title:'菜单',body:''});
for(const [xp,level,percent,note]of [[0,1,0,'距 LV2 还需 60 EXP'],[60,2,0,'距 LV3 还需 120 EXP'],[1260,5,40,'距 LV6 还需 540 EXP'],[1800,6,100,'已达最高等级']]){
 const page=html(xp),menu=page.slice(page.indexOf('<section class="account-menu-panel"'),page.indexOf('<nav aria-label="账号快捷入口"'));
 assert.ok(menu.includes('href="/me/19990"'));assert.ok(menu.includes('UID 19990'));assert.ok(menu.includes('&lt;测试昵称&gt;'));assert.ok(menu.includes('LV'+level));assert.ok(menu.includes(xp+' EXP'));assert.ok(menu.includes('value="'+percent+'"'));assert.ok(menu.includes(note));
}
console.log('✓ 主页链接、经验阈值、升级差额、满级与昵称转义');

const events={},summaryEvents={},documentEvents={},timers=new Map(),effects=[];let focused=false,reduced=false,computed={opacity:'1',transform:'none'},serial=0;
const summary={addEventListener:(type,fn)=>summaryEvents[type]=fn,focus:()=>{focused=true;}};
const panel={inert:false,animate(frames,options){let resolve,reject;const effect={frames,options,finished:new Promise((a,b)=>{resolve=a;reject=b;}),resolve:()=>resolve(),cancel(){this.cancelled=true;reject(Error('cancelled'));}};effects.push(effect);return effect;}};
const menu={open:false,addEventListener:(type,fn)=>events[type]=fn,querySelector:s=>s==='summary'?summary:panel,matches:()=>false,contains:target=>target===summary};
runInNewContext(await fs.readFile(new URL('../public/js/account-menu.js',import.meta.url),'utf8'),{document:{querySelectorAll:s=>s==='[data-account-menu]'?[menu]:[],addEventListener:(type,fn)=>documentEvents[type]=fn},matchMedia:q=>({matches:q.includes('hover')||reduced}),getComputedStyle:()=>computed,clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++serial,fn);return serial;}});
const finish=async()=>{effects.at(-1).resolve();await Promise.resolve();await Promise.resolve();};
const mouse=()=>events.pointerenter({pointerType:'mouse'}),click=detail=>summaryEvents.click({detail,preventDefault(){}});
mouse();assert.equal(menu.open,true);assert.equal(effects.at(-1).options.duration,300);assert.equal(effects.at(-1).frames[0].opacity,0);await finish();click(1);assert.equal(menu.open,true);
click(1);assert.equal(menu.open,true);assert.equal(panel.inert,true);assert.equal(effects.at(-1).options.duration,220);await finish();assert.equal(menu.open,false);
console.log('✓ 每次展开 300ms，收起完成后才隐藏，移入后首击不误关');
mouse();await finish();events.pointerleave();[...timers.values()].at(-1)();assert.equal(menu.open,true);const closing=effects.at(-1);computed={opacity:'.42',transform:'matrix(1,0,0,1,0,-5)'};mouse();assert.equal(closing.cancelled,true);assert.equal(effects.at(-1).frames[0].opacity,'.42');await finish();assert.equal(menu.open,true);computed={opacity:'1',transform:'none'};
events.keydown({key:'Escape',preventDefault(){}});assert.equal(focused,true);await finish();assert.equal(menu.open,false);
console.log('✓ 再次移入重播动画，收起时快速返回可平滑反向，Escape 归焦');
events.pointerenter({pointerType:'touch'});assert.equal(menu.open,false);click(1);await finish();assert.equal(menu.open,true);documentEvents.click({target:{}});await finish();assert.equal(menu.open,false);
reduced=true;const before=effects.length;click(0);assert.equal(menu.open,true);assert.equal(effects.length,before);documentEvents.click({target:{}});assert.equal(menu.open,false);
console.log('✓ 触屏与键盘操作、点击外侧退出、减少动态效果均可用');
