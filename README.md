# Smooth-Deploy

A Claude skill for shipping a React + TypeScript app to **Cloudflare Pages + Functions + D1**, deployed from **GitHub Actions**, with **invite-only email/password auth**, all driven from the `gh` and `wrangler` CLIs.

See [SKILL.md](SKILL.md) for the full recipe. `templates/` holds the files it copies.

## Install

Claude Code (user-level):
```
git clone https://github.com/ErdemKlyc/Smooth-Deploy ~/.claude/skills/smooth-deploy
```
Update later with `git -C ~/.claude/skills/smooth-deploy pull`.

Then just ask, e.g. *"Build X and put it live with smooth-deploy"*.
