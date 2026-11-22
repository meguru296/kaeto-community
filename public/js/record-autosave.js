(() => {
  const form=document.querySelector('[data-record-autosave]');if(!form)return;
  const feedback=form.querySelector('[data-record-feedback]'),retry=form.querySelector('[data-record-retry]'),stream=crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  let dirty={},active=null,sequence=0,timer,failed=false,inflight={},reviewLeaving=false;
  retry.hidden=true;feedback.textContent='选择后自动保存';
  function message(text,error=false){feedback.textContent=text;feedback.classList.toggle('is-error',error);retry.hidden=!error;failed=error;}
  const values=()=>Object.fromEntries(['score','status','note'].map(k=>[k,form.elements[k].value]));
  function body(fields){return new URLSearchParams({gid:form.elements.gid.value,...fields,recordStream:stream,recordSequence:String(++sequence)});}
  async function flush(){
    clearTimeout(timer);if(active){await active;if(failed)return false;return Object.keys(dirty).length?flush():true;}if(!Object.keys(dirty).length)return true;
    const fields=dirty;dirty={};inflight=fields;message('保存中…');
    const task=(async()=>{try{const res=await fetch('/api/record',{method:'POST',body:body(fields),headers:{Accept:'application/json'},keepalive:true,redirect:'error'});const data=await res.json();if(!res.ok||!data.saved)throw Object.assign(Error('save failed'),{saveMessage:data.error||'保存失败，请重试'});message('已自动保存 ✓');return true;}catch(error){dirty={...fields,...dirty};message(error.saveMessage||'保存失败，请检查网络后重试',true);return false;}})();
    active=task;const ok=await task;if(active===task){active=null;inflight={};}return ok&&Object.keys(dirty).length?flush():ok;
  }
  function changed(field){dirty[field]=form.elements[field].value;message('等待保存…');clearTimeout(timer);timer=setTimeout(flush,field==='note'?650:120);}
  form.elements.status.addEventListener('change',()=>{if(!form.elements.status.value){form.elements.note.value='';dirty.note='';}changed('status');});
  form.elements.note.addEventListener('input',()=>changed('note'));form.elements.note.addEventListener('blur',()=>{if(Object.hasOwn(dirty,'note'))flush();});
  form.addEventListener('click',event=>{if(event.target.closest('.star,[data-clear-score]'))changed('score');});
  form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())flush();});
  window.addEventListener('online',()=>{if(Object.keys(dirty).length)flush();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
  window.addEventListener('pagehide',()=>{if(reviewLeaving)return;const fields={...inflight,...dirty};if(!Object.keys(fields).length)return;const current=values();for(const key of Object.keys(fields))fields[key]=current[key];fetch('/api/record',{method:'POST',body:body(fields),headers:{Accept:'application/json'},keepalive:true,redirect:'error'}).catch(()=>{});});
  window.addEventListener('beforeunload',event=>{if(failed&&!reviewLeaving){event.preventDefault();event.returnValue='';}});
  // Submit the visible record state with a review in one server transaction.
  // It also supersedes any older in-flight auto-save from this page.
  document.querySelector('[data-review-form]')?.addEventListener('submit',event=>{
    if(event.defaultPrevented)return;
    const review=event.currentTarget,fields=values();clearTimeout(timer);
    const put=(name,value)=>{let input=review.querySelector('input[name="'+name+'"]');if(!input){input=document.createElement('input');input.type='hidden';input.name=name;review.append(input);}input.value=value;};
    put('recordCapture','1');put('recordStream',stream);put('recordSequence',String(++sequence));for(const [name,value]of Object.entries(fields))put('record_'+name,value);reviewLeaving=true;
  });
})();
