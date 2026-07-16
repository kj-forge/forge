# Per-user catalogues: copy-on-provision, partial unique indexes, and flags over constants

The story of how `exercises` went from a shared read-only reference table to a personal, editable catalogue per athlete ([ADR-0020](../adr/ADR-0020-per-user-exercise-catalogue.md)) — and the four database techniques that made it a small change instead of a rewrite.

## 1. The problem: shared reference data that users want to edit

Until now `exercises` was like an npm package: one global copy, everybody imports it, nobody edits it in place. That works exactly as long as nobody needs to edit it. The moment one athlete wants to rename "Martwy ciąg", add a belt squat, or mark OHP as a main lift for *their* PR table, a shared table gives you two bad options: let the edit leak into everyone else's history, or forbid editing entirely.

There are three standard ways out:

| Model | Idea | Where it hurts |
|---|---|---|
| **Overlay** | Keep the global table; store per-user additions/overrides in a second table; merge at read time | Every read becomes `global ∪ mine − overridden`. Every join has to ask "whose row is this?". Complexity is permanent and lives in the hot path. |
| **Free-for-all** | Let anyone edit the shared rows | One user's rename rewrites another user's history. Non-starter in anything multi-tenant. |
| **Copy-on-provision** | On signup, copy the whole catalogue to the new user; they edit their own copy | Row duplication (~33 rows/athlete — storage-trivial) and a one-time migration for existing users. Complexity is paid once, at write time. |

Forge picked copy-on-provision. The frontend analogy: instead of patching a shared component library at runtime (overlay), you *fork the repo* — after the fork, everything is ordinary code you own, and ordinary tools work on it. After provisioning, an athlete's exercises behave exactly like their sessions or goals: rows scoped by `athlete_id = me`, ordinary INSERT/UPDATE/DELETE with ordinary ownership checks (ADR-0010's owned-row invariant).

## 2. `NULL` as a namespace: templates live in the same table

The templates didn't move to a separate table. They stayed in `exercises` with `athlete_id IS NULL`:

```ts
// db/schema.ts (exercises)
athleteId: uuid().references(() => athletes.id, { onDelete: "cascade" }),  // NULL = global template
sourceExerciseId: uuid().references((): AnyPgColumn => exercises.id, { onDelete: "set null" }),
```

- `athlete_id IS NULL` → a **starter template**: maintained by seed, never shown in the app, only used as copy material at signup.
- `athlete_id = <uuid>` → an **owned copy** (or a custom exercise the athlete created from scratch).
- `source_exercise_id` records lineage — which template a copy came from. It's what the one-time migration used to repoint history, and it's `SET NULL` on delete so removing a template never breaks copies.

Two details worth noticing:

**The self-referencing foreign key.** `source_exercise_id` points at the same table it lives in. In SQL that's unremarkable; in Drizzle it trips TypeScript's circular-inference limit, so the callback needs an explicit return type — the `(): AnyPgColumn =>` above. Same idea as annotating a recursive function's return type when inference gives up.

**Why keep templates in the same table?** Because the copy is `INSERT INTO exercises ... SELECT ... FROM exercises` — same columns, same types, no mapping layer. A separate `exercise_templates` table would duplicate the entire column list and drift over time.

## 3. Partial unique indexes: one table, two uniqueness regimes

The old schema had a global `UNIQUE (slug)`. That's exactly wrong now: every athlete's copy of `przysiad-ze-sztanga` would collide. But dropping uniqueness entirely invites duplicates *within* one athlete's catalogue.

The fix is a **partial unique index** — a unique constraint that only applies to rows matching a `WHERE` clause:

```ts
// db/schema.ts (exercises, table config)
uniqueIndex("exercises_template_slug_uq").on(t.slug).where(sql`${t.athleteId} IS NULL`),
uniqueIndex("exercises_athlete_slug_uq").on(t.athleteId, t.slug).where(sql`${t.athleteId} IS NOT NULL`),
```

Which generates:

```sql
CREATE UNIQUE INDEX "exercises_template_slug_uq" ON "exercises" (slug) WHERE athlete_id IS NULL;
CREATE UNIQUE INDEX "exercises_athlete_slug_uq" ON "exercises" (athlete_id, slug) WHERE athlete_id IS NOT NULL;
```

Read them as two namespaces: templates are unique by `slug` among themselves; owned rows are unique by `(athlete_id, slug)` — the same slug can exist once per athlete. (A plain composite `UNIQUE (athlete_id, slug)` wouldn't cover the templates: in Postgres `NULL` never equals `NULL`, so all template rows would pass the constraint no matter how many share a slug. See [upsert-and-composite-unique.md](upsert-and-composite-unique.md) for composite uniques generally.)

The quiet consequence: **a slug is no longer a global identifier.** Before, `slug = 'martwy-ciag'` meant one specific row; now it means "some row, in whichever namespace you're looking at". All lookups moved to `id`, or to `(athlete_id, slug)` for the stats deep-links (`/stats/martwy-ciag` resolves within *your* catalogue). Slugs also deliberately don't change on rename — your `/stats/...` bookmarks survive an exercise rename.

## 4. `INSERT ... SELECT`: copying rows without ever leaving the database

Both the signup provisioning and the one-time migration use the same SQL shape — `INSERT ... SELECT`, which copies rows *inside* Postgres in one statement:

```sql
-- signup hook (step 4 of runSignupTransaction), simplified
INSERT INTO exercises (athlete_id, source_exercise_id, slug, name_pl, ...)
SELECT $newAthleteId, e.id, e.slug, e.name_pl, ...
FROM exercises e
WHERE e.athlete_id IS NULL;
```

No round-trip of 33 rows to the app server and back, no loop, one statement, atomic — and because it runs inside the signup transaction, a failed signup provisions nothing (see [server-functions.md](server-functions.md) for the transaction story).

The migration for existing athletes (`db/migrations/0010_*.sql`) does the same copy for *every* athlete (`CROSS JOIN` of athletes × templates), then **repoints history** — three tables hold FKs into `exercises`, and all of them pointed at the global rows:

```sql
UPDATE block_movements bm
SET exercise_id = own.id
FROM exercises own
WHERE own.athlete_id = bm.athlete_id
  AND own.source_exercise_id = bm.exercise_id;
-- same shape for goals and training_plan_day_exercises
```

Read it as: "for each logged movement, find the row this athlete *owns* whose lineage points at the template the movement currently references, and swap the FK to it." `UPDATE ... FROM` is Postgres's join-in-an-update; `source_exercise_id` is the join key that makes the repoint possible at all.

This is the expand-then-contract pattern from [deploy-and-environments.md](deploy-and-environments.md) in miniature: add the new columns, copy data, repoint — old rows (templates) stay, nothing is dropped, and the migration was rehearsed on dev before touching prod.

## 5. Flags on rows, not constants in code

Before FRG-18, product behaviour hung off hardcoded slug lists in `strength/constants.ts`:

```ts
// gone after FRG-18
export const PR_TABLE_SLUG_ORDER = ["przysiad-ze-sztanga", "martwy-ciag", ...];
export const LOADED_BW_SLUGS = ["pull-up", "dip"];
```

Those constants encode an assumption — *every athlete's catalogue is spelled identically, forever* — which per-user editing breaks by definition. Rename `pull-up` and the e1RM suppression silently stops matching; the bug wouldn't throw, it would just quietly compute nonsense.

The replacement: behaviour moves onto **columns of the row itself**.

| Was (code constant) | Now (per-row column) | Drives |
|---|---|---|
| main-lift slug list + order | `is_main_lift` (user-editable) | PR table membership, dashboard trend |
| `LOADED_BW_SLUGS` | `is_loaded_bodyweight` | `+kg` display, e1RM suppression ([estimated-1rm-and-pr-detection.md](estimated-1rm-and-pr-detection.md)) |
| canonical slug ordering | `ORDER BY is_main_lift DESC, name_pl` (Polish collation via `localeCompare(..., "pl")`) | PR table ordering |

The general lesson: **when data becomes user-editable, any behaviour keyed on its *content* must move into the data.** Code constants are fine for closed sets the user can't touch (set kinds, weekdays); they're a trap for anything the user can rename.

## 6. Archive, not delete — a deliberate exception to "no soft delete"

[database-concepts.md §9](database-concepts.md#9-no-soft-delete--why-forge-uses-real-delete) argues Forge should use real `DELETE`, and that still holds as the default. Exercises got an `is_archived` flag anyway — because here a hard delete is *impossible*, not merely risky: `block_movements.exercise_id` and `training_plan_day_exercises.exercise_id` are `RESTRICT` FKs, so Postgres refuses to delete an exercise with logged history (on purpose — history must keep its labels).

So `deleteExercise` checks usage first:

- **No history, not in any plan** → real `DELETE`. The row vanishes; §9 logic applies.
- **Used anywhere** → `UPDATE ... SET is_archived = true`. The row stays (history keeps working), but every catalogue read filters it out, so it disappears from search, pickers, and the PR table. A restore path un-archives it.

The difference from the soft-delete anti-pattern: `is_archived` isn't pretending to be deletion. It's a *visibility* flag on a row that must exist, the filter lives in a handful of catalogue queries rather than "every query in the app", and GDPR erasure is untouched — deleting the *athlete* cascades the whole catalogue for real.

## 7. Where to look in the code

| What | Where |
|---|---|
| Schema: nullable `athleteId`, lineage FK, partial unique indexes | `db/schema.ts` (exercises) |
| One-time copy + repoint migration | `db/migrations/0010_exotic_william_stryker.sql` |
| Signup provisioning (step 4 of the transaction) | `src/features/auth/server/signup-hook.ts` |
| CRUD + archive-or-delete + slug collision suffixing | `src/features/strength/server/exercises.ts` |
| Slugify with Polish diacritics (TDD) | `src/features/strength/lib/slugify.ts` + test |
| Flag-driven PR table / trend / e1RM suppression | `src/features/strength/server/queries.ts`, `src/features/dashboard/server/dashboard.ts` |
| Management UI + inline create in the picker | `src/features/strength/views/ExercisesView.tsx`, `components/ExerciseEditorDrawer.tsx`, `components/ExercisePickerDrawer.tsx` |
