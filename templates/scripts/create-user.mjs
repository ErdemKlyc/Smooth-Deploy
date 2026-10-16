import { execSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const db = readFileSync('wrangler.toml', 'utf8').match(/database_name\s*=\s*"([^"]+)"/)?.[1];
if (!db) {
  console.error('Could not find database_name in wrangler.toml');
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

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
const stored = `pbkdf2$100000$${salt.toString('base64')}$${hash.toString('base64')}`;
const e = email.toLowerCase();
const sql = `INSERT INTO users (email, password_hash) VALUES ('${e}', '${stored}') ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, failed_count = 0, locked_until = 0; DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = '${e}');`;

execSync(`npx wrangler d1 execute ${db} ${target} --command "${sql}"`, { stdio: 'inherit' });
console.log(`User ${email} saved (${target.slice(2)}).`);
