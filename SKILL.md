---
name: smooth-deploy
description: Ship a React + TypeScript web app to Cloudflare Pages with Pages Functions and a D1 database, deployed from a GitHub repo through GitHub Actions, driven end to end from the gh and wrangler CLIs. Asks which auth model to use: single-tenant (invite-only email/password, users created from the CLI) or multi-tenant (public signup, one isolated workspace per signup) with Google sign-in, email + password signup, or both. Includes PBKDF2 password hashing, D1-backed session cookies, login lockout, Google OAuth and a login page. Use when the user wants to create, deploy or put live a web app on Cloudflare (Pages, Workers, D1) with GitHub, wants CI/CD from GitHub to Cloudflare, or wants login, signup, Google sign-in or user accounts on a Cloudflare Pages app, even if they only say "make it live", "deploy it", "only some people should log in", "let users sign up" or "use my usual setup".
license: MIT
compatibility: Claude Code or any agent with a shell. Needs Node.js 20+, git, the GitHub CLI (gh) logged in, and wrangler (installed as a dev dependency). Works on Windows (Git Bash), macOS and Linux.
---

# Smooth-Deploy

A proven recipe: **React + TypeScript (Vite)** front end, **Cloudflare Pages Functions** API under `/api`, **Cloudflare D1** database, **GitHub** repo, **GitHub Actions** deploy on every push to `main`, and **auth you choose per app** (single-tenant invite-only, or multi-tenant with Google and/or email signup). Everything is done with `gh` and `wrangler`; the only manual steps are creating one Cloudflare API token and, for Google sign-in, one Google OAuth client.

Template files live in `templates/` next to this file. Copy them, replace the placeholders, then adapt.

| Placeholder | Replace with |
|---|---|
| `__PROJECT__` | Lowercase project slug, used for the Pages project and D1 database name (e.g. `projectplane`) |
| `__DATABASE_ID__` | The id printed by `wrangler d1 create` |
| `__APP_TITLE__` | Title shown on the login page |
| `__GOOGLE_CLIENT_ID__` | Multi-tenant + Google only: the OAuth client ID from Google Cloud Console (not secret) |

## Ask first (only what you can't infer)

- Repo name and **visibility** (default: private) and which `gh` account (check `gh auth status`; if several, confirm the active one).
- **Auth model.** Always ask this, as one question with these options, unless the user already said:
  1. **No auth** (public app or internal tool behind something else).
  2. **Single-tenant, invite-only email + password.** One owner or one team shares one dataset. No signup page; the developer creates each user from the CLI. This is the default if they are unsure.
  3. **Multi-tenant, Google sign-in.** Anyone can sign up with their Google account. Each new signup gets their own isolated workspace (tenant).
  4. **Multi-tenant, email + password signup.** Same, but with a signup form instead of Google.
  5. **Multi-tenant, both** Google and email + password.

  "Tenant" means a separate workspace whose data no other tenant can see. If the user says "multi-tenant" without a method, ask Google, email or both. For 3 to 5, also ask for the app's public name (login page title). Warn that public signup invites abuse and offer Cloudflare Turnstile on the signup form (the `cloudflare:turnstile-spin` skill does this).

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

## Part 2: Auth

Follow the section for the model chosen in "Ask first". Skip Part 2 entirely for **No auth**. Everything else in the recipe (scaffold, CI, go-live) is identical for all models, except the extra Google steps in Part 3.

### 2A: Single-tenant (invite-only email + password)

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

### 2B: Multi-tenant (public signup, one workspace per signup)

Copy the 2A files first, then **copy `templates/multitenant/` over them** (same relative paths, replacing what is there). Then keep only what the chosen method needs.

| File (in `templates/multitenant/`) | Purpose |
|---|---|
| `migrations/0001_auth.sql` | `tenants`, `users` (tenant_id, nullable `password_hash`, `google_sub`, `email_verified`, role), `sessions` |
| `functions/_lib.ts` | Same helpers, `Env` adds the optional Google vars |
| `functions/_auth.ts` | Same PBKDF2 and session code, plus `hashPassword` (Workers), `createTenantUser` (tenant and owner in one transaction) and tenant-aware `currentUser` |
| `functions/api/_middleware.ts` | Guards `/api/*` except the public auth routes; sets `ctx.data.user` and `ctx.data.tenantId` |
| `functions/api/auth/login.ts`, `signup.ts`, `me.ts` | Email + password. `signup.ts` creates a new tenant and its owner |
| `functions/api/auth/google.ts`, `google/callback.ts` | Google OAuth: redirect with a `state` cookie, then code exchange and claims check |
| `scripts/reset-password.mjs` | Password recovery for an existing account (there is no `create-user` here, users sign up themselves) |
| `src/api.ts`, `src/auth.tsx`, `src/pages/Login.tsx`, `src/auth.css`, `src/UserMenu.tsx` | Login page with Google button, sign in / create account toggle, workspace name in the header |

Keep only the method chosen:

| Choice | Keep | Delete | Set in `Login.tsx` |
|---|---|---|---|
| Google | `google.ts`, `google/callback.ts` | `login.ts`, `signup.ts` | `GOOGLE = true`, `EMAIL = false` |
| Email | `login.ts`, `signup.ts` | `google.ts`, `google/` | `GOOGLE = false`, `EMAIL = true` |
| Both | everything | nothing | both `true` |

Also remove the deleted routes from the `PUBLIC` set in `_middleware.ts`, drop the unused `GOOGLE_*` fields from `Env` if Google is not used, and use `"user:reset": "node scripts/reset-password.mjs"` instead of `user:create` in `package.json` (and drop it entirely if Google-only).

**Tenant isolation (the rule that matters most).** Every app table gets `tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` plus an index on it. Every query filters and every insert sets `tenant_id` from `ctx.data.tenantId`, which comes from the session:
```ts
const tenantId = data.tenantId as number;
env.DB.prepare('SELECT * FROM items WHERE tenant_id = ?1 AND id = ?2').bind(tenantId, id)   // reads, updates, deletes
env.DB.prepare('INSERT INTO items (tenant_id, name) VALUES (?1, ?2) RETURNING *').bind(tenantId, name)
```
Never take a tenant id from the request body, URL or headers. Fetching by `id` alone is a cross-tenant leak: always add `AND tenant_id = ?`. When you review the finished app, grep every `prepare(` call on app tables for `tenant_id`.

Design rules (keep them when adapting):
- Same session, hashing and cookie rules as 2A. One user belongs to exactly one tenant (email is globally unique). Inviting teammates into a tenant is an optional upgrade, not built.
- **Google:** OAuth authorization-code flow on the server only. Check `state` against the `pp_oauth` cookie, then require `iss`, `aud` = your client ID, unexpired `exp` and `email_verified === true`. Match users by `google_sub`, never by email alone. Request only `openid email profile`.
- **Pre-hijack defence.** Email signup does not verify the address. If someone later signs in with Google using an email that has an unverified password account, Google proves ownership: the account is claimed, its password is removed and its sessions are deleted. Keep that logic if you change the callback. If you add email verification, set `email_verified = 1` on confirmation and the callback will then link instead of claim.
- Login keeps the 5 failures lock and the identical error for unknown email, Google-only account and wrong password. Signup does reveal that an email is taken (409); that is normal for public signup.
- Minimum password 10 characters, enforced by the server.

## Part 3: Go live (all CLI)

Run these in order; check each result before moving on.

1. **Local check**: `npm run typecheck && npm run build && npm run db:migrate:local`, then `npm run dev:api` and hit the API with curl. For auth, test: no cookie gives 401, wrong password gives 401, right password gives 200 plus cookie, logout then 401, and six bad attempts give 429. For multi-tenant email signup also test: signup returns 201 plus cookie, a second signup with the same email gives 409, and **two accounts cannot see each other's rows** (create an item as user A, then request it as user B and expect 404 or an empty list). Google cannot be tested until the OAuth client exists (step 5).
2. **GitHub**: `git init`, commit, `git branch -M main`, then
   `gh repo create <Name> --private --source=. --remote=origin --push`
3. **Cloudflare login**: `npx wrangler whoami`. If not logged in or the token has expired, run `npx wrangler login` in the background (the user approves in the browser), then wait for "Successfully logged in".
4. **D1**: `npx wrangler d1 create __PROJECT__`, put the printed `database_id` in `wrangler.toml`, then `npm run db:migrate:remote`. Commit.
5. **Pages project**: `npx wrangler pages project create __PROJECT__ --production-branch main`.
   - **Multi-tenant with Google only (the other manual step).** Cloudflare cannot create Google OAuth clients, so ask the user to:
     - open https://console.cloud.google.com/apis/credentials (create or pick a project; if asked, configure the OAuth consent screen with the app name and their email, user type External)
     - **Create credentials**, **OAuth client ID**, application type **Web application**
     - under **Authorized redirect URIs** add `https://__PROJECT__.pages.dev/api/auth/google/callback` and `http://localhost:8788/api/auth/google/callback` (add the custom domain's callback too if there is one; every origin needs its own entry)
     - paste the **Client ID** into the chat (not secret) and keep the **Client secret** to themselves
     - run `npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name __PROJECT__` and paste the secret there (never in chat). For local testing, put `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...` in `.dev.vars` (already git-ignored).

     Then add the client ID to `wrangler.toml` and commit:
     ```toml
     [vars]
     GOOGLE_CLIENT_ID = "__GOOGLE_CLIENT_ID__"
     ```
     Tell the user that while the consent screen is in "Testing" only listed test users can sign in; for public signup they must click **Publish app** (basic scopes `openid email profile` need no Google review).
6. **Account ID** (not secret): get it from `npx wrangler whoami`, then
   `gh variable set CLOUDFLARE_ACCOUNT_ID --body <id>`
7. **API token (the one manual step)**. wrangler's OAuth login cannot mint API tokens. Ask the user to:
   - open https://dash.cloudflare.com/profile/api-tokens, choose **Create Token**, then **Custom token**
   - add the permissions **Account / Cloudflare Pages / Edit** and **Account / D1 / Edit**
   - run `gh secret set CLOUDFLARE_API_TOKEN --repo <owner>/<Name>` themselves and paste the token there (never in chat)
   - say "done"

   **Do not push the workflow until the secret exists**, otherwise the first run fails. Verify with `gh secret list`.
8. **Deploy**: `git push`, then `gh run watch <id> --exit-status`. The workflow does `npm ci`, typecheck, build, `d1 migrations apply --remote`, then `pages deploy dist`.
9. **Verify live**: `curl https://__PROJECT__.pages.dev/api/...`. With auth, an unauthenticated request must return 401. With Google, open the live URL in a browser, click **Continue with Google**, and confirm you land signed in and `GET /api/auth/me` shows the workspace.
10. **First user (single-tenant only; multi-tenant users sign up in the app, so just ask the developer to sign up once and confirm a row appears)**: ask the user to run `npm run user:create -- their@email` from the project folder (it prompts for a password). Confirm with
    `npx wrangler d1 execute __PROJECT__ --remote --command "SELECT email, created_at FROM users"`, which shows emails only and never hashes.

From then on every push to `main` deploys, and new `migrations/*.sql` files are applied automatically.

11. **Hand-off**: tell the user how to recover a forgotten password (Part 4) before you finish. There is no "Forgot password?" link, so this is their only way back in. For multi-tenant, also say what is not built: email verification, password reset by email, teammate invites and billing. Offer them.

## Part 4: Users and password recovery

Applies to single-tenant (2A). For multi-tenant, use `npm run user:reset -- their@email` (same prompt, same effects: new password, unlock, sign out everywhere, no data deleted, same user and tenant; it refuses emails that have no account). Google-only users never have a password; they recover through Google. To list multi-tenant users use `SELECT u.id, u.email, u.role, t.name FROM users u JOIN tenants t ON t.id = u.tenant_id`. To delete a tenant and everything in it (confirm first) run `DELETE FROM tenants WHERE id = ?`; cascades remove its users, sessions and every table that references `tenants(id)`.

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
- **Google says `redirect_uri_mismatch`**: the exact callback URL (scheme, host, port, path) is missing from the OAuth client. The app builds it from the address in the browser, so `localhost:8788`, the `pages.dev` URL and any custom domain each need an entry.
- **Google sign-in returns "Google sign-in is not configured" (501)**: `GOOGLE_CLIENT_SECRET` is a Pages secret and only takes effect on the next deployment; push again. Locally it must be in `.dev.vars`, and `GOOGLE_CLIENT_ID` in `wrangler.toml` `[vars]`.
- **Only some people can use Google sign-in**: the consent screen is still in Testing mode. Publish it.
- Multi-tenant Pages Functions: `last_insert_rowid()` inside `env.DB.batch([...])` is what links the new user to the new tenant. Keep tenant and user creation in one batch so a failed insert leaves no orphan tenant.

## Optional add-ons (offer, don't assume)

- `GITHUB_TOKEN` Pages secret for server-side GitHub API calls: `npx wrangler pages secret put GITHUB_TOKEN --project-name __PROJECT__`.
- A machine-access API (for example an MCP endpoint at `functions/mcp.ts`) authenticated with **separate** bearer tokens (`pp_` + 32 random bytes, stored as SHA-256, scope `read` or `write`, shown once, revocable). Session cookies should not work there and bearer tokens should not work on `/api`.
