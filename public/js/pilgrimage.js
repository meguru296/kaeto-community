(function(){
  'use strict';
  var cards=Array.from(document.querySelectorAll('[data-pg-card]'));
  if(!cards.length)return;
  var filters=Array.from(document.querySelectorAll('[data-pg-filter]'));
  var selected=filters.find(function(b){return b.getAttribute('aria-pressed')==='true';});
  var status=selected?selected.dataset.pgFilter:'all';
  var city=document.querySelector('[data-pg-city]');
  function filter(){
    var visible=0;cards.forEach(function(card){card.hidden=(status!=='all'&&card.dataset.status!==status)||(city&&city.value&&card.dataset.city!==city.value);if(!card.hidden)visible++;});
    var counter=document.querySelector('[data-pg-count]');if(counter)counter.textContent=visible+' 处地点';
    var empty=document.querySelector('[data-pg-empty]');if(empty)empty.hidden=visible!==0;
    filters.forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.pgFilter===status));});
  }
  filters.forEach(function(b){b.addEventListener('click',function(){status=b.dataset.pgFilter;filter();});});
  if(city)city.addEventListener('change',filter);
  var all=document.querySelector('[data-pg-show-all]');if(all)all.addEventListener('click',function(){status='all';if(city)city.value='';filter();});
  function totals(summary){
    Object.keys(summary).forEach(function(key){document.querySelectorAll('[data-pg-total="'+key+'"]').forEach(function(el){el.textContent=summary[key];});});
    [['first',summary.visited>=1],['three',summary.visited>=3],['works',summary.works>=2]].forEach(function(a){var el=document.querySelector('[data-pg-achievement="'+a[0]+'"]');if(el)el.classList.toggle('is-earned',a[1]);});
  }
  document.querySelectorAll('[data-pg-mark]').forEach(function(form){
    var saving=false;
    form.addEventListener('submit',async function(event){
      event.preventDefault();if(saving)return;
      var card=form.closest('[data-pg-card]'),feedback=form.querySelector('.pg-card-feedback');
      var clicked=event.submitter;if(!clicked)return;
      var body=new URLSearchParams();new FormData(form).forEach(function(value,key){body.set(key,value);});body.set('status',clicked.value);
      saving=true;form.setAttribute('aria-busy','true');form.querySelectorAll('button').forEach(function(b){b.disabled=true;});feedback.textContent='正在收进手账…';feedback.classList.remove('is-error');
      try{
        var response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:body});
        var data=await response.json();if(!response.ok)throw new Error(data.error||'暂时没能保存，请稍后再试。');
        var r=data.record;card.dataset.status=r.status;card.classList.toggle('is-visited',r.status==='visited');card.classList.toggle('is-wish',r.status==='wish');
        var stamp=card.querySelector('[data-pg-stamp]');stamp.textContent=r.status==='visited'?'足迹已留下 ✓':r.status==='wish'?'下次想去 ♡':'';
        form.querySelectorAll('.pg-mark-buttons button').forEach(function(b){b.setAttribute('aria-pressed',String(b.value===r.status));});
        form.elements.note.value=r.note;form.elements.date.value=r.date;form.querySelector('[data-pg-save]').value=r.status||'wish';
        if(!r.status)form.querySelector('.pg-note').open=false;totals(data.summary);feedback.textContent=r.status==='visited'?'一枚脚印，收好了。':r.status==='wish'?'已收进想去清单。':'已清除这条足迹。';
        card.classList.remove('is-stamping');void card.offsetWidth;card.classList.add('is-stamping');
        if(status!=='all')filter();
      }catch(error){feedback.classList.add('is-error');feedback.textContent=error instanceof TypeError||error instanceof SyntaxError?'未能确认保存，请刷新查看足迹后再试。':error.message||'保存失败，请稍后再试。';}
      finally{saving=false;form.removeAttribute('aria-busy');form.querySelectorAll('button').forEach(function(b){b.disabled=false;});}
    });
  });
  filter();
})();
