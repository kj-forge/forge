# Database concepts — for the frontend developer

> Reference notes on backend/DB concepts that show up in [`db/schema.ts`](../../db/schema.ts), the ADRs, and PR reviews. Each concept has a frontend analogy and a real example from Forge.

---

## 1. Primary key (PK) — "the row's ID"

**What it is.** A column (or combination of columns) that uniquely identifies a row. Postgres enforces that the value can't be `NULL` and can't repeat in the table.

**Why it matters.**
- It's how you address a row: `UPDATE … WHERE id = X`.
- It's the target of every foreign key from other tables.
- Without one, Postgres still works, but updating a specific row gets clunky.

**Frontend analogy.** It's the `key` prop on a React list:

```tsx
{items.map(item => <Item key={item.id} {...item} />)}
```

Without `key`, React gets confused on reorder. Without a PK, the DB gets confused on update.

**Our choice: UUID over auto-increment integer.**

| | UUID | Auto-incrementing integer |
|---|---|---|
| Generate client-side | ✅ | ❌ (must ask DB first) |
| Info leak | ❌ Opaque | ⚠️ `/users/4234` tells everyone we have ~4000 users |
| Multi-instance / branches | ✅ Mergeable | ❌ Conflicts |
| Size | 16 bytes | 4–8 bytes |

We pay a few microseconds per row for UUIDs and get a lot of flexibility (client-side generation matters for the offline-first Electric SQL sync that's planned in P1).

**In Drizzle:**

```ts
id: uuid().primaryKey().defaultRandom()
//          ↑ marks this column as the PK
//                       ↑ Postgres generates a UUID on INSERT
```

---

## 2. Foreign key (FK) — "a link to another row"

**What it is.** A column whose value MUST exist as a primary key in another table. The database enforces this — you can't insert a `session` with `athlete_id = 'xyz'` if no athlete `xyz` exists.

**Why it matters.**
- It encodes relationships at the database level, not just in your head.
- It protects you from orphan rows (a session whose athlete vanished, or a set whose movement got deleted).
- It drives [cascades](#5-cascades--what-happens-when-you-delete-a-parent) — what happens to children when the parent is deleted.

**Frontend analogy.** TypeScript prop types across components. `<UserCard user={...} />` — TS enforces that `user` is the right shape. Foreign keys are the same idea, except they're enforced by Postgres at runtime instead of by TS at compile time.

**Visual:**

```
Table sessions:                Table athletes:
┌────────────────────┐         ┌─────────────────┐
│ id  │ athlete_id   │         │ id              │
│ s1  │ a1           │ ──FK──► │ a1              │
│ s2  │ a1           │ ──FK──► │ a1              │
│ s3  │ a2           │ ──FK──► │ a2              │
└────────────────────┘         └─────────────────┘
       ↑                              ↑
       Foreign key                    Primary key
```

**In Drizzle:**

```ts
athleteId: uuid()
  .notNull()
  .references(() => athletes.id, { onDelete: "cascade" })
//             ↑ points at athletes.id
//                                ↑ when an athlete is deleted, this row goes too
```

---

## 3. Constraints — column-level rules

| Constraint | What it enforces |
|---|---|
| `NOT NULL` | The column must have a value. |
| `UNIQUE` | The value must be unique across the table (or across a column combination). |
| `CHECK (predicate)` | A custom rule, e.g. `CHECK (rpe BETWEEN 1 AND 10)`. |
| `DEFAULT value` | What to insert if the caller doesn't supply one. |

**Frontend analogy.** Zod schemas at API boundaries:

```ts
z.object({
  email: z.string().email(),       // ≈ TEXT NOT NULL + format check
  rpe: z.number().min(1).max(10).optional(),  // ≈ INTEGER CHECK(1..10), nullable
})
```

Postgres is essentially runtime Zod for whatever lands in the database. If a bug, attacker, or manual SQL tries to insert garbage, Postgres refuses.

**In Drizzle:**

```ts
email: text().notNull().unique()
rpe: smallint()                // nullable (no .notNull() call)
createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
```

---

## 4. Indexes — "shortcuts for lookups"

**The problem.** Without an index, a query like

```sql
SELECT * FROM sessions
WHERE athlete_id = 'abc'
ORDER BY created_at DESC
LIMIT 50;
```

forces Postgres to scan **every row** in `sessions`, check the condition, sort the matches, and take the top 50. At 1,000 rows this is 5 ms. At 1 million rows it's 5 seconds. At 100 million it times out.

**What an index does.** Postgres maintains a parallel data structure (usually a B-tree) with the indexed values sorted and pointers back to the rows. Lookups become `O(log n)` instead of `O(n)`.

**Frontend analogy.** Adding a `Map<id, item>` next to your `Array<item>`. `array.find(x => x.id === id)` is `O(n)`. `map.get(id)` is roughly `O(1)`. The Map costs memory and has to stay in sync on writes — same trade-off as a DB index.

**Trade-offs.**
- ✅ Reads become much faster on indexed columns.
- ❌ Writes get slower (every INSERT/UPDATE has to update the indexes too).
- ❌ Indexes take disk space.

**Rule of thumb.** Index columns that you frequently filter on (`WHERE`), join on, or sort by. Don't pre-index "just in case."

**Our convention for Forge.** Almost every owned table has an index on `(athleteId, createdAt DESC)`, because "show me this athlete's recent X" is the dominant query pattern. Catalog tables (exercises, hyrox_stations) get unique indexes on `slug`.

**In Drizzle:**

```ts
export const sessions = pgTable(
  "sessions",
  { /* columns */ },
  (t) => [
    index("sessions_athlete_date_idx").on(t.athleteId, t.date.desc()),
  ],
);
```

---

## 5. Cascades — what happens when you delete a parent

**The scenario.** An athlete asks for their data to be deleted (GDPR Article 17, right to erasure). They have 500 sessions, 2000 sets, 50 pain check-ins, a journal, injuries, etc. What does `DELETE FROM athletes WHERE id = X` do to all that?

**Four answers, picked per foreign key:**

| `ON DELETE …` | What happens |
|---|---|
| `CASCADE` | Delete all the dependent rows too. The athlete's data goes with them. |
| `RESTRICT` (default) | Refuse the delete. "Can't drop the athlete — they still have sessions." |
| `SET NULL` | Keep the dependent rows but null out their FK. Requires the column to be nullable. |
| `NO ACTION` | Like `RESTRICT`, but checked at transaction commit instead of immediately. |

**Forge picks:**

- Delete an athlete → **CASCADE** their owned data (sessions, sets, daily_metrics, pain_checkins, journal). "Delete me" should actually delete everything that's mine.
- Delete a session → **CASCADE** its blocks, movements, sets, cardio segments.
- Delete a coach → **SET NULL** on `athlete_coach_links` (the coach is gone, but the historical link record stays).
- Delete an exercise → **RESTRICT**! You don't want to lose 500 sets because someone accidentally dropped "back squat" from the catalogue. Force the deleter to migrate those sets first.

**In Drizzle:**

```ts
athleteId:  uuid().notNull().references(() => athletes.id,  { onDelete: "cascade" })
exerciseId: uuid().notNull().references(() => exercises.id, { onDelete: "restrict" })
coachId:    uuid()         .references(() => coaches.id,   { onDelete: "set null" })  // nullable
```

The default in Drizzle if you omit `onDelete` is `NO ACTION` (≈ `RESTRICT`). [ADR-0012](../adr/ADR-0012-drizzle-conventions.md) makes the rule explicit: **always set `onDelete`**.

---

## 6. Native enums vs. text + check

When you have a column that should only ever hold a fixed set of values (e.g., `session_type` can only be `STRENGTH`, `HYROX_EMOM`, `REHAB`, etc.), there are two ways to model it:

**A — Postgres native enum:**

```sql
CREATE TYPE session_type AS ENUM ('STRENGTH', 'HYROX_EMOM', 'REHAB');
CREATE TABLE sessions (type session_type NOT NULL);
```

**B — Text + CHECK constraint:**

```sql
CREATE TABLE sessions (
  type TEXT NOT NULL CHECK (type IN ('STRENGTH', 'HYROX_EMOM', 'REHAB'))
);
```

| Aspect | Native enum | Text + CHECK |
|---|---|---|
| Type safety at SQL level | ✅ Strong | ⚠️ Constraint only |
| ORM support | ✅ First-class in Drizzle | ⚠️ Manual |
| Storage | 4 bytes | The full string (10–30 bytes) |
| Add a new value | `ALTER TYPE ... ADD VALUE` — atomic | UPDATE the constraint |
| Remove a value | **Hard** (data migration) | Easy |

**Frontend analogy.**

```ts
type SessionType = 'STRENGTH' | 'HYROX_EMOM' | 'REHAB';  // ≈ native enum
type SessionType = string;                                // ≈ text + runtime check
```

Native enum is the TS union; text+check is `string` with a runtime guard.

**Forge uses native enums** everywhere a value set is fixed. The fact that values can't be retroactively removed is a *feature* — once an enum value has touched a row anywhere, it must stay supported. That's exactly the semantics we want for historical session types, race divisions, etc.

**In Drizzle:**

```ts
export const sessionType = pgEnum("session_type", [
  "STRENGTH", "HYROX_EMOM", "HYROX_AMRAP", "HYROX_WORK",
  "CARDIO", "COMPROMISED_RUN", "REHAB", "MOBILITY",
]);

// In a table:
type: sessionType().notNull()
```

---

## 7. JSONB — "structured-but-flexible columns"

**What it is.** A Postgres column type that stores JSON as binary, indexable, queryable.

**When to use it.** When the data is genuinely variable in shape — one row has an array of 3 things, another row has 8 — and you don't want to invent a separate table just to model that. Examples in Forge:

| Column | Shape | Why JSONB |
|---|---|---|
| `exercises.aliases` | `["siady", "przysiady", "back squat", "BS"]` | Variable length list of strings; pointless to make an `exercise_aliases` table |
| `progression_rules.config` | `{ topReps: 5, backoffSets: 2, ... }` per rule kind | Different rules need different fields |
| `weekly_summaries.content` | Nested AI-generated content blocks | Pure presentation data |
| `injury_events.attachments` | `[{ kind, url, label }, ...]` | Variable list of structured items |

**When NOT to use it.** When the fields are stable and well-typed (e.g., a user's email) — use regular columns. They're faster, indexable on each field, and visible in `\d table` output.

**Frontend analogy.** It's the difference between a TS interface (rigid columns) and `Record<string, unknown>` / a discriminated union (jsonb). Both have their place.

**In Drizzle:** wire the TS shape through `$type<>()`:

```ts
aliases: jsonb().$type<string[]>().notNull().default([])
//                ↑ Drizzle propagates the type to your reads
```

Without `$type<>()`, you'd read back `unknown` and have to assert your way through it. The cast is free at runtime; it just makes TS strict.

---

## 8. `timestamptz` — always use this

Two timestamp types in Postgres:

| Type | What it stores |
|---|---|
| `timestamp` (no tz) | Date + time, with **no record of timezone**. A user in LA writing "12:00" and a user in Warsaw reading "12:00" see the same string but they don't mean the same moment in time. Bug magnet. |
| `timestamptz` | Stores a moment in time. Internally always UTC. On write, converts from the caller's timezone; on read, displays in the caller's timezone. Safe. |

**Rule:** use `timestamptz` for anything that represents a real moment in time (`created_at`, `recorded_at`, `last_login_at`). Use `date` for things that are inherently calendar-only with no time component (a `target_date` on a goal, a `day` on a daily metrics row).

**In Drizzle:**

```ts
createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
//                     ↑ critical — leaves this off and you've shipped a bug
```

---

## 9. No soft delete — why Forge uses real `DELETE`

**The pattern.** Instead of `DELETE FROM x WHERE id = ...`, you add a `deleted_at` column and run `UPDATE x SET deleted_at = NOW() WHERE id = ...`. The row physically stays in the table; every query has to remember `WHERE deleted_at IS NULL` to filter it out.

**Why people do it.** Easy undo. Preserved history.

**Why Forge doesn't.**

- Every query must remember to filter `WHERE deleted_at IS NULL`. Forget once → leak another athlete's "deleted" data.
- Foreign keys see deleted rows as live; you can end up with a deleted athlete still being a coach in `athlete_coach_links`.
- GDPR right-to-erasure needs the data **actually gone**, not soft-deleted with a flag.
- "History" is what `audit_log` is for, and that's a much stronger guarantee — an immutable, append-only trail decoupled from the live tables.

We pay the cost of "no built-in undo" and use real `DELETE` + `audit_log` instead. See [ADR-0012](../adr/ADR-0012-drizzle-conventions.md) and [ADR-0013](../adr/ADR-0013-monetization-ready-schema.md).

---

## 10. Denormalization (`athlete_id` everywhere) — what and why

**Pure relational textbook (3NF).** Each fact lives in one place. To find the athlete who owns a particular `sets` row, you join your way up:

```
sets → block_movements → session_blocks → sessions → athletes
```

Clean. Slow when you do it for every analytics query. And awkward when you want to express "the athlete owns this row" as a single column.

**Denormalization.** Copy `athlete_id` to every child row at insert time. Each row knows directly who it belongs to.

```
sets.blockMovementId → block_movements.id   (relation preserved)
sets.athleteId       → athletes.id          (denormalized — duplicate of sessions.athleteId)
```

**Frontend analogy.** Redux state shape:

```ts
// Normalized (3NF-like):
posts: { p1: { id: 'p1', userId: 'u1', text: '...' } }
users: { u1: { id: 'u1', name: 'Krzysztof' } }

// Denormalized:
posts: { p1: { id: 'p1', userId: 'u1', userName: 'Krzysztof', text: '...' } }
```

The denormalized shape duplicates `userName`. It costs a few bytes per post but means rendering doesn't need a `users[post.userId]` lookup.

**Why Forge does this on every owned row** (per [ADR-0010](../adr/ADR-0010-multi-tenant-schema.md) and [ADR-0012](../adr/ADR-0012-drizzle-conventions.md)):

1. **Performance on common queries.** "Show me all sets for athlete X" is a single `WHERE athlete_id = X` + index hit, instead of a 3-table join.
2. **Electric SQL local-first sync (P1).** Electric scopes its sync shapes by row. With `athlete_id` directly on each row, the scope is trivial: "sync rows where athlete_id matches the logged-in athlete." Without denormalization, every shape needs a join, which Electric supports but with a lot more complexity.
3. **Row-level security (future).** If we add Postgres RLS policies, "athletes see only their own data" becomes a one-line policy per table. Without `athlete_id` on the row, the policy needs joins.
4. **Defense in depth.** A bug in the app layer that leaks data across athletes is easier to catch when every row carries the owner — a missing `WHERE athlete_id = ?` is obvious in code review.
5. **Audit / export simplicity.** "Give me everything for this athlete" is one query per table; no multi-hop traversal.

**Cost.** ~16 bytes (one UUID) per child row. At one million sessions with maybe ten million child rows, that's ~160 MB across the schema. Cheap.

**Risk of inconsistency.** In theory, denormalized data can drift from the source — what if a session's `athlete_id` changes? In Forge it can't: sessions are immutable per athlete, so children never need to be re-stamped. The denormalization is stable for our access patterns.

---

## Quick reference card

| Concept | Forge convention |
|---|---|
| Primary key | `uuid().primaryKey().defaultRandom()` |
| Foreign key | `.references(() => other.id, { onDelete: "..." })` — **always** specify `onDelete` |
| Required field | `.notNull()` |
| Default | `.default(value)` or `.defaultNow()` for timestamps |
| Unique | `.unique()` for column-level, `uniqueIndex("name").on(col)` for explicit naming |
| Timestamp | `timestamp({ withTimezone: true })` — never bare `timestamp()` |
| Calendar date | `date()` |
| Enum | `pgEnum("snake_case_name", ["VALUE_1", "VALUE_2"])` |
| Loose JSON | `jsonb().$type<MyShape>()` |
| Index | `index("name").on(col1, col2.desc())` in the third arg of `pgTable` |
| Multi-tenant | `athlete_id` denormalized on every owned table, `onDelete: "cascade"` |
| Soft delete | **never** — use real `DELETE` + `audit_log` |
