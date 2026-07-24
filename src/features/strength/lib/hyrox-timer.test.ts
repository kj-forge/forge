import { describe, expect, test } from "bun:test";

import {
  blockMs,
  canUndo,
  effectiveRounds,
  type HyroxBlockPlan,
  type HyroxTimerState,
  hyroxTimerReducer,
  initialTimerState,
  type PersistedSegment,
  rehydrateFromSegments,
  restRemainingMs,
  roundMs,
  roxMs,
  runningMs,
  unsavedClosedSegments,
} from "./hyrox-timer";

const plan2: HyroxBlockPlan[] = [
  {
    blockId: "blk-a",
    targetRounds: 2,
    restSeconds: 120,
    stations: [
      { blockMovementId: "bm-burpee", label: "Burpee Broad Jump", target: "20 m" },
      { blockMovementId: "bm-run", label: "Bieg", target: "500 m" },
      { blockMovementId: "bm-wb", label: "Wall Balls", target: "40 powt." },
    ],
  },
  {
    blockId: "blk-b",
    targetRounds: 3,
    restSeconds: 60,
    stations: [{ blockMovementId: "bm-sled", label: "Sled Push", target: "15 m" }],
  },
];

function driver(plan: HyroxBlockPlan[]) {
  let s = initialTimerState();
  let t = 0;
  return {
    get state() {
      return s;
    },
    get now() {
      return t;
    },
    at(ms: number) {
      t = ms;
      return this;
    },
    adv(ms: number) {
      t += ms;
      return this;
    },
    tap() {
      s = hyroxTimerReducer(s, plan, { type: "tap", atMs: t });
      return this;
    },
    undo() {
      s = hyroxTimerReducer(s, plan, { type: "undo", atMs: t });
      return this;
    },
    pause() {
      s = hyroxTimerReducer(s, plan, { type: "pauseToggle", atMs: t });
      return this;
    },
    endBlock() {
      s = hyroxTimerReducer(s, plan, { type: "endBlockEarly", atMs: t });
      return this;
    },
    extra() {
      s = hyroxTimerReducer(s, plan, { type: "extraRound", atMs: t });
      return this;
    },
    saved(n: number) {
      s = hyroxTimerReducer(s, plan, { type: "markSaved", count: n });
      return this;
    },
  };
}

describe("happy path — two blocks", () => {
  test("full walk mirrors the mockup harness", () => {
    const d = driver(plan2);
    expect(d.state.phase).toBe("idle");
    d.tap();
    expect(d.state.phase).toBe("station");
    expect(d.state.round).toBe(1);
    expect(d.state.stationIndex).toBe(0);
    d.adv(90_000).tap();
    expect(d.state.phase).toBe("rox");
    d.adv(8_000).tap();
    expect(d.state.stationIndex).toBe(1);
    d.adv(150_000).tap().adv(9_000).tap(); // rox → s3
    d.adv(120_000).tap();
    expect(d.state.phase).toBe("rest");
    expect(d.state.round).toBe(1);
    expect(roundMs(d.state, d.now, 0, 1)).toBe(90_000 + 8_000 + 150_000 + 9_000 + 120_000);
    expect(roxMs(d.state, d.now, 0, 1)).toBe(17_000);
    d.adv(125_000).tap();
    expect(d.state.phase).toBe("station");
    expect(d.state.round).toBe(2);
    d.adv(80_000).tap().adv(7_000).tap().adv(140_000).tap().adv(8_000).tap().adv(110_000).tap();
    expect(d.state.phase).toBe("blockDone");
    expect(blockMs(d.state, d.now, 0)).toBe(sumAll(d.state, 0)); // helper below
    d.tap();
    expect(d.state.phase).toBe("idle");
    expect(d.state.blockIndex).toBe(1);
    d.tap();
    expect(d.state.phase).toBe("station"); // 1-stacyjny: bez rox
    d.adv(45_000).tap();
    expect(d.state.phase).toBe("rest");
    d.adv(62_000).tap().adv(48_000).tap().adv(64_000).tap().adv(51_000).tap();
    expect(d.state.phase).toBe("blockDone");
    d.tap();
    expect(d.state.phase).toBe("done");
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
    d.adv(2_000).undo();
    expect(d.state.phase).toBe("station");
    expect(d.state.stationIndex).toBe(2);
    d.adv(1_000).tap(); // → rest again
    d.adv(30_000).tap(); // → round 2 station 1
    d.adv(2_000).undo();
    expect(d.state.phase).toBe("rest");
    expect(d.state.round).toBe(1);
  });
  test("undo never crosses persistedCount or block boundary", () => {
    const d = driver(plan2);
    d.tap().adv(10_000).tap(); // station→rox: 1 closed
    d.saved(1);
    expect(canUndo(d.state)).toBe(false);
    // cross-block: walk to blok B first station
    const e = driver(plan2);
    e.tap();
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000, 30_000, 10_000, 5_000, 10_000, 5_000, 10_000])
      e.adv(ms).tap();
    e.tap(); // blockDone → idle blok B
    e.tap(); // station B r1
    expect(canUndo(e.state)).toBe(false);
  });
  test("undo works from blockDone (no running tail)", () => {
    const d = driver(plan2);
    d.tap();
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000, 30_000, 10_000, 5_000, 10_000, 5_000, 10_000])
      d.adv(ms).tap();
    expect(d.state.phase).toBe("blockDone");
    d.adv(2_000).undo();
    expect(d.state.phase).toBe("station");
    expect(d.state.round).toBe(2);
    expect(d.state.stationIndex).toBe(2);
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
    d.adv(30_000);
    expect(restRemainingMs(d.state, d.now, plan2)).toBe(90_000);
    d.adv(100_000);
    expect(restRemainingMs(d.state, d.now, plan2)).toBe(-10_000);
  });
  test("extraRound grows effectiveRounds and flows rest → extra round → blockDone", () => {
    const d = driver(plan2);
    d.tap();
    for (const ms of [10_000, 5_000, 10_000, 5_000, 10_000, 30_000, 10_000, 5_000, 10_000, 5_000, 10_000])
      d.adv(ms).tap();
    expect(d.state.phase).toBe("blockDone");
    d.extra();
    expect(d.state.phase).toBe("rest");
    expect(effectiveRounds(d.state, plan2, 0)).toBe(3);
    d.adv(30_000).tap();
    expect(d.state.round).toBe(3);
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
      {
        blockId: "blk-a",
        roundNumber: 1,
        orderIndex: 0,
        kind: "STATION" as const,
        blockMovementId: "bm-burpee",
        durationMs: 90_000,
      },
      {
        blockId: "blk-a",
        roundNumber: 1,
        orderIndex: 1,
        kind: "ROX_ZONE" as const,
        blockMovementId: null,
        durationMs: 8_000,
      },
      {
        blockId: "blk-a",
        roundNumber: 1,
        orderIndex: 2,
        kind: "STATION" as const,
        blockMovementId: "bm-run",
        durationMs: 150_000,
      },
      {
        blockId: "blk-a",
        roundNumber: 1,
        orderIndex: 3,
        kind: "ROX_ZONE" as const,
        blockMovementId: null,
        durationMs: 9_000,
      },
      {
        blockId: "blk-a",
        roundNumber: 1,
        orderIndex: 4,
        kind: "STATION" as const,
        blockMovementId: "bm-wb",
        durationMs: 120_000,
      },
    ];
    const s = rehydrateFromSegments(plan2, persisted);
    expect(s.blockIndex).toBe(0);
    expect(s.round).toBe(2);
    expect(s.phase).toBe("idle");
    expect(s.persistedCount).toBe(5);
    expect(canUndo(s)).toBe(false);
  });
  test("complete block rehydrates to blockDone", () => {
    const persisted = [1, 2]
      .flatMap((r) => [
        {
          blockId: "blk-b",
          roundNumber: r,
          orderIndex: (r - 1) * 2,
          kind: "STATION" as const,
          blockMovementId: "bm-sled",
          durationMs: 45_000,
        },
        {
          blockId: "blk-b",
          roundNumber: r,
          orderIndex: (r - 1) * 2 + 1,
          kind: "REST" as const,
          blockMovementId: null,
          durationMs: 60_000,
        },
      ])
      .concat([
        {
          blockId: "blk-b",
          roundNumber: 3,
          orderIndex: 4,
          kind: "STATION" as const,
          blockMovementId: "bm-sled",
          durationMs: 47_000,
        },
      ]);
    const s = rehydrateFromSegments(plan2, persisted);
    expect(s.blockIndex).toBe(1);
    expect(s.phase).toBe("blockDone");
  });
});

describe("rehydrateFromSegments — partial and extra rounds", () => {
  const r1: PersistedSegment[] = [
    {
      blockId: "blk-a",
      roundNumber: 1,
      orderIndex: 0,
      kind: "STATION",
      blockMovementId: "bm-burpee",
      durationMs: 90_000,
    },
    { blockId: "blk-a", roundNumber: 1, orderIndex: 1, kind: "ROX_ZONE", blockMovementId: null, durationMs: 8_000 },
    {
      blockId: "blk-a",
      roundNumber: 1,
      orderIndex: 2,
      kind: "STATION",
      blockMovementId: "bm-run",
      durationMs: 150_000,
    },
    { blockId: "blk-a", roundNumber: 1, orderIndex: 3, kind: "ROX_ZONE", blockMovementId: null, durationMs: 9_000 },
    { blockId: "blk-a", roundNumber: 1, orderIndex: 4, kind: "STATION", blockMovementId: "bm-wb", durationMs: 120_000 },
    { blockId: "blk-a", roundNumber: 1, orderIndex: 5, kind: "REST", blockMovementId: null, durationMs: 118_000 },
  ];
  test("mid-round crash resumes at the next station without double counting", () => {
    const persisted = [
      ...r1,
      {
        blockId: "blk-a",
        roundNumber: 2,
        orderIndex: 6,
        kind: "STATION" as const,
        blockMovementId: "bm-burpee",
        durationMs: 95_000,
      },
      {
        blockId: "blk-a",
        roundNumber: 2,
        orderIndex: 7,
        kind: "ROX_ZONE" as const,
        blockMovementId: null,
        durationMs: 9_000,
      },
    ];
    const s = rehydrateFromSegments(plan2, persisted);
    expect(s.phase).toBe("idle");
    expect(s.round).toBe(2);
    expect(s.stationIndex).toBe(1);
    expect(s.persistedCount).toBe(8);
    const next = hyroxTimerReducer(s, plan2, { type: "tap", atMs: 1_000 });
    expect(next.phase).toBe("station");
    expect(next.stationIndex).toBe(1);
    const tail = next.segments[next.segments.length - 1];
    expect(tail.orderIndex).toBe(8);
    expect(tail.roundNumber).toBe(2);
    expect(roundMs(next, 1_000, 0, 2)).toBe(104_000);
  });
  test("persisted extra round rehydrates to blockDone with extraRounds reconstructed", () => {
    const extraRoundSegs = [2, 3].flatMap((r, i) => [
      {
        blockId: "blk-a",
        roundNumber: r,
        orderIndex: 6 + i * 6,
        kind: "STATION" as const,
        blockMovementId: "bm-burpee",
        durationMs: 90_000,
      },
      {
        blockId: "blk-a",
        roundNumber: r,
        orderIndex: 7 + i * 6,
        kind: "ROX_ZONE" as const,
        blockMovementId: null,
        durationMs: 8_000,
      },
      {
        blockId: "blk-a",
        roundNumber: r,
        orderIndex: 8 + i * 6,
        kind: "STATION" as const,
        blockMovementId: "bm-run",
        durationMs: 150_000,
      },
      {
        blockId: "blk-a",
        roundNumber: r,
        orderIndex: 9 + i * 6,
        kind: "ROX_ZONE" as const,
        blockMovementId: null,
        durationMs: 9_000,
      },
      {
        blockId: "blk-a",
        roundNumber: r,
        orderIndex: 10 + i * 6,
        kind: "STATION" as const,
        blockMovementId: "bm-wb",
        durationMs: 120_000,
      },
      {
        blockId: "blk-a",
        roundNumber: r,
        orderIndex: 11 + i * 6,
        kind: "REST" as const,
        blockMovementId: null,
        durationMs: 60_000,
      },
    ]);
    const s = rehydrateFromSegments(plan2, [...r1, ...extraRoundSegs]);
    expect(s.phase).toBe("blockDone");
    expect(effectiveRounds(s, plan2, 0)).toBe(3);
  });
  test("segments with unknown blockId are ignored", () => {
    const s = rehydrateFromSegments(plan2, [
      { blockId: "blk-zombie", roundNumber: 1, orderIndex: 0, kind: "STATION", blockMovementId: "x", durationMs: 1000 },
    ]);
    expect(s).toEqual(initialTimerState());
  });
  test("resume block is chosen by plan order, not array order", () => {
    const blockB = [
      {
        blockId: "blk-b",
        roundNumber: 1,
        orderIndex: 0,
        kind: "STATION" as const,
        blockMovementId: "bm-sled",
        durationMs: 45_000,
      },
      {
        blockId: "blk-b",
        roundNumber: 1,
        orderIndex: 1,
        kind: "REST" as const,
        blockMovementId: null,
        durationMs: 60_000,
      },
    ];
    // block B rows FIRST — simulates uuid-ordered loader output where blk-a sorts after blk-b
    const s = rehydrateFromSegments(plan2, [...blockB, ...r1]);
    expect(s.blockIndex).toBe(1);
    expect(s.round).toBe(2);
    expect(s.phase).toBe("idle");
  });
});
