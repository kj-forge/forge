# Brother Feedback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One branch delivering the approved batch: round counters/naming (variant 1A), circuit exercise editing with soft-remove (2A), all-sets edit modal with RPE (3B), timed-exercise parity, history-delete fix, inputMode unification, schedule day slot Rano/Wieczór, and a shared BackLink.

**Architecture:** Spec: `docs/superpowers/specs/2026-07-24-brother-feedback-fixes-design.md`. Data changes: `block_movements.removed_after_round` (soft-remove for mid-circuit swaps), `day_slot` enum + `slot` columns on `training_plan_unit_days` and `schedule_overrides`. New server fns: `updateSet`, `retireExerciseFromStep`, `swapExerciseInStep`, `setScheduleEntrySlot`. Round arithmetic moves from min-across-movements to distinct-round-numbers.

**Tech Stack:** TanStack Start/Router/Query, Drizzle + Neon Postgres, RHF + zod, react-number-format, @dnd-kit, shadcn, bun test.

## Global Constraints

- UI copy in Polish; code, comments, commits in English. No `FRG-N` in code/comments.
- Forms via RHF + zodResolver; numeric inputs via `NumericFormat` with `customInput={Input}` and an explicit `inputMode`.
- Icons: lucide only. Comments: minimal — hidden invariants only.
- After each task: `bun run typecheck && bun run lint`. After `db:generate` also `bun run format`.
- Tests: `bun test` (colocated `*.test.ts`, `bun:test` imports). No DB test harness — server fns are verified by typecheck + dev testing.
- Commits: Conventional Commits, ending with `Co-Authored-By: Claude <noreply@anthropic.com>`. KJ's "start execution" is the go-ahead for branch-local commits; pushing/PR needs a separate explicit OK.
- Branch: KJ creates the Linear issue (EN) manually; branch name is the Linear-generated name VERBATIM.
- Naming: *obwód* = the exercise set (step); *runda* = one pass. "Obwód" survives only in "…do obwodu" copy and the exercise-action modal; every counter/save/delete string says "runda".

---

### Task 1: Schema — `removed_after_round` + `day_slot`

**Files:**
- Modify: `db/schema.ts` (enum near line 101, `blockMovements` ~line 518, `trainingPlanUnitDays` ~line 1062, `scheduleOverrides` ~line 1084)
- Generated: `db/migrations/0018_*.sql`

**Interfaces:**
- Produces: `blockMovements.removedAfterRound: integer | null`; `daySlot` pgEnum `["MORNING","EVENING"]`; `trainingPlanUnitDays.slot`, `scheduleOverrides.slot` — both `daySlot NOT NULL DEFAULT 'MORNING'`.

- [ ] **Step 1: Add enum** — next to the other enums (after `setKind`, line ~101):

```ts
export const daySlot = pgEnum("day_slot", ["MORNING", "EVENING"]);
```

- [ ] **Step 2: Add columns.** In `blockMovements` after `rpeCap: smallint(),`:

```ts
    // Mid-circuit swap: last round this exercise was part of; NULL = active.
    removedAfterRound: integer(),
```

In `trainingPlanUnitDays` after `dayOfWeek: integer().notNull(),`:

```ts
    slot: daySlot().notNull().default("MORNING"),
```

In `scheduleOverrides` after `kind: scheduleOverrideKind().notNull(),`:

```ts
    slot: daySlot().notNull().default("MORNING"),
```

- [ ] **Step 3: Generate + format + migrate**

Run: `bun run db:generate` → creates `db/migrations/0018_*.sql`. Inspect it: expect `CREATE TYPE "public"."day_slot"`, three `ALTER TABLE … ADD COLUMN`. Then `bun run format` (drizzle snapshot JSON vs Biome), then `bun run db:migrate`.
Expected: migration applies cleanly.

- [ ] **Step 4: Verify** — `bun run typecheck && bun run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add db/
git commit -m "feat(db): removed_after_round on block movements, day_slot on schedule"
```

---

### Task 2: Round arithmetic — `savedRounds` / simplified `currentRound`

**Files:**
- Modify: `src/features/strength/lib/step-progress.ts`
- Test: `src/features/strength/lib/step-progress.test.ts` (rewrite)

**Interfaces:**
- Produces: `savedRounds(movements): number` (distinct setNumbers), `currentRound(movements): number` (= maxLoggedRound + 1), `maxLoggedRound(movements): number` (unchanged), `loggedRoundNumbers(movements): number[]` (sorted distinct), `isActiveInRound(m: { removedAfterRound: number | null }, round: number): boolean`.
- `completedRounds` is DELETED (Tasks 6–7 remove its consumers; typecheck gates the order — run Task 6/7 before `bun run check`).

- [ ] **Step 1: Rewrite the failing tests** — replace `step-progress.test.ts` content:

```ts
import { describe, expect, test } from "bun:test";

import { currentRound, isActiveInRound, loggedRoundNumbers, maxLoggedRound, savedRounds } from "./step-progress";

const mv = (...rounds: number[]) => ({ sets: rounds.map((setNumber) => ({ setNumber })) });

describe("savedRounds", () => {
  test("counts distinct round numbers across movements", () => {
    expect(savedRounds([mv(1, 2), mv(1, 2)])).toBe(2);
    expect(savedRounds([mv(), mv()])).toBe(0);
    expect(savedRounds([])).toBe(0);
  });

  test("a swap leaves gaps per movement but rounds still count once", () => {
    // Movement A logged rounds 1-2 then was swapped for C (rounds 3-4).
    expect(savedRounds([mv(1, 2), mv(1, 2, 3, 4), mv(3, 4)])).toBe(4);
  });

  test("legacy partial round counts as saved", () => {
    expect(savedRounds([mv(1, 2), mv(1)])).toBe(2);
  });
});

describe("currentRound / maxLoggedRound", () => {
  test("current round is always the frontier + 1", () => {
    expect(currentRound([mv(), mv()])).toBe(1);
    expect(currentRound([mv(1), mv(1)])).toBe(2);
    expect(currentRound([mv(1, 2), mv(1)])).toBe(3);
  });

  test("maxLoggedRound sees the partial round", () => {
    expect(maxLoggedRound([mv(1, 2, 3), mv(1)])).toBe(3);
    expect(maxLoggedRound([mv(), mv()])).toBe(0);
  });
});

describe("loggedRoundNumbers", () => {
  test("sorted distinct rounds, gaps preserved", () => {
    expect(loggedRoundNumbers([mv(3, 1), mv(1, 4)])).toEqual([1, 3, 4]);
    expect(loggedRoundNumbers([mv()])).toEqual([]);
  });
});

describe("isActiveInRound", () => {
  test("null = active forever; otherwise active through removedAfterRound", () => {
    expect(isActiveInRound({ removedAfterRound: null }, 7)).toBe(true);
    expect(isActiveInRound({ removedAfterRound: 1 }, 1)).toBe(true);
    expect(isActiveInRound({ removedAfterRound: 1 }, 2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/features/strength/lib/step-progress.test.ts`
Expected: FAIL — `savedRounds`/`loggedRoundNumbers`/`isActiveInRound` not exported.

- [ ] **Step 3: Implement** — replace `step-progress.ts` content:

```ts
// Round arithmetic for a step (block). Rounds save atomically ("Zapisz
// rundę"), so a round exists iff any movement has a set at that number —
// resilient to mid-circuit swaps (per-movement gaps) and legacy partial
// rounds from the removed per-exercise save.

interface MovementSets {
  sets: { setNumber: number }[];
}

export function savedRounds(movements: MovementSets[]): number {
  return new Set(movements.flatMap((m) => m.sets.map((s) => s.setNumber))).size;
}

export function maxLoggedRound(movements: MovementSets[]): number {
  return Math.max(0, ...movements.flatMap((m) => m.sets.map((s) => s.setNumber)));
}

export function currentRound(movements: MovementSets[]): number {
  return maxLoggedRound(movements) + 1;
}

export function loggedRoundNumbers(movements: MovementSets[]): number[] {
  return [...new Set(movements.flatMap((m) => m.sets.map((s) => s.setNumber)))].sort((a, b) => a - b);
}

// Soft-removed exercises stay in the step for history; they stop rendering
// inputs from the round after removedAfterRound.
export function isActiveInRound(m: { removedAfterRound: number | null }, round: number): boolean {
  return m.removedAfterRound === null || round <= m.removedAfterRound;
}
```

- [ ] **Step 4: Run tests** — `bun test src/features/strength/lib/step-progress.test.ts` → PASS. (`bun run typecheck` will fail until Tasks 6–7 update consumers — that's expected; do NOT run repo-wide check yet.)

- [ ] **Step 5: Commit**

```bash
git add src/features/strength/lib/step-progress.ts src/features/strength/lib/step-progress.test.ts
git commit -m "feat(strength): round math counts saved rounds, adds soft-remove awareness"
```

---

### Task 3: Formatters — duration sets + round plurals

**Files:**
- Modify: `src/features/strength/lib/format-set.ts`
- Test: `src/features/strength/lib/format-set.test.ts` (append)

**Interfaces:**
- Produces: `formatSet` now accepts `{ reps, weightKg, durationSeconds? }` and returns `"30s"` when `durationSeconds != null && reps == null`; `formatRoundsCount(n)` → `"1 runda" | "3 rundy" | "5 rund"`; `formatRoundsSaved(n)` → `"1 runda zapisana" | "2 rundy zapisane" | "5 rund zapisanych"`.
- Task 7/9 will replace `formatRoundSet` (StepDrawer) with this `formatSet`.

- [ ] **Step 1: Append failing tests** to `format-set.test.ts`:

```ts
describe("formatSet — duration sets", () => {
  test("duration-only set renders seconds", () => {
    expect(formatSet({ reps: null, weightKg: null, durationSeconds: 30 })).toBe("30s");
  });

  test("reps win when both present (defensive)", () => {
    expect(formatSet({ reps: 10, weightKg: null, durationSeconds: 30 })).toBe("10× bw");
  });

  test("no durationSeconds key keeps old behavior", () => {
    expect(formatSet({ reps: 5, weightKg: 100 })).toBe("5× 100kg");
  });
});

describe("formatRoundsCount / formatRoundsSaved", () => {
  test("Polish plurals", () => {
    expect(formatRoundsCount(1)).toBe("1 runda");
    expect(formatRoundsCount(3)).toBe("3 rundy");
    expect(formatRoundsCount(5)).toBe("5 rund");
    expect(formatRoundsCount(12)).toBe("12 rund");
    expect(formatRoundsCount(22)).toBe("22 rundy");
    expect(formatRoundsSaved(1)).toBe("1 runda zapisana");
    expect(formatRoundsSaved(4)).toBe("4 rundy zapisane");
    expect(formatRoundsSaved(14)).toBe("14 rund zapisanych");
  });
});
```

Add `formatRoundsCount, formatRoundsSaved` to the existing import from `./format-set`.

- [ ] **Step 2: Run** — `bun test src/features/strength/lib/format-set.test.ts` → FAIL (not exported / wrong output).

- [ ] **Step 3: Implement.** In `format-set.ts` change `formatSet` and add helpers:

```ts
// Compact set summary. Duration-only sets ("Plank 30s") render as seconds;
// everything else reps × weight (bw for bodyweight).
export function formatSet(s: Pick<SetRow, "reps" | "weightKg"> & { durationSeconds?: number | null }): string {
  if (s.durationSeconds != null && s.reps == null) return `${s.durationSeconds}s`;
  const reps = s.reps ?? "–";
  return `${reps}× ${formatWeight(s.weightKg)}`;
}

// Polish plural: 2-4 → "rundy" except teens, else "rund".
function roundsForm(n: number): "runda" | "rundy" | "rund" {
  if (n === 1) return "runda";
  const lastTwo = n % 100;
  const last = n % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "rundy" : "rund";
}

export function formatRoundsCount(n: number): string {
  return `${n} ${roundsForm(n)}`;
}

export function formatRoundsSaved(n: number): string {
  const adj = { runda: "zapisana", rundy: "zapisane", rund: "zapisanych" }[roundsForm(n)];
  return `${n} ${roundsForm(n)} ${adj}`;
}
```

- [ ] **Step 4: Run** — `bun test src/features/strength/lib/format-set.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/strength/lib/format-set.ts src/features/strength/lib/format-set.test.ts
git commit -m "feat(strength): formatSet renders duration sets, round plural helpers"
```

---

### Task 4: Set form — TIME variant + seconds stepper + seed

**Files:**
- Modify: `src/features/strength/lib/set-form.ts`, `src/features/strength/lib/seed-set-fields.ts`
- Test: `src/features/strength/lib/set-form.test.ts` (append), `src/features/strength/lib/seed-set-fields.test.ts` (append)

**Interfaces:**
- Produces: `timeSetFormSchema` (kind, `durationSeconds` string→int 1–36000, rpe), `TimeSetFormInput`/`TimeSetFormValues`, `stepSeconds(value: string, delta: number): string`; `seedSetFields` return gains `durationSeconds: number | undefined`.

- [ ] **Step 1: Failing tests.** Append to `set-form.test.ts`:

```ts
describe("timeSetFormSchema", () => {
  test("parses seconds string to int", () => {
    const parsed = timeSetFormSchema.parse({ kind: "WORK", durationSeconds: "30", rpe: null });
    expect(parsed.durationSeconds).toBe(30);
  });

  test("rejects empty and zero", () => {
    expect(timeSetFormSchema.safeParse({ kind: "WORK", durationSeconds: "", rpe: null }).success).toBe(false);
    expect(timeSetFormSchema.safeParse({ kind: "WORK", durationSeconds: "0", rpe: null }).success).toBe(false);
  });
});

describe("stepSeconds", () => {
  test("steps by delta with floor 1", () => {
    expect(stepSeconds("30", 5)).toBe("35");
    expect(stepSeconds("3", -5)).toBe("1");
    expect(stepSeconds("", 5)).toBe("5");
  });
});
```

(import `stepSeconds, timeSetFormSchema` from `./set-form`). Append to `seed-set-fields.test.ts` a case asserting `durationSeconds` passthrough:

```ts
test("seeds durationSeconds from the current session set", () => {
  const seed = seedSetFields(
    [{ kind: "WORK", reps: null, weightKg: null, durationSeconds: 45 }],
    {} as never,
    "WORK",
  );
  expect(seed?.durationSeconds).toBe(45);
});
```

- [ ] **Step 2: Run** — `bun test src/features/strength/lib/set-form.test.ts src/features/strength/lib/seed-set-fields.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `set-form.ts` add:

```ts
// TIME exercises (defaultUnit === "TIME"): one duration field instead of
// reps/weight; same string-input reasoning as setFormSchema.
export const timeSetFormSchema = z.object({
  kind: z.enum(SET_KINDS),
  durationSeconds: z
    .string()
    .trim()
    .min(1, "Podaj czas w sekundach.")
    .transform(Number)
    .pipe(z.number().int("Liczba całkowita").min(1, "Min 1 s").max(36000, "Max 36000 s")),
  rpe: z.number().int().min(6).max(10).nullable(),
});

export type TimeSetFormInput = z.input<typeof timeSetFormSchema>;
export type TimeSetFormValues = z.output<typeof timeSetFormSchema>;

export function stepSeconds(value: string, delta: number): string {
  const base = parseNum(value) ?? 0;
  return String(Math.max(1, Math.round(base + delta)));
}
```

In `seed-set-fields.ts` extend the type and both returns:

```ts
type SeedFields = { reps: number | undefined; weightKg: number | undefined; durationSeconds: number | undefined };
```

```ts
  const sessionSet = [...sets].reverse().find((s) => s.kind === kind);
  if (sessionSet)
    return {
      reps: sessionSet.reps ?? undefined,
      weightKg: sessionSet.weightKg ?? 0,
      durationSeconds: sessionSet.durationSeconds ?? undefined,
    };

  const ref = lastByKind[kind as RefKind];
  if (!ref) return undefined;
  return { reps: ref.reps ?? undefined, weightKg: ref.weightKg ?? 0, durationSeconds: undefined };
```

and widen the `sets` param type to `ReadonlyArray<{ kind: string; reps: number | null; weightKg: number | null; durationSeconds?: number | null }>` (historical refs don't carry duration — session-only seeding, mirroring the circuit's `seedRow`).

- [ ] **Step 4: Run** — same test command → PASS. `bun run typecheck` → PASS (callers pass supersets of the widened type).

- [ ] **Step 5: Commit**

```bash
git add src/features/strength/lib/set-form.ts src/features/strength/lib/set-form.test.ts src/features/strength/lib/seed-set-fields.ts src/features/strength/lib/seed-set-fields.test.ts
git commit -m "feat(strength): TIME set form schema, seconds stepper, duration seeding"
```

---

### Task 5: Server — `updateSet`, `addSet` duration, retire/swap

**Files:**
- Modify: `src/features/strength/server/sets.ts`, `src/features/strength/server/movements.ts`, `src/features/strength/server/sessions.ts:217-240` (details select)

**Interfaces:**
- Produces: `updateSet({ setId, reps, weightKg, durationSeconds, rpe })` — full-replace, all nullable, refine reps-or-duration; `addSet` accepts `durationSeconds?: number`; `retireExerciseFromStep({ blockMovementId, fromRound })`; `swapExerciseInStep({ blockMovementId, newExerciseId, fromRound })`; `getSessionDetails` movements now include `removedAfterRound`.
- Consumed by Tasks 7–9 UI.

- [ ] **Step 1: `addSet` duration.** In `sets.ts` extend the input and insert:

```ts
const addSetInput = z
  .object({
    blockMovementId: z.uuid(),
    reps: z.int().min(0).max(1000).optional(),
    weightKg: z.number().min(0).max(1000).optional(),
    durationSeconds: z.int().min(1).max(36000).optional(),
    rpe: z.int().min(1).max(10).optional(),
    kind: z.enum(["WARMUP", "TOP_SET", "WORK", "BACK_OFF", "FAILURE", "DROP_SET"]).default("WORK"),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => d.reps !== undefined || d.durationSeconds !== undefined, { message: "Pusta seria." });
```

and in the `.values({ … })` add `durationSeconds: data.durationSeconds,` after `weightKg`.

- [ ] **Step 2: `updateSet`.** Append to `sets.ts`:

```ts
const updateSetInput = z
  .object({
    setId: z.uuid(),
    reps: z.int().min(1).max(999).nullable(),
    weightKg: z.number().min(0).max(1000).nullable(),
    durationSeconds: z.int().min(1).max(36000).nullable(),
    rpe: z.int().min(1).max(10).nullable(),
  })
  .refine((d) => d.reps !== null || d.durationSeconds !== null, { message: "Pusta seria." });

// Full replace of the editable fields (the edit modal always sends all four).
// No PR toast on edits — records celebrate only at logging time.
export const updateSet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(updateSetInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .update(sets)
      .set({ reps: data.reps, weightKg: data.weightKg, durationSeconds: data.durationSeconds, rpe: data.rpe })
      .where(and(eq(sets.id, data.setId), eq(sets.athleteId, athleteId)))
      .returning({ id: sets.id });
    if (!row) throw new Error("Nie znaleziono serii.");
    return row;
  });
```

- [ ] **Step 3: retire + swap.** Append to `movements.ts` (add `isNull` to the drizzle import and `exercises` to the schema import):

```ts
const retireInput = z.object({ blockMovementId: z.uuid(), fromRound: z.int().min(1).max(99) });

// Soft-remove from a circuit: the exercise keeps its logged history and stops
// rendering from `fromRound` on. Guard: the step must keep ≥1 active exercise.
export const retireExerciseFromStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(retireInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [movement] = await db
      .select({ id: blockMovements.id, blockId: blockMovements.blockId })
      .from(blockMovements)
      .where(and(eq(blockMovements.id, data.blockMovementId), eq(blockMovements.athleteId, athleteId)));
    if (!movement) throw new Error("Nie znaleziono ćwiczenia w tej sesji.");

    const active = await db
      .select({ id: blockMovements.id })
      .from(blockMovements)
      .where(and(eq(blockMovements.blockId, movement.blockId), isNull(blockMovements.removedAfterRound)));
    if (active.length <= 1) throw new Error("Obwód musi mieć co najmniej jedno aktywne ćwiczenie.");

    await db
      .update(blockMovements)
      .set({ removedAfterRound: data.fromRound - 1 })
      .where(eq(blockMovements.id, movement.id));
    return { id: movement.id };
  });

const swapInput = z.object({ blockMovementId: z.uuid(), newExerciseId: z.uuid(), fromRound: z.int().min(1).max(99) });

// Swap = retire (or hard-delete when set-less) + add the replacement at the
// same position, atomically from the athlete's perspective.
export const swapExerciseInStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(swapInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [movement] = await db
      .select({
        id: blockMovements.id,
        blockId: blockMovements.blockId,
        orderIndex: blockMovements.orderIndex,
      })
      .from(blockMovements)
      .where(and(eq(blockMovements.id, data.blockMovementId), eq(blockMovements.athleteId, athleteId)));
    if (!movement) throw new Error("Nie znaleziono ćwiczenia w tej sesji.");

    const [duplicate] = await db
      .select({ id: blockMovements.id })
      .from(blockMovements)
      .where(
        and(
          eq(blockMovements.blockId, movement.blockId),
          eq(blockMovements.exerciseId, data.newExerciseId),
          isNull(blockMovements.removedAfterRound),
        ),
      );
    if (duplicate) throw new Error("To ćwiczenie jest już w tym obwodzie.");

    const [{ setCount }] = await db
      .select({ setCount: sql<number>`COUNT(*)::int` })
      .from(sets)
      .where(eq(sets.blockMovementId, movement.id));
    if (setCount === 0) {
      await db.delete(blockMovements).where(eq(blockMovements.id, movement.id));
    } else {
      await db
        .update(blockMovements)
        .set({ removedAfterRound: data.fromRound - 1 })
        .where(eq(blockMovements.id, movement.id));
    }

    const [row] = await db
      .insert(blockMovements)
      .values({
        athleteId,
        blockId: movement.blockId,
        orderIndex: movement.orderIndex,
        exerciseId: data.newExerciseId,
      })
      .returning({ id: blockMovements.id });
    return { blockMovementId: row.id };
  });
```

- [ ] **Step 4: Expose `removedAfterRound`.** In `sessions.ts` `getSessionDetails` movements select (line ~228), add after `exerciseIsLoadedBodyweight`:

```ts
            removedAfterRound: blockMovements.removedAfterRound,
```

- [ ] **Step 5: Verify** — `bun run typecheck && bun run lint` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/strength/server/
git commit -m "feat(strength): updateSet, duration in addSet, circuit retire/swap mutations"
```

---

### Task 6: Cards & summary counters (variant 1A)

**Files:**
- Modify: `src/features/strength/components/StepRows.tsx`, `src/features/strength/components/EndedStepCard.tsx`

**Interfaces:**
- Consumes: `savedRounds`, `loggedRoundNumbers` (Task 2), `formatRoundsCount`, `formatRoundsSaved`, duration-aware `formatSet` (Task 3).

- [ ] **Step 1: `SupersetRow`.** Replace the progress imports/derivations and status (lines 6, 19-21, 36-41):

```ts
import { savedRounds } from "@/features/strength/lib/step-progress";
import { formatRoundsSaved } from "@/features/strength/lib/format-set";
```

```ts
  const saved = savedRounds(step.movements);
  const touched = saved > 0;
  const canRemoveInline = !isEnded && !touched;

  const status =
    step.targetRounds !== null
      ? `Rundy ${saved}/${step.targetRounds}${saved >= step.targetRounds ? " ✓" : ""}`
      : touched
        ? formatRoundsSaved(saved)
        : "Pusty — tapnij, by zacząć";
```

Render `<p className="text-muted-foreground text-xs">{status}</p>` (drop the `Obwód ` prefix at line 57) and DELETE the whole dots `{step.targetRounds !== null && (…)}` span block (lines 59-69).

- [ ] **Step 2: `EndedStepCard`.** Swap imports (`maxLoggedRound` → `savedRounds, loggedRoundNumbers`; add `formatRoundsCount`; Task 9 will change `formatRoundSet` — for now keep it). Replace lines 25-26 and 42-44:

```ts
  const laps = savedRounds(step.movements);
  const isEmpty = laps === 0;
```

```ts
  const subtitle = isCircuit
    ? step.targetRounds !== null
      ? `Rundy ${laps}/${step.targetRounds}`
      : formatRoundsCount(laps)
    : formatSeriesCount(step.movements[0]?.sets.length ?? 0);
```

Replace the per-round list source (line 63): `Array.from({ length: laps }, (_, i) => i + 1)` → `loggedRoundNumbers(step.movements)`.

- [ ] **Step 3: Verify** — `bun run typecheck && bun run lint` → PASS (Task 2 + this task remove two of the three `completedRounds` consumers; StepDrawer remains until Task 7 — typecheck still passes because the export removal already happened in Task 2, so if it fails here, finish Task 7 first; execute 2 → 6 → 7 in one sitting before any repo-wide check).

- [ ] **Step 4: Commit**

```bash
git add src/features/strength/components/StepRows.tsx src/features/strength/components/EndedStepCard.tsx
git commit -m "feat(strength): round counters count saved rounds, drop dots and clamp"
```

---

### Task 7: Circuit drawer rework (variant 2A) + swap wiring

**Files:**
- Modify: `src/features/strength/components/StepDrawer.tsx` (RoundBody), `src/features/strength/views/ActiveSessionView.tsx`

**Interfaces:**
- Consumes: `currentRound`, `savedRounds`, `isActiveInRound`, `loggedRoundNumbers` (Task 2); `retireExerciseFromStep`, `swapExerciseInStep`, `removeExerciseFromSession` (Task 5); `Movement.removedAfterRound` (Task 5).
- Produces: `StepDrawer` prop `onSwapInStep(blockId: string, blockMovementId: string): void`; `PickerMode` gains `{ kind: "swap"; blockId: string; blockMovementId: string }`. Round-list pencil (edit modal) lands in Task 8 — here rows keep the old ✕ temporarily.

- [ ] **Step 1: RoundBody derivations.** Update the progress import (drop `completedRounds`, `maxLoggedRound`; add `savedRounds`, `isActiveInRound`, `loggedRoundNumbers`) and replace lines 150-152 and 170-172:

```ts
  const round = currentRound(step.movements);
  const done = savedRounds(step.movements);
  const activeMovements = step.movements.filter((m) => isActiveInRound(m, round));

  const savedThisRound = new Set(
    activeMovements.filter((m) => m.sets.some((s) => s.setNumber === round)).map((m) => m.id),
  );
```

`roundKind` initializer: replace both `maxLoggedRound(step.movements)` calls with `round - 1` (the last logged round). Replace `loggedRounds` (lines 288-290) with:

```ts
  const loggedRounds = loggedRoundNumbers(step.movements);
```

Title and rows iterate `activeMovements` instead of `step.movements` (lines 292, 343); `rows` state initializer maps over `activeMovements`; in the row render make values swap-proof: `const values = rows[m.id] ?? seedRow(m);` (a swapped-in movement appears without a remount). `saveWholeRound` pending filter uses `activeMovements`.

- [ ] **Step 2: Header + footer strings.** Line 311: `Obwód {round}` → `Runda {round}`; DELETE the dots block (lines 314-324). Footer (line 550): `"Zapisz obwód i dalej →"` → `"Zapisz rundę i dalej →"`, `"Zapisz obwód"` → `"Zapisz rundę"`. Error strings: `"Nie udało się zapisać obwodu."` → `"…zapisać rundy."`, `"Nie udało się usunąć obwodu."` → `"…usunąć rundy."`, aria `Usuń obwód ${r}` → `Usuń rundę ${r}`, sr-only `Logowanie obwodu` stays (obwód = the set). `DialogDescription` fine.

- [ ] **Step 3: Remove per-exercise save.** Delete `saveOne` (lines 193-213) and the per-row `<Button …><Check/></Button>` (lines 439-451) plus the `Check` import and the trailing `<span className="w-16 …" />`/`w-9` header spacer that reserved its column (`collabels` row: drop the `w-9` span). Keep `savedThisRound` (rows disable after an idempotent partial save from a retried request).

- [ ] **Step 4: Pencil + exercise action modal.** Replace the conditional ✕ in the row head (lines 353-363) with an always-on pencil:

```tsx
                <button
                  type="button"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  onClick={() => setMovementAction(m)}
                  disabled={saving !== null}
                  aria-label={`Edytuj ćwiczenie: ${m.exerciseNamePl}`}
                >
                  <Pencil className="size-3.5" />
                </button>
```

Add state + handlers in RoundBody (imports: `Pencil` from lucide, `removeExerciseFromSession` already imported, `retireExerciseFromStep`, `swapExerciseInStep` from `../server/movements`):

```ts
  const [movementAction, setMovementAction] = useState<Movement | null>(null);

  const removeMovement = async (movement: Movement) => {
    setError(null);
    setSaving(movement.id);
    setMovementAction(null);
    try {
      if (movement.sets.length === 0) {
        await removeExerciseFromSession({ data: { blockMovementId: movement.id } });
      } else {
        await retireExerciseFromStep({ data: { blockMovementId: movement.id, fromRound: round } });
      }
      await router.invalidate();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć ćwiczenia z obwodu."));
    } finally {
      setSaving(null);
    }
  };
```

Nested action dialog, rendered at the end of RoundBody's root div (radix portals nested dialogs correctly):

```tsx
      <Dialog open={movementAction !== null} onOpenChange={(o) => !o && setMovementAction(null)}>
        <DialogContent>
          {movementAction && (
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
              <DialogHeader className="shrink-0">
                <DialogTitle>{movementAction.exerciseNamePl}</DialogTitle>
                <DialogDescription>Ćwiczenie w obwodzie · od rundy {round}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const m = movementAction;
                    setMovementAction(null);
                    onSwapExercise(m.id);
                  }}
                >
                  <Repeat2 className="size-4" />
                  Zamień na inne ćwiczenie
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => removeMovement(movementAction)}
                >
                  {movementAction.sets.length === 0 ? "Usuń z obwodu" : "Usuń z obwodu (od tej rundy)"}
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => setMovementAction(null)}>
                  Anuluj
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
```

(`Repeat2` from lucide.) RoundBody gains prop `onSwapExercise: (blockMovementId: string) => void`; `StepDrawer` gains `onSwapInStep: (blockId: string, blockMovementId: string) => void` and passes `onSwapExercise={(mid) => onSwapInStep(step.id, mid)}`.

- [ ] **Step 5: Picker wiring in `ActiveSessionView`.** Extend the mode union (line 24):

```ts
type PickerMode =
  | { kind: "single" }
  | { kind: "multi" }
  | { kind: "morph"; blockId: string }
  | { kind: "swap"; blockId: string; blockMovementId: string };
```

Pass `onSwapInStep={(blockId, blockMovementId) => setPicker({ kind: "swap", blockId, blockMovementId })}` to `<StepDrawer>`. Picker title (line 200): add `picker?.kind === "swap" ? "Zamień ćwiczenie" : …`. In `onPicked` handle swap first (imports: `swapExerciseInStep` from server/movements, `currentRound` from lib/step-progress):

```ts
        onPicked={async (exerciseId) => {
          if (picker?.kind === "swap") {
            const step = steps.find((s) => s.id === picker.blockId);
            await swapExerciseInStep({
              data: {
                blockMovementId: picker.blockMovementId,
                newExerciseId: exerciseId,
                fromRound: step ? currentRound(step.movements) : 1,
              },
            });
          } else if (picker?.kind === "morph") {
            await addExerciseToStep({ data: { blockId: picker.blockId, exerciseId } });
          } else {
            await addStep({ data: { sessionId: session.id, exerciseIds: [exerciseId] } });
          }
          await router.invalidate();
          setPicker(null);
        }}
```

- [ ] **Step 6: Verify** — `bun run typecheck && bun run lint && bun test` → PASS (last `completedRounds` consumer is gone). Dev-test manually later per workflow.

- [ ] **Step 7: Commit**

```bash
git add src/features/strength/components/StepDrawer.tsx src/features/strength/views/ActiveSessionView.tsx
git commit -m "feat(strength): atomic round save, per-exercise edit with swap/retire"
```

---

### Task 8: Edit modals — sets (variant 3B) and rounds

**Files:**
- Create: `src/features/strength/components/EditSetsDialog.tsx`, `src/features/strength/components/EditRoundDialog.tsx`
- Modify: `src/features/strength/components/ExerciseDrawer.tsx` (logged list, lines 321-353), `src/features/strength/components/StepDrawer.tsx` (round list, lines 457-485)

**Interfaces:**
- Consumes: `updateSet`, `deleteSet` (`server/sets`), `deleteRound` (`server/steps`), `numToInputStr` (`lib/set-form`), `Movement`/`Step` types.
- Produces: `<EditSetsDialog movement open onOpenChange />`, `<EditRoundDialog step round onClose />` (round `null` = closed handled by callers passing `open`).

- [ ] **Step 1: `EditSetsDialog.tsx`** — full file:

```tsx
import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { NumericFormat } from "react-number-format";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatSeriesCount } from "@/features/strength/lib/format-set";
import { numToInputStr } from "@/features/strength/lib/set-form";
import { deleteSet, updateSet } from "@/features/strength/server/sets";
import type { Movement, SetRow } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

type RowDraft = { reps: string; weightKg: string; durationSeconds: string; rpe: string };

const toDraft = (s: SetRow): RowDraft => ({
  reps: numToInputStr(s.reps ?? undefined),
  weightKg: numToInputStr(s.weightKg ?? undefined),
  durationSeconds: numToInputStr(s.durationSeconds ?? undefined),
  rpe: numToInputStr(s.rpe ?? undefined),
});

const draftDirty = (s: SetRow, d: RowDraft) =>
  d.reps !== numToInputStr(s.reps ?? undefined) ||
  d.weightKg !== numToInputStr(s.weightKg ?? undefined) ||
  d.durationSeconds !== numToInputStr(s.durationSeconds ?? undefined) ||
  d.rpe !== numToInputStr(s.rpe ?? undefined);

// Payload always carries all four fields (full replace, see updateSet).
const draftToPayload = (setId: string, d: RowDraft) => ({
  setId,
  reps: d.reps === "" ? null : Number(d.reps),
  weightKg: d.weightKg !== "" && Number(d.weightKg) > 0 ? Number(d.weightKg) : null,
  durationSeconds: d.durationSeconds === "" ? null : Number(d.durationSeconds),
  rpe: d.rpe === "" ? null : Number(d.rpe),
});

// All logged sets of one exercise in editable rows; X deletes immediately
// (the modal is a deliberate context — no extra confirm), "Zapisz zmiany"
// updates dirty rows.
export function EditSetsDialog({
  movement,
  open,
  onOpenChange,
}: {
  movement: Movement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Conditional body mount = fresh drafts on every open (picker pattern). */}
        {open && <EditSetsBody movement={movement} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditSetsBody({ movement, close }: { movement: Movement; close: () => void }) {
  const router = useRouter();
  const isTime = movement.exerciseDefaultUnit === "TIME";
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(movement.sets.map((s) => [s.id, toDraft(s)])),
  );
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleSets = movement.sets.filter((s) => !deletedIds.has(s.id));

  const patch = (setId: string, field: keyof RowDraft, value: string) =>
    setDrafts((prev) => ({ ...prev, [setId]: { ...prev[setId], [field]: value } }));

  const handleDelete = async (setId: string) => {
    setError(null);
    setDeletingId(setId);
    try {
      await deleteSet({ data: { setId } });
      setDeletedIds((prev) => new Set(prev).add(setId));
      await router.invalidate();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć serii."));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async () => {
    setError(null);
    const dirty = visibleSets.filter((s) => draftDirty(s, drafts[s.id]));
    const invalid = dirty.find((s) => {
      const d = drafts[s.id];
      return isTime ? d.durationSeconds === "" : d.reps === "";
    });
    if (invalid) {
      setError(isTime ? "Podaj czas w sekundach." : "Podaj liczbę powtórzeń.");
      return;
    }
    setSaving(true);
    try {
      for (const s of dirty) {
        await updateSet({ data: draftToPayload(s.id, drafts[s.id]) });
      }
      if (dirty.length > 0) await router.invalidate();
      close();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się zapisać zmian."));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle>Edytuj serie</DialogTitle>
        <DialogDescription>
          {movement.exerciseNamePl} · {formatSeriesCount(visibleSets.length)}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
          <span className="w-5 shrink-0" />
          {isTime ? (
            <span className="flex-1 text-center">Sekundy</span>
          ) : (
            <>
              <span className="flex-1 text-center">Powtórzenia</span>
              <span className="flex-1 text-center">Ciężar (kg)</span>
            </>
          )}
          <span className="w-14 shrink-0 text-center">RPE</span>
          <span className="w-8 shrink-0" />
        </div>
        {visibleSets.map((s, i) => {
          const d = drafts[s.id];
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-muted-foreground text-xs tabular-nums">{i + 1}.</span>
              {isTime ? (
                <NumericFormat
                  customInput={Input}
                  className="text-center font-bold tabular-nums"
                  inputMode="numeric"
                  decimalScale={0}
                  allowNegative={false}
                  value={d.durationSeconds}
                  valueIsNumericString
                  onValueChange={(v) => patch(s.id, "durationSeconds", v.value)}
                  aria-label={`Sekundy — seria ${i + 1}`}
                />
              ) : (
                <>
                  <NumericFormat
                    customInput={Input}
                    className="text-center font-bold tabular-nums"
                    inputMode="numeric"
                    decimalScale={0}
                    allowNegative={false}
                    value={d.reps}
                    valueIsNumericString
                    onValueChange={(v) => patch(s.id, "reps", v.value)}
                    aria-label={`Powtórzenia — seria ${i + 1}`}
                  />
                  <NumericFormat
                    customInput={Input}
                    className="text-center font-bold text-primary tabular-nums"
                    inputMode="decimal"
                    decimalScale={2}
                    allowNegative={false}
                    value={d.weightKg}
                    valueIsNumericString
                    onValueChange={(v) => patch(s.id, "weightKg", v.value)}
                    aria-label={`Ciężar — seria ${i + 1}`}
                  />
                </>
              )}
              <NumericFormat
                customInput={Input}
                className="w-14 shrink-0 text-center tabular-nums"
                placeholder="—"
                inputMode="numeric"
                decimalScale={0}
                allowNegative={false}
                isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 10)}
                value={d.rpe}
                valueIsNumericString
                onValueChange={(v) => patch(s.id, "rpe", v.value)}
                aria-label={`RPE — seria ${i + 1}`}
              />
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                onClick={() => handleDelete(s.id)}
                disabled={deletingId !== null || saving}
                aria-label={`Usuń serię ${i + 1}`}
              >
                {deletingId === s.id ? <Spinner size="sm" /> : <X className="size-4" />}
              </button>
            </div>
          );
        })}
        {visibleSets.length === 0 && (
          <p className="py-4 text-center text-muted-foreground text-sm">Brak serii.</p>
        )}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-2 px-4 pb-4">
        <Button type="button" className="w-full bg-ember shadow-ember" disabled={saving} onClick={handleSave}>
          {saving ? "Zapisuję..." : "Zapisz zmiany"}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={close}>
          Anuluj
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `EditRoundDialog.tsx`** — full file (same draft helpers, per-movement rows of one round + destructive delete-round):

```tsx
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { NumericFormat } from "react-number-format";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { numToInputStr } from "@/features/strength/lib/set-form";
import { updateSet } from "@/features/strength/server/sets";
import { deleteRound } from "@/features/strength/server/steps";
import type { SetRow, Step } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";

type RowDraft = { reps: string; weightKg: string; durationSeconds: string; rpe: string };

const toDraft = (s: SetRow): RowDraft => ({
  reps: numToInputStr(s.reps ?? undefined),
  weightKg: numToInputStr(s.weightKg ?? undefined),
  durationSeconds: numToInputStr(s.durationSeconds ?? undefined),
  rpe: numToInputStr(s.rpe ?? undefined),
});

// One row per exercise that logged this round; movements without a set in the
// round (added or swapped in later) simply don't appear.
export function EditRoundDialog({ step, round, onClose }: { step: Step; round: number | null; onClose: () => void }) {
  return (
    <Dialog open={round !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {round !== null && <EditRoundBody step={step} round={round} close={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditRoundBody({ step, round, close }: { step: Step; round: number; close: () => void }) {
  const router = useRouter();
  const entries = step.movements.flatMap((m) => {
    const set = m.sets.find((s) => s.setNumber === round);
    return set ? [{ movement: m, set }] : [];
  });
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(entries.map((e) => [e.set.id, toDraft(e.set)])),
  );
  const [saving, setSaving] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (setId: string, field: keyof RowDraft, value: string) =>
    setDrafts((prev) => ({ ...prev, [setId]: { ...prev[setId], [field]: value } }));

  const handleSave = async () => {
    setError(null);
    const dirty = entries.filter((e) => {
      const d = drafts[e.set.id];
      return (
        d.reps !== numToInputStr(e.set.reps ?? undefined) ||
        d.weightKg !== numToInputStr(e.set.weightKg ?? undefined) ||
        d.durationSeconds !== numToInputStr(e.set.durationSeconds ?? undefined) ||
        d.rpe !== numToInputStr(e.set.rpe ?? undefined)
      );
    });
    const invalid = dirty.find((e) => {
      const d = drafts[e.set.id];
      const isTime = e.movement.exerciseDefaultUnit === "TIME";
      return isTime ? d.durationSeconds === "" : d.reps === "";
    });
    if (invalid) {
      setError(`Uzupełnij wartości: ${invalid.movement.exerciseNamePl}.`);
      return;
    }
    setSaving("save");
    try {
      for (const e of dirty) {
        const d = drafts[e.set.id];
        await updateSet({
          data: {
            setId: e.set.id,
            reps: d.reps === "" ? null : Number(d.reps),
            weightKg: d.weightKg !== "" && Number(d.weightKg) > 0 ? Number(d.weightKg) : null,
            durationSeconds: d.durationSeconds === "" ? null : Number(d.durationSeconds),
            rpe: d.rpe === "" ? null : Number(d.rpe),
          },
        });
      }
      if (dirty.length > 0) await router.invalidate();
      close();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się zapisać zmian."));
      setSaving(null);
    }
  };

  const handleDeleteRound = async () => {
    setError(null);
    setSaving("delete");
    try {
      await deleteRound({ data: { blockId: step.id, roundNumber: round } });
      await router.invalidate();
      close();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć rundy."));
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle>Edytuj rundę {round}</DialogTitle>
        <DialogDescription>{step.movements.map((m) => m.exerciseNamePl).join(" + ")}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2">
        {entries.map(({ movement, set }) => {
          const d = drafts[set.id];
          const isTime = movement.exerciseDefaultUnit === "TIME";
          return (
            <div key={set.id}>
              <p className="mb-1 font-semibold text-sm">{movement.exerciseNamePl}</p>
              <div className="flex items-center gap-1.5">
                {isTime ? (
                  <NumericFormat
                    customInput={Input}
                    className="text-center font-bold tabular-nums"
                    placeholder="sek."
                    inputMode="numeric"
                    decimalScale={0}
                    allowNegative={false}
                    value={d.durationSeconds}
                    valueIsNumericString
                    onValueChange={(v) => patch(set.id, "durationSeconds", v.value)}
                    aria-label={`Sekundy: ${movement.exerciseNamePl}`}
                  />
                ) : (
                  <>
                    <NumericFormat
                      customInput={Input}
                      className="text-center font-bold tabular-nums"
                      placeholder="powt."
                      inputMode="numeric"
                      decimalScale={0}
                      allowNegative={false}
                      value={d.reps}
                      valueIsNumericString
                      onValueChange={(v) => patch(set.id, "reps", v.value)}
                      aria-label={`Powtórzenia: ${movement.exerciseNamePl}`}
                    />
                    <NumericFormat
                      customInput={Input}
                      className="text-center font-bold text-primary tabular-nums"
                      placeholder="kg"
                      inputMode="decimal"
                      decimalScale={2}
                      allowNegative={false}
                      value={d.weightKg}
                      valueIsNumericString
                      onValueChange={(v) => patch(set.id, "weightKg", v.value)}
                      aria-label={`Ciężar: ${movement.exerciseNamePl}`}
                    />
                  </>
                )}
                <NumericFormat
                  customInput={Input}
                  className="w-14 shrink-0 text-center tabular-nums"
                  placeholder="RPE"
                  inputMode="numeric"
                  decimalScale={0}
                  allowNegative={false}
                  isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 10)}
                  value={d.rpe}
                  valueIsNumericString
                  onValueChange={(v) => patch(set.id, "rpe", v.value)}
                  aria-label={`RPE: ${movement.exerciseNamePl}`}
                />
              </div>
            </div>
          );
        })}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-2 px-4 pb-4">
        <Button type="button" className="w-full bg-ember shadow-ember" disabled={saving !== null} onClick={handleSave}>
          {saving === "save" ? "Zapisuję..." : "Zapisz zmiany"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          disabled={saving !== null}
          onClick={handleDeleteRound}
        >
          {saving === "delete" ? "Usuwam..." : `Usuń rundę ${round}`}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={close} disabled={saving !== null}>
          Anuluj
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into `ExerciseDrawer`.** In the "W tej sesji" box (lines 321-353): delete the per-row ✕ button (and `handleDeleteSet`, `deletingSetId`, `deleteError` state + `deleteSet` import — deletion now lives in the modal); rows become plain `<li>` text. Header gets the pencil:

```tsx
                <p className="mb-1 flex items-center justify-between gap-1.5 font-medium">
                  <span className="flex items-center gap-1.5">
                    <ListChecks className="size-3.5 text-primary" />W tej sesji:
                  </span>
                  {!isEnded && (
                    <button
                      type="button"
                      className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => setEditOpen(true)}
                      aria-label="Edytuj serie"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </p>
```

Note: `ExerciseDrawerBody` has no `isEnded` prop today — it renders only for active sessions (`ActiveSessionView` gates `StepDrawer` behind `!isEnded`), so drop the guard and render the pencil unconditionally. Add `const [editOpen, setEditOpen] = useState(false);` and after the `</form>`'s closing `</Form>` sibling position, render inside the form root (after `FormRootMessage` container is fine):

```tsx
        <EditSetsDialog movement={movement} open={editOpen} onOpenChange={setEditOpen} />
```

Imports: `Pencil` (lucide), `EditSetsDialog`.

- [ ] **Step 4: Wire into `StepDrawer` RoundBody.** Round list rows (lines 457-485): replace the ✕ button with a pencil opening the round modal; delete `handleDeleteRound` + `deletingRound` state (moved into the modal):

```tsx
                    <button
                      type="button"
                      className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setEditingRound(r)}
                      aria-label={`Edytuj rundę ${r}`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
```

Add `const [editingRound, setEditingRound] = useState<number | null>(null);` and render next to the movement-action dialog:

```tsx
      <EditRoundDialog step={step} round={editingRound} onClose={() => setEditingRound(null)} />
```

Import cleanup in `StepDrawer.tsx`: drop the now-unused `deleteRound` import (it lives in `EditRoundDialog`); keep `Pencil` added in Task 7.

- [ ] **Step 5: Verify** — `bun run typecheck && bun run lint && bun test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/strength/components/EditSetsDialog.tsx src/features/strength/components/EditRoundDialog.tsx src/features/strength/components/ExerciseDrawer.tsx src/features/strength/components/StepDrawer.tsx
git commit -m "feat(strength): edit modals for logged sets and rounds via updateSet"
```

---

### Task 9: Timed single-exercise logging + icons

**Files:**
- Modify: `src/features/strength/components/ExerciseDrawer.tsx`, `src/features/strength/components/StepDrawer.tsx` (drop `formatRoundSet`), `src/features/strength/components/EndedStepCard.tsx`, `src/features/strength/components/MovementRow.tsx`

**Interfaces:**
- Consumes: `timeSetFormSchema`, `stepSeconds` (Task 4), duration-aware `formatSet` (Task 3), `addSet` with `durationSeconds` (Task 5).

- [ ] **Step 1: Split `ExerciseDrawerBody`.** Rename the current body component to `RepsBody` (private) and make the export a thin switch:

```tsx
export function ExerciseDrawerBody({ movement, nav }: { movement: Movement; nav: ReactNode }) {
  return movement.exerciseDefaultUnit === "TIME" ? (
    <TimeBody movement={movement} nav={nav} />
  ) : (
    <RepsBody movement={movement} nav={nav} />
  );
}
```

- [ ] **Step 2: `TimeBody`** — same file, mirrors RepsBody minus reps/weight (kind chips + seconds stepper ±5 + RPE chips + logged list + pencil→EditSetsDialog + submit). Complete component:

```tsx
function TimeBody({ movement, nav }: { movement: Movement; nav: ReactNode }) {
  const router = useRouter();
  const initialKind = suggestKind(movement);
  const seed = seedSetFields(movement.sets, movement.lastByKind, initialKind);

  const form = useForm<TimeSetFormInput, unknown, TimeSetFormValues>({
    resolver: zodResolver(timeSetFormSchema),
    defaultValues: { kind: initialKind, durationSeconds: numToInputStr(seed?.durationSeconds), rpe: null },
    mode: "onSubmit",
  });
  const [editOpen, setEditOpen] = useState(false);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await addSet({
        data: {
          blockMovementId: movement.id,
          durationSeconds: values.durationSeconds,
          rpe: values.rpe ?? undefined,
          kind: values.kind,
        },
      });
      await router.invalidate();
      form.reset({ kind: values.kind, durationSeconds: numToInputStr(values.durationSeconds), rpe: null });
    } catch (err) {
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się zapisać serii."),
      });
    }
  });

  const isSubmitting = form.formState.isSubmitting;
  const currentKind = useWatch({ control: form.control, name: "kind" });

  return (
    <Form {...form}>
      <form className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden" onSubmit={onSubmit} noValidate>
        <DialogHeader className="shrink-0">
          <DialogTitle>{movement.exerciseNamePl}</DialogTitle>
          <DialogDescription className="sr-only">Logowanie serii: {movement.exerciseNamePl}</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-4 pt-1 pb-2">{nav}</div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
          <div className="space-y-3">
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Typ serii</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-3 gap-1.5">
                      {VISIBLE_SET_KINDS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={`rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
                            field.value === k
                              ? "border-transparent bg-ember"
                              : "border-border text-muted-foreground hover:bg-accent"
                          }`}
                          onClick={() => field.onChange(k)}
                        >
                          {SET_KIND_LABEL[k]}
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Controller
              control={form.control}
              name="durationSeconds"
              render={({ field, fieldState }) => (
                <div className="space-y-1.5">
                  <Label htmlFor="duration">Czas (sekundy)</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => field.onChange(stepSeconds(field.value, -5))}
                    >
                      −5
                    </Button>
                    <NumericFormat
                      id="duration"
                      customInput={Input}
                      className="text-center font-extrabold text-xl tabular-nums"
                      inputMode="numeric"
                      value={field.value}
                      valueIsNumericString
                      onValueChange={(values) => field.onChange(values.value)}
                      decimalScale={0}
                      allowNegative={false}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => field.onChange(stepSeconds(field.value, 5))}
                    >
                      +5
                    </Button>
                  </div>
                  {fieldState.error && (
                    <p className="text-destructive text-xs" role="alert">
                      {fieldState.error.message}
                    </p>
                  )}
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="rpe"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <Label>RPE (opcjonalne)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {[6, 7, 8, 9, 10].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`rounded-md border px-3 py-1 font-semibold text-sm transition-colors ${
                          field.value === v
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                        onClick={() => field.onChange(field.value === v ? null : v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            />

            {movement.sets.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-xs">
                <p className="mb-1 flex items-center justify-between gap-1.5 font-medium">
                  <span className="flex items-center gap-1.5">
                    <ListChecks className="size-3.5 text-primary" />W tej sesji:
                  </span>
                  <button
                    type="button"
                    className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => setEditOpen(true)}
                    aria-label="Edytuj serie"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </p>
                <ul className="space-y-0.5">
                  {movement.sets.map((s, i) => (
                    <li key={s.id} className={SET_KIND_COLOR[s.kind as SetKind]}>
                      {i + 1}. {SET_KIND_LABEL[s.kind as SetKind]} · {formatSet(s)}
                      {s.rpe !== null && ` · RPE ${s.rpe}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <FormRootMessage />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2">
          <Button type="submit" className="w-full bg-ember shadow-ember" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              "Zapisuję..."
            ) : (
              <>
                <Zap className="size-4" />
                Zapisz serię ({SET_KIND_LABEL[currentKind]})
              </>
            )}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="w-full">
              Zamknij
            </Button>
          </DialogClose>
        </DialogFooter>
        <EditSetsDialog movement={movement} open={editOpen} onOpenChange={setEditOpen} />
      </form>
    </Form>
  );
}
```

Imports to extend at the top of `ExerciseDrawer.tsx`: `stepSeconds, timeSetFormSchema, type TimeSetFormInput, type TimeSetFormValues` from `lib/set-form`.

- [ ] **Step 3: Kill `formatRoundSet`.** `formatSet` now handles durations (Task 3): in `StepDrawer.tsx` delete the `formatRoundSet` export (lines 129-134) and use `formatSet` at its call site; in `EndedStepCard.tsx` replace the `formatRoundSet` import with `formatSet` (already imported) at line 68.

- [ ] **Step 4: Timer icons.** `MovementRow.tsx` line 60 and `EndedStepCard.tsx` line 52 — TIME exercises show `Timer` instead of `Dumbbell`:

```tsx
{movement.exerciseDefaultUnit === "TIME" ? <Timer className="size-5" /> : <Dumbbell className="size-5" />}
```

(EndedStepCard: `{isCircuit ? <Repeat2 …/> : step.movements[0].exerciseDefaultUnit === "TIME" ? <Timer className="size-5" /> : <Dumbbell …/>}`; import `Timer` from lucide in both.)

- [ ] **Step 5: Verify** — `bun run typecheck && bun run lint && bun test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/strength/components/
git commit -m "feat(strength): timed sets in single-exercise logging, unified duration format"
```

---

### Task 10: History delete — redirect + cache invalidation

**Files:**
- Modify: `src/features/strength/views/ActiveSessionView.tsx:228-236`, `src/features/strength/views/HyroxSessionView.tsx:79-82`

- [ ] **Step 1: `ActiveSessionView`.** Add `import { useQueryClient } from "@tanstack/react-query";`, `const queryClient = useQueryClient();` next to the other hooks, and change the confirm handler:

```tsx
        onConfirm={async () => {
          await deleteSession({ data: { sessionId: session.id } });
          queryClient.invalidateQueries({ queryKey: ["history"] });
          navigate({ to: "/sessions" });
        }}
```

- [ ] **Step 2: `HyroxSessionView`.** Same pattern in `removeSession`:

```tsx
  const removeSession = async () => {
    await deleteSession({ data: { sessionId: session.id } });
    queryClient.invalidateQueries({ queryKey: ["history"] });
    navigate({ to: "/sessions" });
  };
```

- [ ] **Step 3: Verify** — `bun run typecheck && bun run lint` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/strength/views/ActiveSessionView.tsx src/features/strength/views/HyroxSessionView.tsx
git commit -m "fix(strength): session delete returns to history and invalidates its cache"
```

---

### Task 11: `inputMode` audit

**Files:**
- Modify: `src/features/strength/components/ExerciseDrawer.tsx` (RepsBody steppers) + every `NumericFormat` found below.

- [ ] **Step 1: Find them all**

Run: `grep -rn "NumericFormat" src --include="*.tsx" -l`
Expected files (verify): `ExerciseDrawer.tsx`, `StepDrawer.tsx` (has inputMode already), `EditSetsDialog.tsx`/`EditRoundDialog.tsx` (created with inputMode), `ActivatePlanDialog.tsx`, plus any goals/plan editors the grep reveals.

- [ ] **Step 2: Fix.** Rule: integers (reps, seconds, weeks, RPE) → `inputMode="numeric"`; decimals (kg) → `inputMode="decimal"`. In RepsBody: reps input (line ~221) gets `inputMode="numeric"`, weight input (line ~265) gets `inputMode="decimal"`. Apply the same to every hit from Step 1 that lacks the prop.

- [ ] **Step 3: Verify** — `bun run typecheck && bun run lint` → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "fix(ui): explicit inputMode on every NumericFormat for mobile keyboards"
```

---

### Task 12: Schedule slot — lib + server

**Files:**
- Modify: `src/features/plan/constants.ts`, `src/features/plan/lib/schedule.ts`, `src/features/plan/server/queries.ts`, `src/features/plan/server/plan.ts`
- Test: `src/features/plan/lib/schedule.test.ts` (append)

**Interfaces:**
- Produces: `DAY_SLOTS`, `DaySlot`, `DAY_SLOT_LABEL` (constants); `ScheduleEntry.slot: DaySlot`, `WeekAssignment.slot`, `WeekOverride.slot`; `resolveWeek` sorts each day MORNING→EVENING (stable); `setScheduleEntrySlot(…)` server fn; `addScheduleEntry`/`moveScheduleEntry(PLAN)`/`activatePlan` carry `slot`.

- [ ] **Step 1: Constants** — append to `src/features/plan/constants.ts`:

```ts
export const DAY_SLOTS = ["MORNING", "EVENING"] as const;
export type DaySlot = (typeof DAY_SLOTS)[number];
export const DAY_SLOT_LABEL: Record<DaySlot, string> = { MORNING: "Rano", EVENING: "Wieczór" };
```

- [ ] **Step 2: Failing test** — append to `schedule.test.ts` (adapt the file's existing fixture helper if one exists; otherwise this standalone unit fixture):

```ts
describe("resolveWeek — day slots", () => {
  const unit = (unitId: string): ScheduleUnit => ({
    unitId,
    planId: "p1",
    planName: "Plan",
    name: unitId,
    sessionType: "STRENGTH",
    intensity: "MEDIUM",
    training: "",
    goal: null,
    exercises: [],
  });
  const dates = weekDates("2026-07-20");

  test("evening plan entry sorts after a morning ADD on the same day", () => {
    const entries = resolveWeek(
      dates,
      [{ dayOfWeek: 0, unit: unit("u-evening"), activeFrom: null, activeTo: null, slot: "EVENING" }],
      [
        {
          id: "o1",
          date: "2026-07-20",
          kind: "ADD",
          unitId: "u-morning",
          unit: unit("u-morning"),
          sessionType: null,
          name: null,
          note: null,
          slot: "MORNING",
        },
      ],
    );
    expect(entries.map((e) => e.unitId)).toEqual(["u-morning", "u-evening"]);
    expect(entries[0].slot).toBe("MORNING");
  });
});
```

Run: `bun test src/features/plan/lib/schedule.test.ts` → FAIL (no `slot`).

- [ ] **Step 3: Lib.** In `schedule.ts`: import `type DaySlot` from `../constants`; add `slot: DaySlot;` to `ScheduleEntry`, `WeekAssignment`, `WeekOverride`. In `resolveWeek`, collect per-day then sort stably before pushing:

```ts
  dates.forEach((date, dayOfWeek) => {
    const dayEntries: ScheduleEntry[] = [];
    for (const a of assignments) {
      if (a.dayOfWeek !== dayOfWeek || skipped.has(`${a.unit.unitId}:${date}`)) continue;
      if (a.activeFrom && date < a.activeFrom) continue;
      if (a.activeTo && date > a.activeTo) continue;
      dayEntries.push({ date, source: "PLAN", overrideId: null, note: null, slot: a.slot, ...a.unit });
    }
    for (const o of overrides) {
      if (o.date !== date) continue;
      if (o.kind === "ADD" && o.unit) {
        dayEntries.push({ date, source: "ADD", overrideId: o.id, note: o.note, slot: o.slot, ...o.unit });
      } else if (o.kind === "ADHOC") {
        dayEntries.push({
          date,
          source: "ADHOC",
          overrideId: o.id,
          slot: o.slot,
          unitId: null,
          planId: null,
          planName: null,
          name: o.name ?? "Trening",
          sessionType: o.sessionType ?? "OTHER",
          intensity: null,
          training: "",
          goal: null,
          note: o.note,
          exercises: [],
        });
      }
    }
    dayEntries.sort((a, b) => (a.slot === "MORNING" ? 0 : 1) - (b.slot === "MORNING" ? 0 : 1));
    entries.push(...dayEntries);
  });
```

Run the test → PASS.

- [ ] **Step 4: Queries.** In `queries.ts` `loadWeekSchedule`: add `slot: trainingPlanUnitDays.slot,` to `assignmentRows` select and `slot: scheduleOverrides.slot,` to `overrideRows`; map them into `assignments` (`slot: r.slot`) and `overrides` (`slot: r.slot`).

- [ ] **Step 5: Mutations in `plan.ts`.**
  1. `activatePlanInput` assignments entries gain `slot: z.enum(DAY_SLOTS).default("MORNING")` (import `DAY_SLOTS` from `../constants`); `RunActivateArgs.assignments` type gains `slot: DaySlot`; the rows insert becomes `({ athleteId, unitId: a.unitId, dayOfWeek, slot: a.slot })`.
  2. `addScheduleEntryInput`: both union branches gain `slot: z.enum(DAY_SLOTS).default("MORNING")`; both inserts add `slot: data.slot`.
  3. `moveScheduleEntryInput` PLAN branch gains `slot: z.enum(DAY_SLOTS).default("MORNING")`; `runMovePlanEntry` gains a `slot` param and the ADD insert becomes `{ athleteId, date: toDate, kind: "ADD", unitId, slot }`.
  4. New fn:

```ts
const setSlotInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PLAN"), unitId: z.uuid(), date: isoDate, slot: z.enum(DAY_SLOTS) }),
  z.object({ kind: z.literal("OVERRIDE"), overrideId: z.uuid(), slot: z.enum(DAY_SLOTS) }),
]);

// Slot change on a recurring plan entry materializes it as a same-date
// SKIP+ADD override pair (same mechanism as cross-day moves).
export const setScheduleEntrySlot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(setSlotInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    if (data.kind === "OVERRIDE") {
      const [row] = await db
        .update(scheduleOverrides)
        .set({ slot: data.slot })
        .where(and(eq(scheduleOverrides.id, data.overrideId), eq(scheduleOverrides.athleteId, athleteId)))
        .returning({ id: scheduleOverrides.id });
      if (!row) throw new Error("Nie znaleziono wpisu harmonogramu.");
      return;
    }
    const { db: tx_db, end } = await createPool();
    try {
      await tx_db.transaction(async (tx) => {
        const [unit] = await tx
          .select({ id: trainingPlanUnits.id })
          .from(trainingPlanUnits)
          .where(and(eq(trainingPlanUnits.id, data.unitId), eq(trainingPlanUnits.athleteId, athleteId)));
        if (!unit) throw new Error("Nie znaleziono jednostki treningowej.");
        await tx
          .insert(scheduleOverrides)
          .values({ athleteId, date: data.date, kind: "SKIP", unitId: data.unitId })
          .onConflictDoNothing();
        const [existingAdd] = await tx
          .select({ id: scheduleOverrides.id })
          .from(scheduleOverrides)
          .where(
            and(
              eq(scheduleOverrides.athleteId, athleteId),
              eq(scheduleOverrides.unitId, data.unitId),
              eq(scheduleOverrides.date, data.date),
              eq(scheduleOverrides.kind, "ADD"),
            ),
          );
        if (existingAdd) {
          await tx.update(scheduleOverrides).set({ slot: data.slot }).where(eq(scheduleOverrides.id, existingAdd.id));
        } else {
          await tx
            .insert(scheduleOverrides)
            .values({ athleteId, date: data.date, kind: "ADD", unitId: data.unitId, slot: data.slot });
        }
      });
    } finally {
      await end();
    }
  });
```

- [ ] **Step 6: Verify** — `bun run typecheck && bun run lint && bun test` → typecheck will flag `ScheduleTab`/`ActivatePlanDialog`/`AddToDaySheet` call sites missing `slot` — those are Task 13; do Tasks 12+13 back-to-back before a repo-wide check. Lib tests must PASS now.

- [ ] **Step 7: Commit**

```bash
git add src/features/plan/
git commit -m "feat(plan): day slot (morning/evening) in schema plumbing, sorting, slot mutation"
```

---

### Task 13: Schedule slot — UI + mobile DnD off

**Files:**
- Modify: `src/features/plan/components/ScheduleTab.tsx`, `src/features/plan/components/AddToDaySheet.tsx`, `src/features/plan/components/ActivatePlanDialog.tsx`, `src/features/plan/lib/adhoc-form.ts`

- [ ] **Step 1: Mouse-only drag.** In `ScheduleTab.tsx` replace the sensors (imports too — drop `PointerSensor`, `TouchSensor`, add `MouseSensor`):

```ts
  // Drag stays a desktop affordance; on touch the tap → action sheet covers
  // moving between days and slots.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }));
```

- [ ] **Step 2: Slot chip on `EntryCard`.** Imports: `Moon, Sun` from lucide, `DAY_SLOT_LABEL` from `../constants`. In the top row after the intensity pill:

```tsx
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
          {entry.slot === "MORNING" ? <Sun className="size-3" /> : <Moon className="size-3" />}
          {DAY_SLOT_LABEL[entry.slot]}
        </span>
```

- [ ] **Step 3: "Pora dnia" in `EntryActionSheet`.** Add prop `onSetSlot: (entry: ScheduleEntry, slot: DaySlot) => void`; render above the move-day section:

```tsx
              <div>
                <p className="mb-1.5 font-medium text-muted-foreground text-xs">Pora dnia</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DAY_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      disabled={slot === entry.slot}
                      className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
                        slot === entry.slot
                          ? "border-transparent bg-ember"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                      onClick={() => onSetSlot(entry, slot)}
                    >
                      {slot === "MORNING" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                      {DAY_SLOT_LABEL[slot]}
                    </button>
                  ))}
                </div>
              </div>
```

In `ScheduleTab` pass the handler (imports: `setScheduleEntrySlot`, `type DaySlot`, `DAY_SLOTS`):

```tsx
        onSetSlot={(entry, slot) => {
          setAction(null);
          void (async () => {
            try {
              await setScheduleEntrySlot({
                data:
                  entry.source === "PLAN"
                    ? { kind: "PLAN", unitId: entry.unitId as string, date: entry.date, slot }
                    : { kind: "OVERRIDE", overrideId: entry.overrideId as string, slot },
              });
              await router.invalidate();
            } catch (err) {
              toast.error(getErrorMessage(err, "Nie udało się zmienić pory dnia."));
            }
          })();
        }}
```

Also: the PLAN branch of `move()` (drag between days) now passes the entry's slot — `{ kind: "PLAN", unitId: …, fromDate: entry.date, toDate, slot: entry.slot }`.

- [ ] **Step 4: `AddToDaySheet` slot segment.** `adhoc-form.ts`: add `slot: z.enum(DAY_SLOTS)` to `adhocFormSchema` (import from `../constants`), default set at `useForm` (`slot: "MORNING"`). In the sheet: for unit mode add local `const [slot, setSlot] = useState<DaySlot>("MORNING");` + the same two-chip segment (labeled "Pora dnia") above the unit list, and pass `slot` in both `addScheduleEntry` calls (`{ date, unitId, slot }` and the adhoc payload `{ …, slot: values.slot }`); adhoc mode renders the segment as an RHF `FormField` over `slot` with the same chip markup.

- [ ] **Step 5: `ActivatePlanDialog` per-unit slot.** One slot per unit (applies to all its days; simplification noted in spec review — re-activation defaults back to Rano). Add state next to `days`:

```ts
  const [slots, setSlots] = useState<Record<string, DaySlot>>(() =>
    Object.fromEntries(plan.units.map((u) => [u.id, "MORNING" as DaySlot])),
  );
```

Render under each unit's weekday chips a compact two-chip segment (same markup as Step 3, `onClick={() => setSlots((prev) => ({ ...prev, [u.id]: slot }))}`, active = `slots[u.id] === slot`). Submit: `assignments = plan.units.map((u) => ({ unitId: u.id, days: days[u.id] ?? [], slot: slots[u.id] ?? "MORNING" }))`.

- [ ] **Step 6: Verify** — `bun run typecheck && bun run lint && bun test` → PASS (whole repo compiles again).

- [ ] **Step 7: Commit**

```bash
git add src/features/plan/
git commit -m "feat(plan): morning/evening slot UI in schedule, mouse-only drag"
```

---

### Task 14: BackLink

**Files:**
- Create: `src/shared/components/BackLink.tsx`
- Modify: `src/features/strength/views/ActiveSessionView.tsx` (header, lines 65-69), `src/features/strength/views/HyroxSessionView.tsx` (headers), `src/features/strength/views/ExerciseStatsView.tsx` (local BackLink), `src/features/notes/views/NoteEditorView.tsx:165`, `src/features/auth/views/MeView.tsx:17`

- [ ] **Step 1: Component** — mirror the hand-rolled pattern from `ExerciseStatsView` (read its local `BackLink` at lines ~148-158 first and copy its exact classes; expected shape):

```tsx
import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

// Fixed destination, not history.back() — predictable regardless of entry point.
export function BackLink({ to, label }: { to: LinkProps["to"]; label: string }) {
  return (
    <Link
      to={to}
      className="-ml-1.5 inline-flex w-fit items-center gap-0.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-4" />
      {label}
    </Link>
  );
}
```

- [ ] **Step 2: Session views.** `ActiveSessionView` header becomes:

```tsx
      <header className="flex items-center justify-between pt-2">
        <BackLink to="/sessions" label="Historia" />
        <span className="text-muted-foreground text-xs">
          {new Date(session.date).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </header>
```

`HyroxSessionView`: apply the same `justify-end` → `justify-between` + `<BackLink to="/sessions" label="Historia" />` to its header blocks in the ended/summary and empty states (grep `justify-end pt-2` in the file; skip the live-timer screen — no navigation chrome mid-workout).

- [ ] **Step 3: Refactor the three hand-rolled links** in `ExerciseStatsView` (delete local `BackLink`, import shared: `<BackLink to="/stats" label="Statystyki" />`), `NoteEditorView` and `MeView` (match each file's current `to`/label; visual parity check against the old classes).

- [ ] **Step 4: Verify** — `bun run typecheck && bun run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/BackLink.tsx src/features/
git commit -m "feat(ui): shared BackLink, session summary returns to history"
```

---

### Task 15: Strings sweep + full check

**Files:**
- Modify: anything the greps below surface.

- [ ] **Step 1: Round-naming sweep**

Run: `grep -rn "obwod\|obwód\|obwody\|obwodów\|Obwód" src --include="*.tsx" --include="*.ts" -i`
Every counter/save/delete/error string must say **runda**; keep: "+ Obwód" (ActiveSessionView), "+ Ćwiczenie do obwodu", "Notatka do obwodu…", "Nowy obwód"/picker copy, "Ćwiczenie w obwodzie", "Usuń z obwodu", "Logowanie obwodu", "Obwód musi mieć…". Fix any stragglers (e.g. `EndSessionDrawer`, dashboard previews) the grep reveals.

- [ ] **Step 2: Full gate**

Run: `bun run check` (lint + typecheck + test + knip)
Expected: PASS — knip especially must not flag `completedRounds`/`formatRoundSet` leftovers or unused new exports.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(strength): round naming sweep, green check"
```

---

## Dev-test checklist (KJ, on dev)

Per the paused-verification convention — after green checks STOP; KJ tests:

1. Obwód z celem 4: karta "Rundy 0/4" → po 1 zapisie "Rundy 1/4" (nie 2/4), po 5 rundach "Rundy 5/4 ✓"; drawer "Runda 2 / 4", bez kropek; przycisk "Zapisz rundę".
2. Ołówek przy ćwiczeniu → zamiana od rundy 2; podsumowanie pokazuje "—" w rundzie 1 dla nowego ćwiczenia; licznik dalej rośnie.
3. Edycja serii (modal, RPE w wierszu), edycja rundy, usuwanie z modali.
4. Plank (jednostka Czas) w pojedynczym logowaniu: stepper ±5 s, "30s" w listach.
5. Usunięcie sesji → ląduje na Historii, trening znika natychmiast.
6. Klawiatura numeryczna w pojedynczym ćwiczeniu na telefonie.
7. Harmonogram: chip Rano/Wieczór, zmiana pory w arkuszu, sortowanie, brak drag na mobile.
8. Strzałka "‹ Historia" na podsumowaniu i aktywnej sesji.
