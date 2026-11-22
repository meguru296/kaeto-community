import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { hashPassword, verifyPassword } from '../src/lib/utils.js';
import { POLICY_VERSION } from '../src/policies.js';

const dir = await mkdtemp(path.join(os.tmpdir(), 'galrate-email-'));
const sent = [], mailer = { ready: true, fail: false, async sendCode(email, code, purpose) { if (this.fail) throw new Error('Simulated SMTP failure'); sent.push({ email, code, purpose }); } };
const { server, db, auth, emailVerification: codes } = await createApp({ dataDir: dir, mailer });
let count = 0;
function check(label, condition) { assert.ok(condition, label); count++; console.log('✅ ' + label); }
async function rejected(label, action) { await assert.rejects(action); count++; console.log('✅ ' + label); }
const password = 'SecureTest42!', register = (username, email, inviteCode, emailCode, override = {}) => auth.register({ username, email, inviteCode, emailCode, password, password2: password, policyVersion: POLICY_VERSION, ...override });
async function send(email, purpose = 'register', user = null) { await codes.send({ email, purpose, user, ip: 'email-selftest' }); return sent.at(-1).code; }
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [url, expected] of [['/register', 'data-email-send="register"'], ['/forgot-password', 'data-email-send="reset"'], ['/login', 'href="/forgot-password"']]) {
    const response = await fetch(base + url); check(url + ' 具有对应邮箱界面或找回入口', response.ok && (await response.text()).includes(expected));
  }
  const invite = await db.ensureInvite('自测'); invite.maxUses = 2; await db.invites.persist();
  await rejected('没有邮箱验证码无法注册', () => register('测试一', 'one@example.com', invite.code, '000000'));
  check('验证失败不会消耗注册码名额', invite.uses === 0 && db.users.all().length === 0);
  const firstCode = await send('one@example.com');
  await rejected('未同意注册须知不能注册', () => register('测试一', 'one@example.com', invite.code, firstCode, { policyVersion: undefined }));
  check('未同意须知不消耗邮箱验证码或注册码名额', invite.uses === 0 && !db.emailCodes.all().at(-1).used && db.users.all().length === 0);
  await rejected('弱密码在服务端被拒绝', () => register('测试一', 'one@example.com', invite.code, firstCode, { password: 'abcdefgh', password2: 'abcdefgh' }));
  const first = await register('测试一', 'ONE@example.com', invite.code, firstCode);
  check('成功注册保存同意版本与时间', first.user.policyVersion === POLICY_VERSION && Boolean(first.user.policyAcceptedAt));
  await rejected('已使用验证码不能重用', () => codes.check('one@example.com', 'register', firstCode));
  check('验证码仅保存散列，消费后清空散列', db.emailCodes.all()[0].used && !db.emailCodes.all()[0].codeHash);
  const secondCode = await send('two@example.com');
  await register('测试二', 'two@example.com', invite.code, secondCode);
  await rejected('两人注册码满额后不能继续注册', () => register('测试三', 'three@example.com', invite.code, '000000'));
  check('名额按成功注册准确累计', invite.uses === 2 && !db.inviteUsable(invite));
  await rejected('上限不能设置为零或无限', () => auth.createInvite(first.user, { maxUses: 0 }));
  // Simulate cooldown passing without waiting; test data is isolated.
  await db.emailCodes.update(db.emailCodes.all()[0].id, { sentAt: Date.now() - 61000 });
  const resetCode = await send('one@example.com', 'reset');
  await rejected('重置验证码不能用于注册验证', () => codes.check('one@example.com', 'register', resetCode));
  await auth.createSession(first.user.id);
  await auth.resetPassword({ email: 'one@example.com', emailCode: resetCode, password: 'NewSecure55!', password2: 'NewSecure55!' });
  check('重置密码使该用户的全部旧会话失效', db.sessions.filter(s => s.userId === first.user.id).length === 0 && db.sessions.filter(s => s.userId !== first.user.id).length === 1);
  check('新密码可登录且旧密码已失效', await verifyPassword('NewSecure55!', first.user.passwordHash) && !await verifyPassword(password, first.user.passwordHash));
  await rejected('重置验证码只能使用一次', () => auth.resetPassword({ email: 'one@example.com', emailCode: resetCode, password, password2: password }));
  const legacy = await db.users.insert({ username: '旧账号', passwordHash: await hashPassword('old123'), bio: '简介保留', uid: 10003 });
  const bindingCode = await send('legacy@example.com', 'bind', legacy);
  await rejected('绑定邮箱需验证当前登录密码', () => auth.bindEmail(legacy, { email: 'legacy@example.com', emailCode: bindingCode, password: 'wrong' }));
  await auth.bindEmail(legacy, { email: 'legacy@example.com', emailCode: bindingCode, password: 'old123' });
  check('老账号可以绑定邮箱，原密码与简介保持不变', legacy.emailVerifiedAt && legacy.bio === '简介保留' && await verifyPassword('old123', legacy.passwordHash));
  const extra = await send('attempts@example.com');
  for (let i = 0; i < 5; i++) await assert.rejects(() => codes.check('attempts@example.com', 'register', extra === '000000' ? '111111' : '000000'));
  await rejected('输错五次后正确验证码也不可使用', () => codes.check('attempts@example.com', 'register', extra));
  const expired = await send('expired@example.com');
  await db.emailCodes.update(db.emailCodes.find(c => c.email === 'expired@example.com').id, { expiresAt: Date.now() - 1 });
  await rejected('过期验证码被拒绝', () => codes.check('expired@example.com', 'register', expired));
  const before = sent.length; await send('unknown@example.com', 'reset');
  check('未知邮箱找回请求不暴露账号信息且不发邮件', sent.length === before);
  mailer.fail = true;
  await rejected('邮件发送失败不会生成有效验证码', () => send('failure@example.com'));
  check('SMTP 失败没有留下验证码记录', !db.emailCodes.find(c => c.email === 'failure@example.com'));
  console.log(`邮箱专项检查：${count} 项通过；未发送真实邮件。`);
} finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
