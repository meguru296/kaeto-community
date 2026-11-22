(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),images=new Set(),visible=new WeakSet(),failed=new WeakSet();
  const still=img=>img.dataset.stickerStill;
  function play(img){if(!img||reduced.matches||document.hidden||failed.has(img))return;img.src=img.dataset.stickerAnimation;}
  function stop(img){if(img&&img.getAttribute('src')!==still(img))img.src=still(img);}
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{for(const entry of entries){const img=entry.target;if(entry.isIntersecting){visible.add(img);if(!img.hasAttribute('data-sticker-hover'))play(img);}else{visible.delete(img);stop(img);}}},{rootMargin:'60px'}):null;
  function add(img){if(images.has(img))return;images.add(img);img.dataset.stickerStill=img.getAttribute('src');img.addEventListener('error',()=>{if(img.getAttribute('src')!==still(img)){failed.add(img);stop(img);}});if(observer)observer.observe(img);else if(!img.hasAttribute('data-sticker-hover'))play(img);}
  function scan(node){if(node.nodeType!==1)return;if(node.matches('[data-sticker-animation]'))add(node);node.querySelectorAll('[data-sticker-animation]').forEach(add);}
  scan(document.body);
  const changes=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)scan(node);for(const img of images)if(!img.isConnected){observer?.unobserve(img);images.delete(img);}});
  changes.observe(document.body,{childList:true,subtree:true});
  const pickerImage=target=>target.closest('button')?.querySelector('[data-sticker-hover]');
  document.addEventListener('pointerover',event=>play(pickerImage(event.target)));
  document.addEventListener('pointerout',event=>{if(!event.target.closest('button')?.contains(event.relatedTarget))stop(pickerImage(event.target));});
  document.addEventListener('focusin',event=>play(pickerImage(event.target)));
  document.addEventListener('focusout',event=>stop(pickerImage(event.target)));
  function sync(){for(const img of images)if(!reduced.matches&&!document.hidden&&visible.has(img)&&!img.hasAttribute('data-sticker-hover'))play(img);else stop(img);}
  reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  window.addEventListener('pageshow',event=>{if(event.persisted){scan(document.body);changes.observe(document.body,{childList:true,subtree:true});}});
  window.addEventListener('pagehide',()=>{changes.disconnect();observer?.disconnect();images.forEach(stop);images.clear();});
})();
