# Contributing to Forge

Solo project, but processes are set up as if it weren't — to practice good engineering and product habits.

## Workflow — hybrid (since 2026-05-16, ADR-0011)

There are **two tracks** depending on the size of the change.

### Track 1 — Small changes (no Linear ceremony)

For typos, single-file tooling tweaks, doc fixes < ~10 lines, small `.claude/` updates: just open a PR with a descriptive non-Linear branch like `fix/biome-typo` or `chore/bump-knip-ignores`. No Linear issue required. Conventional commits still enforced via husky/commitlint.

Branch protection on `main` / `staging` / `production` still requires a PR — but the PR is lightweight.

### Track 2 — Epic-level work (Linear + PR + self-review)

For features, ADRs, migrations, or anything ≥ 2 hours / ≥ 5 files:

1. Create **one Linear issue per epic** (not per micro-task) under the `Forge` initiative. Team key is **`FRG`**.
2. Branch: `feat/frg-N-<short-scope>` (e.g. `feat/frg-9-hyrox-data-model`). The `frg-N` identifier is sacred for Linear linkback; the descriptive tail can (and usually should) be shortened from Linear's auto-generated title.
3. Multiple commits per branch is fine — encouraged for granular self-review history.
4. PR title in Conventional Commits format. PR body uses the standard template with `Closes FRG-N`.
5. Self-review the diff cold before merge, walk through the test plan.

```
feat/frg-9-hyrox-data-model
fix/frg-145-rest-timer-resets
chore/frg-150-bump-vite-pwa
docs/frg-151-sync-architecture-diagram
```

The Linear `gitBranchName` is `identifier-title` (no username prefix). Copy and shorten the tail.

### PR template

The `## Linear` section in [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) is the fallback if the branch name doesn't include the issue ID. Use a magic word:

- `Closes FRG-123` — closes the issue when the PR merges
- `Refs FRG-123` — links without closing

### Commits

Commit message style: short imperative subject, optionally prefixed with the area. The PR title (and squash-merge commit) is what matters most.

## Release flow

Three long-lived branches:

| Branch | Environment | Audience |
| --- | --- | --- |
| `main` | DEV | Solo development, internal experiments |
| `staging` | STG | Pre-production testing |
| `production` | PROD | Live |

Code moves left to right. The `.github/workflows/linear-release.yml` workflow syncs Linear stages on every push:

- push `main` → issues marked `In dev`
- push `staging` → release frozen, issues marked `In staging`
- push `production` → issues marked `Released`

**Important:** The `staging → production` merge **must be a regular merge, not squash**. Squashing rewrites SHA history and breaks the link between the staging release and the production deploy.

See [docs/architecture/release-process.md](docs/architecture/release-process.md) for the full release process documentation.

## Architecture decisions

Non-trivial architectural decisions are recorded as ADRs in [docs/adr/](docs/adr/), following the format in [docs/adr/ADR-template.md](docs/adr/ADR-template.md).

Status lifecycle: `Proposed` → `Accepted` (after merge) → `Superseded` / `Deprecated` (if replaced).

ADRs are immutable once accepted. To change a decision, write a new ADR that supersedes the old one.

## Local development

> Scaffolding in progress — this section will be filled in once the TanStack Start app is bootstrapped.

```bash
bun install
bun dev
bun test
bun lint
```

## Code style

- Biome for lint + format (no ESLint/Prettier)
- TypeScript strict mode, `exactOptionalPropertyTypes`
- Default to writing no comments — use clear names. Add a comment only when the *why* is non-obvious.
