(() => {
 const section=document.querySelector('[data-suba-soundtrack]');if(!section)return;
 const audio=section.querySelector('audio'),buttons=[...section.querySelectorAll('[data-suba-track]')],feedback=section.querySelector('[data-suba-audio-feedback]');
 let active=-1,request=0;
 function paint(){buttons.forEach((button,i)=>{const playing=i===active&&!audio.paused;button.setAttribute('aria-pressed',String(playing));button.querySelector('[data-suba-play-icon]').textContent=playing?'Ⅱ':'▶';button.setAttribute('aria-label',(playing?'暂停 ':'播放 ')+button.dataset.title);button.closest('.sh-track').classList.toggle('is-selected',i===active);});if(active>=0)section.querySelector('[data-suba-track-number]').textContent=String(active+1).padStart(2,'0');}
 async function select(index){
  if(!buttons.length)return;const button=buttons[index];if(index===active&&!audio.paused){++request;audio.pause();return;}
  const attempt=++request;
  if(index!==active){audio.pause();active=index;audio.src=button.dataset.src;section.querySelector('[data-suba-current-title]').textContent=button.dataset.title;section.querySelector('[data-suba-current-artist]').textContent=button.dataset.artist;const cover=section.querySelector('[data-suba-current-cover]');cover.src=button.dataset.cover;cover.alt=button.dataset.album+' · 专辑封面';section.querySelector('[data-suba-current-album]').textContent=button.dataset.album;}
  feedback.textContent='正在准备播放…';paint();
  try{await audio.play();if(attempt===request&&!audio.paused)feedback.textContent='正在播放 · '+button.dataset.title;}catch{if(attempt===request)feedback.textContent='暂时没能播放，请点击播放重试。';paint();}
 }
 buttons.forEach((button,index)=>button.addEventListener('click',()=>select(index)));
 audio.addEventListener('play',()=>{document.querySelectorAll('audio,video').forEach(other=>{if(other!==audio)other.pause();});paint();});
 audio.addEventListener('pause',()=>{paint();if(active>=0)feedback.textContent='已暂停 · '+buttons[active].dataset.title;});
 audio.addEventListener('ended',()=>{paint();feedback.textContent='这首歌播放结束了。';});
 audio.addEventListener('error',()=>{paint();feedback.textContent='歌曲暂时无法加载，请稍后重试。';});
 window.addEventListener('pagehide',()=>audio.pause());
})();

(() => {
 const book=document.querySelector('[data-suba-gallery]');if(!book)return;
 const frames=[...book.querySelectorAll('[data-suba-gallery-frame]')],links=[...book.querySelectorAll('[data-suba-gallery-select]')];
 const previous=book.querySelector('[data-suba-gallery-prev]'),next=book.querySelector('[data-suba-gallery-next]'),counter=book.querySelector('[data-suba-gallery-number]'),status=book.querySelector('[data-suba-gallery-status]');
 let active=0;
 function select(index,announce=true){
  if(index<0||index>=frames.length)return;active=index;
  frames.forEach((frame,i)=>frame.hidden=i!==index);
  links.forEach((link,i)=>link.setAttribute('aria-current',String(i===index)));
  counter.textContent=String(index+1).padStart(2,'0');previous.disabled=index===0;next.disabled=index===frames.length-1;
  if(announce)status.textContent='原作画廊，第 '+(index+1)+' 幅，共 '+frames.length+' 幅。';
 }
 links.forEach((link,index)=>link.addEventListener('click',event=>{event.preventDefault();select(index);}));
 previous.addEventListener('click',()=>select(active-1));next.addEventListener('click',()=>select(active+1));
 book.addEventListener('keydown',event=>{
  let target;if(event.key==='ArrowLeft')target=Math.max(0,active-1);else if(event.key==='ArrowRight')target=Math.min(frames.length-1,active+1);else if(event.key==='Home')target=0;else if(event.key==='End')target=frames.length-1;else return;
  event.preventDefault();select(target);if(event.target.closest('[data-suba-gallery-select]'))links[target].focus();
 });
 function fromHash(){const index=frames.findIndex(frame=>'#'+frame.id===location.hash);if(index>=0)select(index,false);}
 book.querySelector('[data-suba-gallery-paging]').hidden=false;book.classList.add('is-enhanced');
 select(Math.max(0,frames.findIndex(frame=>'#'+frame.id===location.hash)),false);window.addEventListener('hashchange',fromHash);
})();

(() => {
 const exhibit=document.querySelector('[data-suba-characters]');if(!exhibit)return;
 const links=[...exhibit.querySelectorAll('[data-suba-character]')],panels=[...exhibit.querySelectorAll('[data-suba-character-panel]')],index=exhibit.querySelector('.sh-character-index');
 function select(id,focus=false,animate=true){
  const changed=exhibit.querySelector('[aria-selected="true"]')?.dataset.subaCharacter!==id;
  links.forEach(link=>{const active=link.dataset.subaCharacter===id;link.setAttribute('aria-selected',String(active));link.tabIndex=active?0:-1;if(active&&focus)link.focus();});
  panels.forEach(panel=>{panel.hidden=panel.id!==id;panel.classList.remove('is-entering');if(panel.id===id&&changed&&animate)panel.classList.add('is-entering');});
 }
 index.setAttribute('role','tablist');index.setAttribute('aria-orientation',matchMedia('(max-width:800px)').matches?'horizontal':'vertical');
 panels.forEach(panel=>{panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',panel.id+'-tab');panel.tabIndex=0;});
 links.forEach((link,i)=>{
  link.setAttribute('role','tab');link.setAttribute('aria-controls',link.dataset.subaCharacter);
  link.addEventListener('click',event=>{event.preventDefault();select(link.dataset.subaCharacter);});
  link.addEventListener('keydown',event=>{
   let next;if(['ArrowDown','ArrowRight'].includes(event.key))next=(i+1)%links.length;else if(['ArrowUp','ArrowLeft'].includes(event.key))next=(i+links.length-1)%links.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=links.length-1;else return;
   event.preventDefault();select(links[next].dataset.subaCharacter,true);
  });
 });
 function fromHash(){const id=location.hash.slice(1);if(panels.some(panel=>panel.id===id))select(id);}
 select(panels.some(panel=>panel.id===location.hash.slice(1))?location.hash.slice(1):links[0].dataset.subaCharacter,false,false);
 window.addEventListener('hashchange',fromHash);
 matchMedia('(max-width:800px)').addEventListener('change',event=>index.setAttribute('aria-orientation',event.matches?'horizontal':'vertical'));
})();

// Enhancing the character and CG panels changes document height. Re-align a
// direct fragment link after the page has loaded, using its normal scroll margin.
(() => {
 const page=document.querySelector('[data-subahibi-page]');if(!page||!location.hash)return;
 const align=()=>requestAnimationFrame(()=>{
  let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
  const target=document.getElementById(id);if(target&&page.contains(target))target.scrollIntoView({block:'start',behavior:'instant'});
 });
 if(document.readyState==='complete')align();else window.addEventListener('load',align,{once:true});
})();
