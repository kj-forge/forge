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
    expect(validateHyroxBlocks([block({ stations: [station({ target: "1.5" })] })])).toMatch(/musi być dodatnią/);
  });
  test("requires at least one block", () => {
    expect(validateHyroxBlocks([])).toMatch(/blok/i);
  });
  test("rejects targets above unit maxima", () => {
    expect(validateHyroxBlocks([block({ stations: [station({ defaultUnit: "REPS", target: "1001" })] })])).toMatch(
      /najwyżej 1000/,
    );
    expect(validateHyroxBlocks([block({ stations: [station({ target: "50001" })] })])).toMatch(/najwyżej 50 000/);
  });
});
