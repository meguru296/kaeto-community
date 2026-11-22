(function(){
  'use strict';
  const root=document.querySelector('[data-muramasa-guide]');
  if(!root)return;
  const buttons=[...root.querySelectorAll('[data-mwg-ending]')],allowed=new Set(buttons.map(b=>b.dataset.mwgEnding));
  let completed=new Set();
  try{const saved=JSON.parse(localStorage.getItem(root.dataset.progressKey)||'{}');if(saved&&Array.isArray(saved.completed))completed=new Set(saved.completed.filter(id=>allowed.has(id)));}catch{}
  function update(){
    for(const button of buttons){
      const done=completed.has(button.dataset.mwgEnding);button.setAttribute('aria-pressed',String(done));button.textContent=done?'已回收 ✓':'标记回收 ＋';
      const card=button.closest('[data-mwg-ending-card]');card.classList.toggle('is-complete',done);
      const name=card.querySelector('h4').textContent;button.setAttribute('aria-label',name+'，'+(done?'取消回收标记':'标记回收'));
    }
    root.querySelector('[data-mwg-count]').innerHTML=completed.size+' <small>/ '+allowed.size+'</small>';
    root.querySelector('[data-mwg-progress-bar]').style.width=(completed.size/allowed.size*100)+'%';
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-mwg-ending]');if(!button||!root.contains(button))return;
    const id=button.dataset.mwgEnding;if(!allowed.has(id))return;
    if(completed.has(id))completed.delete(id);else completed.add(id);update();
    try{localStorage.setItem(root.dataset.progressKey,JSON.stringify({completed:[...completed]}));}
    catch{root.querySelector('.mwg-feedback').textContent='浏览器未允许本地保存，回收标记仅在本次页面中保留。';}
  });
  update();
  const sections=[...root.querySelectorAll('[data-mwg-route]')],links=[...root.querySelectorAll('[data-mwg-route-link]')];
  let scheduled=false;
  function highlight(){
    scheduled=false;
    const padding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
    const active=sections.filter(s=>s.getBoundingClientRect().top<=padding+(parseFloat(getComputedStyle(s).scrollMarginTop)||0)+3).at(-1)||sections[0];
    for(const link of links){if(link.dataset.mwgRouteLink===active.dataset.mwgRoute)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
  }
  window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(highlight);}},{passive:true});
  window.addEventListener('resize',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(highlight);}});
  highlight();
})();
