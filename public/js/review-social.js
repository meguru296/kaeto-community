(() => {
  const inbox=document.querySelector('[data-inbox-link]');
  function count(value){if(!inbox)return;const badge=inbox.querySelector('[data-inbox-count]');badge.textContent=value>99?'99+':String(value);badge.hidden=!value;inbox.setAttribute('aria-label',value?`站内消息，${value} 条未读`:'站内消息');}
  let polling=false;
  async function poll(){if(!inbox||document.hidden||polling)return;polling=true;try{const r=await fetch('/api/notifications/unread',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});if(r.ok){const data=await r.json();count(data.unread);}}catch{}finally{polling=false;}}
  if(inbox){setInterval(poll,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});}
  document.querySelectorAll('[data-review-like]').forEach(form=>form.addEventListener('submit',async event=>{
    if(!window.fetch)return;event.preventDefault();const button=form.querySelector('button'),feedback=form.querySelector('[role=status]');if(button.disabled)return;button.disabled=true;feedback.textContent='';
    try{const response=await fetch(form.action,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(form)),signal:AbortSignal.timeout(10000)});const data=await response.json();if(!response.ok)throw Error(data.error||'点赞失败，请重试');button.setAttribute('aria-pressed',String(data.liked));button.setAttribute('aria-label',data.liked?'取消点赞':'点赞这条评价');form.elements.liked.value=data.liked?'0':'1';form.querySelector('[data-like-label]').textContent=data.liked?'已点赞':'点赞';form.querySelector('[data-like-count]').textContent=String(data.likeCount);}
    catch(error){feedback.textContent=error.name==='TimeoutError'?'请求超时，可重试；重复操作不会重复点赞。':error.message;}
    finally{button.disabled=false;}
  }));
  document.querySelectorAll('[data-review-social]').forEach(thread=>{
    const form=thread.querySelector('[data-reply-form]');if(!form)return;
    const target=form.querySelector('.rs-reply-target'),name=form.querySelector('[data-reply-target-name]');
    thread.querySelectorAll('[data-reply-to]').forEach(button=>button.addEventListener('click',()=>{form.elements.parentId.value=button.dataset.replyTo;name.textContent='回复 '+button.dataset.replyName;target.hidden=false;form.closest('details').open=true;form.elements.content.focus();form.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}));
    form.querySelector('[data-cancel-reply]').addEventListener('click',()=>{form.elements.parentId.value='';target.hidden=true;});
    form.addEventListener('submit',()=>{form.querySelector('[type=submit]').disabled=true;});
  });
  document.querySelectorAll('[data-delete-reply]').forEach(form=>form.addEventListener('submit',event=>{if(!confirm('删除这条回复？'))event.preventDefault();}));
  function reveal(){if(!location.hash.startsWith('#reply-'))return;let target;try{target=document.getElementById(decodeURIComponent(location.hash.slice(1)));}catch{}if(target){let details=target.closest('details');while(details){details.open=true;details=details.parentElement?.closest('details');}target.scrollIntoView({block:'center'});}}
  if(location.hash.startsWith('#reply-'))reveal();window.addEventListener('hashchange',reveal);
})();
