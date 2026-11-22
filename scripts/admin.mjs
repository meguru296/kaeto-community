import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateUsername } from '../src/lib/auth.js';
import { openConfiguredDb } from '../src/lib/store.js';
import { hashPassword, nowIso } from '../src/lib/utils.js';

const username = (process.argv[2] || '').trim();
const error = validateUsername(username);
if (error || process.argv.length !== 3) throw new Error('用法：npm run admin -- <username>');

const root = fileURLToPath(new URL('../', import.meta.url));
const db = await openConfiguredDb(root);
try {
  if (db.users.all().length) throw new Error('用户表已有记录。初始化命令只适用于尚无账号的全新实例。');
  const password = randomBytes(24).toString('base64url') + '7!';
  await db.users.insert({
    uid: 10000, username, passwordHash: await hashPassword(password),
    isAdmin: true, isSuperAdmin: true, joinedAt: nowIso(),
  });
  console.log('初始管理员已创建，本次仅显示一次密码。');
  console.log(password);
} finally {
  await db.close();
}
