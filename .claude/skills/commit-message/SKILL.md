---
name: commit-message
description: Write a Conventional Commits-style commit message based on staged changes. Use when the user asks to "commit", "write a commit message", "make a commit", or has just staged files and wants to commit.
---

# Commit Message

Write a [Conventional Commits](https://www.conventionalcommits.org/) message that matches the staged diff and the Forge branch convention.

## Workflow

### Step 1: Inspect what's staged

```bash
git diff --cached --stat
git diff --cached
```

If nothing is staged, ask the user whether to:
- run `git add <specific paths>` (preferred — surgical), or
- run `git add -A` (only if everything in the working tree should go into one commit).

Never run `git add -A` without confirmation — it can sweep up `.env` files or unrelated work.

### Step 2: Pick the type and scope

**Type** (pick exactly one):

| Type | When |
|---|---|
| `feat` | A new feature visible to the user |
| `fix` | A bug fix |
| `refactor` | Code change that neither adds a feature nor fixes a bug |
| `perf` | Performance improvement |
| `docs` | Docs only (README, ADRs, architecture, comments) |
| `test` | Adding or fixing tests only |
| `chore` | Tooling, config, deps — no app code change |
| `ci` | GitHub Actions / CI workflow changes |
| `build` | Build system or external deps changes |
| `style` | Whitespace, formatting (rare — Biome handles this) |
| `revert` | Reverting a previous commit |

**Scope** (optional, in parentheses): the area being changed. Pick from the diff:

| Path | Scope |
|---|---|
| `app/routes/log/*` | `log` |
| `app/routes/analytics/*` | `analytics` |
| `app/lib/db/*` | `db` |
| `app/lib/ai/*` | `ai` |
| `app/lib/auth/*` | `auth` |
| `app/components/*` | `ui` |
| `db/schema.ts`, `db/migrations/*` | `db` |
| `docs/adr/*` | `adr` |
| `docs/architecture/*` | `docs` |
| `.github/workflows/*` | `ci` |
| `.claude/*` | `claude` |
| Root config (biome.json, tsconfig, vite.config) | `config` |

If the diff spans multiple scopes, drop the scope (use `feat: ...` not `feat(many): ...`).

### Step 3: Write the subject line

Format: `<type>(<scope>): <subject>`

- **Imperative mood:** "add quick-log drawer" not "added" / "adds"
- **No period at the end**
- **Lowercase first word** after the colon (except proper nouns)
- **Hard limit: 72 chars total** for the subject line
- Describe **what changed**, not how

Good: `feat(log): add quick-log drawer for strength sessions`
Bad: `Updated some files in log directory.`

### Step 4: Body (optional but encouraged for non-trivial commits)

- Wrap at 72 chars
- Blank line between subject and body
- Use bullet points (1–3) explaining **what and why**, not how (the diff shows how)
- Skip the body for trivial commits (typo fixes, dependency bumps)

### Step 5: Footer — Linear ref + Co-Authored-By

If the current branch is `feat/frg-NNNN-...`, extract `FRG-NNNN` and add to the footer:

```
Closes FRG-1234
```

Use `Refs FRG-1234` instead if the work is partial (issue stays open).

If this commit comes from a Claude session, append:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

(Match the model identifier from the current session.)

### Step 6: Pass via heredoc

Always use a heredoc when running `git commit` to preserve formatting:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body bullet 1>
<body bullet 2>

Closes FRG-NNNN

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Rules

- **One logical change per commit.** If the staged diff covers two unrelated topics, ask the user to split it.
- **No `wip`, `tmp`, or `misc` messages.** If the work isn't a coherent unit, it's not ready to commit.
- **Don't commit `.env` files.** The `protect-files.sh` hook should block edits to them, but double-check `git diff --cached` before committing.
- **Don't amend published commits.** Always create a new commit if the previous one is already pushed.
- **commitlint will validate this** once we add it (Phase 0). Until then, follow the rules manually so the convention is consistent from day 1.

## Verification

After committing:

```bash
git log -1 --format='%H%n%s%n%n%b'
git status
```

Check:
- [ ] Subject under 72 chars
- [ ] Type is one from the list above
- [ ] Linear ref present if branch has `frg-NNNN`
- [ ] No accidental `.env` or secrets in the diff
- [ ] `git status` is clean (commit succeeded)
