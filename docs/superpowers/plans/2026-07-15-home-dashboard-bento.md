# Home Dashboard: Bento Layout, Goals, Empty States — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desktop Home becomes a bento dashboard (today's plan, CTA, last session, goal, PR list, recent sessions, week strip, e1RM sparkline, data-driven Zestawienia shortcut); mobile Home gets a trimmed bento; goals are entered in Profil → Cele; first-run users see a 1-2-3 start path with icon chips; existing empty states gain icons; sidebar drops "Nowa".

> **Approved mockups (KJ, 2026-07-15, home-dashboard-v3):** https://claude.ai/code/artifact/2ff21629-7751-4d36-a487-cc524acb6e26 — bento variant A; Zestawienia tile from session counts per weekday (NOT plan parsing); goals in Profil (types STRENGTH_RM/RACE_TIME/BODY_COMP/CONSISTENCY, STRENGTH_RM progress auto from e1RM); ember icon-chips on start steps, muted watermark icons on ghost tiles.

**Architecture:** New `src/features/goals/` and `src/features/dashboard/` feature folders (runtime-first, ADR-0018). One `getDashboard()` server fn bundles all Home data (one client round-trip on Workers instead of six). `goals` gets a nullable `exerciseId` FK (migration 0008) so STRENGTH_RM goals can auto-derive progress from `bestE1RM`. Dashboard switches at `lg` (like the plan table); below stays a mobile column.

**Tech Stack:** Drizzle migration, RHF + zodResolver + shadcn Form (always-RHF rule), existing `epleyE1RM`/`bestE1RM` libs, lucide icons only, bun:test for pure libs + nav.

## Global Constraints

- Verify per commit: `bun run typecheck` + `./node_modules/.bin/biome check` + `bun test`. After `db:generate`: `bun run format`.
- Commitlint lowercase subject; no FRG-15 in code/comments. All tasks on this branch, ONE PR at the end.
- Ember discipline: chips/pills/numbers/icons only. Icon chips ember; ghost watermark icons muted. ≥16px mobile inputs.
- Weekday indexing 0=PON…6=ND (`shared/lib/weekday`).

---

### Task 1: Migration — `goals.exercise_id`

**Files:** Modify `db/schema.ts` (goals table); generate `db/migrations/0008_*.sql`.

- [ ] Add to goals: `exerciseId: uuid().references(() => exercises.id, { onDelete: "set null" }),` after `type`. (Nullable — only STRENGTH_RM goals point at a lift; the FK is what lets progress auto-compute from that exercise's e1RM.)
- [ ] `bun run db:generate` → `bun run format` → `bun run db:migrate`. Verify + commit `feat(db): goals reference an exercise for auto progress`.

### Task 2: Goals feature — constants + server fns

**Files:** Create `src/features/goals/constants.ts`, `src/features/goals/types.ts`, `src/features/goals/server/goals.ts`, `src/features/goals/lib/goal-progress.ts` + `.test.ts`.

**Interfaces (produces):**
- `GOAL_TYPES = ["STRENGTH_RM", "RACE_TIME", "BODY_COMP", "CONSISTENCY"] as const`; `GOAL_TYPE_LABEL` (Siła (RM) / Czas wyścigu / Sylwetka / Regularność).
- `listGoals()` → active goals (achievedAt null) ordered targetDate asc nulls-last, each `{ id, type, title, targetValue, targetUnit, targetDate, exerciseId, exerciseNamePl, currentE1rm }` — `currentE1rm` batched via one sets query for the referenced exercises + `bestE1RM`.
- `upsertGoal({ id?, type, title(1..120), targetValue?, targetUnit?(..10), targetDate?, exerciseId? })` — insert or update-by-id (athlete-scoped), returns row.
- `deleteGoal({ goalId })`.
- `goalProgress(goal): number | null` (pure, TDD): STRENGTH_RM with target+current → `min(100, current/target*100)`; others → null (no bar).
- `listExercisesForPicker()` → `{ id, namePl }[]` ordered namePl (or reuse an existing exercises list fn if one exists — check `strength/server` first).

- [ ] TDD goal-progress; implement fns; verify + commit `feat(goals): goals server fns and progress lib`.

### Task 3: Profil → Cele section + GoalDrawer

**Files:** Create `src/features/goals/components/GoalDrawer.tsx`, `src/features/goals/components/GoalsSection.tsx`; modify `/me` route + view (check `src/routes/_shell/me.tsx` / its view) to load `listGoals()` alongside existing data and render the section above account settings.

- [ ] GoalsSection: list rows (title, type label + termin small; right: current vs target ember tabular) + „+ Dodaj cel"; empty state with Target icon + „Nie masz jeszcze celu." + CTA.
- [ ] GoalDrawer (RHF+zod, conditional-mount): type chips (4, gradient-active); title Input; targetValue (NumericFormat) + targetUnit Input side-by-side; targetDate (native `<input type="date">` styled like Input); exercise `<select>` shown ONLY for STRENGTH_RM. Edit mode prefills; delete button (ghost destructive) for existing.
- [ ] Verify + dev smoke + commit `feat(goals): cele section in profil with goal drawer`.

### Task 4: Dashboard server fn

**Files:** Create `src/features/dashboard/server/dashboard.ts`; modify `src/features/strength/server/sessions.ts` (export the internal `attachExercises` + the recent-sessions query as a reusable helper).

**Interfaces (produces):** `getDashboard()` → one payload:
- `sessions` (recent 10 with exercise previews — reuse helper),
- `plan` (getTrainingPlan query inline or import fn logic),
- `prs` (main-lift bests: reuse the stats queries — extract `loadPrTable(athleteId, includeAccessories)` helper from `strength/server/stats.ts` and have both fns use it),
- `trend` — `{ slug, namePl, points: { date, e1rm }[] } | null`: first slug in PR_TABLE_SLUG_ORDER with ≥2 ended sessions of data; per-session best e1RM, last 10 sessions asc,
- `goal` — nearest active goal (targetDate asc nulls-last, first) with currentE1rm,
- `weekdayCounts` — `{ weekday, count }[]` top 3 by ended-session count, last 2 months (SQL GROUP BY ISODOW).

- [ ] Refactor exports (no behavior change; suite green). Implement getDashboard (athlete-scoped, all queries batched). Verify + commit `feat(dashboard): single getDashboard server fn`.

### Task 5: Desktop bento + mobile trimmed Home

**Files:** Create `src/features/dashboard/views/DashboardView.tsx` + `src/features/dashboard/components/` tiles (`TodayTile`, `GoalTile`, `PrTile`, `SessionsTile`, `WeekTile`, `TrendSparkline`, `ZestawieniaTile`, `LastSessionTile`); modify `src/routes/_shell/index.tsx` (loader → `getDashboard()`, component → DashboardView); delete `src/features/strength/views/HomeView.tsx` (content absorbed); keep `TodayPlanCard` for mobile or absorb into TodayTile.

- [ ] Mobile (<lg): greeting → today card → CTA → 2-col mini row (GoalTile compact + PrTile compact) → sessions list (existing SessionListItem). Desktop (lg+): greeting bar with CTA button right; bento grid `lg:grid-cols-4` per mockup (today span2 / last session / goal; prs / sessions span2 / week; sparkline span3 / zestawienia).
- [ ] Active session: when an in-progress session exists, LastSessionTile becomes pulsing „Wróć do sesji" (StatusBadge pattern).
- [ ] TrendSparkline: inline SVG polyline from `trend.points`, ember gradient stroke, endpoint dot, min/max labels; hidden when trend null.
- [ ] ZestawieniaTile: weekdayCounts chips → Link `/stats?seg=zestawienia&dzien=N`.
- [ ] Both themes; dev smoke; verify + commit `feat(dashboard): bento home for desktop, trimmed mobile`.

### Task 6: First-run onboarding + ghost tiles

**Files:** Modify `DashboardView.tsx` (+ small `OnboardingTiles` component in dashboard/components).

- [ ] First-run predicate: `sessions.length === 0` → steps mode: Krok 1 (Dumbbell icon-chip, CTA start session), Krok 2 (CalendarDays chip → /plan), Krok 3 (Target chip → /me), ghost tiles (Trophy / BookOpen / CalendarDays watermark, `.gcenter` style) for Rekordy/Sesje/Tydzień. Partial data degrades per-tile (e.g. plan exists but no sessions → Krok 2 replaced by real today tile).
- [ ] Mobile first-run: keep „To Twój pierwszy trening…" card + dashed plan/goal teasers with the same icons.
- [ ] Verify + commit `feat(dashboard): first-run start path with icon tiles`.

### Task 7: Icons in existing empty states + sidebar without Nowa

**Files:** Modify `PlanView.tsx`, `StatsView.tsx` (both segments), `SessionsListView.tsx` (empty Cards get a lucide icon above text: CalendarDays / Trophy / Table2 / BookOpen, `size-8 text-muted-foreground/60 mx-auto mb-2`); `src/shared/lib/nav.ts` + `nav.test.ts` (`/sessions/new` → `inSidebar: false`).

- [ ] RED nav test (SIDEBAR_ITEMS without `/sessions/new`: `["/", "/sessions", "/stats", "/plan"]`), GREEN flag flip.
- [ ] Empty-state icons in the three existing views.
- [ ] Verify + commit `feat(ui): empty-state icons and leaner sidebar`.

### Task 8: Docs + handoff

- [ ] `docs/learning/` — extend an existing doc or short note only if a new concept emerged (single-round-trip dashboard fn + FK-for-auto-progress rationale fits in the PR description; add `docs/learning/README.md` row only if a doc is written).
- [ ] Update this plan's checkboxes; commit `docs: dashboard epic notes`.
- [ ] KJ visual pass (both themes, iPhone + desktop, first-run via fresh account if possible) → push → PR (`Closes FRG-15`) → promote.

## Self-Review

- Mockup coverage: bento A (T5), data-driven Zestawienia (T4/T5), goals in Profil + auto e1RM progress (T1-T3), first-run 1-2-3 + ghosts (T6), icons in existing empty states (T7), sidebar minus Nowa (T7), mobile trimmed (T5). ✔
- Non-obvious call documented: exerciseId FK on goals (T1 note) — alternative (title matching) rejected as fragile. ✔
- Reuse: attachExercises + loadPrTable extracted, not duplicated (T4). ✔
