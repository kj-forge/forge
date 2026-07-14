# Stats: Main-Lift PR Table + Per-Exercise History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Statystyki tab with a PR table for main lifts (heaviest set + Epley e1RM + date), an accessories toggle, per-exercise history drill-down, and PR detection wired to the set-save celebration (deferred piece of the redesign epic).

**Architecture:** `is_main_lift` boolean on `exercises` (+ data migration setting it for the 4 main lifts; accessory group resolved by slug list constant). Pure, unit-tested libs for e1RM and PR detection in `src/features/strength/lib/`. Server fns follow the existing batched-query style (`attachExercises`/`loadLastByKind` in `server/sessions.ts`). Routes under `_shell` (tab bar gains the 5th item; `showsTabBar` + `NAV_ITEMS` updated with tests).

**Tech Stack:** Drizzle migration (`bun run db:generate` → `bun run format` after — snapshot JSON vs Biome, see memory), bun:test, existing shell/nav/theme conventions (ember numbers, lucide icons, both themes).

## Global Constraints

- Decisions (KJ, 2026-07-14): two-column PR metric — heaviest set (weight × reps) AND e1RM `weight × (1 + reps/30)`; accessories toggle (localStorage); drill-down history ~20 sessions.
- Main lifts: deadlift, squat, bench press, OHP. Accessories: RDL, Bulgarian split squat, weighted pull-up, dips. Resolve exact slugs from the seed/DB before the migration (Task 1 step 1).
- Ember only on numbers/icons/pills; `bw` for bodyweight (formatWeight); tabular-nums.
- Athlete-scoped queries, batched (no N+1) — mirror `loadLastByKind`.
- No FRG-13 in code/comments. Verify per commit: typecheck + `./node_modules/.bin/biome check` + `bun test`. Verbatim-branch, all tasks on this one branch, one PR at the end (KJ preference).
- WARMUP sets are excluded from PR candidates.

---

### Task 1: Schema — `is_main_lift` flag + data migration

**Files:** Modify `db/schema.ts` (exercises table, after `isUnilateral`); generate `db/migrations/0006_*.sql`; check seed slugs via `grep -rn "deadlift\|squat\|bench\|ohp\|overhead" db/seed*` (or the seed file location via `grep -rn "namePl" db | head`).

- [ ] Add `isMainLift: boolean().notNull().default(false),` to `exercises`.
- [ ] `bun run db:generate`, then append `UPDATE exercises SET is_main_lift = true WHERE slug IN (...four slugs...);` as a custom statement in the generated migration (drizzle custom SQL) — verify slug spelling against seed data first.
- [ ] `bun run format` (drizzle snapshot vs biome). Run `bun run db:migrate` on dev DB.
- [ ] Export `ACCESSORY_SLUGS: string[]` in `src/features/strength/constants.ts` (rdl, bulgarian split squat, weighted pull-up, dips slugs from seed).
- [ ] Verify + commit `feat(db): is_main_lift flag on exercises`.

### Task 2: e1RM + PR detection libs (TDD)

**Files:** Create `src/features/strength/lib/e1rm.ts` + `.test.ts`; `src/features/strength/lib/pr.ts` + `.test.ts`.

**Interfaces:**
- `epleyE1RM(weightKg: number, reps: number): number` — `weight × (1 + reps/30)`, rounded to 0.5; reps 1 → weight; guards: reps ≥ 1, weight ≥ 0.
- `bestSet(sets: {weightKg: number|null; reps: number|null; kind: string}[]): {weightKg: number; reps: number} | null` — heaviest by weight then reps, ignores WARMUP and null-weight (bodyweight) sets.
- `isNewPR(candidate: {weightKg: number; reps: number}, previousBest: {weightKg: number; reps: number} | null): boolean` — true when e1RM(candidate) > e1RM(previousBest) (or no previous).

- [ ] RED: tests (Epley known values: 100×1=100, 100×5≈116.5, rounding; bestSet ordering/warmup exclusion/bw-only → null; isNewPR edges incl. equal e1RM → false). Run, watch fail.
- [ ] GREEN: implement; full suite green; commit `feat(strength): e1rm and pr-detection libs`.

### Task 3: Server fns — PR table + exercise history

**Files:** Create `src/features/strength/server/stats.ts`.

**Interfaces:**
- `getPrTable({ includeAccessories: boolean })` → `{ exerciseId, slug, namePl, isMainLift, best: {weightKg, reps, e1rm, date} | null }[]` — main lifts always; accessory slugs when asked. One batched query over sets joined to sessions (ended only), reduce in JS with `bestSet`/`epleyE1RM`.
- `getExerciseHistory({ exerciseId })` → last 20 ended sessions with that exercise: `{ sessionId, date, sets: SetRow-lite[], topSet }[]` — query shape like `loadLastByKind` Q1+Q2.

- [ ] Implement (athlete-scoped, `createServerFn` + zod inputValidator like siblings). Typecheck + commit `feat(strength): stats server fns`.

### Task 4: Nav — Statystyki tab

**Files:** Modify `src/shared/lib/nav.ts` + `nav.test.ts`.

- [ ] RED: update tests — five tabs `["/", "/sessions", "/sessions/new", "/stats", "/me"]` (Nowa stays center-ish: order `/, /sessions, /sessions/new, /stats, /me`), labels `[..., "Statystyki", ...]`, `showsTabBar("/stats")` true, `"/stats/abc"` false.
- [ ] GREEN: add `{ to: "/stats", label: "Statystyki", icon: ChartNoAxesColumn, exact: true }` + TAB_BAR_PATHS entry; tab grid `grid-cols-4` → `grid-cols-5` in `AppShell.tsx`.
- [ ] Commit `feat(ui): statystyki nav tab`.

### Task 5: Routes + views — PR table & history

**Files:** Create `src/routes/_shell/stats/index.tsx`, `src/routes/_shell/stats/$exerciseId.tsx` (auth beforeLoad + loader like `_shell/sessions/index.tsx`; pendingComponent: SessionListSkeleton); create `src/features/strength/views/StatsView.tsx`, `ExerciseHistoryView.tsx`.

- [ ] StatsView: table — lift name + rows: `5× 112.5 kg` (ember bold), `e1RM ~131 kg`, date muted; `+ Akcesoria` toggle (Switch or chip; state `localStorage("forge-stats-accessories")`, loader deps via search param `?acc=1` so SSR matches); row = Link to `/stats/$exerciseId`; empty state („zaloguj pierwszą serię”).
- [ ] ExerciseHistoryView: header (exercise name + best), rows per session (date, sets `kind · reps×weight`, top set ember), back via logo/tab (no Wróć — shell convention).
- [ ] Both themes pass, dev smoke; commit `feat(strength): stats views`.

### Task 6: PR celebration wiring (closes the FRG-12 leftover)

**Files:** Modify `src/features/strength/server/sets.ts` (addSet returns `isNewPR` — compute from previous best before insert, batched single query); `src/features/strength/components/ExerciseDrawer.tsx` (on save when `isNewPR`: ember pulse badge `▲ Nowy rekord!` in the set list area, `motion-safe:animate-pulse`, auto-dismiss on drawer close — presentation only, no form logic changes).

- [ ] Implement server part (unit-testable pure compare via `pr.ts`), then UI badge.
- [ ] Verify save flow manually on dev + commit `feat(strength): pr celebration on record sets`.

### Task 7: Docs (Phase E) + handoff

- [ ] `docs/learning/estimated-1rm-and-pr-detection.md` (Epley vs alternatives, why e1RM for comparing rep ranges, PR semantics with warmups/bodyweight).
- [ ] ADR only if a non-obvious architectural call emerged (flag-on-exercises vs config table — one paragraph in learning doc otherwise).
- [ ] Update this plan's checkboxes; commit `docs: stats epic learning notes`.
- [ ] KJ visual pass (both themes, iPhone) → push → PR to main (`Closes FRG-13` — ref allowed in PR body only) → promote.

## Self-Review

- Ticket coverage: flag+seed (T1), tab (T4), PR table + e1RM + date (T2/T3/T5), accessories toggle (T5), drill-down (T3/T5), PR-detection lib + celebration (T2/T6), batched athlete-scoped fns (T3), acceptance items mapped. ✔
- Slug uncertainty explicitly resolved in T1 step 1 (no invented slugs). ✔
- localStorage toggle + SSR: search-param loader dep avoids hydration mismatch (T5). ✔
