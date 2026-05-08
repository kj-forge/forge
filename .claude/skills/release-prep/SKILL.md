---
name: release-prep
description: Run a pre-promotion checklist before merging main → staging or staging → production. Use when the user asks to "promote to staging", "promote to production", "cut a release", "prepare a release", or "release prep".
---

# Release Prep

Pre-promotion checklist for the `main → staging → production` flow described in [docs/architecture/release-process.md](../../../docs/architecture/release-process.md) and [ADR-0008](../../../docs/adr/ADR-0008-linear-release-pipeline.md).

The hard rules from that ADR:

1. `staging → production` is **always a regular merge, never squash**. Squashing rewrites SHA history and breaks the link between the staging release and the production deploy.
2. Direct push to `staging` or `production` is forbidden (also blocked by `validate-bash.sh`). Always promote via PR.

## Workflow

Two scenarios — pick based on the user's request:

- **Scenario A:** `main → staging` (cutting a release for QA)
- **Scenario B:** `staging → production` (shipping the release)

### Scenario A: main → staging

#### Step A1: Check current state

```bash
git fetch origin
git rev-parse --abbrev-ref HEAD                                  # should be on main or feature branch (not staging)
git log origin/staging..origin/main --oneline                    # what would be promoted
git diff origin/staging...origin/main --stat                     # scale of the change
```

Note the commits and files changed. If the diff is empty, abort — nothing to promote.

#### Step A2: CI must be green on every commit being promoted

```bash
# Check the latest commit on main
gh run list --branch main --limit 5 --json databaseId,name,conclusion,headSha
gh pr checks <number-of-most-recent-merged-PR-on-main>
```

Block promotion if any check is `failure` or `cancelled`. `skipped` is OK if it's a path-filtered job.

#### Step A3: Verify Linear refs in PR titles

For each commit being promoted, the squash-merge subject should carry `(#NNNN)` (PR number) — that's what `linear-release sync` reads.

```bash
git log origin/staging..origin/main --format='%s'
```

Every line should contain `(#NNNN)`. If any commit was pushed directly to `main` without a PR, the Linear release sync will skip it. Flag those to the user.

#### Step A4: Scan for accidental secrets in the diff

```bash
git diff origin/staging...origin/main -- '*.env*' '.dev.vars' 'apps/*/.env*'
git log origin/staging..origin/main --all --source -p | grep -iE '(api[_-]?key|secret|token|password)' | head -20
```

If anything looks like a real key (not just a variable name), **abort and rotate it before promoting**.

#### Step A5: Sanity-check release-blocking files

If any of these files changed, the user should review with extra care before promoting:

- `db/migrations/*` — schema changes affect Electric SQL sync shapes; may need staging soak time
- `app/lib/db/electric.ts` — sync shape changes can cause client cache invalidation
- `.github/workflows/linear-release.yml` — release pipeline itself
- `.github/workflows/ci.yml` — affects what gets blocked next time

```bash
git diff origin/staging...origin/main --name-only | grep -E '(db/migrations|electric|linear-release|ci\.yml)'
```

#### Step A6: Open the promotion PR

Two ways, both supported (per release-process.md):

- **Cherry-pick** a subset of commits if `main` has a mix:
  ```bash
  git checkout staging && git pull origin staging
  git checkout -b release/cycle-NN-staging
  git cherry-pick <sha1> <sha2> ...
  git push -u origin release/cycle-NN-staging
  gh pr create --base staging --title "Release: cycle NN to staging" --body "..."
  ```
- **Full merge** if everything on `main` should ship:
  ```bash
  gh pr create --base staging --head main --title "Release: cycle NN to staging" --body "..."
  ```

PR body should list the issues going out (`Refs FRG-1234`, `Refs FRG-1235`, ...).

#### Step A7: After merge, rename the Linear release

`linear-release.yml` auto-creates `Release N` (incrementing per pipeline). **Manually rename** in Linear UI to match the current Linear cycle:

- Regular: `Release {cycle_number}` (e.g., `Release 12`)
- Hotfix: `Release {cycle_number} - Hotfixes M` (e.g., `Release 12 - Hotfixes 1`)

This keeps cross-team filtering possible (single-team for now, but future-proof).

### Scenario B: staging → production

#### Step B1: Check current state

```bash
git fetch origin
git log origin/production..origin/staging --oneline
git diff origin/production...origin/staging --stat
```

#### Step B2: Confirm the staging release is "approved" / "QA'd"

Solo project — usually means **you smoke-tested staging** at `https://staging.<your-domain>` (Cloudflare Pages staging env). Confirm with the user that they've done it. If they haven't:

- [ ] Open staging URL on phone, install as PWA
- [ ] Walk through changed feature(s) — golden path
- [ ] Try one offline scenario relevant to the change

If staging hasn't been touched, abort and walk through it first.

#### Step B3: Verify CI on staging is green

```bash
gh run list --branch staging --limit 3 --json databaseId,name,conclusion,headSha
```

#### Step B4: Verify NO new commits added to staging since the release was cut

A release in `In staging` is **frozen**. New commits on `staging` after freeze would invalidate QA. Compare the staging tip SHA to what was QA'd:

```bash
git log -1 origin/staging --format='%H %s'
```

Confirm with the user that this matches what they tested.

#### Step B5: Open the production PR — REGULAR MERGE ONLY

```bash
gh pr create --base production --head staging --title "Release: cycle NN to production" --body "$(cat <<'EOF'
## Summary
Promoting cycle NN release from staging to production.

## Issues
Refs FRG-NNNN, Refs FRG-NNNN, ...

## QA
- Smoke-tested on staging URL
- Checked: <feature 1>, <feature 2>

## Notes
**Merge as regular merge, NOT squash.** Squashing rewrites SHA history and breaks linear-release complete.
EOF
)"
```

After approval, **merge with the regular merge button**, not squash. Confirm the merge type before clicking.

#### Step B6: Verify the deploy + Linear stage

After merge:

```bash
gh run watch  # watch the linear-release workflow on production push
```

In Linear, the release should move from `In staging` to `Released`. Issues that were in the release move to `Released` too.

If the workflow fails or the stage doesn't move, check:

- `LINEAR_ACCESS_KEY` secret matches the pipeline
- The merge was regular, not squash (look at the production tip — message should still contain the original `(#NNNN)` refs)

## Rules

- **Never squash `staging → production`.** Hard rule. Period.
- **Never push directly to `staging` or `production`.** The bash hook blocks this; never disable it.
- **Don't promote if CI is red.** Even one failing check.
- **Don't promote if you can't smoke-test staging** (Scenario B). Solo project means you ARE the QA.
- **Rotate any leaked secret before promoting**, even if "it's just staging" — staging logs/dashboards may leak the key further.

## Verification

After Scenario A (main → staging):
- [ ] Staging deploy succeeded (Cloudflare Pages staging env)
- [ ] `linear-release sync` workflow on staging push is green
- [ ] Linear release renamed to `Release {cycle_number}`
- [ ] Issues in the release show stage `In staging` (frozen)

After Scenario B (staging → production):
- [ ] Production deploy succeeded (Cloudflare Pages production env)
- [ ] `linear-release complete` workflow on production push is green
- [ ] Linear release stage moved to `Released`
- [ ] Production tip commit message contains the original `(#NNNN)` refs (regular merge preserved them)
