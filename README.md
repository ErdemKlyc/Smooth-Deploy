# Smooth-Deploy

A Claude skill for shipping a React + TypeScript app to **Cloudflare Pages + Functions + D1**, deployed from **GitHub Actions**, with **auth you pick per app**, all driven from the `gh` and `wrangler` CLIs.

When you deploy, the skill asks which auth model you want:

| Model | Who signs up | Sign-in |
|---|---|---|
| Single-tenant | Nobody; you create users from the CLI | Email + password |
| Multi-tenant | Anyone; each signup gets its own isolated workspace | Google, email + password, or both |

See [SKILL.md](SKILL.md) for the full recipe. `templates/` holds the files it copies.

## Install

Claude Code (user-level):
```
git clone https://github.com/ErdemKlyc/Smooth-Deploy ~/.claude/skills/smooth-deploy
```
Update later with `git -C ~/.claude/skills/smooth-deploy pull`.

Then just ask, e.g. *"Build X and put it live with smooth-deploy"*.

## Forgot your password? (apps deployed with this skill)

Single-tenant apps. For multi-tenant apps run `npm run user:reset -- you@example.com` instead (Google users sign in with Google).


From the project folder, logged into Cloudflare with `npx wrangler login`:
```
npm run user:create -- you@example.com
```
Enter a new password. This resets it, unlocks the account and signs you out everywhere. **No data is deleted**: your account keeps the same id, and everything you created stays. See *Part 4* in [SKILL.md](SKILL.md) for listing, unlocking and removing users.
