import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import HeroSection from "../components/HeroSection";

describe("HeroSection", () => {
  it("shows the alpha badge and copyable first-run block", () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>
    );

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
    expect(screen.getByText(/parallax preflight/)).toBeTruthy();
    expect(screen.getByText("Install")).toBeTruthy();
    expect(screen.getByText("Register")).toBeTruthy();
    expect(screen.getByText("Review")).toBeTruthy();
    expect(screen.queryByText(/--env-file/)).toBeNull();
  });
});
