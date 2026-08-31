import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeverityBadge, IncidentStatusBadge, OrderStatusBadge } from "./StatusBadge";

describe("SeverityBadge", () => {
  it("renders the severity label", () => {
    render(<SeverityBadge severity="CRITICAL" />);
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
  });

  it("falls back gracefully for an unrecognized severity", () => {
    render(<SeverityBadge severity="WEIRD" />);
    expect(screen.getByText("WEIRD")).toBeInTheDocument();
  });
});

describe("IncidentStatusBadge", () => {
  it("renders the status label", () => {
    render(<IncidentStatusBadge status="INVESTIGATING" />);
    expect(screen.getByText("INVESTIGATING")).toBeInTheDocument();
  });
});

describe("OrderStatusBadge", () => {
  it("replaces underscores with spaces for readability", () => {
    render(<OrderStatusBadge status="AWAITING_SETTLEMENT" />);
    expect(screen.getByText("AWAITING SETTLEMENT")).toBeInTheDocument();
  });
});
