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
