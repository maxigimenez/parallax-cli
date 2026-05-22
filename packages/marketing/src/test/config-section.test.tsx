import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ConfigSection from "../components/ConfigSection";

describe("ConfigSection", () => {
  it("tells the wizard + dashboard story without referencing YAML", () => {
    render(<ConfigSection />);

    expect(screen.getByText("From wizard to dashboard.")).toBeTruthy();
    expect(screen.getAllByText(/parallax init/).length).toBeGreaterThan(0);
    expect(screen.getByText("Guided setup")).toBeTruthy();
    expect(screen.getByText("Dashboard-managed")).toBeTruthy();
  });

  it("does not surface the old YAML / register flow", () => {
    render(<ConfigSection />);

    expect(screen.queryByText(/parallax\.yml/)).toBeNull();
    expect(screen.queryByText(/workspaceDir/)).toBeNull();
    expect(screen.queryByText(/parallax register/)).toBeNull();
  });
});
