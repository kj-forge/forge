import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { parseInput } from "./validate";

const schema = z.object({ n: z.number().int().min(1, "Za mało.") });

describe("parseInput", () => {
  test("returns parsed data on valid input", () => {
    expect(parseInput(schema, { n: 3 })).toEqual({ n: 3 });
  });

  test("throws a clean Polish message, never a raw Zod JSON dump", () => {
    let message = "";
    try {
      parseInput(schema, { n: 0 });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe("Nieprawidłowe dane. Odśwież stronę i spróbuj ponownie.");
    // The failure must not surface Zod's serialized issue array.
    expect(message.startsWith("[")).toBe(false);
  });
});
