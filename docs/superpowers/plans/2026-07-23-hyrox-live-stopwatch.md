# Hyrox — Etap 2: live stoper trenera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sesja HYROX dostaje ekran live „wariant A”: trener przeklikuje stacje → rox zone → przerwy, czasy segmentów zapisują się do nowej tabeli `session_segments` (+ lustro stacji w `sets`), a koniec treningu pokazuje podsumowanie z notatkami i kartą statystyk „wkrótce”.

**Architecture:** Czysty reducer (`hyrox-timer.ts`, epoch-ms podawane z zewnątrz — deterministyczny, testowalny, serializowalny) + hook `useHyroxLive` (rAF tick, localStorage-journal, flush na granicach rund, wake lock, wibracja) + `HyroxSessionView` wybierany w route po `session.type`. Zapis idempotentny przez unikalny indeks `(blockId, roundNumber, orderIndex)`; undo tylko w niezapisanym buforze.

**Tech Stack:** TanStack Start, Drizzle/Neon (HTTP `db` + WebSocket `createPool()`), Zod, bun test, Tailwind/shadcn (tokeny Żaru kuźni), Screen Wake Lock API, Vibration API.

**Spec:** `docs/superpowers/specs/2026-07-22-hyrox-training-design.md` (sekcja „Etap 2 — live” + „Ekrany” + „Obsługa błędów”). Makieta wariantu A: artifact `d8bc25f9` + harness `mock-harness.js` (70 asercji — źródło scenariuszy testowych reduktora).

## Global Constraints

- Język: kod/komentarze EN, copy w apce PL, commity EN (Conventional Commits, temat lowercase — commitlint `subject-case`).
- Commity kończą się trailerem: `Co-Authored-By: Claude <noreply@anthropic.com>` (bez wersji).
- Commit-steps wykonujemy po jednorazowym „go” KJ dla planu; NIGDY push bez zgody.
- Żadnych `FRG-N` w kodzie (tylko commit/PR/ADR-metadata).
- Po edycjach: `bun run typecheck` **i** `bun run lint`; po `db:generate` dodatkowo `bun run format`.
- Polskie cudzysłowy w stringach JS: „…” zamykane U+201D (`”`), NIGDY ASCII `"` — po każdym tasku z polskim copy w JS: `grep -rn '„[^”]*"' src/` musi zwrócić 0 trafień.
- Komentarze minimalne — tylko ukryte niezmienniki.
- Czas na żywym liczniku `m:ss.d`, podsumowania `m:ss`; czas rundy = stacje + rox (bez przerw); czas bloku z przerwami; ember nigdy jako kolor tekstu body; ikony lucide; motion za `prefers-reduced-motion`.
- Branch: nazwa z Lineara VERBATIM (KJ poda).

## Prerequisites (KJ, ręcznie)

1. Linear issue (EN), proponowany tytuł: **"Hyrox live session: coach stopwatch, segment capture and summaries"**.
2. Nazwa brancha. Pierwszy commit: ten plan (`docs: add hyrox live stopwatch stage 2 plan`).

---

### Task 1: Schema — enum `segment_kind` + tabela `session_segments`

**Files:**
- Modify: `db/schema.ts` (enum przy pozostałych enumach ~L68-101; tabela po `sets` ~L578)
- Create: `db/migrations/00XX_*.sql` (via `bun run db:generate`)

**Interfaces:**
- Produces: `sessionSegments` (drizzle) + enum `segmentKind` — konsumowane w Taskach 4-5.

- [ ] **Step 1: Enum + tabela w `db/schema.ts`**

Przy enumach:

```ts
export const segmentKind = pgEnum("segment_kind", ["STATION", "ROX_ZONE", "REST"]);
```

Po tabeli `sets`:

```ts
// Live Hyrox timeline (ADR-0023): one row per coach-tapped segment. REST after
// round N carries roundNumber = N (the rest closes the round it follows).
// blockMovementId is required iff kind = STATION — enforced in zod, not CHECK.
export const sessionSegments = pgTable(
  "session_segments",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Denormalized from sessions.athleteId per ADR-0010.
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    blockId: uuid()
      .notNull()
      .references(() => sessionBlocks.id, { onDelete: "cascade" }),
    roundNumber: integer().notNull(),
    orderIndex: integer().notNull(),
    kind: segmentKind().notNull(),
    blockMovementId: uuid().references(() => blockMovements.id, { onDelete: "cascade" }),
    // Milliseconds — the live display shows tenths without loss.
    durationMs: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("session_segments_session_idx").on(t.sessionId, t.blockId, t.orderIndex),
    // Retry-safe writes: saveHyroxSegments inserts with ON CONFLICT DO NOTHING.
    uniqueIndex("session_segments_block_round_order_uq").on(t.blockId, t.roundNumber, t.orderIndex),
  ],
);
```

- [ ] **Step 2: Migracja** — Run: `bun run db:generate` (przejrzyj SQL: 1×CREATE TYPE, 1×CREATE TABLE, 2×indeksy, nic więcej) → `bun run format` → `bun run db:migrate`.
- [ ] **Step 3: Typecheck + lint** — `bun run typecheck && bun run lint`.
- [ ] **Step 4: Commit**

```bash
git add db/schema.ts db/migrations
git commit -m "feat(db): session_segments live timeline table with segment kind enum

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Reducer `hyrox-timer.ts` (TDD — scenariusze z harnessu makiety)

Serce ficzera. Czysty: żadnego `Date.now()`/`performance.now()` w środku — każde zdarzenie niesie `atMs` (epoch). Pauza jako wirtualny zegar: `vnow = (pausedAtMs ?? atMs) - pausedTotalMs`.

**Files:**
- Create: `src/features/strength/lib/hyrox-timer.ts`
- Test: `src/features/strength/lib/hyrox-timer.test.ts`

**Interfaces:**
- Produces (konsumowane przez Taski 4/6/7/8):

```ts
export type HyroxPhase = "idle" | "station" | "rox" | "rest" | "blockDone" | "done";
export interface HyroxStationPlan { blockMovementId: string; label: string; target: string | null }
export interface HyroxBlockPlan { blockId: string; targetRounds: number; restSeconds: number | null; stations: HyroxStationPlan[] }
export interface LiveSegment {
  kind: "STATION" | "ROX_ZONE" | "REST";
  blockIndex: number; roundNumber: number; orderIndex: number;
  blockMovementId: string | null;
  startMs: number;            // virtual (pause-adjusted) epoch ms
  durationMs: number | null;  // null = the single running tail
}
export interface HyroxTimerState {
  phase: HyroxPhase; blockIndex: number; round: number; stationIndex: number;
  extraRounds: Record<number, number>;
  segments: LiveSegment[];
  persistedCount: number;     // prefix of segments already saved server-side
  pausedAtMs: number | null; pausedTotalMs: number;
}
export type HyroxTimerEvent =
  | { type: "tap"; atMs: number } | { type: "undo"; atMs: number }
  | { type: "pauseToggle"; atMs: number } | { type: "endBlockEarly"; atMs: number }
  | { type: "extraRound"; atMs: number } | { type: "markSaved"; count: number };
export function initialTimerState(): HyroxTimerState;
export function hyroxTimerReducer(state: HyroxTimerState, plan: HyroxBlockPlan[], event: HyroxTimerEvent): HyroxTimerState;
export function rehydrateFromSegments(plan: HyroxBlockPlan[], persisted: PersistedSegment[]): HyroxTimerState; // crash recovery without localStorage: positioned at the next station of the unfinished round
export interface PersistedSegment { blockId: string; roundNumber: number; orderIndex: number; kind: LiveSegment["kind"]; blockMovementId: string | null; durationMs: number }
// selectors (all pure, atMs-in):
export function canUndo(state: HyroxTimerState): boolean;
export function runningMs(state: HyroxTimerState, atMs: number): number;
export function roundMs(state: HyroxTimerState, atMs: number, blockIndex: number, round: number): number;   // STATION+ROX only
export function roxMs(state: HyroxTimerState, atMs: number, blockIndex: number, round: number): number;
export function blockMs(state: HyroxTimerState, atMs: number, blockIndex: number): number;                   // incl. REST
export function restRemainingMs(state: HyroxTimerState, atMs: number, plan: HyroxBlockPlan[]): number | null; // null = no declared rest (count up)
export function effectiveRounds(state: HyroxTimerState, plan: HyroxBlockPlan[], blockIndex: number): number; // targetRounds + extra
export function unsavedClosedSegments(state: HyroxTimerState): LiveSegment[];
```

Semantyka przejść (port 1:1 z silnika makiety, z ADR-owym niuansem REST):
- `tap`: idle→station(r1,s0); station→(ostatnia stacja? ostatnia runda? blockDone : rest[roundNumber=bieżąca] : rox); rox→station(s+1); rest→station(r+1,s0); blockDone→(następny blok? idle : done); done→state bez zmian (reset robi UI przez nową sesję — w makiecie był restart, w produkcie NIE).
- Segment bieżący zawsze na ogonie z `durationMs: null`; domknięcie = `durationMs = vnow - startMs`; `orderIndex` = liczba segmentów danego bloku (rosnący per blok).
- `undo`: dozwolone gdy istnieje domknięty segment ponad `persistedCount`, ostatni domknięty ma ten sam `blockIndex` co bieżący kontekst i faza ∉ {idle, done}; działa też z `blockDone` (brak ogona). Efekt: porzuć ogon (jeśli jest), reopen ostatni domknięty (`durationMs: null`, oryginalny `startMs`), przywróć `phase/blockIndex/round/stationIndex` z niego (kind→faza: STATION→station, ROX_ZONE→rox, REST→rest).
- `pauseToggle`: mrozi/odmraża wirtualny zegar (pausedAtMs/pausedTotalMs jak w makiecie).
- `endBlockEarly`: tylko w fazie rest → domyka REST → blockDone.
- `extraRound`: tylko w blockDone → `extraRounds[block]++` → otwiera REST (roundNumber = ostatnia ukończona runda) → faza rest.
- `markSaved`: `persistedCount = max(persistedCount, count)`.
- `rehydrateFromSegments` (zdecydowane na code review, nadpisuje wcześniejszy opis "następna runda"): rehydracja z DB wznawia od następnej stacji niedokończonej rundy (segmenty sprzed pada zachowane, bieżący segment przepada); `localStorage` nadal wznawia dokładny stan. Wszystkie przekazane segmenty (odfiltrowane po nieznanym `blockId`; brak znanych → `initialTimerState()`) trafiają do `segments` jako domknięte i persisted (`persistedCount = segments.length`). Blok/pozycja = ostatni dotknięty blok (ostatni segment w tablicy); `completedStations` = liczba `STATION` w `maxRound` tego bloku. Jeśli `completedStations < stations.length` (runda w trakcie w momencie crasha) → `phase: "idle"`, `round: maxRound`, `stationIndex: completedStations` (bez replayu rundy — ogon/rox z chwili crasha przepada świadomie). Jeśli runda kompletna: `extra = max(0, maxRound - targetRounds)` odtwarza `extraRounds[blockIndex]`; `maxRound >= targetRounds + extra` → `phase: "blockDone"`, inaczej `phase: "idle"`, `round: maxRound + 1`, `stationIndex: 0`.

- [ ] **Step 1: Testy (failing)** — `hyrox-timer.test.ts`, port scenariuszy harnessu + nowe brzegi. Plan bazowy testów (helper `plan2` = Blok A: 3 stacje × 2 rundy, rest 120 s; Blok B: 1 stacja × 3 rundy, rest 60 s; `tick` = helper trzymający `t` i dispatchujący z rosnącym `atMs`):

```ts
import { describe, expect, test } from "bun:test";

import {
  canUndo, effectiveRounds, hyroxTimerReducer, initialTimerState, rehydrateFromSegments,
  restRemainingMs, roundMs, roxMs, blockMs, runningMs, unsavedClosedSegments,
  type HyroxBlockPlan, type HyroxTimerState,
} from "./hyrox-timer";

const plan2: HyroxBlockPlan[] = [
  { blockId: "blk-a", targetRounds: 2, restSeconds: 120, stations: [
    { blockMovementId: "bm-burpee", label: "Burpee Broad Jump", target: "20 m" },
    { blockMovementId: "bm-run", label: "Bieg", target: "500 m" },
    { blockMovementId: "bm-wb", label: "Wall Balls", target: "40 powt." },
  ]},
  { blockId: "blk-b", targetRounds: 3, restSeconds: 60, stations: [
    { blockMovementId: "bm-sled", label: "Sled Push", target: "15 m" },
  ]},
];

function driver(plan: HyroxBlockPlan[]) {
  let s = initialTimerState(); let t = 0;
  return {
    get state() { return s; }, get now() { return t; },
    at(ms: number) { t = ms; return this; },
    adv(ms: number) { t += ms; return this; },
    tap() { s = hyroxTimerReducer(s, plan, { type: "tap", atMs: t }); return this; },
    undo() { s = hyroxTimerReducer(s, plan, { type: "undo", atMs: t }); return this; },
    pause() { s = hyroxTimerReducer(s, plan, { type: "pauseToggle", atMs: t }); return this; },
    endBlock() { s = hyroxTimerReducer(s, plan, { type: "endBlockEarly", atMs: t }); return this; },
    extra() { s = hyroxTimerReducer(s, plan, { type: "extraRound", atMs: t }); return this; },
    saved(n: number) { s = hyroxTimerReducer(s, plan, { type: "markSaved", count: n }); return this; },
  };
}

describe("happy path — two blocks", () => {
  test("full walk mirrors the mockup harness", () => {
    const d = driver(plan2);
    expect(d.state.phase).toBe("idle");
    d.tap(); expect(d.state.phase).toBe("station"); expect(d.state.round).toBe(1); expect(d.state.stationIndex).toBe(0);
    d.adv(90_000).tap(); expect(d.state.phase).toBe("rox");
    d.adv(8_000).tap(); expect(d.state.stationIndex).toBe(1);
    d.adv(150_000).tap().adv(9_000).tap(); // rox → s3
    d.adv(120_000).tap(); expect(d.state.phase).toBe("rest"); expect(d.state.round).toBe(1);
    expect(roundMs(d.state, d.now, 0, 1)).toBe(90_000 + 8_000 + 150_000 + 9_000 + 120_000);
    expect(roxMs(d.state, d.now, 0, 1)).toBe(17_000);
    d.adv(125_000).tap(); expect(d.state.phase).toBe("station"); expect(d.state.round).toBe(2);
    d.adv(80_000).tap().adv(7_000).tap().adv(140_000).tap().adv(8_000).tap().adv(110_000).tap();
    expect(d.state.phase).toBe("blockDone");
    expect(blockMs(d.state, d.now, 0)).toBe(sumAll(d.state, 0)); // helper below
    d.tap(); expect(d.state.phase).toBe("idle"); expect(d.state.blockIndex).toBe(1);
    d.tap(); expect(d.state.phase).toBe("station"); // 1-stacyjny: bez rox
    d.adv(45_000).tap(); expect(d.state.phase).toBe("rest");
    d.adv(62_000).tap().adv(48_000).tap().adv(64_000).tap().adv(51_000).tap();
    expect(d.state.phase).toBe("blockDone");
    d.tap(); expect(d.state.phase).toBe("done");
  });
});

function sumAll(s: HyroxTimerState, blockIndex: number) {
  return s.segments.filter((x) => x.blockIndex === blockIndex).reduce((a, x) => a + (x.durationMs ?? 0), 0);
}

describe("undo", () => {
  test("undo from rox reopens the station with original start", () => {
    const d = driver(plan2);
    d.tap().adv(90_000).tap().adv(3_000).undo();
    expect(d.state.phase).toBe("station");
    expect(runningMs(d.state, d.now)).toBe(93_000); // jakby kliknięcia nie było
  });
  test("undo from rest reopens last station; undo at round start reopens rest", () => {
    const d = driver(plan2);
    d.tap().adv(10_000).tap().adv(5_000).tap().adv(10_000).tap().adv(5_000).tap().adv(10_000).tap(); // → rest
    d.adv(2_000).undo(); expect(d.state.phase).toBe("station"); expect(d.state.stationIndex).toBe(2);
    d.adv(1_000).tap(); // → rest again
    d.adv(30_000).tap(); // → round 2 station 1
    d.adv(2_000).undo(); expect(d.state.phase).toBe("rest"); expect(d.state.round).toBe(1);
  });
  test("undo never crosses persistedCount or block boundary", () => {
    const d = driver(plan2);
    d.tap().adv(10_000).tap(); // station→rox: 1 closed
    d.saved(1);
    expect(canUndo(d.state)).toBe(false);
    // cross-block: walk to blok B first station
    const e = driver(plan2);
    e.tap();
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000, 30_000, 10_000, 5_000, 10_000, 5_000, 10_000]) e.adv(ms).tap();
    e.tap(); // blockDone → idle blok B
    e.tap(); // station B r1
    expect(canUndo(e.state)).toBe(false);
  });
  test("undo works from blockDone (no running tail)", () => {
    const d = driver(plan2);
    d.tap();
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000, 30_000, 10_000, 5_000, 10_000, 5_000, 10_000]) d.adv(ms).tap();
    expect(d.state.phase).toBe("blockDone");
    d.adv(2_000).undo();
    expect(d.state.phase).toBe("station"); expect(d.state.round).toBe(2); expect(d.state.stationIndex).toBe(2);
  });
});

describe("pause", () => {
  test("pause freezes running and aggregate clocks", () => {
    const d = driver(plan2);
    d.tap().adv(10_000).pause().adv(60_000);
    expect(runningMs(d.state, d.now)).toBe(10_000);
    d.pause().adv(5_000);
    expect(runningMs(d.state, d.now)).toBe(15_000);
    expect(blockMs(d.state, d.now, 0)).toBe(15_000);
  });
});

describe("rest countdown, extra round, early end", () => {
  test("restRemainingMs counts down declared rest and goes negative", () => {
    const d = driver(plan2);
    d.tap();
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000]) d.adv(ms).tap(); // → rest (120 s)
    d.adv(30_000); expect(restRemainingMs(d.state, d.now, plan2)).toBe(90_000);
    d.adv(100_000); expect(restRemainingMs(d.state, d.now, plan2)).toBe(-10_000);
  });
  test("extraRound grows effectiveRounds and flows rest → extra round → blockDone", () => {
    const d = driver(plan2);
    d.tap();
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000, 30_000, 10_000, 5_000, 10_000, 5_000, 10_000]) d.adv(ms).tap();
    expect(d.state.phase).toBe("blockDone");
    d.extra(); expect(d.state.phase).toBe("rest");
    expect(effectiveRounds(d.state, plan2, 0)).toBe(3);
    d.adv(30_000).tap(); expect(d.state.round).toBe(3);
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000]) d.adv(ms).tap();
    expect(d.state.phase).toBe("blockDone");
  });
  test("endBlockEarly from rest closes the rest and ends the block", () => {
    const d = driver(plan2);
    d.tap();
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000]) d.adv(ms).tap(); // rest po r1
    d.adv(15_000).endBlock();
    expect(d.state.phase).toBe("blockDone");
    const rests = d.state.segments.filter((s) => s.kind === "REST");
    expect(rests).toHaveLength(1);
    expect(rests[0].durationMs).toBe(15_000);
  });
});

describe("segments bookkeeping", () => {
  test("orderIndex is per-block monotonic and REST carries the closed round's number", () => {
    const d = driver(plan2);
    d.tap();
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000]) d.adv(ms).tap();
    const blockA = d.state.segments.filter((s) => s.blockIndex === 0);
    expect(blockA.map((s) => s.orderIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(blockA[5].kind).toBe("REST");
    expect(blockA[5].roundNumber).toBe(1);
    expect(blockA[5].durationMs).toBeNull();
  });
  test("unsavedClosedSegments excludes the running tail and saved prefix", () => {
    const d = driver(plan2);
    d.tap().adv(10_000).tap().adv(5_000);
    expect(unsavedClosedSegments(d.state)).toHaveLength(1);
    d.saved(1);
    expect(unsavedClosedSegments(d.state)).toHaveLength(0);
  });
});

describe("rehydrateFromSegments", () => {
  test("resumes at the next round boundary with everything persisted", () => {
    const persisted = [
      { blockId: "blk-a", roundNumber: 1, orderIndex: 0, kind: "STATION" as const, blockMovementId: "bm-burpee", durationMs: 90_000 },
      { blockId: "blk-a", roundNumber: 1, orderIndex: 1, kind: "ROX_ZONE" as const, blockMovementId: null, durationMs: 8_000 },
      { blockId: "blk-a", roundNumber: 1, orderIndex: 2, kind: "STATION" as const, blockMovementId: "bm-run", durationMs: 150_000 },
      { blockId: "blk-a", roundNumber: 1, orderIndex: 3, kind: "ROX_ZONE" as const, blockMovementId: null, durationMs: 9_000 },
      { blockId: "blk-a", roundNumber: 1, orderIndex: 4, kind: "STATION" as const, blockMovementId: "bm-wb", durationMs: 120_000 },
    ];
    const s = rehydrateFromSegments(plan2, persisted);
    expect(s.blockIndex).toBe(0);
    expect(s.round).toBe(2);
    expect(s.phase).toBe("idle");
    expect(s.persistedCount).toBe(5);
    expect(canUndo(s)).toBe(false);
  });
  test("complete block rehydrates to blockDone", () => {
    const persisted = [1, 2].flatMap((r) => [
      { blockId: "blk-b", roundNumber: r, orderIndex: (r - 1) * 2, kind: "STATION" as const, blockMovementId: "bm-sled", durationMs: 45_000 },
      { blockId: "blk-b", roundNumber: r, orderIndex: (r - 1) * 2 + 1, kind: "REST" as const, blockMovementId: null, durationMs: 60_000 },
    ]).concat([{ blockId: "blk-b", roundNumber: 3, orderIndex: 4, kind: "STATION" as const, blockMovementId: "bm-sled", durationMs: 47_000 }]);
    const s = rehydrateFromSegments(plan2, persisted);
    expect(s.blockIndex).toBe(1);
    expect(s.phase).toBe("blockDone");
  });
});
```

- [ ] **Step 2: RED** — Run: `bun test src/features/strength/lib/hyrox-timer.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implementacja reduktora** — wg kontraktu z „Interfaces” i semantyki przejść wyżej. Wskazówki implementacyjne (nie zmieniaj kontraktu):
  - `vnow(state, atMs)` = `(state.pausedAtMs ?? atMs) - state.pausedTotalMs`; wszystkie `startMs` w czasie wirtualnym.
  - `closeTail(state, atMs)` domyka ogon; `openSeg(kind, ...)` dodaje ogon z `orderIndex` = liczba segmentów bloku.
  - `tap` w fazie `rest` przy `restSeconds: null` działa identycznie (REST bez targetu odliczania — selector zwraca null).
  - `undo`: `pausedTotalMs`/`pausedAtMs` bez zmian (pauza globalna); reopen = zamiana `durationMs` na `null` i zrzucenie ogona.
  - Reducer NIE mutuje — zwraca nowe obiekty (spread), segments kopiowane przy zmianie.
- [ ] **Step 4: GREEN** — Run: `bun test src/features/strength/lib/hyrox-timer.test.ts` → wszystkie PASS.
- [ ] **Step 5: Typecheck + lint + commit**

```bash
git add src/features/strength/lib/hyrox-timer.ts src/features/strength/lib/hyrox-timer.test.ts
git commit -m "feat(strength): pure hyrox live timer reducer with undo, pause and rehydration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `hyrox-live-store.ts` — localStorage-journal (TDD)

**Files:**
- Create: `src/features/strength/lib/hyrox-live-store.ts`
- Test: `src/features/strength/lib/hyrox-live-store.test.ts`

**Interfaces:**
- Produces:

```ts
export function serializeLiveState(sessionId: string, state: HyroxTimerState): string;
export function parseLiveState(sessionId: string, raw: string | null): HyroxTimerState | null; // null przy złej wersji/sessionId/parse error
export const liveStateKey = (sessionId: string) => `forge:hyrox-live:${sessionId}`;
```

- [ ] **Step 1: Testy (failing)** — round-trip (serialize→parse ≡ state), odrzucenie: inny sessionId, brak wersji `v: 1`, uszkodzony JSON (`parse` zwraca null, nie rzuca), `raw: null` → null.

```ts
import { describe, expect, test } from "bun:test";

import { initialTimerState } from "./hyrox-timer";
import { liveStateKey, parseLiveState, serializeLiveState } from "./hyrox-live-store";

describe("hyrox live store", () => {
  test("round-trips the state for the same session", () => {
    const s = { ...initialTimerState(), round: 2, pausedTotalMs: 1500 };
    expect(parseLiveState("sess-1", serializeLiveState("sess-1", s))).toEqual(s);
  });
  test("rejects other session, bad version, corrupt json, null", () => {
    const raw = serializeLiveState("sess-1", initialTimerState());
    expect(parseLiveState("sess-2", raw)).toBeNull();
    expect(parseLiveState("sess-1", raw.replace('"v":1', '"v":9'))).toBeNull();
    expect(parseLiveState("sess-1", "{nope")).toBeNull();
    expect(parseLiveState("sess-1", null)).toBeNull();
  });
  test("key is namespaced per session", () => {
    expect(liveStateKey("abc")).toBe("forge:hyrox-live:abc");
  });
});
```

- [ ] **Step 2: RED → implementacja → GREEN** (envelope `{ v: 1, sessionId, state }`, `try/catch` w parse).
- [ ] **Step 3: Typecheck + lint + commit**

```bash
git add src/features/strength/lib/hyrox-live-store.ts src/features/strength/lib/hyrox-live-store.test.ts
git commit -m "feat(strength): versioned localstorage journal for hyrox live state

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Server fn `saveHyroxSegments` — idempotentny zapis + lustro `sets`

**Files:**
- Create: `src/features/strength/server/segments.ts`

**Interfaces:**
- Consumes: `sessionSegments`, `segmentKind` (Task 1).
- Produces: `saveHyroxSegments({ data: { sessionId, blockId, segments: [{ roundNumber, orderIndex, kind, blockMovementId?, durationMs }] } })` → `{ inserted: number }`.

- [ ] **Step 1: Implementacja** (wzorce: `parseInput`, `getCurrentAthleteOrThrow`, `createPool` jak w `runUpsertUnit`):

```ts
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createPool } from "@/db/pool";
import { db } from "@/db/client";
import { blockMovements, sessionBlocks, sessions, sessionSegments, sets } from "@/db/schema";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { createServerFn } from "@tanstack/react-start";

const segmentInput = z
  .object({
    roundNumber: z.number().int().min(1).max(99),
    orderIndex: z.number().int().min(0).max(9999),
    kind: z.enum(["STATION", "ROX_ZONE", "REST"]),
    blockMovementId: z.uuid().optional(),
    durationMs: z.number().int().min(0).max(86_400_000),
  })
  .refine((s) => (s.kind === "STATION" ? !!s.blockMovementId : !s.blockMovementId), {
    message: "Segment stacji musi wskazywać ćwiczenie, pozostałe nie mogą.",
  });

const saveHyroxSegmentsInput = z.object({
  sessionId: z.uuid(),
  blockId: z.uuid(),
  segments: z.array(segmentInput).min(1).max(200),
});

// NOT exported — keeps the pool import out of the client bundle (same pattern
// as runCreateSession). Idempotent: the unique (blockId, roundNumber,
// orderIndex) index absorbs retries; sets mirror rows are written only for
// segments actually inserted this call, so a retry never doubles them.
async function runSaveHyroxSegments(args: {
  athleteId: string;
  sessionId: string;
  blockId: string;
  segments: z.infer<typeof segmentInput>[];
}): Promise<{ inserted: number }> {
  const { db: tx_db, end } = await createPool();
  try {
    return await tx_db.transaction(async (tx) => {
      const inserted = await tx
        .insert(sessionSegments)
        .values(
          args.segments.map((s) => ({
            athleteId: args.athleteId,
            sessionId: args.sessionId,
            blockId: args.blockId,
            roundNumber: s.roundNumber,
            orderIndex: s.orderIndex,
            kind: s.kind,
            blockMovementId: s.blockMovementId ?? null,
            durationMs: s.durationMs,
          })),
        )
        .onConflictDoNothing({
          target: [sessionSegments.blockId, sessionSegments.roundNumber, sessionSegments.orderIndex],
        })
        .returning({ orderIndex: sessionSegments.orderIndex });
      const insertedOrder = new Set(inserted.map((r) => r.orderIndex));
      const mirror = args.segments.filter((s) => s.kind === "STATION" && insertedOrder.has(s.orderIndex));
      if (mirror.length > 0) {
        await tx.insert(sets).values(
          mirror.map((s) => ({
            athleteId: args.athleteId,
            blockMovementId: s.blockMovementId as string,
            setNumber: s.roundNumber,
            durationSeconds: Math.round(s.durationMs / 1000),
            kind: "WORK" as const,
          })),
        );
      }
      return { inserted: inserted.length };
    });
  } finally {
    await end();
  }
}

export const saveHyroxSegments = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(saveHyroxSegmentsInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [block] = await db
      .select({ id: sessionBlocks.id, sessionId: sessionBlocks.sessionId })
      .from(sessionBlocks)
      .where(and(eq(sessionBlocks.id, data.blockId), eq(sessionBlocks.athleteId, athleteId)));
    if (!block || block.sessionId !== data.sessionId) throw new Error("Nie znaleziono bloku sesji.");
    const [session] = await db
      .select({ endedAt: sessions.endedAt })
      .from(sessions)
      .where(and(eq(sessions.id, data.sessionId), eq(sessions.athleteId, athleteId)));
    if (!session) throw new Error("Nie znaleziono sesji.");
    if (session.endedAt) throw new Error("Sesja jest już zakończona.");
    const movementIds = data.segments.flatMap((s) => (s.blockMovementId ? [s.blockMovementId] : []));
    if (movementIds.length > 0) {
      const owned = await db
        .select({ id: blockMovements.id })
        .from(blockMovements)
        .where(and(eq(blockMovements.blockId, data.blockId), inArray(blockMovements.id, movementIds)));
      if (owned.length !== new Set(movementIds).size) throw new Error("Segment wskazuje ćwiczenie spoza bloku.");
    }
    return runSaveHyroxSegments({ athleteId, ...data });
  });
```

(Dokładne ścieżki importów dopasuj do konwencji repo — `db/client`/`db/pool` importowane są w `sessions.ts`; skopiuj stamtąd formę.)

- [ ] **Step 2: Typecheck + lint + testy** — `bun run typecheck && bun run lint && bun test`.
- [ ] **Step 3: Commit**

```bash
git add src/features/strength/server/segments.ts
git commit -m "feat(strength): idempotent hyrox segment batch save with sets mirror

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Loader + przełącznik widoku po typie sesji

**Files:**
- Modify: `src/features/strength/server/sessions.ts` (getSessionDetails: targety w select movements + `segments` dla HYROX)
- Create: `src/features/strength/views/SessionView.tsx` (thin switch)
- Modify: `src/routes/_shell/sessions/$sessionId.tsx` (component: SessionView)
- Create (placeholder w tym tasku): `src/features/strength/views/HyroxSessionView.tsx`

**Interfaces:**
- Produces: loader zwraca `{ session, steps, segments }`; `steps[].movements[]` niesie dodatkowo `targetReps`, `targetDistanceM`. `HyroxSessionView` w tym tasku to szkielet („Sesja Hyrox” + lista bloków, bez stopera) — pełne ekrany w Taskach 7-8; dzięki temu task jest samodzielnie weryfikowalny.

- [ ] **Step 1: `getSessionDetails`** — do selecta movements dodaj:

```ts
            targetReps: blockMovements.targetReps,
            targetDistanceM: blockMovements.targetDistanceM,
```

Po zbudowaniu `steps` dodaj:

```ts
    // Live timeline rows exist only for HYROX sessions; other types skip the query.
    const segments =
      session.type === "HYROX"
        ? await db
            .select()
            .from(sessionSegments)
            .where(eq(sessionSegments.sessionId, session.id))
            .orderBy(sessionSegments.blockId, sessionSegments.orderIndex)
        : [];
```

i zwróć `{ session, steps: …, segments }`.

- [ ] **Step 2: `SessionView.tsx`**

```tsx
import { getRouteApi } from "@tanstack/react-router";

import { ActiveSessionView } from "@/features/strength/views/ActiveSessionView";
import { HyroxSessionView } from "@/features/strength/views/HyroxSessionView";

const route = getRouteApi("/_shell/sessions/$sessionId");

// The only render branch on session.type in the app — a deliberate exception
// recorded in ADR-0023.
export function SessionView() {
  const { session } = route.useLoaderData();
  return session.type === "HYROX" ? <HyroxSessionView /> : <ActiveSessionView />;
}
```

W route: import + `component: SessionView`.

- [ ] **Step 3: Szkielet `HyroxSessionView.tsx`** — nagłówek „Sesja Hyrox” + `StatusBadge` + karty bloków (nazwa `Blok ${String.fromCharCode(65 + i)}`, lista stacji z targetami, `${targetRounds} rund · przerwa m:ss`), CTA disabled „Stoper (w budowie)”. Pusta sesja: komunikat jak w `ActiveSessionView` (przenieś warunek HYROX-empty tutaj; `ActiveSessionView` przestaje renderować sesje HYROX, więc jego HYROX-owe gałęzie z Etapu 1 — komunikat pustej sesji i ukrycie builderów — USUŃ, zostaje nagłówek wg typu).
- [ ] **Step 4: Typecheck + lint + testy + commit**

```bash
git add src/features/strength/server/sessions.ts src/features/strength/views/SessionView.tsx src/features/strength/views/HyroxSessionView.tsx src/routes/_shell/sessions/\$sessionId.tsx src/features/strength/views/ActiveSessionView.tsx
git commit -m "feat(strength): session view switch by type, hyrox loader carries targets and segments

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Hook `useHyroxLive` — orkiestracja (reducer + store + flush + wake lock + wibracja)

**Files:**
- Create: `src/features/strength/components/useHyroxLive.ts`

**Interfaces:**
- Consumes: reducer/selektory (Task 2), store (Task 3), `saveHyroxSegments` (Task 4), loader shape (Task 5).
- Produces:

```ts
export interface HyroxLive {
  state: HyroxTimerState;
  plan: HyroxBlockPlan[];
  nowMs: number;                 // rAF-driven, do selektorów w renderze
  tap(): void; undo(): void; pauseToggle(): void; endBlockEarly(): void; extraRound(): void;
  syncError: string | null;      // nieblokujący komunikat po ≥2 nieudanych flushach
  finish(notes?: string): Promise<void>; // flush całości + endSession + czyszczenie storage
}
export function useHyroxLive(sessionId: string, steps: LoaderSteps, persisted: PersistedSegment[]): HyroxLive;
```

- [ ] **Step 1: Implementacja.** Wymagania (kolejność inicjalizacji jest niezmiennikiem):
  1. `plan` z `steps` (useMemo): bloki w kolejności `orderIndex`; stacja = movement (label = `exerciseNamePl`, target z `targetReps` → `"${n} powt."` / `targetDistanceM` → `"${n} m"` / null); `targetRounds ?? 1`, `restSeconds`.
  2. Stan startowy (lazy useState): `parseLiveState(sessionId, localStorage.getItem(liveStateKey(sessionId)))` → jeśli null i `persisted.length > 0` → `rehydrateFromSegments(plan, persisted)` → inaczej `initialTimerState()`.
  3. `dispatch` wrapper: reducer → `setState` → `localStorage.setItem(liveStateKey(sessionId), serializeLiveState(...))` (try/catch — quota/private mode nie wywala stopera) → `maybeFlush(next)`.
  4. `maybeFlush`: gdy `unsavedClosedSegments(next).length > 0` i faza ∈ {`rest`, `blockDone`, `done`}: zbuduj payload per blok (`blockId` z planu po `blockIndex`, mapowanie `LiveSegment` → wejście server fn), `saveHyroxSegments` → po sukcesie `dispatch({ type: "markSaved", count })`; po porażce zapamiętaj i ponów przy następnym flushu oraz na `window` event `online`; po 2. porażce z rzędu ustaw `syncError` (czyść po sukcesie). Jeden flush w locie naraz (ref-lock).
  5. rAF-pętla aktualizuje `nowMs` (Date.now) tylko gdy jest ogon lub faza rest; wstrzymana przy pauzie (poza pierwszym renderem po zdarzeniu).
  6. Wake lock: `navigator.wakeLock?.request("screen")` gdy faza ∉ {idle przy bloku 0 bez segmentów, done}; re-acquire na `visibilitychange` (document.visible); release na unmount/done. Całość w try/catch (Safari bez wsparcia = no-op).
  7. Wibracja: gdy `restRemainingMs` przechodzi przez 0 (poprzedni tick > 0, obecny ≤ 0) → `navigator.vibrate?.(200)`.
  8. `finish(notes)`: flush WSZYSTKICH domkniętych segmentów (niezależnie od fazy; jeśli flush padnie — rzuć, UI pokaże błąd i NIE zakończy sesji), potem `endSession({ data: { sessionId, notes } })`, `localStorage.removeItem`, `router.invalidate()`.
- [ ] **Step 2: Typecheck + lint + testy** (bez testów jednostkowych hooka — logika liczona jest w reducerze; hook to sklejka przeglądarki).
- [ ] **Step 3: Commit**

```bash
git add src/features/strength/components/useHyroxLive.ts
git commit -m "feat(strength): hyrox live hook with journal, boundary flush, wake lock

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Ekrany live (idle / stacja / rox / przerwa) — wariant A

**Files:**
- Create: `src/features/strength/components/HyroxLiveScreens.tsx`
- Modify: `src/features/strength/views/HyroxSessionView.tsx` (podpina hook + ekrany)

**Interfaces:**
- Consumes: `HyroxLive` (Task 6), selektory (Task 2).
- Produces: `HyroxIdleScreen`, `HyroxStationScreen` (stacja + rox w jednym — flaga z fazy), `HyroxRestScreen` — wszystkie sterowane przez `live: HyroxLive`.

- [ ] **Step 1: Implementacja wg makiety (wariant A), tokeny apki.** Wymagane elementy i copy (PL, cudzysłowy ”):
  - **Idle**: eyebrow `Sesja Hyrox · Blok A`, lista stacji z targetami (karta `bg-muted`), `„Telefon trzyma trener. Ekran nie zgaśnie.”`, CTA `bg-ember shadow-ember` `Start: Blok A` + sub `${rundy} rund × ${n} stacji · przerwa ${m:ss}`. Gdy `state.round > 1` (rehydracja z DB): chip `Wznowienie od rundy ${round}`.
  - **Stacja**: eyebrow `BLOK A · RUNDA 1/3 · STACJA 2/5` (uppercase, tracking); nazwa stacji `text-3xl font-extrabold`; target `text-muted-foreground`; kropki postępu stacji (done/muted, current/ember); licznik `text-7xl font-extrabold tabular-nums` `m:ss` + dziesiątki mniejszą frakcją (`runningMs` + `nowMs`); pod nim `Runda <b>{roundMs}</b> · Blok <b>{blockMs}</b>`; rząd kontrolek `Cofnij` (rotate-ccw, disabled gdy `!canUndo`) i `Pauza/Wznów` (pause/play); przy pauzie chip `PAUZA — zegar zatrzymany` (ember, dashed); CTA `Koniec stacji` + sub `następnie: …` (rox → nazwa następnej stacji / przerwa m:ss i runda N+1 / koniec bloku).
  - **Rox zone**: ta sama struktura, tło ekranu `bg-[color-mix(in_srgb,var(--primary)_7%,var(--background))]` (dark 13% — utility/inline style, dopasuj do konwencji), eyebrow ember `ROX ZONE · zmiana stacji`, nazwa `Rox zone`, sub `→ ${następna} · ${target}`, CTA `Start: ${następna stacja}`.
  - **Przerwa**: karta podsumowania rundy (`Runda ${N}` czas + `w tym rox zone ${m:ss} · ${pct}%` w ember); odliczanie `text-8xl` z `restRemainingMs` (ujemne → `+m:ss` w destructive; `restSeconds null` → licznik w górę bez targetu); pod spodem `przerwa ${m:ss deklarowana}`; kontrolki Cofnij/Pauza + `Zakończ blok`; CTA `Start rundy ${N+1}` + sub pierwsza stacja.
  - Layout jak `ActiveSessionView`: `main.mx-auto.flex.min-h-full.max-w-md.flex-col`, CTA w sticky stopce (`sticky bottom-0` wzór z ActiveSessionView), przycisk główny wysoki (`py-5 text-lg font-extrabold`).
  - `syncError` renderowany jako nieblokujący pasek `text-destructive text-xs` nad stopką.
- [ ] **Step 2: `HyroxSessionView`** — `useHyroxLive(session.id, steps, segments)`; routing faz: idle/station/rox/rest → ekrany z tego taska; blockDone/done → tymczasowo blockDone jako prosty ekran z CTA (pełne podsumowania w Tasku 8); sesja `endedAt` → placeholder (Task 8).
- [ ] **Step 3: Typecheck + lint + testy + sweep cudzysłowów** (`grep -rn '„[^”]*"' src/` → 0).
- [ ] **Step 4: Commit**

```bash
git add src/features/strength/components/HyroxLiveScreens.tsx src/features/strength/views/HyroxSessionView.tsx
git commit -m "feat(strength): hyrox live screens — station, rox zone and rest (variant a)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Podsumowania (blok / koniec treningu) + notatki + widok zakończonej sesji

**Files:**
- Create: `src/features/strength/components/HyroxSummaries.tsx`
- Modify: `src/features/strength/views/HyroxSessionView.tsx`

**Interfaces:**
- Consumes: selektory (Task 2), `NotesDrawer` (istniejący: props `open,onOpenChange,initialNotes,onSave`), `EndSessionDrawer`? — NIE: koniec przez `live.finish(notes)` z własnym drawerem potwierdzenia (użyj `EndSessionDrawer` jeśli jego props pasują — sprawdź; jeśli wymaga `movementCount`, podaj liczbę stacji).
- Produces: `HyroxBlockDoneScreen`, `HyroxDoneSummary` (żyje też jako widok zakończonej sesji — dane z props: segmenty DB lub stan live).

- [ ] **Step 1: `HyroxBlockDoneScreen`** — `Blok A zakończony`, czas bloku (z przerwami) `text-3xl`, karta `Praca na stacjach / Rox zone łącznie (ember) / Przerwy`, lista rund `Runda N — m:ss · rox m:ss` (+ `(ekstra)` gdy `roundNumber > targetRounds`), secondary `+ Ekstra runda`, CTA `Start: Blok B` z sub `przejście poza zegarem` / gdy ostatni blok `Zakończ trening` → otwiera drawer potwierdzenia z polem notatek → `live.finish(notes)`.
- [ ] **Step 2: `HyroxDoneSummary`** — czysty komponent liczący z `PersistedSegment[]` + plan (grupowanie po bloku/rundzie — te same wzory co selektory; wylicz lokalnie, bez stanu live): suma, karty bloków z rundami, karta **Notatki** (wzór z `ActiveSessionView` ended: podgląd + `Edytuj`/`Dodaj` → `NotesDrawer` + `updateSessionNotes`), karta „Statystyki Hyrox” **nieaktywna**: tytuł + `Wkrótce` chip + copy `Estymata czasu zawodów pojawi się po zebraniu większej ilości danych.` (bez linku). Przycisk `Usuń sesję` (istniejący `DeleteSessionDrawer`).
- [ ] **Step 3: Routing w `HyroxSessionView`**: `session.endedAt` → `HyroxDoneSummary` z `segments` z loadera; live fazy blockDone/done → ekrany z tego taska (done przed `finish` pokazuje podsumowanie + CTA `Zakończ trening`).
- [ ] **Step 4: Typecheck + lint + testy + sweep cudzysłowów + commit**

```bash
git add src/features/strength/components/HyroxSummaries.tsx src/features/strength/views/HyroxSessionView.tsx
git commit -m "feat(strength): hyrox block and session summaries, notes and ended view

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Dokumentacja + finalny check

**Files:**
- Create: `docs/learning/hyrox-live-timing.md`
- Modify: `docs/architecture/data-model.md` (wiersz `session_segments`), `docs/adr/ADR-0023-hyrox-training-data-model.md` (Stage 2 → implemented, jedno zdanie w Status/Consequences)

- [ ] **Step 1: Learning doc** (per konwencja epików): sekcje — czemu czysty reducer z epoch-ms (determinizm, serializacja, testy bez zegara), wirtualny zegar pauzy, dziennik localStorage + rehydracja z DB (dwa poziomy odporności), idempotentny zapis batchy przez unikalny indeks + lustro `sets` tylko dla faktycznie wstawionych, wake lock i throttling tła (czemu Date.now, nie performance.now), granice undo.
- [ ] **Step 2: data-model.md + ADR-0023 update.**
- [ ] **Step 3: `bun run check`** — lint/typecheck/testy zielone (knip: dług sprzed brancha akceptowany, ale ZERO nowych trafień z plików Hyrox).
- [ ] **Step 4: Commit**

```bash
git add docs/learning/hyrox-live-timing.md docs/architecture/data-model.md docs/adr/ADR-0023-hyrox-training-data-model.md
git commit -m "docs: hyrox live timing learning notes, data model updates

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 5: STOP — pauza przed weryfikacją** (KJ na dev: pełny trening testowy z telefonu — deklaracja z Etapu 1 → start z planu → przeklikanie bloków z pauzą/cofnij/ekstra rundą → kill karty w środku rundy → powrót → zakończenie → widok ended → historia). PR (skill `pr-description`) po zgodzie.

---

## Poza planem (świadomie)

Dźwięki · pominięcie stacji · edycja segmentów po fakcie · multi-device live · Etap 3 (statystyki/estymata — osobny brainstorm z makietami wykresów) · e2e Playwright dla stopera (rozważyć po stabilizacji; dziś brak wzorca dla timer-driven e2e w repo).
