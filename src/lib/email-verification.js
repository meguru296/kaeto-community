import { randomInt } from 'node:crypto';
import { hashPassword, verifyPassword, nowIso } from './utils.js';
import { AuthError } from './auth.js';

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(email)) throw new AuthError('请输入有效的邮箱地址');
  return email;
}
export const maskedEmail = value => { const [name, domain] = String(value || '').split('@'); return domain ? `${name.slice(0, 2)}***@${domain}` : '未绑定'; };

export class EmailVerification {
  constructor(db, mailer) { this.db = db; this.mailer = mailer; this.ipLimits = new Map(); this.writes = Promise.resolve(); }
  serial(action) {
    const result = this.writes.then(action); this.writes = result.catch(() => {}); return result;
  }
  async send({ email: value, purpose, user, ip }) {
    const email = normalizeEmail(value);
    if (!['register', 'reset', 'bind'].includes(purpose)) throw new AuthError('验证用途不正确');
    if (purpose === 'bind' && !user) throw new AuthError('请先登录', 401);
    return this.serial(async () => {
      const now = Date.now();
      this.db.emailCodes.items = this.db.emailCodes.all().filter(item => item.expiresAt > now);
      const recent = this.db.emailCodes.find(item => item.email === email && now - item.sentAt < 60000);
      if (recent) throw new AuthError('请稍等 60 秒再发送验证码', 429);
      const rate = this.ipLimits.get(ip) || { at: now, count: 0 };
      if (now - rate.at > 3600000) { rate.at = now; rate.count = 0; }
      if (rate.count >= 20) throw new AuthError('发送过于频繁，请稍后再试', 429);
      rate.count++; this.ipLimits.set(ip, rate);
      if (this.ipLimits.size > 2000) for (const [key, record] of this.ipLimits) if (now - record.at > 3600000) this.ipLimits.delete(key);
      const owner = this.db.users.find(item => item.email === email && item.emailVerifiedAt);
      // Keep reset responses identical for registered and unknown addresses.
      if (purpose === 'reset' && !owner) return;
      if (purpose !== 'reset' && owner) throw new AuthError('这个邮箱已绑定账号');
      if (purpose === 'bind' && user.emailVerifiedAt) throw new AuthError('你已绑定邮箱，如需更换请联系站长');
      if (this.db.emailCodes.filter(item => item.email === email).length >= 5) throw new AuthError('这个邮箱发送过于频繁，请稍后再试', 429);
      const code = String(randomInt(100000, 1000000));
      const codeHash = await hashPassword(code);
      try { await this.mailer.sendCode(email, code, purpose); }
      catch (_) { throw new AuthError('验证码发送失败，请稍后重试或联系站长', 503); }
      for (const item of this.db.emailCodes.all()) {
        if (item.email === email && item.purpose === purpose && item.userId === (purpose === 'bind' ? user.id : null)) { item.used = true; item.codeHash = ''; }
      }
      await this.db.emailCodes.insert({ email, purpose, userId: purpose === 'bind' ? user.id : null, codeHash, sentAt: now, expiresAt: now + 600000, attempts: 0, used: false });
    });
  }
  async check(email, purpose, code, userId = null) {
    const item = this.db.emailCodes.find(item => item.email === email && item.purpose === purpose && item.userId === userId && !item.used && item.expiresAt > Date.now());
    if (!item || item.attempts >= 5 || !/^\d{6}$/.test(String(code || ''))) throw new AuthError('验证码无效或已过期，请重新获取');
    await this.db.emailCodes.update(item.id, { attempts: item.attempts + 1 });
    if (!await verifyPassword(String(code), item.codeHash)) throw new AuthError(item.attempts >= 5 ? '验证码输错次数过多，请重新获取' : '验证码不正确');
    return item;
  }
  async consume(item) { await this.db.emailCodes.update(item.id, { used: true, codeHash: '', usedAt: nowIso() }); }
}
