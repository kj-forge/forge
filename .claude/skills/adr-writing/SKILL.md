---
name: adr-writing
description: Generate a new ADR (Architecture Decision Record) under docs/adr/ following the template. Use when the user asks to "write an ADR", "document a decision", "add architecture decision", or proposes a non-trivial technical choice that should be recorded.
---

# ADR Writing

Generate a new ADR under `docs/adr/` following [docs/adr/ADR-template.md](../../../docs/adr/ADR-template.md).

## Workflow

### Step 1: Pick the next ADR number

```bash
ls docs/adr/ADR-*.md | sort | tail -1
```
Take the highest number and increment by 1. ADRs are numbered with 4-digit zero-padded integers: `ADR-0009`, `ADR-0010`, ...

### Step 2: Confirm the slug

ADRs use kebab-case slugs that describe the **decision**, not the implementation. Good: `adopt-feature-flags`, `replace-electric-with-powersync`. Bad: `add-launchdarkly-sdk` (implementation detail), `improve-sync` (vague).

If unsure, propose 2–3 slugs and ask the user to pick.

### Step 3: Read the template

Read `docs/adr/ADR-template.md` for the exact structure. Do not improvise sections.

### Step 4: Draft the ADR

Fill in:

- **Status:** `Proposed` (becomes `Accepted` on PR merge)
- **Date:** today's date (ISO `YYYY-MM-DD`)
- **Deciders:** `@kj-ninja` (default for solo project)
- **Linear:** `[FRG-XXX](https://linear.app/kj-ninja/issue/FRG-XXX)` if there's an issue, otherwise omit the line

Body sections (all mandatory):

- **Context** — what problem, what constraints (technical, product, time, learning goals)
- **Decision** — the choice in one paragraph
- **Alternatives considered** — at least **two** alternatives, each with concrete pros/cons
- **Consequences** — Positive / Negative-trade-offs / Follow-ups
- **References** — docs, PRs, articles that informed this decision

### Step 5: Update the index

Add a row to `docs/adr/README.md` index table in the right numerical place:

```
| [ADR-NNNN](ADR-NNNN-<slug>.md) | <Title from H1> | Accepted |
```

Status in the index should match the status in the ADR file.

## Rules

- **One decision per ADR.** If a change has multiple decisions, write multiple ADRs that cross-reference each other.
- **Alternatives are mandatory.** "We chose X because we chose X" is not an ADR — show the alternatives that were rejected and why. Even bad alternatives are useful (they document the search space).
- **ADRs are immutable once Accepted.** To change a decision, write a new ADR that supersedes the old one. Update the old one's Status to `Superseded by ADR-NNNN`.
- **Don't write ADRs for trivial choices.** "Use kebab-case for filenames" is a CONTRIBUTING.md note, not an ADR. ADR threshold: would a future contributor benefit from understanding *why* this was chosen?
- **Keep it short.** Most ADRs fit on one screen. If yours is sprawling, you're probably mixing decisions.

## Verification

After writing:

- [ ] File exists at `docs/adr/ADR-NNNN-<slug>.md`
- [ ] Index in `docs/adr/README.md` updated with a new row in numerical order
- [ ] All template sections filled (no `<placeholder>` text left)
- [ ] At least 2 alternatives in "Alternatives considered" with concrete pros/cons
- [ ] Status set to `Proposed` (will become `Accepted` on merge)
