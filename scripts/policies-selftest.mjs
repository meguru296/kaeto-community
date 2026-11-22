import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { POLICY_VERSION } from '../src/policies.js';
const source=await fs.readFile(new URL('../public/js/policies.js',import.meta.url),'utf8');
let count=0;
function check(name,test){test();count++;console.log('✓ '+name);}
const storage=new Map();
function browser({blocked=false,registration=true}={}){
  const listeners=new Map(),consent={checked:false,addEventListener:(name,fn)=>listeners.set('consent-'+name,fn)};
  const button=id=>({addEventListener:(name,fn)=>listeners.set(id+'-'+name,fn)}),state={opened:0,closed:0};
  const dialog={dataset:{registrationNotice:POLICY_VERSION},open:false,showModal(){this.open=true;state.opened++;},close(){this.open=false;state.closed++;},querySelector:selector=>button(selector)};
  const document={querySelector:selector=>registration?selector==='[data-registration-notice]'?dialog:consent:null,querySelectorAll:()=>[button('reopen')]};
  const localStorage={getItem:key=>{if(blocked)throw Error('blocked');return storage.get(key);},setItem:(key,value)=>{if(blocked)throw Error('blocked');storage.set(key,value);},removeItem:key=>storage.delete(key)};
  vm.runInNewContext(source,{document,localStorage});return{state,consent,listeners};
}
const first=browser();check('首次注册弹出须知且未默认勾选',()=>{assert.equal(first.state.opened,1);assert.equal(first.consent.checked,false);});
first.listeners.get('[data-close-notice]-click')();check('关闭弹窗不等于同意',()=>{assert.equal(first.consent.checked,false);assert.equal(storage.size,0);});
first.listeners.get('reopen-click')();first.listeners.get('[data-accept-notice]-click')();
check('明确同意后保存版本',()=>{assert.equal(first.consent.checked,true);assert.equal(storage.get('kaeto.registration-notice'),POLICY_VERSION);});
const again=browser();check('已确认后不重复弹窗',()=>{assert.equal(again.state.opened,0);assert.equal(again.consent.checked,true);});
again.listeners.get('reopen-click')();check('可主动重新打开查看',()=>assert.equal(again.state.opened,1));
const fallback=browser({blocked:true});check('禁用本地存储也可确认',()=>{assert.equal(fallback.state.opened,1);fallback.listeners.get('[data-accept-notice]-click')();assert.equal(fallback.consent.checked,true);});
check('其他页面不弹窗',()=>assert.equal(browser({registration:false}).state.opened,0));
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kaeto-policies-'));let app;
try{
  app=await createApp({dataDir:dir,mailer:{ready:false}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  for(const[url,text]of[['/policies','用户须知'],['/policies/privacy','服务器和备份的位置由站点运营者确定'],['/policies/disclaimer','不免除本站依法应承担的责任']]){
    const res=await fetch(base+url),html=await res.text();check(url+' 内容可访问',()=>{assert.equal(res.status,200);assert.ok(html.includes(text));});
  }
  const register=await(await fetch(base+'/register')).text();check('注册表单要求同意当前版本',()=>{assert.match(register,new RegExp('name="policyVersion" value="'+POLICY_VERSION+'" required'));assert.match(register,/data-registration-notice=/);});
  const login=await(await fetch(base+'/login')).text();check('登录页仅保留常驻入口',()=>{assert.ok(!login.includes('data-registration-notice='));assert.ok(login.includes('href="/policies/privacy"'));});
  const old=await app.db.users.insert({username:'old-member'}),session=await app.auth.createSession(old.id);
  const res=await fetch(base+'/register',{redirect:'manual',headers:{Cookie:'gr_session='+session.id}});
  check('已有账号不要求重新确认',()=>{assert.equal(res.status,303);assert.equal(res.headers.get('location'),'/me');assert.equal(app.db.users.get(old.id).policyVersion,undefined);});
}finally{if(app)await new Promise(resolve=>app.server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
console.log(`${count} 项注册须知检查通过；使用模拟浏览器和隔离数据。`);
