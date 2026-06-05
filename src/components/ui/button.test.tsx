/// <reference lib="dom" />
import "@testing-library/jest-dom";
import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  test("renders its children", () => {
    render(<Button>Add 1 to 0</Button>);
    expect(screen.getByRole("button", { name: "Add 1 to 0" })).toBeInTheDocument();
  });

  test("calls onClick when clicked", async () => {
    const onClick = mock(() => {});
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Forge</Button>);

    await user.click(screen.getByRole("button", { name: "Forge" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("applies the default variant data attribute", () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-variant", "default");
  });

  test("supports the lg size variant", () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-size", "lg");
  });
});
