(()=>{
 const menus=[...document.querySelectorAll('[data-account-menu]')],closers=new Map();
 for(const menu of menus){
  const summary=menu.querySelector('summary'),panel=menu.querySelector('.account-menu-panel');
  let leaveTimer,animation=null,generation=0,closing=false,openedByHover=false,keyboardOpen=false;
  function show(visible){
   clearTimeout(leaveTimer);if(!visible&&!menu.open)return;
   const wasOpen=menu.open,current=wasOpen?getComputedStyle(panel):null;
   const from=current?{opacity:current.opacity,transform:current.transform}:{opacity:0,transform:'translateY(-12px) scale(.985)'};
   const revision=++generation;animation?.cancel();animation=null;closing=!visible;openedByHover=visible&&openedByHover;
   menu.open=true;panel.inert=!visible;
   const finish=()=>{if(revision!==generation)return;menu.open=visible;closing=false;panel.inert=false;animation?.cancel();animation=null;};
   if(matchMedia('(prefers-reduced-motion: reduce)').matches||typeof panel.animate!=='function'){finish();return;}
   animation=panel.animate([from,visible?{opacity:1,transform:'translateY(0) scale(1)'}:{opacity:0,transform:'translateY(-9px) scale(.985)'}],{duration:visible?300:220,easing:visible?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.4,0,1,1)',fill:'both'});
   animation.finished.then(finish,()=>{});
  }
  const close=()=>{openedByHover=false;keyboardOpen=false;show(false);};closers.set(menu,close);
  menu.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&matchMedia('(hover:hover)').matches){clearTimeout(leaveTimer);if(!menu.open||closing){openedByHover=true;keyboardOpen=false;show(true);}}});
  menu.addEventListener('pointerleave',()=>{leaveTimer=setTimeout(()=>{if(!keyboardOpen||!menu.matches(':focus-within'))close();},140);});
  summary.addEventListener('click',e=>{e.preventDefault();clearTimeout(leaveTimer);if(openedByHover&&e.detail>0&&!closing){openedByHover=false;return;}openedByHover=false;keyboardOpen=e.detail===0;if(menu.open&&!closing)close();else show(true);});
  menu.addEventListener('focusout',()=>{setTimeout(()=>{if(!menu.matches(':focus-within')&&!menu.matches(':hover'))close();},0);});
  menu.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();summary.focus();}});
  document.addEventListener('click',e=>{if(!menu.contains(e.target))close();});
  menu.addEventListener('toggle',()=>{if(menu.open)for(const other of menus)if(other!==menu)closers.get(other)?.();});
 }
 for(const form of document.querySelectorAll('[data-cover-preference]')){form.querySelector('[name=redirect]').value=location.pathname+location.search;form.querySelector('input[type=checkbox]').addEventListener('change',()=>form.requestSubmit());}
})();
