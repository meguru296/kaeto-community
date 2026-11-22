(function(){
 'use strict';
 var doc=document,dialog,previous,controller;
 function close(){controller?.abort();dialog?.close();previous?.focus();}
 function enhance(root){
  root.querySelectorAll('[data-correction-action]').forEach(function(select){function update(){root.querySelectorAll('[data-correction-adopt]').forEach(function(el){el.hidden=select.value!=='accept';});root.querySelectorAll('[data-correction-resolution]').forEach(function(el){el.hidden=select.value!=='resolve';});}select.addEventListener('change',update);update();});
  root.querySelectorAll('.wc-field-choice input').forEach(function(input){input.addEventListener('change',function(){if(input.checked)input.closest('.wc-field').querySelector('textarea,select')?.focus();});});
 }
 enhance(doc);
 doc.addEventListener('click',async function(event){
  var link=event.target.closest('[data-correction-open]');if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button||typeof HTMLDialogElement==='undefined')return;
  event.preventDefault();previous=link;
  if(!dialog){dialog=doc.createElement('dialog');dialog.className='wc-dialog';dialog.setAttribute('aria-label','提交作品资料纠错');doc.body.append(dialog);dialog.addEventListener('cancel',function(e){e.preventDefault();close();});dialog.addEventListener('click',function(e){if(e.target===dialog||e.target.closest('[data-correction-close]'))close();});}
  dialog.innerHTML='<div class="wc-dialog-bar"><strong>作品资料纠错</strong><button type="button" data-correction-close aria-label="关闭纠错窗口">关闭 ×</button></div><div class="wc-dialog-body"><p class="wc-loading" role="status">正在读取当前资料…</p></div>';dialog.showModal();controller=new AbortController();
  try{var response=await fetch(link.href,{headers:{Accept:'text/html'},signal:controller.signal});if(!response.ok||!response.url.includes('/corrections/new')){location.assign(link.href);return;}var page=new DOMParser().parseFromString(await response.text(),'text/html'),article=page.querySelector('[data-correction-form-page]');if(!article){location.assign(link.href);return;}var content=doc.importNode(article,true);dialog.querySelector('.wc-dialog-body').replaceChildren(content);enhance(content);
   var form=content.querySelector('form');form.addEventListener('submit',async function(e){e.preventDefault();var buttons=Array.from(form.querySelectorAll('button[type=submit]')),feedback=form.querySelector('[data-correction-feedback]');if(!feedback){feedback=doc.createElement('p');feedback.dataset.correctionFeedback='';feedback.className='wc-warning';feedback.setAttribute('role','alert');form.append(feedback);}if(!Array.from(form.querySelectorAll('.wc-field-choice input')).some(i=>i.checked)){feedback.textContent='请至少勾选一项需要纠错的资料。';buttons.forEach(b=>b.disabled=false);return;}buttons.forEach(b=>b.disabled=true);feedback.textContent='正在保存…';try{var saved=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'text/html'},body:new URLSearchParams(new FormData(form)),redirect:'follow'});if(saved.ok&&new URL(saved.url).pathname.startsWith('/me/corrections/')){location.assign(saved.url);return;}var errorPage=new DOMParser().parseFromString(await saved.text(),'text/html');feedback.textContent=errorPage.querySelector('.error-message,.error-text,.error-page p,main .page-hint')?.textContent||'提交未完成。请检查填写格式；资料可能已更新，可保留说明后重新打开窗口。';}catch{feedback.textContent='网络连接中断，内容仍保留在窗口中，请稍后重试。';}finally{buttons.forEach(b=>b.disabled=false);}});
  }catch(error){if(error.name!=='AbortError'){var area=dialog.querySelector('.wc-dialog-body');area.replaceChildren();var p=doc.createElement('p');p.textContent='暂时无法读取资料。';var fallback=doc.createElement('a');fallback.href=link.href;fallback.textContent='打开完整纠错页面 →';area.append(p,fallback);}}
 });
})();
