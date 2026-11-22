(function(){'use strict';function ready(){
  var foldStorage='kaeto-steam-card-folds';
  function foldPreferences(){try{var stored=JSON.parse(localStorage.getItem(foldStorage)||'{}');return Object.fromEntries(Object.entries(stored).filter(function(entry){return /^\d{17}$/.test(entry[0])&&typeof entry[1]==='boolean';}).slice(-30));}catch{return {};}}
  function restoreSteamFold(){var fold=document.querySelector('[data-steam-fold]');if(fold){var prefs=foldPreferences();if(Object.prototype.hasOwnProperty.call(prefs,fold.dataset.steamId))fold.open=prefs[fold.dataset.steamId];}}
  restoreSteamFold();
  document.addEventListener('toggle',function(event){var fold=event.target;if(!fold.matches('[data-steam-fold]'))return;try{var prefs=foldPreferences();delete prefs[fold.dataset.steamId];prefs[fold.dataset.steamId]=fold.open;localStorage.setItem(foldStorage,JSON.stringify(Object.fromEntries(Object.entries(prefs).slice(-30))));}catch{}},true);
  var steam=document.querySelector('[data-steam-continue]');
  if(steam){var destination=new URL(steam.href);if(destination.origin==='https://steamcommunity.com'&&destination.pathname==='/openid/login')window.location.replace(destination.href);}
  if(document.querySelector('[data-steam-pending]')){
    var attempts=0;
    async function updateSteam(){try{var response=await fetch('/api/me/steam-card',{credentials:'same-origin',headers:{Accept:'application/json'}});if(!response.ok)return;var data=await response.json(),card=document.querySelector('.steam-card');if(card&&typeof data.html==='string'){var previousFold=card.querySelector('[data-steam-fold]'),previousOpen=previousFold&&previousFold.open;card.outerHTML=data.html;restoreSteamFold();var newFold=document.querySelector('[data-steam-fold]');if(previousFold&&newFold)newFold.open=previousOpen;}if(data.busy&&++attempts<8)setTimeout(updateSteam,2500);}catch{}}
    setTimeout(updateSteam,2000);
  }
  var root=document.querySelector('[data-bi-preview]');if(!root)return;
  var rows=Array.from(root.querySelectorAll('[data-bi-row]')),query=root.querySelector('[data-bi-search]'),filter='matched',status=root.querySelector('[data-bi-selection-count]');
  function selected(){return root.querySelectorAll('[data-bi-select]:checked').length;}
  function draw(){var needle=query.value.trim().toLowerCase(),visible=0;rows.forEach(function(row){var linked=!!row.querySelector('[data-bi-gid]').value.trim(),chosen=row.querySelector('[data-bi-select]').checked,match=filter==='all'||filter==='matched'&&linked||filter==='unmatched'&&!linked||filter==='selected'&&chosen;row.hidden=!(match&&row.dataset.biSearch.toLowerCase().includes(needle));if(!row.hidden)visible++;});root.querySelectorAll('[data-bi-filter]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.biFilter===filter));});status.textContent='已勾选 '+selected()+' / 25 部 · 当前显示 '+visible+' 部';}
  root.addEventListener('click',function(event){var button=event.target.closest('[data-bi-filter]');if(button){filter=button.dataset.biFilter;draw();}if(event.target.closest('[data-bi-clear]')){rows.forEach(function(row){row.querySelector('[data-bi-select]').checked=false;});draw();}});
  query.addEventListener('input',draw);
  root.addEventListener('change',function(event){if(event.target.matches('[data-bi-select]')&&selected()>25){event.target.checked=false;draw();status.textContent+=' · 每次最多保存 25 部，请先完成这一批';return;}if(event.target.matches('[data-bi-select],[data-bi-gid]'))draw();});draw();
}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();})();
