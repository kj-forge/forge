import { describe, expect, test } from "bun:test";

import { noteParts } from "./note-title";

describe("noteParts", () => {
  test("first non-empty line is the title, next one the preview", () => {
    expect(noteParts("Technika RDL\nbiodra wyżej\nłopatki ściągnięte")).toEqual({
      title: "Technika RDL",
      preview: "biodra wyżej",
    });
  });

  test("skips leading blank lines and trims", () => {
    expect(noteParts("\n\n  Pomysł na blok  \n\n  akcesoria 2x w tyg ")).toEqual({
      title: "Pomysł na blok",
      preview: "akcesoria 2x w tyg",
    });
  });

  test("single line has no preview; empty body has neither", () => {
    expect(noteParts("Kupić magnezję")).toEqual({ title: "Kupić magnezję", preview: null });
    expect(noteParts("")).toEqual({ title: null, preview: null });
    expect(noteParts("  \n ")).toEqual({ title: null, preview: null });
  });
});
