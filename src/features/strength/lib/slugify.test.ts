import { describe, expect, test } from "bun:test";

import { slugify } from "./slugify";

describe("slugify", () => {
  test("lowercases, strips Polish diacritics, hyphenates spaces", () => {
    expect(slugify("Przysiad ze sztangą")).toBe("przysiad-ze-sztanga");
    expect(slugify("Wyciskanie nad głowę (OHP)")).toBe("wyciskanie-nad-glowe-ohp");
    expect(slugify("Żuraw źle łka")).toBe("zuraw-zle-lka");
  });

  test("collapses repeated separators and trims edge hyphens", () => {
    expect(slugify("  belt   squat  ")).toBe("belt-squat");
    expect(slugify("--dziwne---nazwy--")).toBe("dziwne-nazwy");
  });

  test("falls back for names with no usable characters", () => {
    expect(slugify("!!!")).toBe("cwiczenie");
  });
});
