# Server functions deep dive — for someone strong on frontend

How TanStack Start's `createServerFn` actually works, the patterns that emerged in `src/lib/strength.ts` and `src/lib/auth-signup.ts`, the gotchas we hit (and one bug we shipped), and the React 19 anti-patterns we replaced with idiomatic alternatives.

> Sibling docs: [`auth-concepts.md`](auth-concepts.md) for the auth flow itself, [`database-concepts.md`](database-concepts.md) for the schema primitives.

## 1. What a server function actually is

A `createServerFn` declaration is **two things** in one block:

```ts
export const addSet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => addSetInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    // ...DB writes
    return row;
  });
```

On the **server**, this is a function with a handler. TanStack Start auto-generates an HTTP endpoint (something like `POST /_server/strength_addSet`).

On the **client**, when you do `import { addSet } from "@/lib/strength"`, the bundler **rewrites the import** so what reaches the browser is a stub — a thin `fetch()` wrapper that calls the server endpoint. The handler body, and any modules it transitively imports, never reach the browser bundle.

That last sentence is the whole architecture. Almost every gotcha in this doc comes from a moment when that boundary leaked.

## 2. The builder pattern, stage by stage

`createServerFn({…}).inputValidator(…).handler(…)` is method chaining. Each call returns a new builder with one more capability attached. You can stop at any stage:

| Stage | What it does | When to skip |
|---|---|---|
| `createServerFn({ method })` | Picks GET vs POST. GET caches better; POST signals side-effects. | Never skip. Method matters for HTTP semantics + client cache behaviour. |
| `.inputValidator(fn)` | Validates incoming `data` from the client before the handler sees it. Throws → 400 to client. | Only skip if the fn truly takes no input (reads only). |
| `.handler(async ({ data }) => …)` | The actual logic. `data` is typed by the validator's return type. | Required. |

```ts
// Validator-less GET (no input):
export const listRecentSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return db.select(…).from(sessions).where(eq(sessions.athleteId, athleteId)).limit(10);
});
```

The return value of the handler is what the client receives, type-safe end-to-end. No DTOs to maintain.

## 3. Validation at the boundary — Zod

Every mutation server fn validates the client payload with Zod:

```ts
const addSetInput = z.object({
  blockMovementId: z.uuid(),
  reps: z.int().min(0).max(1000).optional(),
  weightKg: z.number().min(0).max(1000).optional(),
  rpe: z.int().min(1).max(10).optional(),
  kind: z.enum(["WARMUP","TOP_SET","WORK","BACK_OFF","FAILURE","DROP_SET"]).default("WORK"),
  notes: z.string().max(500).optional(),
});

export const addSet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => addSetInput.parse(data))
  .handler(async ({ data }) => { /* data is typed from the schema */ });
```

Why every server fn does this:

- **Without** Zod a malicious client could send `weightKg: -999999`, `reps: "5kg jasne"` (string instead of number), or a 10 MB `notes` body. The DB layer probably catches some of it; some leaks through.
- **With** Zod the handler never sees bad shapes. The boundary is one place to look when reasoning about "what payload reaches the DB?".

`z.uuid()`, `z.int()`, `z.enum(...)` are all top-level Zod 4 constructors (the older `z.string().uuid()` etc. are deprecated — see [`docs/learning/auth-concepts.md`](auth-concepts.md) §"Zod 4 idioms").

## 4. Auth per fn — no middleware

TanStack Start has no Express-style middleware ("auth check runs before every endpoint"). Every server fn is its own entry point. So every fn that touches per-user data starts with the same line:

```ts
async function getCurrentAthleteOrThrow(): Promise<CurrentAthlete> {
  const headers = new Headers(getRequestHeaders() as HeadersInit);
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error("Unauthorized — no active session");

  const [athlete] = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(eq(athletes.userId, session.user.id))
    .limit(1);
  if (!athlete) throw new Error("No athlete row for this user — signup hook may have failed");

  return { athleteId: athlete.id, userId: session.user.id };
}
```

Used in every read and every write:

```ts
.handler(async ({ data }) => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  // …everything from here on uses athleteId in WHERE / VALUES
});
```

Two reasons we don't extract into a "middleware":

1. **Explicitness wins for security-critical code.** If you read `addSet`'s handler you can see in line 1 "this requires auth". A wrapped `withAuth(...)` HOC hides that under abstraction.
2. **TypeScript types stay clean.** `.inputValidator(...).handler(...)` is a fluent builder with full inference. Wrapping it generically (`withAuth(createServerFn(...))`) tends to either lose inference or require painful generic constraints.

Cost: 2-3 DB queries per server fn call (~100 ms on Neon HTTP). Acceptable for MVP. Optimisation path when needed: cache `athleteId` in the session cookie next to the session token, so only one read.

## 5. Multi-tenant ownership check — the most important pattern

Defense-in-depth: every read and write filters by the current athlete's ID inside the SQL `WHERE`. The auth check above proves "who's calling"; the WHERE clause proves "what they're allowed to see/modify".

```ts
// In a READ:
.where(and(
  eq(sessions.id, data.sessionId),
  eq(sessions.athleteId, athleteId),     // ← essential
))

// In an UPDATE:
.where(and(
  eq(sessions.id, data.sessionId),
  eq(sessions.athleteId, athleteId),     // ← essential
  isNull(sessions.endedAt),
))
.returning({ id: sessions.id });

// In a DELETE:
.where(and(
  eq(sets.id, data.setId),
  eq(sets.athleteId, athleteId),         // ← essential
))
.returning({ id: sets.id });
```

If the client sends a `sessionId` or `setId` belonging to another athlete, the WHERE matches zero rows. `.returning(...)` comes back as `[]`. The handler then explicitly checks `if (!row) throw new Error("Not found or not owned")` and surfaces the error.

This is OWASP Top 10 #1 (Broken Access Control) defence. Drizzle's parameterised SQL protects against injection; the `athleteId` filter is what protects against IDOR (Insecure Direct Object Reference).

The schema enforces this at the table level too (`athleteId NOT NULL` on every owned table, per [ADR-0010](../adr/ADR-0010-multi-tenant-schema.md)), but the WHERE-clause filter is the one that catches "you can't touch this row" at query time.

## 6. Drizzle patterns we use

### Select, where, join

```ts
db
  .select({                                       // partial projection — only the columns we need
    id: sessions.id,
    date: sessions.date,
    type: sessions.type,
  })
  .from(sessions)
  .where(eq(sessions.athleteId, athleteId))       // type-safe — column type must match value
  .orderBy(desc(sessions.date))
  .limit(10);
```

### Joins

```ts
db
  .select({…})
  .from(sets)
  .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
  .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
  .innerJoin(sessions, eq(sessionBlocks.sessionId, sessions.id))
  .where(and(
    eq(sets.athleteId, athleteId),
    eq(blockMovements.exerciseId, exerciseId),
    sql`${sessions.endedAt} IS NOT NULL`,
  ))
  .orderBy(desc(sets.createdAt))
  .limit(20);
```

### Raw SQL fragments — when there's no Drizzle helper

```ts
sql`EXTRACT(DOW FROM ${sessions.date}) = ${data.dayOfWeek}`
sql<number>`COALESCE(MAX(${sets.setNumber}), 0) + 1`
sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${exercises.aliases}) AS alias WHERE alias ILIKE ${pattern})`
```

`${expr}` inside a `sql\`...\`` template **is not** string interpolation — Drizzle parses it and emits the value as a parameterised query parameter. There is no SQL injection risk.

### Insert with `.returning()`

```ts
const [row] = await db
  .insert(sets)
  .values({ athleteId, blockMovementId, setNumber, reps, weightKg, rpe, kind })
  .returning();
```

Postgres-specific. Saves an extra SELECT after INSERT to fetch the new row's id/timestamps.

### Group by + aggregates

```ts
db.select({
    id: exercises.id,
    namePl: exercises.namePl,
    lastUsed: sql<Date>`MAX(${blockMovements.createdAt})`.as("last_used"),
  })
  .from(blockMovements)
  .innerJoin(exercises, eq(blockMovements.exerciseId, exercises.id))
  .where(eq(blockMovements.athleteId, athleteId))
  .groupBy(exercises.id, exercises.slug, exercises.namePl, exercises.category)
  .orderBy(desc(sql`MAX(${blockMovements.createdAt})`))
  .limit(10);
```

## 7. Atomic transactions — when to reach for `dbPool`

Two DB clients live in Forge:

| Client | Driver | Multi-statement transactions | Where it lives |
|---|---|---|---|
| `db` | `@neondatabase/serverless` HTTP | ❌ No | `db/client.ts` — default for everything |
| `dbPool` | `@neondatabase/serverless` WebSocket Pool | ✅ Yes | `db/pool.ts` — atomic ops only |

The HTTP driver makes one fetch per query — it cannot wrap multiple statements in a single PG transaction (no shared connection across requests). The WebSocket pool keeps a persistent connection and supports `BEGIN ... COMMIT`.

Use `dbPool.transaction(async (tx) => {…})` when:

1. Multiple INSERTs/UPDATEs across **different** tables must succeed or fail together.
2. Foreign-key dependencies between rows (insert parent, then child referencing parent's id).
3. Read-modify-write where consistency matters.

```ts
async function runCreateSession(args: RunCreateSessionArgs) {
  return dbPool.transaction(async (tx) => {
    // 1. SELECT (optional) — clone template movements inside the same TX
    const templateMovements = args.fromTemplateSessionId
      ? await tx.select(…).from(blockMovements).innerJoin(sessionBlocks, …)…
      : [];

    // 2. INSERT session
    const [session] = await tx.insert(sessions).values({…}).returning({ id: sessions.id });

    // 3. INSERT one block referencing session.id
    const [block] = await tx.insert(sessionBlocks).values({ sessionId: session.id, … }).returning({…});

    // 4. INSERT movements referencing block.id (if cloning template)
    if (templateMovements.length > 0) {
      await tx.insert(blockMovements).values(templateMovements.map(…));
    }

    return { sessionId: session.id, blockId: block.id };
  });
}
```

Critical: **use `tx`, not `db` or `dbPool`** inside the callback. A stray `db.insert(…)` inside the transaction body bypasses the BEGIN — it runs as its own statement, lost to rollback if the surrounding TX fails.

If the callback throws, Drizzle issues `ROLLBACK` automatically. If it returns, `COMMIT`.

Single-statement operations (`addSet`, `endSession`, `deleteSession`, `removeExerciseFromSession`, `addExerciseToSession`) don't need the transaction overhead — they go through the HTTP `db` client.

## 8. The bug we shipped — server-only code leaked into the client bundle

**Symptom**: User opens the app, browser console shows:

```
pool.ts:30 Uncaught (in promise) Error: DATABASE_URL is not set.
```

**Trace**: `process.env.DATABASE_URL` is undefined in the browser. The DB pool's top-level module code runs there because Vite included `db/pool.ts` in the client bundle.

**Why**: in `src/lib/strength.ts` we had

```ts
// ❌ ANTI-PATTERN
export async function runCreateSession(args) {
  return dbPool.transaction(async (tx) => { /* … */ });
}

export const createSession = createServerFn(…).handler(async ({ data }) => {
  // ...
  return runCreateSession({ … });
});
```

The TanStack Start bundler knows how to strip the server-fn handler closure. But `runCreateSession` is a **plain exported function**. The bundler can't statically prove that the client never imports it directly — so it keeps the function in the bundle, which keeps the `dbPool` reference, which keeps the `import { dbPool } from "../../db/pool"` statement, which keeps `db/pool.ts` (a module with top-level side effects). The browser loads it, throws on `process.env.DATABASE_URL`, and we get the stack trace above.

**Fix**: drop the `export`. The function becomes module-internal, used only inside `createSession`'s handler closure. The bundler now sees no client-reachable reference to `dbPool` and strips the whole import chain.

```ts
// ✅ FIX
async function runCreateSession(args) {           // no export
  return dbPool.transaction(async (tx) => { /* … */ });
}

export const createSession = createServerFn(…).handler(async ({ data }) => {
  return runCreateSession({ … });
});
```

We verified the strip worked by greping the client bundle:

```bash
$ grep -rn "dbPool\|neonConfig\|pool.ts" dist/client/
# (empty)
```

**The rule**, in a sentence: in any module that's imported from a client route, do **not** export plain async functions that touch server-only modules. Keep them module-internal (closure-scoped) and only call them from inside server-fn handlers.

The auth epic's `runSignupTransaction` was exported under the same assumption — at that time the path was different (it was reached from `auth.ts` which was reached from `session.ts` which was reached from beforeLoad), so the bundler had a clear closure to walk. Strength was different — the client imports `createSession`, `addSet`, `getRecentExercises`, etc. directly from `strength.ts`, which made the leak visible. Both auth-signup and strength were updated to keep their `runX` helpers module-internal.

**When we need to re-export for tests**: use TanStack Start's `serverOnly` wrapper (or a server-only file split) so the bundler knows the binding belongs on the server side. Tracked as a follow-up in the integration-test sub-issue.

## 9. The read-after-write race

After `runCreateSession` commits (via WebSocket pool), the client navigates to `/sessions/$sessionId`, which fires the route's `loader` calling `getSessionDetails`. That loader uses the **HTTP** `db` client.

The HTTP driver opens a fresh stateless connection to Neon's serverless pooler. The pooler may briefly route the read to a replica that hasn't yet seen the WebSocket-pool's COMMIT. The SELECT returns zero rows. The loader throws `"Session not found"`. The user sees a red error flash before the second navigation re-renders with the now-visible row.

**Fix**: retry the lookup up to 3 times with 120 ms backoff before declaring "not found".

```ts
let session: typeof sessions.$inferSelect | undefined;
for (let attempt = 0; attempt < 3; attempt++) {
  [session] = await db.select().from(sessions).where(…).limit(1);
  if (session) break;
  if (attempt < 2) await new Promise((r) => setTimeout(r, 120));
}
if (!session) throw new Error("Session not found");
```

The cost is up to ~240 ms in the worst case (race genuinely hits and we retry twice). In practice the first attempt succeeds on Neon ~95% of the time, and the global pending component covers the rare miss with a loader.

This is the kind of thing **integration tests** would catch quickly if we'd had them — flagged in the FRG-7 testing sub-issue.

## 10. React 19 deprecation: `FormEvent` and `FormEventHandler`

In `@types/react@19`, both are flagged `@deprecated`:

```ts
import { type FormEvent } from "react";       // ❌ deprecated
import { type FormEventHandler } from "react";// ❌ deprecated
```

Why: React 19's docs prefer **contextual typing** — `<form onSubmit={(e) => …}>` lets TypeScript infer `e` from the JSX prop's signature without an explicit annotation.

Three viable replacements:

### ❌ Don't: `React.FormEvent<HTMLFormElement>` namespaced

Same deprecation, just accessed differently. Plus requires `import * as React from "react"`.

### ✅ Inline the handler in JSX

```ts
<form onSubmit={async (e) => {
  e.preventDefault();
  // …business logic
}}>
```

Works fine; type for `e` infers from the prop. The handler grows the JSX though.

### ✅ Split event handling from business logic (what we settled on)

```ts
const submitSet = async () => {
  // …business logic only, no event
};

<form onSubmit={(e) => {
  e.preventDefault();
  submitSet();
}}>
```

Two-line inline lambda handles the DOM concern (`preventDefault`); a named function handles the actual logic. The named function has no type annotation problem because it never takes a DOM event.

## 11. React 19 anti-pattern: `useEffect` for derived state

When the picker drawer reopened, the search query from the last open was still there ("siad" hanging in the input after the user already added that exercise). The instinct was:

```ts
// ❌ ANTI-PATTERN — useEffect to reset state on a parent boolean
function ExercisePickerDrawer({ open, … }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);
  // …
}
```

This works but is the pattern React docs explicitly warn against ("You Might Not Need an Effect"). The issue: state and effect are racing in the same component to stay in sync with a parent prop.

### Better — conditional child component (what we settled on)

State lives in a child that **only mounts when the drawer is open**. Closing → unmounts → state gone. Reopening → mounts fresh → state initialises from `useState` defaults. No effect, no reset code.

```ts
// ✅ PATTERN — let lifecycle do the reset
function ExercisePickerDrawer({ open, onOpenChange, onPicked }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>…</DrawerHeader>
        {open ? <ExercisePickerForm onPicked={onPicked} /> : null}
        <DrawerFooter>…</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ExercisePickerForm({ onPicked }) {
  const [query, setQuery] = useState("");      // fresh mount → fresh state
  const [results, setResults] = useState([]);
  // …no useEffect needed
}
```

The rule: **state belongs in the component whose lifetime matches the state's lifetime.** If you find yourself writing a `useEffect` to wipe state on a prop change, ask "should this state live in a deeper component?" Usually yes.

### When you genuinely want carry-over (counter-example)

The exercise drawer for **set logging** does NOT use the conditional-child pattern. The user's expected UX is: save `5×100`, close, reopen for the next set — see `5×100` already filled in as defaults (carry-over). State persists across opens because that's the intent. We use the parent-level state pattern there, deliberately.

The same component pattern can be right or wrong depending on whether you want persistence or freshness. Choose based on user intent, not by reflex.

## 12. Input UX: string state for numeric fields

Controlled inputs with `type="number"` and `state: number` have a frustrating failure mode:

```ts
// ❌ ANTI-PATTERN — numeric state + parseInt fallback
const [reps, setReps] = useState(5);

<Input
  type="number"
  value={reps}
  onChange={(e) => setReps(Number.parseInt(e.target.value, 10) || 0)}
/>
```

User presses backspace → `e.target.value = ""` → `parseInt("") = NaN` → `|| 0` → state becomes `0` → input re-renders showing `"0"`. User now types `2` → input shows `"02"` (or `"20"` depending on cursor) → next render shows `"2"`. Flicker, off-by-one cursor, frustration.

### The fix — string state, parse on submit

```ts
// ✅ PATTERN
const [reps, setReps] = useState<string>(String(defaultReps));
const repsNum = Number.parseInt(reps, 10);  // NaN if empty/invalid

<Input
  type="number"
  inputMode="numeric"
  value={reps}
  onChange={(e) => setReps(e.target.value)}
/>

// Steppers — write a string, derive from the parsed number
<Button onClick={() => setReps(String(Math.max(0, (Number.isNaN(repsNum) ? 0 : repsNum) - 1)))}>−</Button>

// On submit: validate, then convert
if (Number.isNaN(repsNum) || repsNum < 0) {
  setError("Podaj liczbę powtórzeń.");
  return;
}
await addSet({ data: { reps: repsNum, … } });
```

Backspace works naturally — empty string stays empty. Typing builds the number character by character. The parse happens exactly once, at the boundary (submit / stepper / save).

## 13. Read state synchronisation — `loader` + `router.invalidate()`

The reads-and-mutations cycle in our routes:

```ts
// Route loader runs server fn, returns data
export const Route = createFileRoute("/sessions/$sessionId")({
  beforeLoad: async () => { /* auth check */ },
  loader: ({ params }) => getSessionDetails({ data: { sessionId: params.sessionId } }),
  component: ActiveSessionPage,
});

// Component reads loader's result
function ActiveSessionPage() {
  const { session, movements } = Route.useLoaderData();
  const router = useRouter();

  const handleSomeMutation = async () => {
    await someServerFn({ data: { … } });
    router.invalidate();              // re-runs the loader; React re-renders with fresh data
  };
}
```

This is fine for one-user single-tab MVP. The cost: every mutation refetches the entire route's loader data, even if only one set changed. For a session with 4 movements and 16 sets, the refetched payload is ~3 KB. Acceptable.

When this stops scaling (more than one tab open, optimistic updates needed, partial updates), we'll bring in TanStack Query for cache invalidation control. Not now.

## 14. Polish vs English in error messages

Convention:

- **Internal errors** (logged, thrown by the server, seen by us in dev tools) — English.
  ```ts
  throw new Error("Session not found or not owned by this athlete");
  ```
- **User-facing strings** (rendered in UI, set as `reason` fields, displayed in toasts) — Polish.
  ```ts
  return { shouldProgress: false, reason: "Brak danych RPE — zaloguj RPE…" };
  ```

The split matters: `throw new Error("Polish text")` would make English-speaking debuggers (Sentry, future hires) parse Polish stack traces. `reason: "English text"` would leak technical phrasing into the user's screen.

## 15. Where to find each pattern in the code

| Pattern | File / lines |
|---|---|
| `getCurrentAthleteOrThrow` | `src/lib/strength.ts` (top of file) |
| Multi-tenant `WHERE` filter | every server fn in `src/lib/strength.ts` and `src/lib/auth-signup.ts` |
| Atomic transaction | `runCreateSession` in `src/lib/strength.ts`, `runSignupTransaction` in `src/lib/auth-signup.ts` |
| Read-after-write retry | `getSessionDetails` in `src/lib/strength.ts` |
| Conditional child for state reset | `ExercisePickerDrawer` → `ExercisePickerForm` in `src/routes/sessions/$sessionId.tsx` |
| String state for numeric input | `ExerciseDrawer` in `src/routes/sessions/$sessionId.tsx` |
| Split submit from event handling | `submitSet` + inline `onSubmit` in `src/routes/sessions/$sessionId.tsx` |
| Two DB clients side-by-side | `db/client.ts` (HTTP, default) + `db/pool.ts` (WebSocket pool, transactions only) |
| Global pending loader | `src/router.tsx` + `src/components/global-pending.tsx` + `src/components/spinner.tsx` |

## 16. Quick reference — when to reach for what

| You want… | Use |
|---|---|
| A single read or write that's not multi-row dependent | `db` (HTTP driver) |
| Multi-row atomic write across tables | `dbPool.transaction(async (tx) => …)` — use `tx` everywhere inside |
| Per-fn auth check | `await getCurrentAthleteOrThrow()` at the top of every handler |
| Per-fn input validation | `.inputValidator((data: unknown) => mySchema.parse(data))` chain |
| Per-fn ownership check on writes | `eq(table.athleteId, athleteId)` in `WHERE` |
| Type for an onSubmit param | Don't annotate — let JSX context infer. Split logic from event if helpful. |
| Reset state on a parent boolean | Move state into a child + conditional render — not `useEffect` |
| Numeric input that backspaces cleanly | String state, parse on submit/stepper |
| Refetch a route's data after mutation | `router.invalidate()` |

## 17. References

- [TanStack Start server functions](https://tanstack.com/start/latest/docs/framework/react/server-functions) (official)
- [React docs — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Drizzle ORM docs](https://orm.drizzle.team/)
- [@neondatabase/serverless](https://github.com/neondatabase/serverless) — HTTP vs WebSocket driver story
- `docs/adr/ADR-0015` — auth implementation
- `docs/adr/ADR-0016` — strength logging implementation
- `docs/adr/ADR-0010` — multi-tenant invariant
- `docs/adr/ADR-0012` — Drizzle conventions
