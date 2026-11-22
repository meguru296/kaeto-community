(function(){
  'use strict';
  var doc=document,reduced=matchMedia('(prefers-reduced-motion: reduce)');
  var intro=doc.querySelector('.jx-opening'),closeTimer,fadeTimer,previousFocus;
  function storageSeen(){try{return sessionStorage.getItem('tangtang-annual-entry-v1')==='1';}catch{return false;}}
  function dismiss(){
    if(!intro||!intro.open)return;
    clearTimeout(closeTimer);clearTimeout(fadeTimer);intro.classList.add('is-leaving');
    function finish(){intro.close();intro.classList.remove('is-leaving');doc.documentElement.classList.remove('jx-modal-open');if(previousFocus&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});}
    if(reduced.matches)finish();else fadeTimer=setTimeout(finish,320);
  }
  function play(){
    if(!intro||intro.open||reduced.matches)return;
    previousFocus=doc.activeElement;clearTimeout(fadeTimer);intro.classList.remove('is-leaving');
    try{sessionStorage.setItem('tangtang-annual-entry-v1','1');}catch{}
    intro.showModal();doc.documentElement.classList.add('jx-modal-open');closeTimer=setTimeout(dismiss,1650);
  }
  if(intro){intro.querySelector('[data-jx-skip]').addEventListener('click',dismiss);intro.addEventListener('cancel',function(e){e.preventDefault();dismiss();});doc.querySelector('[data-jx-replay]')?.addEventListener('click',play);reduced.addEventListener('change',function(){if(reduced.matches)dismiss();});if(!storageSeen())play();}
  doc.querySelectorAll('[data-password-toggle]').forEach(function(button){
    button.addEventListener('click',function(){var input=doc.getElementById(button.dataset.passwordToggle);var show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'隐藏':'显示';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',(show?'隐藏':'显示')+(input.name==='password2'?'确认密码':'密码'));});
  });
  var form=doc.querySelector('[data-auth-form]');
  if(form){
    var repeat=form.elements.password2,password=form.elements.password,feedback=form.querySelector('.au-form-feedback');
    function verify(){if(!repeat)return;var mismatch=repeat.value&&repeat.value!==password.value;repeat.setCustomValidity(mismatch?'两次输入的密码不一致。':'');feedback.textContent=mismatch?'两次密码还不一致，请再检查一下。':'';}
    repeat?.addEventListener('input',verify);password.addEventListener('input',verify);
    form.addEventListener('submit',function(e){verify();if(!form.checkValidity()){e.preventDefault();form.reportValidity();}});
    var invite=form.elements.inviteCode;invite?.addEventListener('blur',function(){invite.value=invite.value.trim().toUpperCase();});
  }
})();
