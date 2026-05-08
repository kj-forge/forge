#!/usr/bin/env bash
# PreToolUse hook: block dangerous bash commands
# Tailored for Forge (TanStack Start, Cloudflare Pages, branch flow main → staging → production)
# Adapted from gigaverse-app/gigaverse-web-app/.claude/hooks/validate-command.sh
# Exit 2 = block, Exit 0 = allow

cmd="$TOOL_INPUT_command"

[ -z "$cmd" ] && exit 0

# 1. rm -rf targeting root or home directory
if echo "$cmd" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+(/\s|/"|~/?(\s|"|$)|\$HOME)'; then
  echo "BLOCKED: Destructive 'rm -rf' targeting root or home directory." >&2
  exit 2
fi

# 2. git push --force to main/staging/production (deployment branches per ADR-0008)
if echo "$cmd" | grep -qE 'git\s+push\s+.*(-f|--force)' && echo "$cmd" | grep -qE '\b(main|staging|production)\b'; then
  echo "BLOCKED: Force push to protected branch (main/staging/production). Use a feature branch + PR." >&2
  exit 2
fi

# 3. git push directly to staging/production (Cloudflare Pages deploys these branches)
if echo "$cmd" | grep -qE 'git\s+push\b' && echo "$cmd" | grep -qE '\b(staging|production)\b'; then
  echo "BLOCKED: Direct push to staging/production triggers a Cloudflare Pages deploy. Use a PR via main → staging → production flow (see docs/architecture/release-process.md)." >&2
  exit 2
fi

# 4. git reset --hard
if echo "$cmd" | grep -qE 'git\s+reset\s+--hard'; then
  echo "BLOCKED: 'git reset --hard' destroys uncommitted work. Use 'git stash' or 'git checkout -- <file>' instead." >&2
  exit 2
fi

exit 0
