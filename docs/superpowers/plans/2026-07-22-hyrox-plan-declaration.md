# Hyrox — Etap 1: deklaracja w planie + materializacja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jednostka planu typu HYROX deklaruje bloki (stacje z targetami × rundy + przerwa między rundami) i materializuje się w sesję przy starcie z planu.

**Architecture:** Rozszerzamy istniejący łańcuch plan→unit→steps→step_exercises o targety i `restSeconds`, zdejmujemy unikalne indeksy blokujące powtórzone ćwiczenie w sekwencji, dodajemy edytor bloków Hyrox obok edytora siłowego w `UnitDrawer`, i przepuszczamy jednostki HYROX przez `loadStartableUnits` → `createSession(fromUnitId)`.

**Tech Stack:** TanStack Start (createServerFn), Drizzle + Neon (HTTP `db` / WebSocket `createPool()`), Zod, RHF tylko dla pól prostych (struktura kroków poza RHF), react-number-format, bun test.

**Spec:** `docs/superpowers/specs/2026-07-22-hyrox-training-design.md`

## Global Constraints

- Język: kod/komentarze EN, copy w apce PL, commity EN (Conventional Commits).
- Commity kończą się trailerem: `Co-Authored-By: Claude <noreply@anthropic.com>` (bez wersji).
- ŻADNYCH commitów/pushy bez zgody KJ w sesji; commit-steps w tym planie wykonujemy dopiero po jego jednorazowym "go" dla planu.
- Żadnych `FRG-N` w kodzie/komentarzach (tylko commit/PR/ADR-metadata).
- Po edycjach: `bun run typecheck` **i** `bun run lint`; po `db:generate` dodatkowo `bun run format`.
- Numeryczne inputy: `NumericFormat` z `customInput={Input}`, nigdy `type=number`.
- Komentarze minimalne — tylko ukryte niezmienniki.
- Branch: wygenerowany przez Linear VERBATIM (KJ poda nazwę po utworzeniu issue).

## Prerequisites (KJ, ręcznie)

1. Linear issue (EN), proponowany tytuł: **"Hyrox plan units: block/station declaration and session materialization"**, opis = link do spec + skrót zakresu Etapu 1.
2. Podaj wygenerowaną nazwę brancha. Pierwszy commit na branchu: spec + ten plan (`docs: add hyrox training spec and stage 1 plan`).

---

### Task 1: Schema — kolumny targetów/restSeconds + zdjęcie unikalnych indeksów + guard w `addExerciseToStep`

Indeks `block_movements_block_exercise_uq` jest oparciem dla `onConflictDoNothing` w `addExerciseToStep` — zdjęcie indeksu i zmiana kodu muszą wejść razem, inaczej `onConflictDoNothing({ target })` wybuchnie w runtime.

**Files:**
- Modify: `db/schema.ts:516-548` (blockMovements), `db/schema.ts:976-1021` (unit steps + step exercises)
- Modify: `src/features/strength/server/steps.ts:102-124` (addExerciseToStep)
- Create: `db/migrations/00XX_*.sql` (via `bun run db:generate`)

**Interfaces:**
- Produces: kolumny `trainingPlanUnitSteps.restSeconds`, `trainingPlanUnitStepExercises.targetReps|targetDistanceM`, `blockMovements.targetReps` — używane w Taskach 4–8.

- [ ] **Step 1: Edytuj `db/schema.ts` — blockMovements**

W `blockMovements` dodaj kolumnę po `exerciseId` i usuń unikalny indeks wraz z jego komentarzem:

```ts
    exerciseId: uuid()
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    // Hyrox stations: declared target (reps or meters, by exercise unit).
    targetReps: integer(),
    targetDurationSeconds: integer(),
```

W bloku indeksów USUŃ linie (komentarz + indeks):

```ts
    // One row per exercise per block — server-side guard against the double-add
    // race (slow network / double-tap). addExerciseToSession relies on this via
    // INSERT … ON CONFLICT. Existing duplicates are removed in the same
    // migration before the index is created.
    uniqueIndex("block_movements_block_exercise_uq").on(t.blockId, t.exerciseId),
```

- [ ] **Step 2: Edytuj `db/schema.ts` — unit steps + step exercises**

W `trainingPlanUnitSteps` po `durationSeconds`:

```ts
    // REST steps: planned break length.
    durationSeconds: integer(),
    // Hyrox blocks: declared rest between rounds.
    restSeconds: integer(),
```

W `trainingPlanUnitStepExercises` po `exerciseId` dodaj:

```ts
    // Hyrox stations: declared target (reps or meters, by exercise unit).
    targetReps: integer(),
    targetDistanceM: integer(),
```

USUŃ `uniqueIndex("training_plan_unit_step_exercises_step_exercise_uq").on(t.stepId, t.exerciseId),` i zaktualizuj komentarz nad tabelą — usuń zdanie o unikalności, dodaj: `// A Hyrox sequence may repeat an exercise (e.g. Bieg twice per round), so there is no per-step uniqueness.`

- [ ] **Step 3: Przepnij `addExerciseToStep` na guard w kodzie**

W `src/features/strength/server/steps.ts` zastąp insert z `onConflictDoNothing`:

```ts
    const [existing] = await db
      .select({ id: blockMovements.id })
      .from(blockMovements)
      .where(and(eq(blockMovements.blockId, data.blockId), eq(blockMovements.exerciseId, data.exerciseId)));
    if (existing) throw new Error("To ćwiczenie jest już w tym kroku.");

    const [row] = await db
      .insert(blockMovements)
      .values({
        athleteId,
        blockId: data.blockId,
        orderIndex: sql`coalesce((select max(order_index) + 1 from block_movements where block_id = ${data.blockId}), 0)`,
        exerciseId: data.exerciseId,
      })
      .returning({ id: blockMovements.id });
    return { blockMovementId: row.id };
```

(Okno wyścigu przy double-tapie akceptujemy: skutkiem jest usuwalny duplikat w superserii, nie korupcja danych.)

- [ ] **Step 4: Wygeneruj migrację i sformatuj**

Run: `bun run db:generate` → nowy plik w `db/migrations/`; przejrzyj SQL: 4×`ADD COLUMN`, 2×`DROP INDEX`, zero DROP TABLE/DATA.
Run: `bun run format`

- [ ] **Step 5: Zastosuj migrację lokalnie**

Run: `bun run db:migrate`
Expected: migracja przechodzi bez błędów.

- [ ] **Step 6: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: zielono.

- [ ] **Step 7: Commit**

```bash
git add db/schema.ts db/migrations src/features/strength/server/steps.ts
git commit -m "feat(db): hyrox targets and rest columns, allow repeated exercise in sequence

Drops the per-block/per-step exercise unique indexes (a Hyrox round may
run the same exercise twice); the double-add guard in addExerciseToStep
moves to a code check.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `ExerciseOption` niesie `defaultUnit`

Edytor bloków Hyrox decyduje po jednostce ćwiczenia, czy target to powtórzenia czy metry.

**Files:**
- Modify: `src/features/strength/server/exercises.ts:47-54` (listAllExercises)
- Modify: `src/features/plan/components/ExerciseListPicker.tsx:10` (typ)

**Interfaces:**
- Produces: `ExerciseOption = { id: string; namePl: string; aliases: string[]; defaultUnit: "REPS" | "TIME" | "DISTANCE" | "CALORIES" }` — konsumowane w Taskach 4/6.

- [ ] **Step 1: Rozszerz select w `listAllExercises`**

```ts
    .select({
      id: exercises.id,
      namePl: exercises.namePl,
      aliases: exercises.aliases,
      defaultUnit: exercises.defaultUnit,
    })
```

- [ ] **Step 2: Rozszerz typ w `ExerciseListPicker.tsx`**

```ts
export type ExerciseOption = {
  id: string;
  namePl: string;
  aliases: string[];
  defaultUnit: "REPS" | "TIME" | "DISTANCE" | "CALORIES";
};
```

- [ ] **Step 3: Typecheck + lint** — `bun run typecheck && bun run lint`; napraw ewentualne miejsca budujące `ExerciseOption` literalnie (np. testy/fixtures), dokładając `defaultUnit: "REPS"`.

- [ ] **Step 4: Commit**

```bash
git add src/features/strength/server/exercises.ts src/features/plan/components/ExerciseListPicker.tsx
git commit -m "feat(plan): exercise options carry default unit for target inputs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `lib/hyrox-blocks.ts` — drafty, konwersje, walidacja (TDD)

Czysta logika edytora bloków: draft ↔ payload ↔ unit steps. Testowana zanim powstanie komponent.

**Files:**
- Create: `src/features/plan/lib/hyrox-blocks.ts`
- Test: `src/features/plan/lib/hyrox-blocks.test.ts`

**Interfaces:**
- Consumes: `ExerciseOption.defaultUnit` (Task 2), kolumny z Taska 1 (poprzez kształt `PlanUnit["steps"]` rozszerzany w Tasku 5).
- Produces:
  - `interface HyroxStationDraft { key: string; exerciseId: string; namePl: string; defaultUnit: "REPS" | "TIME" | "DISTANCE" | "CALORIES"; target: string }`
  - `interface HyroxBlockDraft { key: string; stations: HyroxStationDraft[]; rounds: string; restMinutes: string }`
  - `hyroxDraftsFromUnitSteps(steps): HyroxBlockDraft[]`
  - `hyroxStepsPayload(drafts): UpsertUnitStep[]` (kształt kroku zoda z Taska 5)
  - `validateHyroxBlocks(drafts): string | null` (PL komunikat pierwszego błędu)

- [ ] **Step 1: Napisz testy (failing)**

`src/features/plan/lib/hyrox-blocks.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { hyroxDraftsFromUnitSteps, hyroxStepsPayload, validateHyroxBlocks } from "./hyrox-blocks";

const station = (over: Partial<Parameters<typeof hyroxStepsPayload>[0][number]["stations"][number]> = {}) => ({
  key: "s1",
  exerciseId: "e1",
  namePl: "Bieg",
  defaultUnit: "DISTANCE" as const,
  target: "500",
  ...over,
});
const block = (over: Partial<Parameters<typeof hyroxStepsPayload>[0][number]> = {}) => ({
  key: "b1",
  stations: [station()],
  rounds: "3",
  restMinutes: "2",
  ...over,
});

describe("hyroxStepsPayload", () => {
  test("maps stations with unit-appropriate targets, rounds and rest", () => {
    const [step] = hyroxStepsPayload([
      block({
        stations: [
          station({ defaultUnit: "REPS", target: "40", namePl: "Wall Balls", exerciseId: "wb" }),
          station(),
          station({ key: "s3", target: "" }),
        ],
      }),
    ]);
    expect(step.kind).toBe("STRAIGHT_SETS");
    expect(step.targetRounds).toBe(3);
    expect(step.restSeconds).toBe(120);
    expect(step.exercises).toEqual([
      { exerciseId: "wb", targetReps: 40 },
      { exerciseId: "e1", targetDistanceM: 500 },
      { exerciseId: "e1" },
    ]);
  });

  test("empty rest → no restSeconds; TIME/CALORIES unit → no target", () => {
    const [step] = hyroxStepsPayload([
      block({ restMinutes: "", stations: [station({ defaultUnit: "CALORIES", target: "15" })] }),
    ]);
    expect(step.restSeconds).toBeUndefined();
    expect(step.exercises).toEqual([{ exerciseId: "e1" }]);
  });

  test("same exercise twice in sequence survives the round-trip", () => {
    const [step] = hyroxStepsPayload([block({ stations: [station(), station({ key: "s2" })] })]);
    expect(step.exercises).toHaveLength(2);
  });
});

describe("hyroxDraftsFromUnitSteps", () => {
  test("rebuilds drafts from persisted steps", () => {
    const drafts = hyroxDraftsFromUnitSteps([
      {
        id: "st1",
        kind: "STRAIGHT_SETS",
        targetRounds: 4,
        durationSeconds: null,
        restSeconds: 90,
        note: null,
        exercises: [
          { exerciseId: "e1", namePl: "Bieg", defaultUnit: "DISTANCE", targetReps: null, targetDistanceM: 500 },
          { exerciseId: "wb", namePl: "Wall Balls", defaultUnit: "REPS", targetReps: 40, targetDistanceM: null },
        ],
      },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].rounds).toBe("4");
    expect(drafts[0].restMinutes).toBe("1.5");
    expect(drafts[0].stations.map((s) => s.target)).toEqual(["500", "40"]);
  });
});

describe("validateHyroxBlocks", () => {
  test("accepts a valid declaration", () => {
    expect(validateHyroxBlocks([block()])).toBeNull();
  });
  test("rejects empty block, missing rounds, out-of-range rest", () => {
    expect(validateHyroxBlocks([block({ stations: [] })])).toMatch(/stacj/i);
    expect(validateHyroxBlocks([block({ rounds: "" })])).toMatch(/rund/i);
    expect(validateHyroxBlocks([block({ restMinutes: "90" })])).toMatch(/przerw/i);
  });
  test("requires at least one block", () => {
    expect(validateHyroxBlocks([])).toMatch(/blok/i);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają FAILować**

Run: `bun test src/features/plan/lib/hyrox-blocks.test.ts`
Expected: FAIL (`Cannot find module './hyrox-blocks'`).

- [ ] **Step 3: Implementacja `hyrox-blocks.ts`**

```ts
// Hyrox unit editor logic: block drafts (strings for iOS-safe inputs) ↔ the
// upsertUnit steps payload ↔ persisted unit steps. Pure, so the drawer and
// tests share one source of truth.

export interface HyroxStationDraft {
  key: string;
  exerciseId: string;
  namePl: string;
  defaultUnit: "REPS" | "TIME" | "DISTANCE" | "CALORIES";
  target: string;
}

export interface HyroxBlockDraft {
  key: string;
  stations: HyroxStationDraft[];
  rounds: string;
  restMinutes: string;
}

interface PersistedHyroxStep {
  id: string;
  kind: "STRAIGHT_SETS" | "REST";
  targetRounds: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  note: string | null;
  exercises: {
    exerciseId: string;
    namePl: string;
    defaultUnit: HyroxStationDraft["defaultUnit"];
    targetReps: number | null;
    targetDistanceM: number | null;
  }[];
}

export interface HyroxStepExercisePayload {
  exerciseId: string;
  targetReps?: number;
  targetDistanceM?: number;
}

export interface HyroxStepPayload {
  kind: "STRAIGHT_SETS";
  targetRounds: number;
  restSeconds?: number;
  exercises: HyroxStepExercisePayload[];
}

export function hyroxDraftsFromUnitSteps(steps: PersistedHyroxStep[] | undefined): HyroxBlockDraft[] {
  return (steps ?? [])
    .filter((s) => s.kind === "STRAIGHT_SETS")
    .map((s) => ({
      key: s.id,
      rounds: s.targetRounds !== null ? String(s.targetRounds) : "",
      restMinutes: s.restSeconds !== null ? String(Math.round((s.restSeconds / 60) * 10) / 10) : "",
      stations: s.exercises.map((e, i) => ({
        key: `${s.id}-${i}`,
        exerciseId: e.exerciseId,
        namePl: e.namePl,
        defaultUnit: e.defaultUnit,
        target: e.targetReps !== null ? String(e.targetReps) : e.targetDistanceM !== null ? String(e.targetDistanceM) : "",
      })),
    }));
}

export function hyroxStepsPayload(drafts: HyroxBlockDraft[]): HyroxStepPayload[] {
  return drafts.map((b) => ({
    kind: "STRAIGHT_SETS" as const,
    targetRounds: Number(b.rounds),
    restSeconds: b.restMinutes ? Math.round(Number(b.restMinutes) * 60) : undefined,
    exercises: b.stations.map((s) => {
      const target = s.target ? Number(s.target) : undefined;
      if (target === undefined) return { exerciseId: s.exerciseId };
      if (s.defaultUnit === "REPS") return { exerciseId: s.exerciseId, targetReps: target };
      if (s.defaultUnit === "DISTANCE") return { exerciseId: s.exerciseId, targetDistanceM: target };
      return { exerciseId: s.exerciseId };
    }),
  }));
}

export function validateHyroxBlocks(drafts: HyroxBlockDraft[]): string | null {
  if (drafts.length === 0) return "Dodaj przynajmniej jeden blok.";
  for (const [i, b] of drafts.entries()) {
    const label = `Blok ${String.fromCharCode(65 + i)}`;
    if (b.stations.length === 0) return `${label}: dodaj przynajmniej jedną stację.`;
    const rounds = Number(b.rounds);
    if (!b.rounds || !Number.isInteger(rounds) || rounds < 1 || rounds > 30)
      return `${label}: podaj liczbę rund (1–30).`;
    if (b.restMinutes) {
      const restSeconds = Math.round(Number(b.restMinutes) * 60);
      if (restSeconds < 5 || restSeconds > 3600) return `${label}: przerwa musi mieścić się w 5 s – 60 min.`;
    }
    for (const s of b.stations) {
      if (s.target && (!Number.isInteger(Number(s.target)) || Number(s.target) < 1))
        return `${label}: target stacji „${s.namePl}” musi być dodatnią liczbą całkowitą.`;
    }
  }
  return null;
}
```

- [ ] **Step 4: Testy na zielono**

Run: `bun test src/features/plan/lib/hyrox-blocks.test.ts`
Expected: PASS (wszystkie).

- [ ] **Step 5: Typecheck + lint + commit**

Run: `bun run typecheck && bun run lint`

```bash
git add src/features/plan/lib/hyrox-blocks.ts src/features/plan/lib/hyrox-blocks.test.ts
git commit -m "feat(plan): hyrox block drafts, payload mapping and validation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Zod + `runUpsertUnit` — kroki z targetami i `restSeconds`, HYROX przestaje dropować kroki

Zmiana kształtu `steps[].exerciseIds: string[]` → `steps[].exercises: {exerciseId, targetReps?, targetDistanceM?}[]` (STRENGTH podaje same `exerciseId`). W tym samym tasku minimalna adaptacja `UnitDrawer` (mapowanie payloadu), żeby projekt się kompilował; UI Hyrox dochodzi w Tasku 5.

**Files:**
- Modify: `src/features/plan/server/plan.ts:88-132` (zod + typ), `plan.ts:183-206` (insert), `plan.ts:227` (handler)
- Modify: `src/features/plan/lib/unit-form.ts:22-24` (unitTrainingRequired)
- Modify: `src/features/plan/components/UnitDrawer.tsx:116-129` (payload map)

**Interfaces:**
- Produces: `unitStepInput` = `{ kind: "STRAIGHT_SETS" | "REST"; targetRounds?: number; durationSeconds?: number; restSeconds?: number; note?: string; exercises: { exerciseId: string; targetReps?: number; targetDistanceM?: number }[] }` — dokładnie kształt `HyroxStepPayload` z Taska 3.
- Consumes: nic z Taska 3 (kompatybilność kształtów pilnowana typem w Tasku 5).

- [ ] **Step 1: Nowy zod w `plan.ts`**

Zastąp `unitStepInput`:

```ts
const stepExerciseInput = z.object({
  exerciseId: z.uuid(),
  targetReps: z.number().int().min(1).max(1000).optional(),
  targetDistanceM: z.number().int().min(1).max(50000).optional(),
});

// A unit step: a workout step (1..n exercises, optional round target) or a
// REST break. Kind values are the blockKind subset units may hold.
const unitStepInput = z
  .object({
    kind: z.enum(["STRAIGHT_SETS", "REST"]),
    targetRounds: z.number().int().min(1).max(30).optional(),
    durationSeconds: z.number().int().min(5).max(3600).optional(),
    restSeconds: z.number().int().min(5).max(3600).optional(),
    note: z.string().trim().max(500).optional(),
    exercises: z.array(stepExerciseInput).max(12).default([]),
  })
  .refine((s) => (s.kind === "REST" ? s.exercises.length === 0 : s.exercises.length > 0), {
    message: "Krok treningowy musi mieć ćwiczenia, a przerwa nie może ich mieć.",
  });
```

W `upsertUnitInput` komentarz `// Ordered steps; only persisted for STRENGTH units.` zmień na `// Ordered steps; persisted for STRENGTH and HYROX units.` oraz w `.refine(...)` zastąp warunek liczenia ćwiczeń:

```ts
        v.sessionType === "STRENGTH" || v.sessionType === "HYROX"
          ? v.steps.reduce((n, s) => n + s.exercises.length, 0)
          : 0,
```

- [ ] **Step 2: Insert kroków w `runUpsertUnit`**

W pętli `for (const [orderIndex, step] of args.steps.entries())` dodaj `restSeconds` i przepnij insert ćwiczeń:

```ts
            targetRounds: step.targetRounds ?? null,
            durationSeconds: step.durationSeconds ?? null,
            restSeconds: step.restSeconds ?? null,
            note: step.note || null,
```

```ts
        if (step.exercises.length > 0) {
          await tx.insert(trainingPlanUnitStepExercises).values(
            step.exercises.map((ex, i) => ({
              athleteId: args.athleteId,
              stepId: created.id,
              orderIndex: i,
              exerciseId: ex.exerciseId,
              targetReps: ex.targetReps ?? null,
              targetDistanceM: ex.targetDistanceM ?? null,
            })),
          );
        }
```

- [ ] **Step 3: Handler przepuszcza kroki HYROX**

`plan.ts:227`:

```ts
      steps: data.sessionType === "STRENGTH" || data.sessionType === "HYROX" ? data.steps : [],
```

- [ ] **Step 4: `unitTrainingRequired` obejmuje HYROX**

`src/features/plan/lib/unit-form.ts` — komentarz i implementacja:

```ts
// A unit needs written training UNLESS it's a STRENGTH/HYROX unit that
// already carries an exercise list (the ordered list is the content). Pure so
// the drawer and the server enforce the same rule.
export function unitTrainingRequired(sessionType: string, exerciseCount: number): boolean {
  return !((sessionType === "STRENGTH" || sessionType === "HYROX") && exerciseCount > 0);
}
```

- [ ] **Step 5: Minimalna adaptacja `UnitDrawer` (kompilacja)**

W `onSubmit`, w mapowaniu kroków STRENGTH zamień `exerciseIds` na:

```ts
                  exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId })),
```

(w gałęzi REST: `exercises: []`).

- [ ] **Step 6: Typecheck + lint + testy**

Run: `bun run typecheck && bun run lint && bun test`
Expected: zielono (istniejące testy bez regresji).

- [ ] **Step 7: Commit**

```bash
git add src/features/plan/server/plan.ts src/features/plan/lib/unit-form.ts src/features/plan/components/UnitDrawer.tsx
git commit -m "feat(plan): unit steps accept per-exercise targets and round rest, HYROX keeps steps

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Odczyt — `loadStepsByUnit` z targetami, `loadStartableUnits` z HYROX

**Files:**
- Modify: `src/features/plan/server/queries.ts:28-105` (loadStepsByUnit + typ), `queries.ts:315-345` (loadStartableUnits), `queries.ts:350-359` (loadUnitSteps)

**Interfaces:**
- Produces:
  - kroki jednostki: `{ id, kind, targetRounds, durationSeconds, restSeconds, note, exercises: { exerciseId, namePl, defaultUnit, targetReps, targetDistanceM }[] }` — kształt konsumowany przez `hyroxDraftsFromUnitSteps` (Task 3) i `UnitDrawer` (Task 6),
  - `loadStartableUnits` zwraca dodatkowo `sessionType` i obejmuje jednostki HYROX.
  - Uwaga: `loadUnitSteps` celowo NIE zmienia się w tym tasku (jego nowy kształt zwrotu musi wejść razem ze zmianą `SeedStep` — Task 6 — inaczej typecheck pęka między commitami).

- [ ] **Step 1: Rozszerz `loadStepsByUnit`**

W typie mapy i selectach dodaj pola; select kroków:

```ts
      restSeconds: trainingPlanUnitSteps.restSeconds,
```

select ćwiczeń (join już jest):

```ts
      defaultUnit: exercises.defaultUnit,
      targetReps: trainingPlanUnitStepExercises.targetReps,
      targetDistanceM: trainingPlanUnitStepExercises.targetDistanceM,
```

Typ elementu `exercises` w mapie zmień z `ScheduleExercise[]` na dedykowany (lokalny) `UnitStepExercise[]`:

```ts
type UnitStepExercise = {
  exerciseId: string;
  namePl: string;
  defaultUnit: "REPS" | "TIME" | "DISTANCE" | "CALORIES";
  targetReps: number | null;
  targetDistanceM: number | null;
};
```

Miejsca spłaszczające do `ScheduleExercise` (np. `loadExercisesByUnit`, ekran harmonogramu) mapują jawnie: `unitSteps.flatMap((s) => s.exercises.map((e) => ({ exerciseId: e.exerciseId, namePl: e.namePl })))`.

- [ ] **Step 2: `loadStartableUnits` — HYROX + sessionType**

W select dodaj `sessionType: trainingPlanUnits.sessionType`, a warunek `eq(trainingPlanUnits.sessionType, "STRENGTH")` zamień na:

```ts
        inArray(trainingPlanUnits.sessionType, ["STRENGTH", "HYROX"]),
```

Zaktualizuj komentarz nad funkcją: `// STRENGTH and HYROX units of ACTIVE plans that can seed a session (≥1 exercise) …`. Zwrotka: `...u, sessionType: u.sessionType, ...` (spread już to niesie — upewnij się, że select zawiera pole).

- [ ] **Step 3: Typecheck + lint + testy** — `bun run typecheck && bun run lint && bun test`. Typecheck wskaże konsumentów starego kształtu `exercises: ScheduleExercise[]` — dopnij jawne mapowania zgodnie ze Step 1.

- [ ] **Step 4: Commit**

```bash
git add src/features/plan/server/queries.ts
git commit -m "feat(plan): unit step reads carry targets, rest and unit; startable units include HYROX

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Materializacja — `SeedStep` z targetami, bloki z `restSeconds` (plan + template)

**Files:**
- Modify: `src/features/strength/server/sessions.ts:307-435` (SeedStep, runCreateSession, template clone)

**Interfaces:**
- Consumes: `loadStepsByUnit` z targetami (Task 5).
- Produces: `SeedStep = { kind: "STRAIGHT_SETS" | "REST"; targetRounds: number | null; durationSeconds: number | null; restSeconds: number | null; note: string | null; exercises: { exerciseId: string; targetReps: number | null; targetDistanceM: number | null }[] }` oraz `loadUnitSteps` zwracający dokładnie ten kształt (zmiana wchodzi w tym samym commicie co `SeedStep`, żeby typecheck był zielony na każdej granicy commitu).

- [ ] **Step 1: `loadUnitSteps` — pełny seed (w `src/features/plan/server/queries.ts:350-359`)**

```ts
export async function loadUnitSteps(athleteId: string, unitId: string) {
  const byUnit = await loadStepsByUnit(athleteId, [unitId]);
  return (byUnit.get(unitId) ?? []).map((s) => ({
    kind: s.kind,
    targetRounds: s.targetRounds,
    durationSeconds: s.durationSeconds,
    restSeconds: s.restSeconds,
    note: s.note,
    exercises: s.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      targetReps: e.targetReps,
      targetDistanceM: e.targetDistanceM,
    })),
  }));
}
```

- [ ] **Step 2: Nowy kształt `SeedStep`**

```ts
// One step to materialize into a session_block (+ its ordered exercises).
export interface SeedStep {
  kind: "STRAIGHT_SETS" | "REST";
  targetRounds: number | null;
  durationSeconds: number | null;
  // Hyrox blocks: declared rest between rounds.
  restSeconds: number | null;
  // REST steps carry their instruction in the block notes.
  note: string | null;
  exercises: { exerciseId: string; targetReps: number | null; targetDistanceM: number | null }[];
}
```

- [ ] **Step 3: Ścieżka template — klonuj targety i rest**

W select movementów dodaj `targetReps: blockMovements.targetReps, targetDistanceM: blockMovements.targetDistanceM`, a mapowanie seedSteps:

```ts
        seedSteps = blocks
          .map((b) => ({
            kind: b.kind === "REST" ? ("REST" as const) : ("STRAIGHT_SETS" as const),
            targetRounds: b.targetRounds,
            durationSeconds: b.durationSeconds,
            restSeconds: b.restSeconds,
            note: b.kind === "REST" ? b.notes : null,
            exercises: movementRows
              .filter((m) => m.blockId === b.id)
              .map((m) => ({ exerciseId: m.exerciseId, targetReps: m.targetReps, targetDistanceM: m.targetDistanceM })),
          }))
          .filter((s) => s.kind === "REST" || s.exercises.length > 0);
```

- [ ] **Step 4: Insert bloków i movementów z nowymi polami**

```ts
          .values({
            athleteId: args.athleteId,
            sessionId: session.id,
            orderIndex,
            kind: step.kind,
            targetRounds: step.targetRounds,
            durationSeconds: step.durationSeconds,
            restSeconds: step.restSeconds,
            notes: step.note,
          })
```

```ts
        if (step.exercises.length > 0) {
          await tx.insert(blockMovements).values(
            step.exercises.map((ex, i) => ({
              athleteId: args.athleteId,
              blockId: block.id,
              orderIndex: i,
              exerciseId: ex.exerciseId,
              targetReps: ex.targetReps,
              targetDistanceM: ex.targetDistanceM,
            })),
          );
        }
```

- [ ] **Step 5: Typecheck + lint + testy** — `bun run typecheck && bun run lint && bun test` (kompilator złapie pozostałych producentów `exerciseIds`).

- [ ] **Step 6: Commit**

```bash
git add src/features/strength/server/sessions.ts src/features/plan/server/queries.ts
git commit -m "feat(strength): session seeding materializes targets and round rest

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `HyroxBlocksEditor` + integracja w `UnitDrawer`

**Files:**
- Create: `src/features/plan/components/HyroxBlocksEditor.tsx`
- Modify: `src/features/plan/components/UnitDrawer.tsx` (stan, submit, render, walidacja)

**Interfaces:**
- Consumes: `HyroxBlockDraft`, `hyroxDraftsFromUnitSteps`, `hyroxStepsPayload`, `validateHyroxBlocks` (Task 3); `ExerciseSearchField`, `ExerciseOption` (Task 2).
- Produces: `<HyroxBlocksEditor blocks onChange allExercises onError />`.

- [ ] **Step 1: Komponent `HyroxBlocksEditor.tsx`**

Wzorce 1:1 z `UnitStepsEditor` (przyciski strzałek/usuwania, dashed „+”, NumericFormat). Kluczowe różnice: karta bloku z literą (`Blok ${String.fromCharCode(65 + i)}`), wiersze stacji z inputem targetu (sufiks `powt.`/`m` wg `defaultUnit`, brak inputu dla TIME/CALORIES), stepper rund, input przerwy w minutach, stacje mogą się powtarzać (`ExerciseSearchField` z `excludeIds={[]}`).

```tsx
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useState } from "react";
import { NumericFormat } from "react-number-format";

import { Input } from "@/components/ui/input";
import type { HyroxBlockDraft, HyroxStationDraft } from "@/features/plan/lib/hyrox-blocks";
import { ExerciseSearchField, type ExerciseOption } from "./ExerciseListPicker";

const emptyBlock = (): HyroxBlockDraft => ({ key: crypto.randomUUID(), stations: [], rounds: "3", restMinutes: "2" });

const targetSuffix = (unit: HyroxStationDraft["defaultUnit"]) =>
  unit === "REPS" ? "powt." : unit === "DISTANCE" ? "m" : null;

interface HyroxBlocksEditorProps {
  blocks: HyroxBlockDraft[];
  onChange: (blocks: HyroxBlockDraft[]) => void;
  allExercises: ExerciseOption[];
  onError: (message: string) => void;
}

export function HyroxBlocksEditor({ blocks, onChange, allExercises, onError }: HyroxBlocksEditorProps) {
  // Which block has its station search open; a pick appends and keeps it open
  // (declaring 5 stations in a row is the common case).
  const [addingIn, setAddingIn] = useState<string | null>(null);

  const update = (key: string, patch: Partial<HyroxBlockDraft>) =>
    onChange(blocks.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const moveStation = (block: HyroxBlockDraft, index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= block.stations.length) return;
    const next = [...block.stations];
    [next[index], next[j]] = [next[j], next[index]];
    update(block.key, { stations: next });
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => (
        <div key={block.key} className="space-y-2 rounded-lg border border-primary/40 p-3">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-[10px] text-primary uppercase tracking-wide">
              Blok {String.fromCharCode(65 + bi)}
            </span>
            <span className="min-w-0 flex-1" />
            <button
              type="button"
              aria-label="Usuń blok"
              onClick={() => onChange(blocks.filter((b) => b.key !== block.key))}
              className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              ✕
            </button>
          </div>

          {block.stations.map((station, si) => {
            const suffix = targetSuffix(station.defaultUnit);
            return (
              <div key={station.key} className="flex items-center gap-1 rounded-lg border bg-card px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate font-medium text-sm">{station.namePl}</span>
                {suffix && (
                  <span className="flex items-center gap-1">
                    <NumericFormat
                      customInput={Input}
                      className="w-16 text-center tabular-nums"
                      placeholder="—"
                      inputMode="numeric"
                      decimalScale={0}
                      allowNegative={false}
                      value={station.target}
                      valueIsNumericString
                      onValueChange={(v) =>
                        update(block.key, {
                          stations: block.stations.map((s) => (s.key === station.key ? { ...s, target: v.value } : s)),
                        })
                      }
                    />
                    <span className="text-muted-foreground text-xs">{suffix}</span>
                  </span>
                )}
                <button
                  type="button"
                  aria-label="W górę"
                  disabled={si === 0}
                  onClick={() => moveStation(block, si, -1)}
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="W dół"
                  disabled={si === block.stations.length - 1}
                  onClick={() => moveStation(block, si, 1)}
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Usuń ${station.namePl}`}
                  onClick={() =>
                    update(block.key, { stations: block.stations.filter((s) => s.key !== station.key) })
                  }
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  ✕
                </button>
              </div>
            );
          })}

          {addingIn === block.key ? (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Dodaj stację</span>
                <button
                  type="button"
                  className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                  onClick={() => setAddingIn(null)}
                >
                  Gotowe
                </button>
              </div>
              <ExerciseSearchField
                allExercises={allExercises}
                excludeIds={[]}
                onPick={(e) => {
                  const opt = allExercises.find((o) => o.id === e.id);
                  update(block.key, {
                    stations: [
                      ...block.stations,
                      {
                        key: crypto.randomUUID(),
                        exerciseId: e.id,
                        namePl: e.namePl,
                        defaultUnit: opt?.defaultUnit ?? "REPS",
                        target: "",
                      },
                    ],
                  });
                }}
                onError={onError}
                autoFocus
              />
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setAddingIn(block.key)}
            >
              <Plus className="size-3.5" />
              Stacja
            </button>
          )}

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Rundy:</span>
              <NumericFormat
                customInput={Input}
                className="w-14 text-center tabular-nums"
                inputMode="numeric"
                decimalScale={0}
                allowNegative={false}
                isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 30)}
                value={block.rounds}
                valueIsNumericString
                onValueChange={(v) => update(block.key, { rounds: v.value })}
              />
            </span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Przerwa (min):</span>
              <NumericFormat
                customInput={Input}
                className="w-16 text-center tabular-nums"
                placeholder="—"
                inputMode="decimal"
                decimalScale={1}
                allowNegative={false}
                value={block.restMinutes}
                valueIsNumericString
                onValueChange={(v) => update(block.key, { restMinutes: v.value })}
              />
            </span>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
        onClick={() => onChange([...blocks, emptyBlock()])}
      >
        <Plus className="size-3.5" />
        Blok
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Integracja w `UnitDrawer`**

Importy + stan + submit + render:

```ts
import { hyroxDraftsFromUnitSteps, type HyroxBlockDraft, hyroxStepsPayload, validateHyroxBlocks } from "@/features/plan/lib/hyrox-blocks";
import { HyroxBlocksEditor } from "./HyroxBlocksEditor";
```

```ts
  const [hyroxBlocks, setHyroxBlocks] = useState<HyroxBlockDraft[]>(() =>
    unit?.sessionType === "HYROX" ? hyroxDraftsFromUnitSteps(unit?.steps) : [],
  );
```

`totalExercises` uwzględnia typ:

```ts
  const totalExercises =
    sessionType === "HYROX"
      ? hyroxBlocks.reduce((n, b) => n + b.stations.length, 0)
      : steps.reduce((n, s) => n + s.exercises.length, 0);
```

W `onSubmit`, po istniejącej walidacji STRENGTH dodaj:

```ts
    if (values.sessionType === "HYROX") {
      const hyroxError = validateHyroxBlocks(hyroxBlocks);
      if (hyroxError && totalExercises > 0) {
        form.setError("root.serverError", { type: "manual", message: hyroxError });
        return;
      }
    }
```

(pusta lista bloków = jednostka opisowa, jak dziś — wymaga `training` przez `unitTrainingRequired`).

Payload `steps`:

```ts
          steps:
            values.sessionType === "HYROX"
              ? totalExercises > 0
                ? hyroxStepsPayload(hyroxBlocks)
                : []
              : steps.map(/* gałąź STRENGTH: pozostaw istniejące mapowanie z Taska 4 Step 5 bez zmian */),
```

Render (obok gałęzi STRENGTH):

```tsx
          {sessionType === "HYROX" && (
            <div className="space-y-2">
              <span className="font-medium text-sm leading-none">Bloki i stacje</span>
              <HyroxBlocksEditor
                blocks={hyroxBlocks}
                onChange={setHyroxBlocks}
                allExercises={allExercises}
                onError={(message) => form.setError("root.serverError", { type: "server", message })}
              />
            </div>
          )}
```

- [ ] **Step 3: Typecheck + lint + testy** — `bun run typecheck && bun run lint && bun test`.

- [ ] **Step 4: Weryfikacja wizualna w dev** (edytor: dodanie bloku, powtórzona stacja „Bieg”, targety, rundy/przerwa, zapis, ponowne otwarcie → drafty wracają). Run: `bun run dev` — sprawdź w przeglądarce; hover/focus na nowych kontrolkach.

- [ ] **Step 5: Commit**

```bash
git add src/features/plan/components/HyroxBlocksEditor.tsx src/features/plan/components/UnitDrawer.tsx
git commit -m "feat(plan): hyrox blocks editor in the unit drawer

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: `NewSessionView` — start jednostki HYROX z planu + nagłówek sesji po typie

**Files:**
- Modify: `src/features/strength/views/NewSessionView.tsx:26-33,55-124` (filtr po typie, copy)
- Modify: `src/features/strength/views/ActiveSessionView.tsx:71` (nagłówek)

**Interfaces:**
- Consumes: `loadStartableUnits` zwraca `sessionType` (Task 5).

- [ ] **Step 1: Filtruj jednostki po wybranym typie**

```ts
  // STRENGTH and HYROX sessions seed from a plan unit; the picker shows only
  // units matching the selected type chip.
  const typeUnits = units.filter((u) => u.sessionType === type);
  const [unitId, setUnitId] = useState<string | null>(null);
  const fromPlan = (type === "STRENGTH" || type === "HYROX") && typeUnits.length > 0;
  const picked = typeUnits.find((u) => u.id === unitId) ?? typeUnits.find((u) => u.todayAssigned) ?? typeUnits[0];
```

Wszystkie użycia `planStrength`/`units` w JSX przepnij na `fromPlan`/`typeUnits` (karta planu, warianty przycisku „Pusta sesja”). Opis nagłówka:

```ts
          {fromPlan
            ? type === "HYROX"
              ? "Zacznij z planu (trening Hyrox) albo od zera."
              : "Zacznij z planu (dowolny trening siłowy) albo od zera."
            : "Zacznij od zera — sam dodajesz ćwiczenia."}
```

(Uwaga: `unitId` bez inicjalizatora funkcyjnego — wybór domyślny liczony w `picked`, bo zmiana chipa typu zmienia listę.)

- [ ] **Step 2: Nagłówek `ActiveSessionView` po typie**

`<h1>` zamiast hardcodu:

```tsx
        <h1 className="font-bold text-2xl tracking-tight">
          {SESSION_TYPE_LABEL_PL_ADJ[session.type] ? `Sesja ${SESSION_TYPE_LABEL_PL_ADJ[session.type]}` : "Sesja"}
        </h1>
```

Dodaj import `SESSION_TYPE_LABEL_PL_ADJ` z `@/features/strength/constants`. (Pełny widok Hyrox przychodzi w Etapie 2 — do tego czasu sesja Hyrox renderuje bloki jak obwody siłowe, co jest akceptowanym interim.)

- [ ] **Step 3: Pusta sesja HYROX — komunikat zamiast builderów (spec: ad-hoc poza v1)**

W `ActiveSessionView` pusta karta rozróżnia typ:

```tsx
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            {session.type === "HYROX"
              ? "Trening Hyrox deklarujesz w planie. Wystartuj sesję z planu, żeby dostać bloki i stoper."
              : "Brak ćwiczeń. Dodaj pojedyncze ćwiczenie albo obwód poniżej."}
          </CardContent>
```

a rząd „+ Ćwiczenie / + Obwód” w sticky stopce jest ukryty dla HYROX (przycisk „Zakończ sesję” zostaje):

```tsx
            {session.type !== "HYROX" && (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setPicker({ kind: "single" })}>
                  + Ćwiczenie
                </Button>
                <Button type="button" variant="outline" onClick={() => setPicker({ kind: "multi" })}>
                  + Obwód
                </Button>
              </div>
            )}
```

- [ ] **Step 4: Typecheck + lint + testy** — `bun run typecheck && bun run lint && bun test`.

- [ ] **Step 5: Weryfikacja w dev**: `/sessions/new?type=HYROX` pokazuje jednostkę Hyrox; start tworzy sesję z blokami (sprawdź w UI sesji: obwody z targetRounds; `restSeconds` w DB przez `bun run db:studio`); pusta sesja HYROX pokazuje komunikat o planie i nie oferuje builderów.

- [ ] **Step 6: Commit**

```bash
git add src/features/strength/views/NewSessionView.tsx src/features/strength/views/ActiveSessionView.tsx
git commit -m "feat(strength): start hyrox sessions from plan units, session heading by type

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Dokumentacja + finalny check

**Files:**
- Create: `docs/adr/ADR-0023-hyrox-training-data-model.md` (użyj skilla `adr-writing`)
- Modify: `docs/architecture/data-model.md` (wiersze nowych kolumn; sekcja "Block model for sessions" — wzmianka o powtarzalnych ćwiczeniach i restSeconds)

**Interfaces:** brak (dokumentacja).

- [ ] **Step 1: ADR-0023** — decyzje: `session_segments` + lustro `sets` (zapowiedź Etapu 2), zdjęcie unikalnych indeksów, branch widoku po `session.type`, targety na `block_movements`/`step_exercises`. Kontekst i alternatywy ze spec (jsonb, sets+jsonb). Metadata `Linear:` = issue Etapu 1.
- [ ] **Step 2: Aktualizacja `data-model.md`** — kolumny: `training_plan_unit_steps.rest_seconds`, `training_plan_unit_step_exercises.target_reps|target_distance_m`, `block_movements.target_reps`; adnotacja o usuniętych indeksach unikalnych.
- [ ] **Step 3: Finalny check** — Run: `bun run check` (lint + typecheck + test + knip). Expected: zielono; knip nie zgłasza martwych eksportów z nowych plików.
- [ ] **Step 4: Commit**

```bash
git add docs/adr/ADR-0023-hyrox-training-data-model.md docs/architecture/data-model.md
git commit -m "docs: ADR-0023 hyrox training data model, data-model updates

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 5: STOP — pauza przed weryfikacją** (reguła KJ): status + co przetestować na dev (deklaracja jednostki Hyrox end-to-end, start sesji z planu, powtórzona stacja). PR (skill `pr-description`) dopiero po zgodzie KJ.

---

## Poza planem (Etap 2 — osobny plan po merge PR 1)

`session_segments` + enum + `saveHyroxSegments`, reducer `hyrox-timer.ts` + testy (scenariusze z harnessu makiety), `HyroxSessionView` (wariant A), wake lock/wibracje, ekran końcowy (notatki + karta statystyk „wkrótce”), widok zakończonej sesji Hyrox, `docs/learning/hyrox-live-timing.md`.
