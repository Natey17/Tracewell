import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DailySyncChart } from "./DailySyncChart";

describe("DailySyncChart", () => {
  it("renders one bar per data point", () => {
    const data = [
      { date: "2026-08-26", count: 0 },
      { date: "2026-08-27", count: 0 },
      { date: "2026-08-28", count: 15 },
    ];

    const { container } = render(<DailySyncChart data={data} />);

    expect(container.querySelectorAll(".bar-chart-col")).toHaveLength(3);
  });

  it("marks zero-count days with the zero styling class", () => {
    const data = [
      { date: "2026-08-27", count: 0 },
      { date: "2026-08-28", count: 15 },
    ];

    const { container } = render(<DailySyncChart data={data} />);
    const bars = container.querySelectorAll(".bar-chart-bar");

    expect(bars[0]).toHaveClass("zero");
    expect(bars[1]).not.toHaveClass("zero");
  });

  it("labels the first and last dates below the chart", () => {
    const data = [
      { date: "2026-08-15", count: 15 },
      { date: "2026-08-28", count: 0 },
    ];

    const { getByText } = render(<DailySyncChart data={data} />);

    expect(getByText("2026-08-15")).toBeInTheDocument();
    expect(getByText("2026-08-28")).toBeInTheDocument();
  });
});
