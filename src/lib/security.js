import net from 'node:net';

export function requestSecurity(req, config) {
  const s = config.security || {};
  const loopback = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');
  const trusted = s.trustProxy === 'loopback' && loopback;
  const forwarded = String(req.headers['x-real-ip'] || '');
  req.clientIp = trusted && net.isIP(forwarded) ? forwarded : req.socket.remoteAddress || 'unknown';
  req.secure = !!req.socket.encrypted || trusted && req.headers['x-forwarded-proto'] === 'https';
  req.secureCookies = !!s.secureCookies || req.secure;
  const expected = config.site?.publicUrl ? new URL(config.site.publicUrl).origin : `${req.secure ? 'https' : 'http'}://${req.headers.host}`;
  if (config.site?.publicUrl && req.headers.host !== new URL(expected).host) throw Object.assign(new Error('站点地址不匹配'), { status: 400 });
  if (!['GET', 'HEAD'].includes(req.method)) {
    if (req.headers['sec-fetch-site'] === 'cross-site') throw Object.assign(new Error('跨站请求被拒绝'), { status: 403 });
    let origin;
    try { origin = req.headers.origin ? new URL(req.headers.origin).origin : req.headers.referer ? new URL(req.headers.referer).origin : ''; } catch { origin = ''; }
    if (origin !== expected) throw Object.assign(new Error('写入请求必须来自本站页面'), { status: 403 });
    const type = String(req.headers['content-type'] || '').split(';')[0];
    const storyDraft = req.method === 'POST' && new URL(req.url, expected).pathname === '/api/me/story-card' && type === 'application/json';
    if (!storyDraft && !['application/x-www-form-urlencoded', 'multipart/form-data'].includes(type)) throw Object.assign(new Error('不支持的表单格式'), { status: 415 });
  }
}

export function securityHeaders(res, config) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self'; connect-src 'self'; frame-src https://music.163.com; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if (config.site.publicUrl?.startsWith('https://')) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

export class RequestLimiter {
  constructor() { this.entries = new Map(); }
  allow(key, limit, window = 60000) {
    const now = Date.now(); let item = this.entries.get(key);
    if (!item || now >= item.until) { item = { count: 0, until: now + window }; this.entries.set(key, item); }
    if (this.entries.size > 5000) for (const [k, v] of this.entries) if (v.until <= now) this.entries.delete(k);
    // Bound memory even when requests use many distinct names.
    if (this.entries.size > 10000) this.entries.delete(this.entries.keys().next().value);
    return ++item.count <= limit;
  }
}
