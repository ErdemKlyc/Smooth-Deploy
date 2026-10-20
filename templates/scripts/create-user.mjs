import { spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const db = readFileSync('wrangler.toml', 'utf8').match(/database_name\s*=\s*"([^"]+)"/)?.[1];
if (!db) {
  console.error('Could not find database_name in wrangler.toml');
  process.exit(1);
}

const wranglerBin = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
if (!existsSync(wranglerBin)) {
  console.error('wrangler is not installed. Run npm install first.');
  process.exit(1);
}

const args = process.argv.slice(2);
const target = args.includes('--local') ? '--local' : '--remote';
const [email, passArg] = args.filter((a) => !a.startsWith('--'));

if (!email || !/^[^\s'"\\;]+@[^\s'"\\;]+\.[^\s'"\\;]+$/.test(email)) {
  console.error('Usage: npm run user:create -- <email> [password] [--local|--remote]');
  process.exit(1);
}

let password = passArg;
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Password (min 10 chars): ');
  rl.close();
}
if (password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

// No shell is involved anywhere below: the hash contains `$`, which shells expand inside double quotes.
const wrangler = (...a) => {
  const r = spawnSync(process.execPath, [wranglerBin, 'd1', 'execute', db, target, ...a], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  if (r.status !== 0) {
    process.stdout.write(r.stdout ?? '');
    console.error(`wrangler exited with code ${r.status}`);
    process.exit(1);
  }
  return r.stdout;
};

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
const stored = `pbkdf2$100000$${salt.toString('base64')}$${hash.toString('base64')}`;
const e = email.toLowerCase();
const sql = `INSERT INTO users (email, password_hash) VALUES ('${e}', '${stored}') ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, failed_count = 0, locked_until = 0;
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = '${e}');
`;

const dir = mkdtempSync(join(tmpdir(), 'create-user-'));
try {
  const file = join(dir, 'user.sql');
  writeFileSync(file, sql);
  wrangler('--file', file, '--yes');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const out = wrangler('--json', '--command', `SELECT password_hash FROM users WHERE email = '${e}'`);
const saved = JSON.parse(out.slice(out.indexOf('[')))?.[0]?.results?.[0]?.password_hash;
if (saved !== stored) {
  console.error('ERROR: the stored password hash does not match what was written. Login will fail. Do not ship this; investigate.');
  process.exit(1);
}
console.log(`User ${email} saved and verified (${target.slice(2)}).`);
