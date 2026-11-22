(function(){
  'use strict';
  const root=document.querySelector('[data-muramasa-flowchart]');if(!root)return;
  const viewport=root.querySelector('.mgf-viewport'),svg=root.querySelector('svg'),output=root.querySelector('[data-mgf-scale]');
  const full={width:Number(svg.dataset.fullWidth),height:Number(svg.dataset.fullHeight)};
  const routeButtons=[...root.querySelectorAll('[data-mgf-focus]')],points=new Map();
  let scale=1,x=0,y=0,activeRoute=null,drag=null,pinch=null,suppressClick=false,frame=0;
  const size=()=>({width:viewport.clientWidth,height:viewport.clientHeight});
  function draw(){
    const view=size();svg.setAttribute('viewBox',`${x} ${y} ${view.width/scale} ${view.height/scale}`);
    output.textContent=Math.round(scale*100)+'%';
    for(const button of routeButtons)button.setAttribute('aria-pressed',String(button.dataset.mgfFocus===activeRoute));
    root.querySelector('[data-mgf-zoom="out"]').disabled=scale<=.025;
    root.querySelector('[data-mgf-zoom="in"]').disabled=scale>=2.5;
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
  function fit(){const view=size();scale=Math.min(view.width/(full.width+50),view.height/(full.height+50));x=(full.width-view.width/scale)/2;y=(full.height-view.height/scale)/2;activeRoute=null;draw();}
  function zoom(next,px,py){
    const view=size();px??=view.width/2;py??=view.height/2;
    const worldX=x+px/scale,worldY=y+py/scale;
    scale=Math.max(.025,Math.min(2.5,next));x=worldX-px/scale;y=worldY-py/scale;schedule();
  }
  function focusRoute(id){
    const lane=root.querySelector(`[data-mgf-lane="${id}"]`);if(!lane)return;
    const [,top,,height]=lane.dataset.bounds.split(' ').map(Number),view=size();
    // Show the start at a reading scale. Every other lane remains on the canvas.
    scale=Math.min(1,Math.max(.75,view.width/860),Math.max(.75,view.height/Math.min(height,680)));
    x=0;y=top-18;activeRoute=id;draw();
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!root.contains(button))return;
    if(button.dataset.mgfFocus){focusRoute(button.dataset.mgfFocus);return;}
    if(button.dataset.mgfZoom){zoom(scale*(button.dataset.mgfZoom==='in'?1.3:1/1.3));return;}
    if(button.dataset.mgfAction==='fit'){fit();return;}
    if(button.dataset.mgfAction==='actual'){zoom(1);return;}
    if(button.dataset.mgfAction==='expand'){
      const view=size(),cx=x+view.width/scale/2,cy=y+view.height/scale/2;
      const expanded=root.classList.toggle('is-expanded');button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'收起画布 ↙':'展开画布 ↗';
      const next=size();x=cx-next.width/scale/2;y=cy-next.height/scale/2;previous=next;draw();
    }
  });
  viewport.addEventListener('wheel',event=>{
    event.preventDefault();const rect=viewport.getBoundingClientRect();activeRoute=null;
    zoom(scale*Math.exp(-Math.max(-150,Math.min(150,event.deltaY))*.004),event.clientX-rect.left,event.clientY-rect.top);
  },{passive:false});
  viewport.addEventListener('keydown',event=>{
    if(event.target!==viewport)return;
    const move=85/scale;
    if(['+','=','-','0','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault();else return;
    if(event.key==='0'){fit();return;}
    if(event.key==='+'||event.key==='='){zoom(scale*1.3);return;}
    if(event.key==='-'){zoom(scale/1.3);return;}
    if(event.key==='ArrowLeft')x-=move;if(event.key==='ArrowRight')x+=move;if(event.key==='ArrowUp')y-=move;if(event.key==='ArrowDown')y+=move;activeRoute=null;schedule();
  });
  function twoPoints(){const [a,b]=[...points.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};}
  viewport.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;const rect=viewport.getBoundingClientRect();
    points.set(event.pointerId,{x:event.clientX-rect.left,y:event.clientY-rect.top});viewport.setPointerCapture(event.pointerId);
    if(points.size===1){drag={px:event.clientX,py:event.clientY,x,y};suppressClick=false;}
    if(points.size===2){pinch={...twoPoints(),scale,x,y};drag=null;suppressClick=true;}
  });
  viewport.addEventListener('pointermove',event=>{
    if(!points.has(event.pointerId))return;const rect=viewport.getBoundingClientRect();points.set(event.pointerId,{x:event.clientX-rect.left,y:event.clientY-rect.top});
    if(points.size>=2&&pinch){
      const next=twoPoints();scale=Math.max(.025,Math.min(2.5,pinch.scale*next.distance/Math.max(pinch.distance,1)));
      x=pinch.x+pinch.cx/pinch.scale-next.cx/scale;y=pinch.y+pinch.cy/pinch.scale-next.cy/scale;activeRoute=null;schedule();
    }else if(drag){
      const dx=event.clientX-drag.px,dy=event.clientY-drag.py;
      if(Math.hypot(dx,dy)>5){suppressClick=true;viewport.classList.add('is-dragging');x=drag.x-dx/scale;y=drag.y-dy/scale;activeRoute=null;schedule();}
    }
  });
  function release(event){
    points.delete(event.pointerId);pinch=null;drag=null;viewport.classList.remove('is-dragging');
    if(points.size===1){const p=[...points.values()][0],rect=viewport.getBoundingClientRect();drag={px:p.x+rect.left,py:p.y+rect.top,x,y};}
  }
  viewport.addEventListener('pointerup',release);viewport.addEventListener('pointercancel',release);viewport.addEventListener('lostpointercapture',event=>{if(points.has(event.pointerId))release(event);});
  // Pointer capture retargets click to the viewport; resolve a stationary click
  // from the final screen position and keep normal anchor navigation semantics.
  viewport.addEventListener('click',event=>{
    if(suppressClick){event.preventDefault();suppressClick=false;return;}
    if(event.target.closest('a'))return;
    const link=document.elementFromPoint(event.clientX,event.clientY)?.closest('a[data-mgf-card]');
    if(link&&svg.contains(link)){event.preventDefault();const target=document.getElementById(link.getAttribute('href').slice(1));if(target){history.replaceState(null,'',link.getAttribute('href'));target.scrollIntoView({block:'start'});}}
  });
  // Resize about the existing center instead of resetting a user's position.
  let previous=size();new ResizeObserver(()=>{const next=size();x+=(previous.width-next.width)/scale/2;y+=(previous.height-next.height)/scale/2;previous=next;schedule();}).observe(viewport);
  focusRoute('ichijo');
})();
