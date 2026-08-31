import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("renders the label and value", () => {
    render(<StatTile label="Blocked backlog" value={51} />);
    expect(screen.getByText("Blocked backlog")).toBeInTheDocument();
    expect(screen.getByText("51")).toBeInTheDocument();
  });

  it("renders an optional hint", () => {
    render(<StatTile label="Backlog" value={0} hint="nothing waiting" />);
    expect(screen.getByText("nothing waiting")).toBeInTheDocument();
  });

  it("omits the hint entirely when none is given", () => {
    const { container } = render(<StatTile label="Backlog" value={0} />);
    expect(container.querySelector(".stat-tile-hint")).toBeNull();
  });

  it("applies the tone color when specified", () => {
    render(<StatTile label="Backlog" value={5} tone="critical" />);
    const value = screen.getByText("5");
    expect(value).toHaveStyle({ color: "var(--status-critical)" });
  });
});
