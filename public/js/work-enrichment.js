(() => {
  const host=document.querySelector('[data-work-enrichment]');if(!host)return;
  const note=host.querySelector('[data-work-enrichment-note]');let attempts=0,timer,controller,stopped=false,fetching=false;
  // Only replace read-only work material. Editors, progress, reviews, purchase
  // controls, correction dialogs, and the curated Subahibi gallery stay live.
  const selectors=['.wd-cover','.wd-cover-column>small','.sh-cover-archive>small','[data-work-cover-note]','[data-work-cover-admin]','.wd-identity','.sh-hero-date','[data-work-part]','.sh-facts>dl','#work-intro','.sh-existing-gallery','[data-work-related]','.wd-sync-note>p'];
  async function load(){
    if(stopped||document.hidden||fetching)return;if(attempts>=45){stopped=true;if(note)note.textContent='补充资料仍在准备，稍后可重新打开查看。';return;}attempts++;fetching=true;
    controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch('/api/work-detail?'+new URLSearchParams({gid:host.dataset.workEnrichment}),{signal:controller.signal,headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('unavailable');const data=await response.json();
      if(data.state==='pending'||data.state==='busy'){timer=setTimeout(load,2000);return;}
      if(data.state!=='ready'||typeof data.html!=='string')throw Error('unavailable');
      const next=new DOMParser().parseFromString(data.html,'text/html');
      for(const selector of [...selectors.filter(s=>s!=='[data-work-part]'),...[...host.querySelectorAll('[data-work-part]')].map(el=>'[data-work-part="'+el.dataset.workPart+'"]'),...(host.querySelector('[data-subahibi-page]')?[]:['#work-images'])]){
        const old=host.querySelector(selector),fresh=next.querySelector(selector);if(!old||!fresh)continue;
        if(old.contains(document.activeElement)||selector==='.wd-cover'&&(old.hasAttribute('data-reveal-cover')&&old.disabled||host.querySelector('.poster-dialog[open]'))||selector==='[data-work-cover-admin]'&&old.querySelector('form'))continue;
        for(const opened of old.querySelectorAll('details[open]')){if(opened.id)fresh.querySelector('#'+CSS.escape(opened.id))?.setAttribute('open','');}
        if(old.tagName==='DETAILS'&&old.open)fresh.open=true;
        old.replaceWith(fresh);
      }
      if(note)note.textContent='已展示当前可用的补充资料。';stopped=true;
    }catch{if(!stopped&&note)note.textContent='补充资料暂时不可用，现有资料与游玩记录仍可使用。';stopped=true;}
    finally{clearTimeout(timeout);fetching=false;}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!stopped){clearTimeout(timer);load();}});
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);controller?.abort();});
  window.addEventListener('pageshow',event=>{if(event.persisted){stopped=false;attempts=0;load();}});
  if(note)note.textContent='正在补充作品资料，可先阅读或记录游玩进度。';load();
})();
