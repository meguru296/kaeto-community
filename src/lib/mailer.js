import nodemailer from 'nodemailer';

export class Mailer {
  constructor(config = {}) {
    this.config = config;
    this.ready = Boolean(config.user && config.password);
    if (this.ready) this.transport = nodemailer.createTransport({
      host: config.host || 'smtp.yeah.net', port: Number(config.port || 465), secure: true,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 18000,
      logger: false, debug: false,
    });
  }
  async sendCode(email, code, purpose) {
    if (!this.ready) throw new Error('邮件服务尚未配置，请联系站长');
    const action = { register: '注册账号', reset: '重置密码', bind: '绑定邮箱' }[purpose];
    await this.transport.sendMail({
      from: { name: '视觉小说社区', address: this.config.user }, to: email,
      subject: `视觉小说社区 · ${action}验证码`,
      text: `你正在视觉小说社区 ${action}。\n\n验证码：${code}\n\n10 分钟内有效，仅可使用一次。请不要向他人透露验证码。\n如果不是你本人操作，请忽略这封邮件。`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:30px auto;padding:32px;background:#fff8fb;border-top:4px solid #b55480;color:#453342"><p style="color:#ac6586;font-size:12px">VISUAL NOVEL COMMUNITY</p><h2>${action}</h2><p>你的验证码是：</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p><p>10 分钟内有效，仅可使用一次。</p><p style="font-size:12px;color:#967a8b">请勿向他人透露验证码。非本人操作请忽略此邮件。</p></div>`,
    });
  }
  async verify() {
    if (!this.ready) throw new Error('Mail not configured');
    await this.transport.verify();
  }
}
