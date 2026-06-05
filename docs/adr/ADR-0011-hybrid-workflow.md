# ADR-0011: Hybrid workflow — small changes fast-track, epics through Linear + PR

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** @kj-ninja
- **Supersedes (in part):** the strict "1 Linear issue = 1 PR" pattern implicit in PRs #4–#7.

## Context

PRs #4–#7 followed a strict "one Linear issue per task, one PR per issue" pattern intended to practice product-management discipline. After 7 PRs of pure infrastructure in 3 weeks, the audit (2026-05-16) flagged the ceremony as too heavy for solo-developer pace: every micro-task forced a branch / commit / PR cycle that took longer than the work itself for small changes. The user explicitly asked whether to relax the rule and accept lower process discipline in exchange for velocity to MVP.

## Decision

**Hybrid workflow with two tracks:**

### Track 1 — Small changes (fast-track, no Linear ceremony)

What qualifies:
- Typo fixes in docs / comments
- Single-file tooling tweaks (Biome rule adjustments, `knip.json` updates)
- Renames, formatting cleanup
- Small `.claude/` updates
- README < ~10 line edits

How:
- For protected branches (`main` / `staging` / `production`): still require PR (branch protection enforces).
- Use descriptive non-Linear branch names: `fix/biome-typo`, `chore/bump-knip-ignores`.
- Conventional commits still required (commitlint hook).

### Track 2 — Epic-level work (Linear issue + branch + PR)

What qualifies:
- A feature epic (e.g., "DB schema foundation", "Quick Log UI", "AI weekly summary loop")
- An ADR worth writing
- Migrations / breaking changes
- Anything ≥ 2 hours of work or touching ≥ 5 files

How:
- One Linear issue per epic, not per micro-task.
- Branch `feat/frg-N-<short-scope>` (e.g., `feat/frg-9-hyrox-data-model`). The `frg-N` identifier prefix is sacred (Linear linkback); the descriptive tail can be shortened from Linear's auto-generated title.
- Multiple commits per branch is fine and encouraged for granular self-review.
- PR title in Conventional Commits format. PR body uses the standard template with `Closes FRG-N`.
- Self-review before merge — read the diff cold, walk through the test plan.

### What stays the same (regardless of track)

- `main → staging → production` release flow (Gigaverse pattern, ADR-0008).
- Conventional commits (commitlint enforces).
- Biome + husky pre-commit + commit-msg hooks.
- ADRs for non-trivial architectural decisions.
- Branch protection on protected branches.
- `delete_branch_on_merge` + `fetch.prune = true`.
- Package install research (`package-install-research-first.md`).

## Alternatives considered

### Alternative A — Continue strict per-task

- **Pros:** maximum audit trail; matches enterprise team workflow.
- **Cons:** velocity penalty unjustified at solo-dev stage; user reports the ceremony fatigue is real.

### Alternative B — Drop Linear entirely until team grows

- **Pros:** maximum velocity.
- **Cons:** losing Linear means losing the planning surface for P0/P1/P2 priorities, the link to PRs, and the "what shipped in cycle N" view. Half measure.

### Alternative C — Chosen: hybrid

The compromise. Small things move fast. Big things keep their audit trail. Discipline scales with stakes.

## Consequences

### Positive

- Faster path to MVP without throwing away the product surface (Linear epics + ADRs).
- The hybrid lets us revert to strict per-task when a coach or another developer joins — the supporting infrastructure (Linear, branch protection, ADRs) is already there.
- Conventional commits + Biome + husky + ADRs continue to enforce quality regardless of which track a change uses.

### Negative / trade-offs

- "Small" vs "epic" judgment is subjective. A reasonable rule of thumb is in the memory `forge-workflow-hybrid.md`; when unsure, lean toward Linear ceremony (it's cheap if used proportionally).
- Risk that small changes accumulate into "kind of a feature" without an audit trail. Mitigation: monthly self-review of `git log` against Linear; promote drifted work into a retroactive issue when needed.

### Follow-ups

- Memory `forge-workflow-hybrid.md` captures the rule in actionable form for future sessions.
- Memory `forge-branch-naming.md` updated to reflect the relaxed branch naming.
- If/when the team grows beyond solo, supersede this ADR with a return to strict per-task.

## References

- `~/.claude/projects/-Users-chris-projects-forge/memory/forge-workflow-hybrid.md`
- `~/.claude/projects/-Users-chris-projects-forge/memory/forge-branch-naming.md` (updated, history preserved)
- ADR-0008 — release pipeline (still applies to both tracks at the merge boundary)
