(function(){
 'use strict';
 var page=document.querySelector('[data-runtime-page]');if(!page)return;
 var panel=page.querySelector('[data-runtime-panel]'),button=page.querySelector('[data-runtime-refresh]'),toggle=page.querySelector('[data-runtime-auto]'),message=page.querySelector('[data-runtime-connection]');
 var automatic=true,blocked=false,failed=false,timer=null,controller=null;
 button.hidden=false;toggle.hidden=false;page.querySelector('[data-runtime-fallback]').hidden=true;
 function schedule(){clearTimeout(timer);if(automatic&&!blocked&&!document.hidden&&!controller)timer=setTimeout(refresh,15000);}
 async function refresh(){
  if(controller||blocked)return;clearTimeout(timer);controller=new AbortController();button.disabled=true;var timeout=setTimeout(function(){controller?.abort();},8000);
  try{
   var response=await fetch('/api/admin/runtime',{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
   if(response.status===401||response.status===403){blocked=true;panel.textContent='登录已失效或权限已更改。请重新登录后打开运行状态。';throw new Error('permission');}
   if(!response.ok)throw new Error('unavailable');var data=await response.json();
   if(typeof data.html!=='string'||data.html.length>100000||typeof data.generatedAt!=='string')throw new Error('invalid');
   panel.innerHTML=data.html;failed=false;message.textContent=automatic?'自动刷新中 · 每 15 秒更新，切到后台时暂停':'已暂停自动刷新 · 可手动更新';message.classList.remove('rs-disconnected');
  }catch(error){if(!document.hidden){failed=true;message.textContent=blocked?'权限已失效，已停止读取运行数据':'暂时无法获取新状态，以下保留上次采样；不代表网站当前正常。';message.classList.add('rs-disconnected');}}
  finally{clearTimeout(timeout);controller=null;button.disabled=blocked;toggle.disabled=blocked;schedule();}
 }
 button.addEventListener('click',refresh);
 toggle.addEventListener('click',function(){automatic=!automatic;toggle.setAttribute('aria-pressed',String(automatic));toggle.textContent='自动刷新：'+(automatic?'开':'关');if(!failed)message.textContent=automatic?'自动刷新中 · 每 15 秒更新':'已暂停自动刷新 · 可手动更新';if(automatic)refresh();else clearTimeout(timer);});
 document.addEventListener('visibilitychange',function(){if(document.hidden){clearTimeout(timer);controller?.abort();}else if(automatic&&!blocked)refresh();});
 window.addEventListener('pagehide',function(){automatic=false;clearTimeout(timer);controller?.abort();});
 message.textContent='自动刷新中 · 每 15 秒更新，切到后台时暂停';schedule();
})();
