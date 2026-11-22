import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, newId, nowIso } from './utils.js';
import { randomInviteCode } from './store.js';
import { normalizeEmail } from './email-verification.js';
import { POLICY_VERSION } from '../policies.js';
import { isSuperAdmin } from './site-content.js';
import { normalizeMemberSource, INVITE_MEMBER_SOURCE, MEMBER_SOURCE_MAX } from './member-sources.js';

export const SESSION_COOKIE = 'gr_session';

const USERNAME_RE = /^[\p{Script=Han}A-Za-z0-9_\u3040-\u30ff-]{2,20}$/u;

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateUsername(username) {
  const name = String(username || '').trim();
  if (name.length < 2 || name.length > 20) return '用户名长度需在 2-20 个字符之间';
  if (!USERNAME_RE.test(name)) return '用户名只能包含中英文、数字、下划线、连字符';
  if (/^_|_$/.test(name)) return '用户名不能以下划线开头或结尾';
  return null;
}

export function validatePassword(password) {
  const pwd = String(password || '');
  if (pwd.length < 8) return '密码至少 8 位';
  if (pwd.length > 72) return '密码最多 72 位';
  if ([/[A-Za-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(re => re.test(pwd)).length < 2) return '密码需包含字母、数字、符号中的至少两类';
  return null;
}

export class Auth {
  constructor(db, config, emailVerification) {
    this.db = db;
    this.config = config;
    this.emailVerification = emailVerification;
    this.sessionDays = config?.security?.sessionDays ?? 30;
  }

  /* ------------------------- 注册 / 登录 ------------------------- */

  async register(form) {
    return this.emailVerification.serial(() => this.registerVerified(form));
  }

  async registerVerified({ username, password, password2, inviteCode, email: emailValue, emailCode, policyVersion }) {
    if (!this.config?.security?.allowRegistration) {
      throw new AuthError('本站当前关闭了注册', 403);
    }
    if (policyVersion !== POLICY_VERSION) throw new AuthError('请先阅读并同意用户须知与隐私说明');
    const nameErr = validateUsername(username);
    if (nameErr) throw new AuthError(nameErr);
    const pwdErr = validatePassword(password);
    if (pwdErr) throw new AuthError(pwdErr);
    if (password !== password2) throw new AuthError('两次输入的密码不一致');

    const name = String(username).trim();
    if (this.db.userByName(name)) throw new AuthError('该用户名已被占用');

    const code = String(inviteCode || '').trim().toUpperCase();
    if (!code) throw new AuthError('必须填写注册码');
    const invite = this.db.invites.find((i) => String(i.code).toUpperCase() === code);
    if (!invite) throw new AuthError('注册码无效');
    if (!this.db.inviteUsable(invite)) throw new AuthError('该注册码已停用或可用人数已满');
    const email = normalizeEmail(emailValue);
    if (this.db.users.find(u => u.email === email && u.emailVerifiedAt)) throw new AuthError('这个邮箱已绑定账号');
    const verification = await this.emailVerification.check(email, 'register', emailCode);

    const isFirstUser = this.db.users.all().length === 0;
    const user = await this.db.users.insert({
      username: name,
      registrationInviteId: invite.id,
      passwordHash: await hashPassword(password),
      email,
      emailVerifiedAt: nowIso(),
      policyVersion: POLICY_VERSION,
      policyAcceptedAt: nowIso(),
      isAdmin: Boolean(isFirstUser && this.config?.security?.firstUserIsAdmin),
      bio: '',
      avatarSeed: newId(4),
      uid: Math.max(9999, ...this.db.users.all().map(u => Number(u.uid) || 0)) + 1,
      joinedAt: nowIso(),
    });

    invite.uses = (invite.uses || 0) + 1;
    invite.usedBy = Array.isArray(invite.usedBy) ? [...invite.usedBy, user.id] : [user.id];
    invite.lastUsedAt = nowIso();
    await this.db.invites.persist();
    await this.emailVerification.consume(verification);

    const session = await this.createSession(user.id);
    return { user, session };
  }

  async login({ username, password }) {
    return this.emailVerification.serial(() => this.loginVerified({ username, password }));
  }

  async loginVerified({ username, password }) {
    const user = this.db.userByName(username);
    if (!user) throw new AuthError('用户名或密码错误', 401);
    const ok = await verifyPassword(String(password || ''), user.passwordHash);
    if (!ok) throw new AuthError('用户名或密码错误', 401);
    const session = await this.createSession(user.id);
    return { user, session };
  }

  async resetPassword({ email: value, emailCode, password, password2 }) {
    return this.emailVerification.serial(async () => {
      const pwdErr = validatePassword(password);
      if (pwdErr) throw new AuthError(pwdErr);
      if (password !== password2) throw new AuthError('两次输入的密码不一致');
      const email = normalizeEmail(value);
      const verification = await this.emailVerification.check(email, 'reset', emailCode);
      const user = this.db.users.find(u => u.email === email && u.emailVerifiedAt);
      if (!user) throw new AuthError('验证码无效或已过期，请重新获取');
      await this.db.users.update(user.id, { passwordHash: await hashPassword(password) });
      await this.db.sessions.replaceAll(this.db.sessions.filter(s => s.userId !== user.id));
      await this.emailVerification.consume(verification);
    });
  }

  async bindEmail(user, { email: value, emailCode, password }) {
    return this.emailVerification.serial(async () => {
      if (!user) throw new AuthError('请先登录', 401);
      if (user.emailVerifiedAt) throw new AuthError('你已绑定邮箱，如需更换请联系站长');
      if (!await verifyPassword(String(password || ''), user.passwordHash)) throw new AuthError('当前密码不正确');
      const email = normalizeEmail(value);
      if (this.db.users.find(u => u.email === email && u.emailVerifiedAt)) throw new AuthError('这个邮箱已绑定账号');
      const verification = await this.emailVerification.check(email, 'bind', emailCode, user.id);
      await this.db.users.update(user.id, { email, emailVerifiedAt: nowIso() });
      await this.emailVerification.consume(verification);
    });
  }

  async logout(sessionId) {
    if (!sessionId) return;
    await this.db.sessions.remove(sessionId);
  }

  /* --------------------------- 会话 --------------------------- */

  async createSession(userId) {
    const id = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.sessionDays * 86400000).toISOString();
    return this.db.sessions.insert({
      id,
      userId,
      expiresAt,
      createdAt: nowIso(),
      userAgent: '',
    });
  }

  /** 从请求里解析当前会话与用户，会话过半自动续期 */
  async currentUser(req) {
    const sid = (req.cookies || {})[SESSION_COOKIE];
    if (!sid) return null;
    const session = this.db.sessions.get(sid);
    if (!session) {
      req.clearSession = true;
      return null;
    }
    const expires = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      await this.db.sessions.remove(session.id);
      req.clearSession = true;
      return null;
    }
    const user = this.db.users.get(session.userId);
    if (!user) {
      await this.db.sessions.remove(session.id);
      req.clearSession = true;
      return null;
    }
    const half = this.sessionDays * 86400000 * 0.5;
    if (expires - Date.now() < half) {
      const next = new Date(Date.now() + this.sessionDays * 86400000).toISOString();
      await this.db.sessions.update(session.id, { expiresAt: next });
    }
    req.sessionId = session.id;
    return user;
  }

  sessionCookie(session, secure = false) {
    const maxAge = this.sessionDays * 86400;
    return `${SESSION_COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }

  clearCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  /* --------------------------- 注册码 --------------------------- */

  /** 管理员生成注册码；不传 code 时随机生成 */
  async createInvite(user, { code, note, maxUses = 1, memberSource = '' } = {}) {
    if (!user?.isAdmin) throw new AuthError('只有管理员可以管理注册码', 403);
    memberSource = normalizeMemberSource(memberSource === undefined ? '' : memberSource);
    if (memberSource === null) throw new AuthError(`注册来源无效，请填写 ${MEMBER_SOURCE_MAX} 字以内的单行文字`);
    if (memberSource && !isSuperAdmin(user)) throw new AuthError('仅超级管理员可设置注册来源', 403);
    const limit = Number(maxUses);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new AuthError('最多可注册人数需为 1—10000 的整数');
    let wanted = String(code || '').trim().toUpperCase();
    if (wanted && this.db.invites.find((i) => String(i.code).toUpperCase() === wanted)) {
      throw new AuthError('该注册码已存在');
    }
    if (!wanted) do { wanted = randomInviteCode(); } while (this.db.invites.find(i => i.code === wanted));
    return this.db.invites.insert({
      code: wanted,
      note: String(note || '').slice(0, 80),
      memberSource,
      active: true,
      maxUses: limit,
      uses: 0,
      usedBy: [],
      lastUsedAt: null,
    });
  }

  async setInviteMemberSource(user, inviteId, source) {
    if (!isSuperAdmin(user)) throw new AuthError('仅超级管理员可修改注册来源', 403);
    source = normalizeMemberSource(source);
    if (source === null) throw new AuthError(`注册来源无效，请填写 ${MEMBER_SOURCE_MAX} 字以内的单行文字`);
    const invite = this.db.invites.get(inviteId);
    if (!invite) return null;
    const before = normalizeMemberSource(invite.memberSource) || '';
    if (before === source) return invite;
    const updated = await this.db.invites.update(inviteId, { memberSource: source });
    await this.db.audit.insert({ action: 'invite-member-source', key: inviteId, userId: user.id, before, after: source });
    return updated;
  }

  async setMemberRegistrationSource(user, memberId, source) {
    if (!isSuperAdmin(user)) throw new AuthError('仅超级管理员可修改注册来源', 403);
    const inherited = source === INVITE_MEMBER_SOURCE;
    source = inherited ? null : normalizeMemberSource(source);
    if (source === null && !inherited) throw new AuthError(`注册来源无效，请填写 ${MEMBER_SOURCE_MAX} 字以内的单行文字`);
    const member = this.db.users.get(memberId);
    if (!member) return null;
    const before = normalizeMemberSource(member.registrationSource);
    if (before === source) return member;
    const updated = await this.db.users.update(memberId, { registrationSource: source });
    await this.db.audit.insert({ action: 'member-registration-source', key: memberId, userId: user.id, before, after: source });
    return updated;
  }

  async toggleInvite(user, inviteId, active) {
    if (!user?.isAdmin) throw new AuthError('只有管理员可以管理注册码', 403);
    return this.db.invites.update(inviteId, { active: Boolean(active) });
  }
}
