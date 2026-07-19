import { describe, expect, test } from "bun:test";

import { completedRounds, currentRound, maxLoggedRound } from "./step-progress";

const mv = (...rounds: number[]) => ({ sets: rounds.map((setNumber) => ({ setNumber })) });

describe("completedRounds", () => {
  test("min across movements — a partial round doesn't count", () => {
    expect(completedRounds([mv(1, 2), mv(1)])).toBe(1);
    expect(completedRounds([mv(1, 2), mv(1, 2)])).toBe(2);
  });

  test("empty movement pins the step at zero", () => {
    expect(completedRounds([mv(1, 2), mv()])).toBe(0);
    expect(completedRounds([])).toBe(0);
  });
});

describe("currentRound / maxLoggedRound", () => {
  test("inputs advance once everyone logged the frontier round", () => {
    expect(currentRound([mv(1), mv(1)])).toBe(2);
    expect(currentRound([mv(1), mv()])).toBe(1);
    expect(currentRound([mv(), mv()])).toBe(1);
  });

  test("an exercise added mid-step joins the round in progress (no backfill)", () => {
    // Two exercises at round 4, a freshly morphed-in one with nothing yet:
    // the counter stays at the frontier instead of dropping to round 1.
    expect(currentRound([mv(1, 2, 3, 4), mv(1, 2, 3, 4), mv()])).toBe(4);
    // Once the newcomer logs the frontier, the step moves on together.
    expect(currentRound([mv(1, 2, 3, 4), mv(1, 2, 3, 4), mv(4)])).toBe(5);
  });

  test("maxLoggedRound sees the partial round", () => {
    expect(maxLoggedRound([mv(1, 2, 3), mv(1)])).toBe(3);
    expect(maxLoggedRound([mv(), mv()])).toBe(0);
  });
});
