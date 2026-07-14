# Upsert & composite unique — for someone strong on frontend

Short notes from the training-plan feature: the first place in Forge where a table is keyed by "one row per (owner, slot)" and writes must be idempotent. The concepts here show up in every CRUD backend eventually.

> Code: `training_plan_days` in `db/schema.ts`, `upsertPlanDay` in `src/features/plan/server/plan.ts`.

## 1. Composite unique constraint

```ts
(t) => [uniqueIndex("training_plan_days_athlete_day_idx").on(t.athleteId, t.dayOfWeek)]
```

A weekly plan has exactly one entry per weekday **per athlete**. Neither column alone is unique — `dayOfWeek = 1` exists for every athlete, and one athlete has seven days. The uniqueness lives in the *pair*. The database enforces it no matter which code path writes (server fn today, import script tomorrow), which turns a class of bugs ("two Tuesday rows, which one wins?") into a loud constraint violation instead of silent data corruption.

Frontend analogy: it's a `Map` keyed by a tuple — `map.set([athleteId, day], value)` replaces rather than appends.

## 2. Three ways to "save or update", and when each is right

| Pattern | How | Used in Forge | Caveat |
|---|---|---|---|
| SELECT-then-INSERT | read, branch in JS | seed's demo athlete (natural-key lookup) | Race: two concurrent writers both see "missing" and both insert. Fine for a one-shot seed, wrong for request handlers |
| `ON CONFLICT DO NOTHING` | insert, silently skip dupes | seed catalogue rows | Loses the new values on conflict — it's "first write wins" |
| `ON CONFLICT DO UPDATE` (upsert) | insert, overwrite on conflict | `upsertPlanDay` | The right tool when the newest edit should win |

The upsert in Drizzle:

```ts
db.insert(trainingPlanDays)
  .values({ athleteId, dayOfWeek, intensity, training, goal })
  .onConflictDoUpdate({
    target: [trainingPlanDays.athleteId, trainingPlanDays.dayOfWeek],
    set: { intensity, training, goal, updatedAt: new Date() },
  });
```

`target` names the constraint columns — Postgres uses it to decide *which* conflict resolves to an update (a table can have several unique constraints). One statement, atomic, race-free: two simultaneous saves of Tuesday can't create two rows; the second simply overwrites the first.

## 3. Why `updatedAt` is set manually

`defaultNow()` fires only on INSERT. Postgres has no `ON UPDATE now()` column option (MySQL does) — the idiomatic choices are a trigger or setting it in application code. Forge sets it in the `set:` clause (and in every `db.update(...)` elsewhere, e.g. `endSession`): one obvious place, no hidden trigger magic, at the cost of remembering to do it. A trigger becomes worth it when many code paths write the same table; for now they don't.

## 4. Aside: `training_plan_days` vs the older `weekly_templates`

The schema already had `weekly_templates` (typed session *slots* — day, time of day, session type — meant for a future template/suggestion engine). The training plan deliberately did NOT reuse it: the plan is the athlete's **free-text notebook** (preserved line breaks, "Rano: interwały…, Wieczór: rehab"), while templates are structured data for machines to match against. Cramming prose into the slots model (or slots into prose) would have made both worse. When the suggestion engine lands, it will *read* both: "your plan says Tuesday is Siła A — want to start from that template?"
