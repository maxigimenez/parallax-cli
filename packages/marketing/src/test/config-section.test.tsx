import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ConfigSection from "../components/ConfigSection";

describe("ConfigSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders the shared yaml code block and copies the register command inline", async () => {
    render(<ConfigSection />);

    expect(screen.getAllByText("parallax.yml").length).toBeGreaterThan(0);
    expect(screen.getByText("workspaceDir")).toBeTruthy();
    expect(screen.getByText("/Users/maxi/projects/www")).toBeTruthy();

    const buttons = screen.getAllByRole("button");
    const inlineCopyButton = buttons.find((button) =>
      button.getAttribute("aria-label") === "Copy inline code"
    );

    expect(inlineCopyButton).toBeTruthy();

    fireEvent.click(inlineCopyButton!);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("parallax register ./parallax.yml");
    });
  });

  it("renders yaml syntax-highlighted content while keeping raw code copyable", () => {
    render(<ConfigSection />);

    expect(screen.getByText("workspaceDir")).toBeTruthy();
    expect(screen.getByText("/Users/maxi/projects/www")).toBeTruthy();
    expect(screen.getByText("[ai-ready]")).toBeTruthy();
    expect(screen.getAllByText("provider").length).toBeGreaterThan(0);
    expect(screen.getByText("codex")).toBeTruthy();
    expect(screen.getByText("model")).toBeTruthy();
    expect(screen.getByText("gpt-5.4")).toBeTruthy();
  });
});
