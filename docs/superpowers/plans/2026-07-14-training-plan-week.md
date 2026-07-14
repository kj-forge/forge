# Training Plan: Structured Week — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A structured weekly training plan (PON–ND): each day carries an intensity (HARD/MEDIUM/EASY/RESET), free-text training and an optional goal; edited per-day in a drawer with a serial "fill the week" mode; surfaced on Home as a "Dziś wg planu" card.

> **Approved mockup (KJ, 2026-07-14, plan-wizja-v1):** https://claude.ai/code/artifact/c02e5e99-fb62-47c5-8a03-f137904b38bd — serial drawer entry (Zapisz i dalej → next day, 7 progress bars), Home today-card instead of a 6th tab, sidebar gains "Plan", intensity pills (Hard ember / Medium amber / Easy emerald / Reset blue), free text with preserved line breaks.

**Architecture:** New `training_plan_days` table (athlete-scoped, unique per weekday). New `src/features/plan/` feature folder (runtime-first per ADR-0018). Nav splits into `NAV_ITEMS` (6, sidebar) and `TAB_BAR_ITEMS` (5, mobile bar) — no 6th tab. Weekday helpers move from `features/strength/lib` to `shared/lib` (both features need them).

**Tech Stack:** Drizzle migration + upsert (`onConflictDoUpdate` — first real upsert in the app), RHF + zodResolver + shadcn Form (per always-RHF rule), existing responsive Dialog primitives, bun:test TDD for pure parts.

## Global Constraints

- Verify per commit: `bun run typecheck` + `./node_modules/.bin/biome check` (NOT `bun run lint` — broken local bunx) + `bun test`. After `db:generate`: `bun run format`.
- Commitlint: lowercase subject start. No FRG-14 in code/comments (PR/commit refs only).
- Mobile inputs ≥16px font (iOS zoom). Ember discipline: pills `bg-primary/15 text-primary`, never body text. Lucide icons only.
- All work on this one branch, separate commits, ONE PR at the end.
- Weekday indexing everywhere: 0 = poniedziałek … 6 = niedziela (matches existing `warsawWeekday`).

---

### Task 1: Shared weekday lib (move + extend)

**Files:** Move `src/features/strength/lib/weekday.ts` + `.test.ts` → `src/shared/lib/weekday.ts` + `.test.ts`; update importers (`src/routes/_shell/stats/index.tsx`, `src/features/strength/views/StatsView.tsx`).

**Interfaces (produces):** `WEEKDAY_LABELS_PL` (existing, "PON"…), `WEEKDAY_FULL_PL: readonly string[]` — `["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]`, `warsawWeekday(now?: Date): number` (existing).

- [ ] RED: add `WEEKDAY_FULL_PL` test to the moved test file; run → fail (export missing).
- [ ] GREEN: `git mv` both files to `src/shared/lib/`, add the constant, fix imports. Full suite green.
- [ ] Verify + commit `refactor(shared): weekday helpers shared across features`.

### Task 2: Schema — `training_plan_days`

**Files:** Modify `db/schema.ts`; generate `db/migrations/0007_*.sql`.

```ts
export const planIntensity = pgEnum("plan_intensity", ["HARD", "MEDIUM", "EASY", "RESET"]);

export const trainingPlanDays = pgTable(
  "training_plan_days",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    dayOfWeek: integer().notNull(),
    intensity: planIntensity().notNull(),
    training: text().notNull(),
    goal: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("training_plan_days_athlete_day_idx").on(t.athleteId, t.dayOfWeek)],
);
```

- [ ] Add enum + table. `bun run db:generate` → `bun run format` → `bun run db:migrate` (dev DB).
- [ ] Verify + commit `feat(db): training_plan_days table`.

### Task 3: Plan feature — constants + server fns

**Files:** Create `src/features/plan/constants.ts`, `src/features/plan/types.ts`, `src/features/plan/server/plan.ts`.

**Interfaces (produces):**
- `PLAN_INTENSITIES = ["HARD", "MEDIUM", "EASY", "RESET"] as const`; `PlanIntensity` type.
- `PLAN_INTENSITY_LABEL: Record<PlanIntensity, string>` — Hard/Medium/Easy/Reset.
- `PLAN_INTENSITY_CLASS: Record<PlanIntensity, string>` — pill classes: HARD `bg-primary/15 text-primary`, MEDIUM `bg-amber-500/15 text-amber-600 dark:text-amber-400`, EASY `bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`, RESET `bg-blue-400/15 text-blue-600 dark:text-blue-400`.
- `getTrainingPlan()` → `PlanDay[]` (athlete's rows ordered by dayOfWeek; `PlanDay = { id, dayOfWeek, intensity, training, goal }`).
- `upsertPlanDay({ dayOfWeek: 0-6, intensity, training: string(1..2000), goal?: string(..500) })` — `onConflictDoUpdate` on `(athleteId, dayOfWeek)`, sets `updatedAt: new Date()`, returns the row. Empty-string goal normalised to null.

- [ ] Implement (athlete-scoped via `getCurrentAthleteOrThrow`, zod inputValidator, style of `server/sessions.ts`).
- [ ] Verify + commit `feat(plan): training plan server fns`.

### Task 4: Nav — sidebar Plan link, tab bar stays at five (TDD)

**Files:** Modify `src/shared/lib/nav.ts` + `nav.test.ts`, `src/shared/components/AppShell.tsx`; create route stub `src/routes/_shell/plan/index.tsx` (auth beforeLoad + null component — Task 5 fills it; the stub keeps `Link to="/plan"` typechecking).

**Interfaces (produces):** `NavItem` gains `inTabBar: boolean`; `NAV_ITEMS` = 6 items ordered `/, /sessions, /sessions/new, /stats, /plan, /me` (Plan: label "Plan", icon `CalendarDays`, `inTabBar: false`, before `/me`); `TAB_BAR_ITEMS = NAV_ITEMS.filter((i) => i.inTabBar)` (5); `showsTabBar("/plan")` → true (bar visible, no tab active).

- [ ] RED: tests — NAV_ITEMS six labels incl. "Plan"; TAB_BAR_ITEMS five (no "/plan"); `showsTabBar("/plan")` true, `"/plan/x"` false; `isActivePath("/plan", "/plan")` true.
- [ ] GREEN: nav.ts; AppShell maps `TAB_BAR_ITEMS` (grid stays `grid-cols-5`); AppSidebar keeps `NAV_ITEMS`; route stub.
- [ ] Verify + commit `feat(ui): plan link in sidebar, tab bar unchanged`.

### Task 5: Route + PlanView — 7 day cards

**Files:** Replace stub `src/routes/_shell/plan/index.tsx` (loader `getTrainingPlan`, pendingComponent `SessionListSkeleton`); create `src/features/plan/views/PlanView.tsx`.

- [ ] Route: beforeLoad auth (pattern of `_shell/stats/index.tsx`), loader, component `PlanView`.
- [ ] View: `<main className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">`, h1 "Plan tygodnia". Always render 7 cards (`WEEKDAY_FULL_PL` order): filled → header (uppercase day name + intensity pill), training `whitespace-pre-line text-sm`, goal line (lucide `Target` size-3, muted); missing → dashed "uzupełnij" card. Today (`warsawWeekday()` client-side is fine — view renders post-hydration on the phone) gets ember ring (`border-primary/50 ring-1 ring-primary/30`) + day name `text-primary`; desktop `md:grid md:grid-cols-2 lg:grid-cols-3`? NO — keep single column list on mobile, `md:grid-cols-2` grid (approved desktop mockup shows a grid).
- [ ] Empty state (0 days): Card with text + gradient CTA `Uzupełnij tydzień (PON → ND)` → opens the drawer in serial mode at day 0 (wired fully in Task 6; here the CTA can set the same state).
- [ ] Each card tappable (`button` semantics, `hover:bg-accent`) → opens drawer for that day (state lives in PlanView: `editing: { day: number; serial: boolean } | null`).
- [ ] Verify + dev smoke + commit `feat(plan): plan tygodnia view`.

### Task 6: Day editor drawer + serial "fill the week" mode

**Files:** Create `src/features/plan/lib/plan-day-form.ts` (+ `.test.ts` if any pure logic emerges), `src/features/plan/components/PlanDayDrawer.tsx`; modify `PlanView.tsx` (wire state).

**Form (RHF + zodResolver + shadcn `<Form>`):**
```ts
export const planDayFormSchema = z.object({
  intensity: z.enum(PLAN_INTENSITIES),
  training: z.string().trim().min(1, "Wpisz trening — choćby „Wolne”.").max(2000),
  goal: z.string().trim().max(500).optional(),
});
```

- [ ] Drawer body (conditional-mount like `ExerciseDrawer` so defaults re-seed per open): title = full day name; serial mode adds 7 progress bars (`bg-primary` for days ≤ current index) + subtitle `uzupełniasz tydzień · dzień N z 7`.
- [ ] Fields: intensity chips (4, gradient-active like kind chips, one tap), `Textarea` Trening (autofocus, `text-base` ≥16px, rows≈4), Textarea Cel (optional, rows 2). shadcn `textarea` is NOT installed yet — `yes n | bun x --bun shadcn@latest add textarea` (research-first: confirm against ui.shadcn.com; no overwrites).
- [ ] Submit: `upsertPlanDay` → `router.invalidate()`. Serial: primary button `Zapisz i dalej → {next full day name}` advances `editing.day + 1` (after ND → close); ghost `Zapisz i zamknij`. Non-serial: single `Zapisz` (bg-ember). Server error → `FormRootMessage`.
- [ ] Prefill when the day exists (defaultValues from loader data); new day defaults `intensity: "MEDIUM"`.
- [ ] Verify + dev smoke (fill a week end-to-end) + commit `feat(plan): day editor drawer with serial week fill`.

### Task 7: Home — „Dziś wg planu" card

**Files:** Modify `src/routes/_shell/index.tsx` (loader → `Promise.all([listRecentSessions(), getTrainingPlan()])`), `src/features/strength/views/HomeView.tsx`; create `src/features/plan/components/TodayPlanCard.tsx`.

- [ ] Loader returns `{ sessions, plan }`; HomeView adapts (`route.useLoaderData()` shape change).
- [ ] `TodayPlanCard({ plan })`: today = `warsawWeekday()`; if plan empty → dashed teaser `Ustaw plan tygodnia →` (Link to `/plan`); if today missing → muted "Brak planu na dziś" + link; else ember-tinted card (approved mockup): kicker `CalendarDays` + „Dziś wg planu", day name + pill, training (`whitespace-pre-line`, clamp ~3 lines `line-clamp-3`), goal muted. Whole card = Link to `/plan`.
- [ ] Verify + commit `feat(plan): dziś wg planu card on home`.

### Task 8: Docs + handoff

- [ ] `docs/learning/upsert-and-composite-unique.md` — short: composite unique constraint, INSERT…ON CONFLICT DO UPDATE vs DO NOTHING (seed) vs SELECT-then-INSERT (race), why updatedAt is set manually. Index it in `docs/learning/README.md`.
- [ ] Update this plan's checkboxes; commit `docs: training plan learning notes`.
- [ ] KJ visual pass (both themes, iPhone, fill-the-week flow) → push → PR (`Closes FRG-14`) → promote via PR.

## Self-Review

- Ticket coverage: schema (T2), 7-day view + intensity pills + preserved line breaks + today highlight (T5), per-day drawer ≤2 taps (T6), Home today card (T7), nav decision resolved = sidebar + home card (T4), acceptance (<5 min week fill = serial mode, Europe/Warsaw = shared warsawWeekday) mapped. ✔
- Out of scope honored: no plan↔template engine, single plan, no sharing. ✔
- Type consistency: `PlanDay` produced by T3, consumed T5–T7; `editing` state shape shared T5/T6. ✔
