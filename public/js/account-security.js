(function () {
  'use strict';
  document.querySelectorAll('[data-email-send]').forEach(function (button) {
    button.addEventListener('click', async function () {
      var form = button.closest('form'), email = form.elements.email, feedback = form.querySelector('.ac-email-feedback');
      if (!email.checkValidity()) { email.reportValidity(); return; }
      button.disabled = true; button.textContent = '发送中…'; feedback.textContent = '';
      var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 25000);
      try {
        var response = await fetch('/api/email/send', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: email.value, purpose: button.dataset.emailSend }), signal: controller.signal });
        var result = await response.json();
        feedback.textContent = result.message;
        if (!response.ok) throw new Error(result.message);
        var end = Date.now() + 60000;
        function tick() { var remaining = Math.ceil((end - Date.now()) / 1000); button.textContent = remaining > 0 ? remaining + ' 秒后重发' : '重新获取'; if (remaining <= 0) { clearInterval(timer); button.disabled = false; } }
        var timer = setInterval(tick, 1000); tick(); form.elements.emailCode.focus();
      } catch (err) {
        feedback.textContent = err.name === 'AbortError' ? '发送超时，请稍后查看邮箱或重试。' : err.message || '发送失败，请稍后重试。';
        button.disabled = false; button.textContent = '获取验证码';
      } finally { clearTimeout(timeout); }
    });
  });
  document.querySelectorAll('[data-password-strength]').forEach(function (input) {
    var panel = input.closest('.field').querySelector('[data-strength-panel]'), text = panel.querySelector('p');
    function update() {
      var value = input.value, classes = [/[A-Za-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(function (re) { return re.test(value); }).length;
      var valid = value.length >= 8 && value.length <= 72 && classes >= 2;
      input.setCustomValidity(value && !valid ? '至少 8 位，包含字母、数字、符号中的至少两类。' : '');
      var score = !value ? 0 : !valid ? 1 : value.length >= 12 && classes === 3 ? 4 : value.length >= 10 || classes === 3 ? 3 : 2;
      panel.dataset.level = score;
      text.textContent = !value ? '至少 8 位，包含字母、数字、符号中的两类。' : !valid ? '强度较弱 · 至少 8 位，混合两类字符。' : score === 4 ? '强度高 · 请避免与其他网站使用相同密码。' : score === 3 ? '强度良好 · 更长的密码会更稳妥。' : '强度一般 · 可增加长度或加入符号。';
    }
    input.addEventListener('input', update); update();
  });
})();
