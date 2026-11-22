(() => {
  const page=document.querySelector('[data-work-lists]');if(!page)return;
  const picker=page.querySelector('[data-wl-picker]');
  let pending=false,refreshing=false,membershipStopped=false;
  const feedbackFor=form=>form.querySelector('[role="status"]')||page.querySelector('.wl-feedback');
  function updateCoverPreview(){
    const preview=page.querySelector('[data-wl-cover-preview]');if(!preview?.querySelector)return;
    const form=page.querySelector('.wl-metadata'),select=form?.querySelector('select[name="coverGid"]');if(!select)return;
    preview.dataset.coverTheme=form.querySelector('input[name="coverTheme"]:checked')?.value||'sage';
    preview.querySelector('[data-wl-cover-title]').textContent=form.querySelector('input[name="title"]').value.trim()||'我的作品清单';
    const options=[...select.options].filter(option=>option.value),primary=options.find(option=>option.value===select.value);
    const entries=[...(primary?[primary]:[]),...options.filter(option=>option!==primary)].slice(0,3),books=preview.querySelector('[data-wl-folder-books]');
    // The options contain only server-rendered images from works in this list.
    // Build nodes rather than interpreting titles or image URLs as HTML.
    books.replaceChildren();
    if(!entries.length){const empty=document.createElement('span');empty.className='wl-folder-empty';empty.setAttribute('aria-hidden','true');empty.textContent='✧';const label=document.createElement('small');label.textContent='YOUR NEXT STORY';empty.append(label);books.append(empty);}
    entries.forEach((option,index)=>{
      const book=document.createElement('span');book.className='wl-collage-book wl-collage-book-'+index;book.dataset.coverGid=option.value;
      const frame=document.createElement('span');frame.className='wl-cover';
      if(option.dataset.coverSrc){const img=document.createElement('img');img.src=option.dataset.coverSrc;img.alt=option.dataset.coverTitle+'封面';img.loading='lazy';img.width=180;img.height=240;frame.append(img);}else frame.textContent='✦';
      book.append(frame);books.append(book);
    });
    preview.querySelector('[data-wl-cover-count]').textContent=String(options.length);
  }
  const previewInput=event=>{if(event.target.closest?.('.wl-metadata'))updateCoverPreview();};
  page.addEventListener('input',previewInput);page.addEventListener('change',previewInput);
  function validMembership(state){return Boolean(picker&&state?.id===picker.dataset.listId&&Number.isSafeInteger(state.revision)&&state.revision>=0&&Number.isSafeInteger(state.count)&&state.count>=0&&state.count<=200&&Array.isArray(state.gids)&&state.gids.length<=200&&state.gids.every(gid=>typeof gid==='string'&&/^(?:cn|vn|bg)?[1-9]\d{0,8}$/.test(gid)));}
  function applyMembership(state,fromRevision=null){
    if(!validMembership(state)||state.revision<Number(picker.dataset.revision))return false;
    picker.dataset.revision=String(state.revision);
    const joined=new Set(state.gids);
    page.querySelectorAll('[data-wl-work-gid]').forEach(card=>{
      const added=joined.has(card.dataset.wlWorkGid);card.classList.toggle('is-added',added);
      const badge=card.querySelector('[data-wl-membership-badge]');if(badge)badge.hidden=!added;
      const form=card.querySelector('form[data-wl-add]'),button=form?.querySelector('button[type="submit"]');
      if(button){button.textContent=added?'已加入 ✓':'＋ 加入';button.disabled=added||pending;}
      const revision=form?.querySelector('input[name="revision"]');if(revision)revision.value=String(state.revision);
    });
    page.querySelectorAll('[data-wl-selected-count],[data-wl-total-count]').forEach(node=>node.textContent=String(state.count));
    // Never silently advance the revision of an older, unsaved settings form
    // after another tab changed it. Only our own matching revision can advance.
    if(fromRevision!==null)page.querySelectorAll('form[data-wl-form] input[name="revision"]').forEach(input=>{if(Number(input.value)===fromRevision)input.value=String(state.revision);});
    return true;
  }
  async function refreshMembership(){
    if(!picker||pending||refreshing||membershipStopped||document.hidden)return;
    refreshing=true;
    try{
      const response=await fetch('/api/lists/'+picker.dataset.listId+'/membership',{headers:{Accept:'application/json'},cache:'no-store',signal:window.AbortSignal?.timeout?.(8000)});
      if(response.status===401||response.status===404){membershipStopped=true;return;}
      if(response.ok)applyMembership(await response.json());
    }catch{/* Keep the last confirmed state while offline. */}
    finally{refreshing=false;}
  }
  page.addEventListener('submit',async event=>{
    const form=event.target.closest('form[data-wl-form]');if(!form)return;
    event.preventDefault();if(pending)return;
    let confirmation=form.dataset.wlConfirm;
    if(form.dataset.wlRemoveMembers!==undefined){const targets=event.submitter?.name==='userId'?[event.submitter]:[...form.querySelectorAll('[data-wl-member-choice]:checked')].map(x=>x.closest('li').querySelector('[name=userId]'));if(!targets.length){feedbackFor(form).textContent='请先选择要移除的协作者。';return;}confirmation='移除 '+targets.map(b=>b.dataset.memberName+'（UID '+b.dataset.memberUid+'）').join('、')+' 的协作权限？已整理的内容将保留，重新加入需由创建者邀请。';}
    if(confirmation&&!window.confirm(confirmation))return;
    const feedback=feedbackFor(form),buttons=[...page.querySelectorAll('form[data-wl-form] button[type="submit"]')],disabled=buttons.map(b=>b.disabled);
    pending=true;buttons.forEach(b=>b.disabled=true);feedback.classList.remove('is-error');feedback.textContent='正在保存…';
    const unlock=()=>{pending=false;buttons.forEach((b,i)=>b.disabled=disabled[i]);};
    try{
      const data=new URLSearchParams(new FormData(form));
      if(event.submitter?.name)data.set(event.submitter.name,event.submitter.value);
      if(/^\/lists\/[a-f0-9]{24}\/edit$/.test(window.location.pathname))data.set('returnTo',window.location.pathname+window.location.search+window.location.hash);
      // A hidden input named "action" shadows HTMLFormElement.action.
      const response=await fetch(form.getAttribute('action'),{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:data,signal:window.AbortSignal?.timeout?.(15000)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'保存失败，请稍后再试');
      if(!result.location||!result.location.startsWith('/')||result.location.startsWith('//'))throw Error('返回地址有误，请刷新清单查看');
      if(picker&&['add','remove'].includes(data.get('action'))&&validMembership(result.membership)&&typeof result.entriesHtml==='string'){
        const entries=page.querySelector('[data-wl-entries]'),drafts=[];
        entries?.querySelectorAll('[data-wl-note-gid]').forEach(noteForm=>{
          const input=noteForm.querySelector('textarea[name="note"]');
          if(input&&input.value!==input.defaultValue)drafts.push({gid:noteForm.dataset.wlNoteGid,value:input.value,revision:noteForm.querySelector('input[name="revision"]').value});
        });
        if(entries)entries.innerHTML=result.entriesHtml;
        const fromRevision=Number(data.get('revision'));
        entries?.querySelectorAll('[data-wl-note-gid]').forEach(noteForm=>{
          const draft=drafts.find(d=>d.gid===noteForm.dataset.wlNoteGid);if(!draft)return;
          noteForm.querySelector('textarea[name="note"]').value=draft.value;
          noteForm.querySelector('input[name="revision"]').value=Number(draft.revision)===fromRevision?String(result.membership.revision):draft.revision;
        });
        unlock();applyMembership(result.membership,fromRevision);
        const select=page.querySelector('select[name="coverGid"]');
        if(select&&typeof result.coverOptionsHtml==='string'){
          const selected=select.value;select.innerHTML=result.coverOptionsHtml;
          select.value=[...select.options].some(option=>option.value===selected)?selected:'';
          updateCoverPreview();
        }
        feedback.textContent=(data.get('action')==='add'?'已加入清单':'已移出清单')+'，当前共 '+result.membership.count+' 部作品。';
        return;
      }
      const destination=new URL(result.location,window.location.origin);
      const sameDocument=destination.pathname===window.location.pathname&&destination.search===window.location.search;
      window.location.assign(result.location);if(sameDocument)window.location.reload();
    }catch(e){
      unlock();feedback.textContent=e.message||'连接暂时中断，请检查网络后重试；当前输入仍保留。';feedback.classList.add('is-error');
      await refreshMembership();
    }
  });
  if(picker){
    window.addEventListener?.('focus',refreshMembership);
    document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)refreshMembership();});
    window.setInterval?.(refreshMembership,20000);
    refreshMembership();
  }
  page.querySelector('[data-wl-copy]')?.addEventListener('click',async()=>{
    const feedback=page.querySelector('.wl-feedback');
    try{await navigator.clipboard.writeText(window.location.origin+window.location.pathname);feedback.textContent='清单链接已复制。';}catch{feedback.textContent='可以复制浏览器地址栏中的清单链接。';}
  });
})();
