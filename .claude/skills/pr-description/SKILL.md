---
name: pr-description
description: Generate a pull request title and body in the Forge format (Summary / Linear / Test plan / Screenshots / Notes). Use when the user asks to "open a PR", "create a PR", "write a PR description", or has just pushed a feature branch and wants to open the PR.
---

# PR Description

Generate a pull request title and body that follows [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md).

## Workflow

### Step 1: Inspect the branch state

```bash
git branch --show-current
git fetch origin main
git log origin/main..HEAD --oneline
git diff origin/main...HEAD --stat
```

Note:
- Branch name (look for `feat/frg-NNNN-...` to extract Linear issue)
- Number of commits (1 vs many — affects squash recommendation)
- Files changed and lines added/removed (affects "Notes" section if huge)

If the branch hasn't been pushed yet, ask the user if you should push first (`git push -u origin <branch>`).

### Step 2: Title

Format: same as [commit-message](../commit-message/SKILL.md) subject line — `<type>(<scope>): <subject>`, **under 70 chars**.

If the branch has multiple commits, the PR title should reflect the **overall change**, not the first commit. Pick the most descriptive subject across all commits or write a new summary line.

Good: `feat(log): quick-log strength drawer with rest timer`
Bad: `WIP: stuff for the log page` or `Multiple changes`

### Step 3: Body — fill the template sections

Read `.github/PULL_REQUEST_TEMPLATE.md` for the exact section order. The template has 5 sections: Summary, Linear, Test plan, Screenshots / recordings, Notes.

#### Summary
1–3 bullets answering **what changed and why**. Focus on user-visible or behaviour-visible changes; skip refactor noise.

```
## Summary
- Added bottom-sheet quick-log drawer for strength sessions (Vaul + RHF)
- Auto-suggests last weight per exercise from local TanStack DB
- Rest timer auto-starts on set save
```

#### Linear
Extract `FRG-NNNN` from the branch name `feat/frg-NNNN-...`. If the branch doesn't carry one, ask the user to provide an issue number or confirm the PR has no Linear issue (rare — should be a `chore`).

```
## Linear
Closes FRG-1234
```

Use `Refs FRG-NNNN` (not `Closes`) if the work is partial.

#### Test plan
A bulleted checklist a reviewer (or future-you) can walk through to verify it works. Always include both the **golden path** and at least one **edge case**.

```
## Test plan
- [ ] Open `/log/strength` on iPhone 14 viewport — drawer opens from bottom
- [ ] Pick "Squat", confirm last weight auto-fills
- [ ] Save 5 sets, rest timer auto-starts after each
- [ ] Disconnect network, save 2 more sets — UI updates instantly
- [ ] Reconnect, verify sets sync to server (check Postgres)
- [ ] Mobile: swipe down on drawer dismisses without saving
```

#### Screenshots / recordings
For UI changes, attach mobile-viewport screenshots (preferred over desktop) or short recording. If the change is non-UI, write `N/A — non-UI`.

If you can't take screenshots in this session, leave the section as a TODO so the user knows to attach before merging:

```
## Screenshots / recordings
- [ ] TODO: attach iPhone 14 viewport screenshot of the drawer (golden path + dismissed state)
```

#### Notes
Trade-offs, follow-ups, areas needing extra reviewer attention. Skip the section heading if there's nothing to add.

```
## Notes
- Rest timer interval is hardcoded to 90s for now — making it user-configurable is FRG-1240 (out of scope here)
- Drawer animation feels slow on Android 13 emulator — needs follow-up profiling
```

### Step 4: Open the PR

Use `gh pr create` with a heredoc to preserve formatting:

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
- <bullet 1>
- <bullet 2>

## Linear
Closes FRG-NNNN

## Test plan
- [ ] <step 1>
- [ ] <step 2>

## Screenshots / recordings
<screenshots or N/A>

## Notes
<trade-offs, follow-ups, or omit>
EOF
)"
```

### Step 5: Return the PR URL

`gh pr create` prints the URL on success. Hand it back to the user.

## Rules

- **Title under 70 chars.** Long titles wrap awkwardly in GitHub UI and Linear.
- **Test plan is mandatory.** "Tested locally" is not a test plan — list specific steps.
- **Screenshots for every UI change.** Mobile viewport preferred (Forge is mobile-first).
- **Don't fabricate test results.** If you didn't run something, say so in the Test plan as a TODO.
- **Linear ref is mandatory** unless this is a `chore` PR with no associated issue. Confirm with user if branch has no `frg-NNNN`.
- **Squash policy:** for `feature → main` PRs, GitHub default squash-merge is fine (the `Closes FRG-NNNN` carries to the squashed commit). **Never squash `staging → production`** — that's the hard rule from [docs/architecture/release-process.md](../../../docs/architecture/release-process.md).

## Verification

After creating:

```bash
gh pr view --json url,title,body,baseRefName,headRefName
```

Check:
- [ ] Title under 70 chars and matches the actual change
- [ ] All 5 template sections filled (or section omitted with reason)
- [ ] `Closes FRG-NNNN` in body or branch name carries the ref
- [ ] Test plan has both golden path and at least one edge case
- [ ] Screenshots present (or TODO marked) for UI changes
