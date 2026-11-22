import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = await mkdtemp(path.join(tmpdir(), 'kaeto-check-'));
const config = path.join(tmp, 'config.json');
try {
  await writeFile(config, JSON.stringify({
    site: { name: '测试', host: '127.0.0.1', port: 0 },
    security: { allowRegistration: true, ensureInviteOnBoot: false }, ymgal: {},
  }));
  const env = { ...process.env, CONFIG_PATH: config, DATA_DIR: path.join(tmp, 'work-cache'), TMP: tmp, TEMP: tmp };
  for (const key of ['DATABASE_URL', 'MAIL_CONFIG_PATH', 'UPLOAD_DIR', 'BANGUMI_CONFIG_PATH',
    'BANGUMI_CATALOGUE_TOKEN', 'ITAD_API_KEY', 'STEAM_WEB_API_KEY', 'MUSIC_CLI_ENTRY']) delete env[key];
  for (const suite of [
    'email-selftest.js', 'security-selftest.mjs', 'policies-selftest.mjs',
    'story-card-selftest.mjs', 'bangumi-characters-selftest.mjs', 'account-menu-selftest.mjs',
    'work-list-collaboration-selftest.mjs', 'work-list-open-selftest.mjs', 'work-lists-selftest.mjs',
    'playing-selftest.mjs', 'profile-uid-selftest.mjs', 'deployment-selftest.mjs', 'pwa-selftest.mjs',
  ]) {
    console.log('\n--- ' + suite + ' ---');
    const child = spawnSync(process.execPath, ['scripts/' + suite], { cwd: root, env, stdio: 'inherit' });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error('检查失败：' + suite);
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
