---
name: smooth-deploy
description: Ship a React + TypeScript web app to Cloudflare Pages with Pages Functions and a D1 database, deployed from a GitHub repo through GitHub Actions, driven end to end from the gh and wrangler CLIs. Includes invite-only email/password auth (no signup; users created from the CLI), PBKDF2 password hashing, D1-backed session cookies, login lockout, and a login page. Use when the user wants to create, deploy or put live a web app on Cloudflare (Pages, Workers, D1) with GitHub, wants CI/CD from GitHub to Cloudflare, or wants to add private/invite-only login with email and password to a Cloudflare Pages app, even if they only say "make it live", "deploy it", "only some people should log in" or "use my usual setup".
license: MIT
compatibility: Claude Code or any agent with a shell. Needs Node.js 20+, git, the GitHub CLI (gh) logged in, and wrangler (installed as a dev dependency). Works on Windows (Git Bash), macOS and Linux.
---

# Smooth-Deploy

A proven recipe: **React + TypeScript (Vite)** front end, **Cloudflare Pages Functions** API under `/api`, **Cloudflare D1** database, **GitHub** repo, **GitHub Actions** deploy on every push to `main`, and **invite-only email/password auth**. Everything is done with `gh` and `wrangler`; the only manual step is creating one Cloudflare API token.

Template files live in `templates/` next to this file. Copy them, replace the placeholders, then adapt.

| Placeholder | Replace with |
|---|---|
| `__PROJECT__` | Lowercase project slug, used for the Pages project and D1 database name (e.g. `projectplane`) |
| `__DATABASE_ID__` | The id printed by `wrangler d1 create` |
| `__APP_TITLE__` | Title shown on the login page |

## Ask first (only what you can't infer)

- Repo name and **visibility** (default: private) and which `gh` account (check `gh auth status`; if several, confirm the active one).
- Whether auth is wanted. If yes, it is invite-only by default; ask before adding any signup flow.

Do not ask about hosting style or CI: this skill's answer is Pages + Functions + D1 + GitHub Actions.

## Part 1: Scaffold

1. Folder layout (Pages Functions use file-based routing under `functions/`):
   ```
   functions/_lib.ts            helpers (json, bad, body, str) + Env type
   functions/api/...            API routes, e.g. functions/api/items/[id].ts
   functions/tsconfig.json      types: @cloudflare/workers-types
   migrations/0001_*.sql        D1 schema (numbered, never edit applied ones; add new files)
   src/                         React app
   wrangler.toml                Pages config + D1 binding "DB"
   .github/workflows/deploy.yml CI deploy
   ```
2. Install:
   ```
   npm init -y
   npm i react react-dom react-router-dom
   npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @cloudflare/workers-types wrangler
   ```
3. Copy from `templates/`: `wrangler.toml`, `vite.config.ts` (proxies `/api` to `:8788`), `functions/_lib.ts`, `functions/tsconfig.json`, `src/vite-env.d.ts`, `.github/workflows/deploy.yml`, and `gitignore` as `.gitignore`.
4. In `package.json` set `"type": "module"`, `"private": true` and scripts:
   ```json
   "dev": "vite",
   "build": "vite build",
   "typecheck": "tsc --noEmit && tsc --noEmit -p functions",
   "dev:api": "npm run build && wrangler pages dev dist --port 8788",
   "db:migrate:local": "wrangler d1 migrations apply __PROJECT__ --local",
   "db:migrate:remote": "wrangler d1 migrations apply __PROJECT__ --remote",
   "user:create": "node scripts/create-user.mjs"
   ```
   Root `tsconfig.json`: `"jsx": "react-jsx"`, `"moduleResolution": "Bundler"`, `"strict": true`, `"noEmit": true`, `"include": ["src", "vite.config.ts"]`.
5. API conventions: export `onRequestGet` / `onRequestPost` / `onRequestPut` / `onRequestDelete` typed `PagesFunction<Env>`; always use `env.DB.prepare(...).bind(...)` (never string-concatenate SQL); use `RETURNING *` to send back the saved row; use `env.DB.batch([...])` for multi-statement deletes.
6. SPA routing works automatically on Pages when there is no `404.html`: unknown paths serve `index.html`, and `/api/*` hits Functions first.

## Part 2: Auth (invite-only email + password)

Copy from `templates/`:

| File | Purpose |
|---|---|
| `migrations/0001_auth.sql` | `users` (email, password_hash, failed_count, locked_until) and `sessions` (token_hash, user_id, expires_at). Renumber to follow existing migrations. |
| `functions/_auth.ts` | PBKDF2 verify, constant-time compare, dummy hash for unknown emails, session create/lookup, cookie helpers |
| `functions/api/_middleware.ts` | Guards every `/api/*` route except `/api/auth/login`; sets `ctx.data.user` |
| `functions/api/auth/login.ts`, `logout.ts`, `me.ts` | Login (5 fails lock 15 min, same error for unknown email and wrong password), logout (deletes session), current user |
| `scripts/create-user.mjs` | Creates or resets a user from the CLI. Reads the DB name from `wrangler.toml`. Re-running resets the password and kills that user's sessions. Writes the SQL to a temp file, runs `wrangler d1 execute --file` through `node` with no shell, then reads the hash back and fails loudly if it doesn't match |
| `src/api.ts` | `req()` helper that broadcasts 401s, plus `me` / `login` / `logout` |
| `src/auth.tsx` | `AuthProvider` + `useAuth()` |
| `src/pages/Login.tsx`, `src/auth.css` | Login page |
| `src/UserMenu.tsx` | Email + Sign out button for the header |
| `src/main.tsx` | Shows the `<Gate>` pattern: render `<Login />` until `useAuth().email` is set |

Design rules (keep them when adapting):
- **No signup endpoint.** Users exist only if created with `npm run user:create -- email@x.com`.
- PBKDF2-SHA256, **100,000 iterations** (the Workers runtime rejects more), 16-byte random salt, stored as `pbkdf2$<iter>$<salt b64>$<hash b64>`. The Node script and the Worker must use the same parameters.
- Session token = 32 random bytes; **only its SHA-256 is stored**. Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`. SameSite=Lax plus JSON bodies is the CSRF defence; don't add CORS headers.
- Never log or echo passwords or tokens. Tell the user to run `user:create` themselves so the password never passes through the chat.

## Part 3: Go live (all CLI)

Run these in order; check each result before moving on.

1. **Local check**: `npm run typecheck && npm run build && npm run db:migrate:local`, then `npm run dev:api` and hit the API with curl. For auth, test: no cookie gives 401, wrong password gives 401, right password gives 200 plus cookie, logout then 401, and six bad attempts give 429.
2. **GitHub**: `git init`, commit, `git branch -M main`, then
   `gh repo create <Name> --private --source=. --remote=origin --push`
3. **Cloudflare login**: `npx wrangler whoami`. If not logged in or the token has expired, run `npx wrangler login` in the background (the user approves in the browser), then wait for "Successfully logged in".
4. **D1**: `npx wrangler d1 create __PROJECT__`, put the printed `database_id` in `wrangler.toml`, then `npm run db:migrate:remote`. Commit.
5. **Pages project**: `npx wrangler pages project create __PROJECT__ --production-branch main`.
6. **Account ID** (not secret): get it from `npx wrangler whoami`, then
   `gh variable set CLOUDFLARE_ACCOUNT_ID --body <id>`
7. **API token (the one manual step)**. wrangler's OAuth login cannot mint API tokens. Ask the user to:
   - open https://dash.cloudflare.com/profile/api-tokens, choose **Create Token**, then **Custom token**
   - add the permissions **Account / Cloudflare Pages / Edit** and **Account / D1 / Edit**
   - run `gh secret set CLOUDFLARE_API_TOKEN --repo <owner>/<Name>` themselves and paste the token there (never in chat)
   - say "done"

   **Do not push the workflow until the secret exists**, otherwise the first run fails. Verify with `gh secret list`.
8. **Deploy**: `git push`, then `gh run watch <id> --exit-status`. The workflow does `npm ci`, typecheck, build, `d1 migrations apply --remote`, then `pages deploy dist`.
9. **Verify live**: `curl https://__PROJECT__.pages.dev/api/...`. With auth, an unauthenticated request must return 401.
10. **First user**: ask the user to run `npm run user:create -- their@email` from the project folder (it prompts for a password). Confirm with
    `npx wrangler d1 execute __PROJECT__ --remote --command "SELECT email, created_at FROM users"`, which shows emails only and never hashes.

From then on every push to `main` deploys, and new `migrations/*.sql` files are applied automatically.

11. **Hand-off**: tell the user how to recover a forgotten password (Part 4) before you finish. There is no "Forgot password?" link, so this is their only way back in.

## Part 4: Users and password recovery

There is no self-service reset. Recovery is done from the CLI by anyone who is logged into the Cloudflare account with `wrangler`. That login is the trust anchor.

**Forgotten password (reset)**: from the project folder, run
```
npm run user:create -- their@email
```
It prompts for a new password of at least 10 characters. Re-running it for an existing email:
- replaces the password hash
- clears `failed_count` and `locked_until`, which also unlocks an account locked by failed attempts
- deletes that user's sessions, signing them out on every device

**It does not delete any data.** The user row is updated in place (`INSERT ... ON CONFLICT(email) DO UPDATE`), so the user id stays the same. Everything else is untouched: app data, rows that reference `users(id)` (for example API or MCP tokens), and anything else the user created. Reassure the user about this if they ask.

If `wrangler` reports "Not logged in" or an expired token, run `npx wrangler login` first.

Other user operations (remote; use `--local` for the dev DB):
```
# list users (emails only, never select password_hash)
npx wrangler d1 execute __PROJECT__ --remote --command "SELECT id, email, created_at, locked_until FROM users"

# unlock without changing the password
npx wrangler d1 execute __PROJECT__ --remote --command "UPDATE users SET failed_count = 0, locked_until = 0 WHERE email = 'their@email'"

# sign a user out everywhere
npx wrangler d1 execute __PROJECT__ --remote --command "DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'their@email')"

# remove a user (confirm with the user first; this cascades to rows referencing users(id))
npx wrangler d1 execute __PROJECT__ --remote --command "DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'their@email'); DELETE FROM users WHERE email = 'their@email'"
```

Rules when changing `create-user.mjs` or the auth schema:
- **Never pass the hash through a shell.** The stored format `pbkdf2$100000$<salt>$<hash>` contains `$`. `sh` and `bash` expand `$1` and similar inside double quotes, which silently corrupts every hash so that nobody can log in (cmd.exe on Windows doesn't expand `$`, so the bug hides there). Don't use `execSync` with `--command "..."`. Use `spawnSync(process.execPath, [wranglerBin, ...])` with `--file`, as the template does, and keep the read-back check.
- Keep the reset an **upsert on `email`**. Never use `INSERT OR REPLACE` or delete-then-insert. SQLite's REPLACE deletes the old row, which changes the user id and cascades `ON DELETE CASCADE` deletes to the user's tokens and any other owned rows.
- If you add tables that belong to a user, reference `users(id)` (not email), so resetting or renaming never orphans them.
- Never pass the password through the chat. Tell the user to run the command in their own terminal.

Optional upgrades (offer them, don't build them by default):
- **Change password in Settings**: an endpoint that takes the current and the new password, verifies the current one with `verifyPassword`, writes a new PBKDF2 hash and deletes the user's other sessions. No extra services needed.
- **Email reset link**: needs an email provider (for example Cloudflare Email Sending or Resend). Store a single-use, SHA-256-hashed token with a 30-minute expiry. Return the same response whether or not the email exists, and rate-limit requests.

## Gotchas learned the hard way

- **Don't mix deploy methods.** A Pages project created with `wrangler pages project create` (direct upload) can **never** be connected to Git later, and the Cloudflare Git integration cannot be set up from the CLI. This skill always uses GitHub Actions plus direct upload.
- The D1 binding comes from `wrangler.toml` (`binding = "DB"`) because `pages_build_output_dir` is set. You don't need to add it in the dashboard.
- `wrangler d1 migrations apply --remote` asks for confirmation; in CI or non-interactive shells it falls back to "yes".
- Windows: run `wrangler pages dev` with `nohup ... &` and a unique `--port`. Old dev servers keep ports open (`netstat -ano | grep <port>`, then `taskkill //F //PID <pid> //T`). A stale `.wrangler/tmp` causes "Could not resolve middleware-loader.entry.ts"; delete `.wrangler/tmp` and restart.
- The `--` in `npm run user:create -- email` is required so the arguments reach the script.
- **"Invalid email or password" for every user right after creating them** (especially on macOS or Linux) means the password hash was corrupted on its way into D1. Older copies of `create-user.mjs` ran it through a shell, which expanded the `$` signs. Replace the script with the current template and re-run `user:create` for each user. Their data is kept.
- **Several `gh` accounts**: if `git push` says "Repository not found" for a private repo, the active `gh` account is probably not the owner (`gh auth status`). Don't switch the user's account silently. Push once with `GH_TOKEN=$(gh auth token -u <owner>) git push`, and tell the user they can run `gh auth switch -u <owner>`.
- `Secure` cookies still work on `http://localhost` in browsers and curl, so there's no need for a dev-only cookie flag.
- Validate user-supplied URLs server-side and allow only `http:` and `https:` (blocks `javascript:` links). Accept images only as `data:image/(png|jpeg|webp)` with a size cap, and never SVG.
- Cloudflare Access is unnecessary when this auth is in place. Mention it only if the user wants SSO.

## Optional add-ons (offer, don't assume)

- `GITHUB_TOKEN` Pages secret for server-side GitHub API calls: `npx wrangler pages secret put GITHUB_TOKEN --project-name __PROJECT__`.
- A machine-access API (for example an MCP endpoint at `functions/mcp.ts`) authenticated with **separate** bearer tokens (`pp_` + 32 random bytes, stored as SHA-256, scope `read` or `write`, shown once, revocable). Session cookies should not work there and bearer tokens should not work on `/api`.
