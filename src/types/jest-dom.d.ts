/// <reference types="@testing-library/jest-dom" />

import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Augment Bun's `bun:test` Matchers interface with @testing-library/jest-dom
// custom matchers (toBeInTheDocument, toHaveAttribute, etc.). Imported as
// type-only side-effect via the triple-slash directive on top.
declare module "bun:test" {
  interface Matchers<T = unknown> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
  interface AsymmetricMatchers extends TestingLibraryMatchers<unknown, void> {}
}
