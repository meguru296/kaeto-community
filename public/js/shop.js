(function(){
 'use strict';
 var page=document.querySelector('[data-shop-page]');if(!page)return;
 var links=Array.from(page.querySelectorAll('[data-shop-filter]'));
 var products=Array.from(page.querySelectorAll('[data-shop-product]'));
 var result=page.querySelector('[data-shop-result]');
 page.querySelectorAll('img').forEach(function(image){image.draggable=false;});
 page.addEventListener('contextmenu',function(event){if(event.target.closest('img,[data-poster]'))event.preventDefault();});
 page.addEventListener('dragstart',function(event){if(event.target.closest('img,[data-poster]'))event.preventDefault();});
 function select(category){
  if(!links.some(function(link){return link.dataset.shopFilter===category;}))category='all';
  var count=0,label='全部制品';
  links.forEach(function(link){var active=link.dataset.shopFilter===category;if(active){link.setAttribute('aria-current','true');label=link.childNodes[0].textContent;}else link.removeAttribute('aria-current');});
  products.forEach(function(product){var visible=category==='all'||product.dataset.category===category;product.hidden=!visible;if(visible)count++;});
  result.textContent=label+' · '+count+' 款';
 }
 links.forEach(function(link){link.addEventListener('click',function(event){if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();var url=new URL(link.href);select(link.dataset.shopFilter);try{history.pushState(null,'',url.pathname+url.search+'#catalog');}catch(_){location.href=link.href;}});});
 window.addEventListener('popstate',function(){select(new URL(location.href).searchParams.get('category')||'all');});
 var memory=page.querySelector('[data-shop-memory]');
 if(memory){
  var frames=Array.from(memory.querySelectorAll('[data-shop-memory-frame]'));
  var thumbnails=Array.from(memory.querySelectorAll('[data-memory-select]'));
  var controls=memory.querySelector('.kc-memory-controls'),previous=memory.querySelector('[data-memory-prev]'),next=memory.querySelector('[data-memory-next]');
  var current=0;
  controls.hidden=false;
  function showMemory(index){
   current=Math.max(0,Math.min(frames.length-1,index));
   frames.forEach(function(frame,i){frame.hidden=i!==current;});
   thumbnails.forEach(function(link,i){if(i===current)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
   var chosen=thumbnails[current];
   memory.querySelector('[data-memory-label]').textContent=chosen.dataset.label;
   memory.querySelector('[data-memory-title]').textContent=chosen.dataset.title;
   memory.querySelector('[data-memory-description]').textContent=chosen.dataset.description;
   memory.querySelector('[data-memory-number]').textContent=String(current+1).padStart(2,'0');
   memory.querySelector('[data-memory-status]').textContent='第 '+(current+1)+' / '+frames.length+' 张 · '+chosen.dataset.title;
   previous.disabled=current===0;next.disabled=current===frames.length-1;
   var strip=chosen.parentElement;
   var itemBounds=chosen.getBoundingClientRect(),stripBounds=strip.getBoundingClientRect();
   if(itemBounds.left<stripBounds.left||itemBounds.right>stripBounds.right)strip.scrollTo({left:strip.scrollLeft+itemBounds.left-stripBounds.left-12,behavior:'instant'});
  }
  thumbnails.forEach(function(link,i){link.addEventListener('click',function(event){if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();showMemory(i);});});
  previous.addEventListener('click',function(){showMemory(current-1);});next.addEventListener('click',function(){showMemory(current+1);});
  memory.addEventListener('keydown',function(event){if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();showMemory(current+(event.key==='ArrowRight'?1:-1));});
  showMemory(0);
 }
 function initialAnchor(){if(!location.hash)return;var id;try{id=decodeURIComponent(location.hash.slice(1));}catch(_){return;}var target=document.getElementById(id);if(target&&page.contains(target))target.scrollIntoView({block:'start',behavior:'instant'});}
 function alignAnchor(){requestAnimationFrame(initialAnchor);}
 if(document.readyState==='complete')alignAnchor();else window.addEventListener('pageshow',alignAnchor,{once:true});
 window.addEventListener('hashchange',alignAnchor);
})();
