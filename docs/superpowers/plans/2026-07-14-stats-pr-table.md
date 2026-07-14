# Stats: Main-Lift PR Table + Per-Exercise History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Statystyki tab with two segments — "Rekordy" (PR table: heaviest set + Epley e1RM + date, accessories toggle) and "Zestawienia" (weekday comparison matrix: exercises × recent sessions of a chosen weekday, compact set notation) — plus PR detection wired to a TOAST celebration on set save (deferred piece of the redesign epic).

> **SCOPE v2 (KJ, 2026-07-14, mockup stats-wizja-v2):** per-exercise history drill-down DROPPED (PR rows are not links). Added: Zestawienia matrix (day chips PON–ND, last 2 months, sticky exercise column + horizontal date scroll on mobile, newest column ember). Celebration is a ~4s auto-hide toast (sonner), not an in-drawer badge.

**Architecture:** `is_main_lift` boolean on `exercises` (+ data migration setting it for the 4 main lifts; accessory group resolved by slug list constant). Pure, unit-tested libs for e1RM and PR detection in `src/features/strength/lib/`. Server fns follow the existing batched-query style (`attachExercises`/`loadLastByKind` in `server/sessions.ts`). Routes under `_shell` (tab bar gains the 5th item; `showsTabBar` + `NAV_ITEMS` updated with tests).

**Tech Stack:** Drizzle migration (`bun run db:generate` → `bun run format` after — snapshot JSON vs Biome, see memory), bun:test, existing shell/nav/theme conventions (ember numbers, lucide icons, both themes).

## Global Constraints

- Decisions (KJ, 2026-07-14): two-column PR metric — heaviest set (weight × reps) AND e1RM `weight × (1 + reps/30)`; accessories toggle (localStorage); drill-down history ~20 sessions.
- Main lifts (exact slugs verified in db/seed.ts): `back-squat`, `deadlift`, `bench-press`, `overhead-press`. Accessories: `romanian-deadlift`, `bulgarian-split-squat`, `pull-up`, `dip` (weighted variants = same exercise, weight lives on sets; loaded-bw display rule applies to pull-up/dip).
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

### Task 3: Server fns — PR table + weekday comparison

**Files:** Create `src/features/strength/server/stats.ts`; create `src/features/strength/lib/format-sets-compact.ts` + `.test.ts`.

**Interfaces:**
- `getPrTable({ includeAccessories: boolean })` → `{ exerciseId, slug, namePl, isMainLift, best: {weightKg, reps, e1rm, date} | null }[]` — main lifts always; accessory slugs when asked. One batched query over sets joined to sessions (ended only), reduce in JS with `bestSet`/`epleyE1RM`. Loaded-bw (weighted pull-up/dips slugs): best shown as `+kg`, e1rm null.
- `getWeekdayComparison({ weekday: 0-6 })` → ended sessions of that weekday from the last 2 months (newest first), each `{ sessionId, date, exercises: { namePl, sets: {weightKg, reps, kind}[] }[] }` — batched like `attachExercises`; matrix pivot happens client-side.
- `formatSetsCompact(sets)` (pure, TDD): KJ's notes notation — equal sets collapse to `4×5`, varied reps join `8/7/6/6`, weight groups separated by `·`, bodyweight = reps only, weighted-bw = `+20`. RED first with cases from the mockup (105 4×5; 12/12/10; 50 8/7/6/6 · 40 ×10).

- [ ] TDD the formatter, then implement server fns (athlete-scoped, zod inputValidator). Commit `feat(strength): stats server fns + compact set formatter`.

### Task 4: Nav — Statystyki tab

**Files:** Modify `src/shared/lib/nav.ts` + `nav.test.ts`.

- [ ] RED: update tests — five tabs `["/", "/sessions", "/sessions/new", "/stats", "/me"]` (Nowa stays center-ish: order `/, /sessions, /sessions/new, /stats, /me`), labels `[..., "Statystyki", ...]`, `showsTabBar("/stats")` true, `"/stats/abc"` false.
- [ ] GREEN: add `{ to: "/stats", label: "Statystyki", icon: ChartNoAxesColumn, exact: true }` + TAB_BAR_PATHS entry; tab grid `grid-cols-4` → `grid-cols-5` in `AppShell.tsx`.
- [ ] Commit `feat(ui): statystyki nav tab`.

### Task 5: Route + view — Rekordy/Zestawienia segments

**Files:** Create `src/routes/_shell/stats/index.tsx` (auth beforeLoad + loader like `_shell/sessions/index.tsx`; pendingComponent: SessionListSkeleton; search params `?seg=rekordy|zestawienia&acc=1&dzien=0-6` as loader deps so SSR matches); create `src/features/strength/views/StatsView.tsx`.

- [ ] Segment control (Rekordy | Zestawienia) — gradient-active chips like the drawer kind chips.
- [ ] Rekordy: PR rows — name + record date left; right: heaviest set (ember 900 tabular) over `e1RM ~X kg` muted; NOT links (drill-down dropped). `+ Akcesoria` toggle → search param + localStorage default; accessories section under a small divider.
- [ ] Zestawienia: day chips PON–ND (default = today's weekday); matrix table in `overflow-x-auto` container — sticky first column (exercise names, `bg-card2`), one column per session date (newest first, newest header+cells ember), cells via `formatSetsCompact`, `—` when the exercise is absent; desktop full width, mobile horizontal scroll.
- [ ] Empty states for both segments; both themes; dev smoke; commit `feat(strength): stats view with rekordy and zestawienia`.

### Task 6: PR celebration TOAST (closes the FRG-12 leftover)

**Files:** Install sonner via shadcn (`yes n | bun x --bun shadcn@latest add sonner` — research-first: confirm command against ui.shadcn.com/docs/components/sonner; NO overwrites of existing ui files); mount `<Toaster />` in `_shell.tsx` (inside AppShell tree); modify `src/features/strength/server/sets.ts` (addSet returns `{ isNewPR, e1rm, previousE1rm }` — previous best computed via `pr.ts` in one batched query before insert); `ExerciseDrawer.tsx` onSubmit: when `isNewPR` → `toast("Nowy rekord: <bój>!", { description: "5× 112.5 kg · e1RM ~131 kg (było ~128)", duration: 4000 })` with ember styling (toast className using tokens).

- [ ] Server part first (pure compare unit-tested in Task 2), then Toaster + call site. No other form logic changes.
- [ ] Verify save flow on dev (beat a PR → toast, non-PR → silence) + commit `feat(strength): pr celebration toast on record sets`.

### Task 7: Docs (Phase E) + handoff

- [ ] `docs/learning/estimated-1rm-and-pr-detection.md` (Epley vs alternatives, why e1RM for comparing rep ranges, PR semantics with warmups/bodyweight).
- [ ] ADR only if a non-obvious architectural call emerged (flag-on-exercises vs config table — one paragraph in learning doc otherwise).
- [ ] Update this plan's checkboxes; commit `docs: stats epic learning notes`.
- [ ] KJ visual pass (both themes, iPhone) → push → PR to main (`Closes FRG-13` — ref allowed in PR body only) → promote.

## Self-Review

- Ticket coverage: flag+seed (T1), tab (T4), PR table + e1RM + date (T2/T3/T5), accessories toggle (T5), drill-down (T3/T5), PR-detection lib + celebration (T2/T6), batched athlete-scoped fns (T3), acceptance items mapped. ✔
- Slug uncertainty explicitly resolved in T1 step 1 (no invented slugs). ✔
- localStorage toggle + SSR: search-param loader dep avoids hydration mismatch (T5). ✔
