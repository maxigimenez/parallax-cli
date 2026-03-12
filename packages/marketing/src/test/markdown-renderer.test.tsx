import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MarkdownRenderer from "../components/MarkdownRenderer";

describe("MarkdownRenderer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders copy button for fenced code blocks and copies code", async () => {
    render(<MarkdownRenderer content={"## Getting Started\n\n```bash\nparallax status\n```"} />);

    const button = screen.getByRole("button", { name: "Copy code" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("parallax status");
    });
  });

  it("renders bash syntax highlighting without changing copied content", async () => {
    render(<MarkdownRenderer content={"```bash\n$ parallax status\n```"} />);

    expect(screen.getByText((content) => content.includes("$"))).toBeTruthy();
    expect(screen.getByText("parallax status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("$ parallax status");
    });
  });

  it("does not add copy buttons to inline code", () => {
    render(<MarkdownRenderer content={"Use `parallax status` to confirm the runtime is healthy."} />);

    expect(screen.queryByRole("button", { name: /copy code/i })).toBeNull();
    expect(screen.getByText("parallax status")).toBeTruthy();
  });

  it("renders headings without backticks", () => {
    render(<MarkdownRenderer content={"## `parallax status`\n\nCheck the runtime."} />);

    expect(screen.getByRole("heading", { name: "parallax status" })).toBeTruthy();
  });

  it("renders h4 headings", () => {
    render(<MarkdownRenderer content={"#### pullFrom.provider (required)\n\nDetails."} />);

    expect(screen.getByRole("heading", { level: 4, name: "pullFrom.provider (required)" })).toBeTruthy();
  });
});
