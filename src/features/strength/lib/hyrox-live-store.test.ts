import { describe, expect, test } from "bun:test";

import { liveStateKey, parseLiveState, serializeLiveState } from "./hyrox-live-store";
import { initialTimerState } from "./hyrox-timer";

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
