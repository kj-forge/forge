# ADR-0008: Linear release pipeline with main → staging → production

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** @kj-ninja

## Context

A non-trivial part of Forge's purpose is practising product / architect skills. That includes a real release process: branches per environment, automated promotion of Linear issue stages, naming conventions, edge-case handling.

The pattern is borrowed almost entirely from Gigaverse's release process (the user's day job), adapted to a single-repo solo project. Reference: Gigaverse "Linear Release process: main → staging → production" doc.

## Decision

A single Linear release pipeline named **`Forge Web`**, three long-lived branches, automated stage transitions:

| Branch | Environment | Linear stage |
| --- | --- | --- |
| `main` | DEV (Cloudflare Pages preview) | `In dev` |
| `staging` | STG (Cloudflare Pages staging) | `In staging` (frozen) |
| `production` | PROD (Cloudflare Pages production) | `Released` |

Stage transitions are automated by `.github/workflows/linear-release.yml`:

- push `main` → `linear-release sync` (issues → `In dev`)
- push `staging` → `sync` + `update --stage "In staging"` (freezes the release)
- push `production` → `linear-release complete` (issues → `Released`)

Naming: `Release N` where `N` is the current Linear cycle number; hotfixes `Release N - Hotfixes M`. After cutting a release to `staging`, manually rename the auto-generated `Release N` in Linear UI to match the cycle.

**Hard rule:** the `staging → production` merge must be a regular merge, never squash. Squashing rewrites SHA history and breaks the link between the staging release and production deploy.

## Alternatives considered

### Two environments only (`main` → `production`)

- Pros: less ceremony, less branch management for solo work.
- Cons: defeats the purpose — one of the goals is to learn the full enterprise release flow. Drop to two only if `staging` becomes a dead branch.

### Trunk-based with feature flags

- Pros: fewer branches, fewer merges.
- Cons: harder to learn for a solo project, requires a robust feature-flag system before it pays off.

### No automated pipeline (manual stage updates)

- Pros: zero CI cost.
- Cons: every issue's release stage drifts from reality fast; the value of Linear release tracking disappears.

## Consequences

### Positive

- Issues automatically reflect deployment reality. Looking at any Linear issue tells you whether the work is in dev, staging, or live.
- The `staging` freeze gives even a solo developer a stable testing window.
- Workflow pattern is portable to any future repo.

### Negative / trade-offs

- Three branches to keep aligned. As a solo dev, this is overhead unless the freeze window is actually used.
- Naming convention requires manual rename after each release cut.

### Follow-ups

- Create the `Forge Web` pipeline in Linear (Settings → Releases → New pipeline) with stages: `Planned → Started → In dev → In staging (frozen) → Released`.
- Generate pipeline access key, add to repo secrets as `LINEAR_ACCESS_KEY`.
- Uncomment the steps in `.github/workflows/linear-release.yml` once the pipeline + secret are in place.
- Set up branch protection on all three branches (Phase 0 — see [docs/architecture/release-process.md](../architecture/release-process.md)).
- Re-evaluate at end of cycle 2: if `staging` is consistently a no-op, simplify to two environments via a superseding ADR.
