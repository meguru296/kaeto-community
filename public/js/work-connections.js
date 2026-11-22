(() => {
  for(const panel of document.querySelectorAll('[data-work-offers]')){
    const app=panel.querySelector('[data-offer-app]'),region=panel.querySelector('[data-offer-region]'),result=panel.querySelector('[data-offer-result]');let generation=0,controller,started=false;
    async function load(){
      started=true;const current=++generation;controller?.abort();controller=new AbortController();
      panel.querySelector('[data-offer-direct]').href='https://store.steampowered.com/app/'+app.value+'/';result.setAttribute('aria-busy','true');
      try{const res=await fetch('/api/work-offers?'+new URLSearchParams({gid:panel.dataset.workOffers,appid:app.value,country:region.value}),{signal:controller.signal,headers:{Accept:'application/json'}});if(!res.ok)throw Error('unavailable');const data=await res.json();if(current===generation&&typeof data.html==='string')result.innerHTML=data.html;}
      catch(error){if(error.name!=='AbortError'&&current===generation){let message=result.querySelector('.wo-message');if(!message){message=document.createElement('p');message.className='wo-message';result.append(message);}message.textContent='价格暂时无法更新，可直接前往 Steam 查看。';}}
      finally{if(current===generation)result.removeAttribute('aria-busy');}
    }
    app.addEventListener('change',load);region.addEventListener('change',load);
    if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();if(!started)load();}},{rootMargin:'160px'});observer.observe(panel);}else load();
    window.addEventListener('pagehide',()=>controller?.abort(),{once:true});
  }
})();
