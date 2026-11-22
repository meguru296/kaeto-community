(function(){
  'use strict';
  document.querySelectorAll('[data-character-follow]').forEach(function(form){
    var pending=false;
    form.addEventListener('submit',async function(event){
      event.preventDefault();if(pending)return;
      var button=form.querySelector('button'),feedback=form.querySelector('.cb-feedback'),selected=form.elements.selected.value;
      pending=true;button.disabled=true;feedback.textContent='';feedback.classList.remove('is-error');
      try{
        var response=await fetch(form.action,{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(form))});
        var data=await response.json();if(!response.ok)throw Error(data.error||'未能保存，请稍后再试');
        if(data.selected!==(selected==='1'))throw Error('保存状态尚未确认，请刷新查看');
        form.elements.selected.value=data.selected?'0':'1';button.setAttribute('aria-pressed',String(data.selected));button.setAttribute('aria-label',(data.selected?'取消收藏':'收藏')+form.closest('.cb-card').querySelector('h3').textContent);
        button.querySelector('span').textContent=data.selected?'♥':'♡';form.querySelector('[data-follow-label]').textContent=data.selected?'已收藏':'收藏角色';
        document.querySelectorAll('[data-character-count]').forEach(function(el){el.textContent=data.count;});
        feedback.textContent=data.selected?'已收好这个名字。':'已取消收藏。';
      }catch(error){feedback.classList.add('is-error');feedback.textContent=error instanceof TypeError||error instanceof SyntaxError?'未能确认保存，请刷新后查看收藏。':error.message;}
      finally{pending=false;button.disabled=false;}
    });
  });
})();
