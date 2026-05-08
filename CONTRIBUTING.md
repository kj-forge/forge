# Contributing to Forge

Solo project, but processes are set up as if it weren't — to practice good engineering and product habits.

## Linear ↔ GitHub flow

Work is tracked in Linear under the `Forge` initiative. The team key is **`FRG`**, so issues look like `FRG-123`.

Every commit and PR should be traceable back to a Linear issue.

### Branch naming

```
feat/frg-123-quick-log-strength
fix/frg-145-rest-timer-resets
chore/frg-150-bump-vite-pwa
docs/frg-151-add-sync-architecture-diagram
```

The `frg-XXX` part is what Linear uses to auto-link the branch to the issue. Linear's `gitBranchName` field on each issue gives you the right format — copy it from the issue UI.

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
