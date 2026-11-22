import { esc } from './lib/utils.js';
import { maskedEmail } from './lib/email-verification.js';
import { registrationConsent, registrationNotice } from './policies.js';

export function emailFields(purpose) {
  return `<div class="field"><label for="account-email">邮箱</label><input class="input" id="account-email" name="email" type="email" required maxlength="254" autocomplete="email" placeholder="用于验证身份和找回密码"></div>
    <div class="field"><label for="email-code">邮箱验证码 <span>10 分钟内有效</span></label><div class="ac-code-row"><input class="input" id="email-code" name="emailCode" required pattern="[0-9]{6}" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位数字"><button type="button" class="ac-send-code" data-email-send="${purpose}">获取验证码</button></div><p class="ac-email-feedback" role="status" aria-live="polite"></p></div>`;
}

function passwordField(id, label, isNew = false) {
  return `<div class="field"><label for="${id}">${label}</label><div class="au-password"><input class="input" id="${id}" name="${id}" type="password" required ${isNew ? 'minlength="8" maxlength="72"' : ''} autocomplete="${isNew ? 'new-password' : 'current-password'}" ${isNew && id === 'password' ? 'data-password-strength' : ''}><button type="button" data-password-toggle="${id}" aria-label="显示${label}" aria-pressed="false">显示</button></div>${isNew && id === 'password' ? '<div class="ac-strength" data-strength-panel><div class="ac-strength-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p role="status" aria-live="polite">至少 8 位，包含字母、数字、符号中的两类。</p></div>' : ''}</div>`;
}

export function accountDesign({ mode, flashHtml = '', defaultInvite = '', siteOpen = true, next = '' }) {
  const login = mode === 'login', reset = mode === 'reset', disabled = !siteOpen && mode === 'register';
  const headings = { login: ['CONTINUE YOUR STORY', '欢迎回来。', '登录后，继续记录你的游玩旅程。'], register: ['CREATE YOUR SAVE POINT', '来视觉小说社区坐坐。', '用注册码和已验证邮箱加入，和同好一起聊喜欢的作品。'], reset: ['FIND YOUR SAVE POINT', '找回你的账号。', '验证绑定邮箱，设置一个新的密码。'] };
  const [eyebrow, heading, description] = headings[mode];
  return `<section class="au-shell ${login ? 'au-login' : 'au-register'} ${reset ? 'au-reset' : ''}"><div class="au-art"><img src="/img/community/${login ? 'blue-ribbon' : 'spring-veranda'}.webp" alt="星标的插画" fetchpriority="high"><span class="au-art-index">KAETO / ${login ? '01' : '02'}</span><div class="au-art-caption"><p>VISUAL NOVEL COMMUNITY</p><h2>${login || reset ? '故事还在，<br>等你回来。' : '喜欢的故事，<br>从这里接着聊。'}</h2><span>视觉小说社区</span></div></div><div class="au-form-side"><a class="au-home" href="/">← 返回视觉小说社区</a><div class="au-form-wrap"><img class="au-avatar" src="/img/community/member-avatar.webp" alt="星标" width="64" height="64"><p class="au-eyebrow">${eyebrow}</p><h1>${heading}</h1><p class="au-description">${description}</p>${flashHtml}${disabled ? '<div class="flash flash-error">站点暂时关闭注册。</div>' : ''}<form method="post" action="${reset ? '/forgot-password' : login ? '/login' : '/register'}" class="stack-form au-form" data-auth-form>
    ${reset ? '' : '<div class="field"><label for="username">用户名</label><input class="input" id="username" name="username" required minlength="2" maxlength="20" autocomplete="username" placeholder="2—20 个字符"></div>'}
    ${!login ? emailFields(reset ? 'reset' : 'register') : ''}
    ${login && next ? `<input type="hidden" name="next" value="${esc(next)}">` : ''}${passwordField('password', reset ? '新密码' : '密码', !login)}${!login ? passwordField('password2', '确认密码', true) : ''}
    ${mode === 'register' ? `<div class="field"><label for="inviteCode">注册码 <span>向站长索取</span></label><input class="input au-invite" id="inviteCode" name="inviteCode" required value="${esc(defaultInvite)}" placeholder="XXXX-XXXX-XXXX" autocomplete="off" maxlength="20"></div>` : ''}
    ${login ? '<a class="ac-forgot" href="/forgot-password">忘记密码？通过邮箱找回 ↗</a>' : reset ? '<p class="ac-reset-note">重置后，其他设备的登录将失效。老账号请先在个人中心绑定邮箱。</p>' : ''}
    ${mode === 'register' ? registrationConsent() : ''}<p class="au-form-feedback" role="status" aria-live="polite"></p><button class="btn btn-primary btn-block au-submit" type="submit" ${disabled ? 'disabled' : ''}>${login ? '登录，继续故事 →' : reset ? '验证邮箱并重置密码 →' : '注册并登录 →'}</button></form><p class="auth-switch">${login ? '还没有账号？<a href="/register">用注册码注册 ↗</a>' : '已有账号？<a href="/login">返回登录 ↗</a>'}</p><p class="au-footnote">评分 · 游玩记录 · 群友感想</p></div></div></section>${mode === 'register' && !disabled ? registrationNotice() : ''}`;
}

export function accountSecurity(user) {
  const verified = Boolean(user.email && user.emailVerifiedAt);
  return `<section class="ac-security" id="account-security"><details ${verified ? '' : 'open'}><summary><span><small>ACCOUNT SECURITY</small><strong>账号安全</strong></span><span class="ac-security-badge">${verified ? '邮箱已验证 ✓' : '绑定邮箱，开启密码找回'} ↓</span></summary><div class="ac-security-body">${verified ? `<p>已绑定 <strong>${esc(maskedEmail(user.email))}</strong>，可用于验证身份和找回密码。</p><a class="btn btn-ghost btn-sm" href="/forgot-password">通过邮箱重置密码 ↗</a>` : `<p>已有账号可在这里补充邮箱。验证并绑定后，忘记密码时就能自行找回。</p><form method="post" action="/api/email/bind" class="stack-form au-form ac-bind-form">${emailFields('bind')}${passwordField('password', '当前登录密码')}<p class="ac-reset-note">邮箱不会显示在公开主页。一个邮箱只能绑定一个账号。</p><button class="btn btn-primary" type="submit">验证并绑定邮箱 →</button></form>`}</div></details></section>`;
}
