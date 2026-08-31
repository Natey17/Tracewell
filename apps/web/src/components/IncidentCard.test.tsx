import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IncidentCard } from "./IncidentCard";
import type { Incident } from "../api/types";

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 3,
    type: "BLOCKED_BACKLOG",
    severity: "CRITICAL",
    status: "OPEN",
    title: "51 orders blocked behind order #301",
    summary: "Pipeline cursor is stalled.",
    relatedOrderIds: [301],
    detectedAt: new Date().toISOString(),
    resolvedAt: null,
    reports: [],
    ...overrides,
  };
}

describe("IncidentCard", () => {
  it("renders the title, severity, status, and summary", () => {
    render(
      <MemoryRouter>
        <IncidentCard incident={makeIncident()} />
      </MemoryRouter>
    );

    expect(screen.getByText("51 orders blocked behind order #301")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("Pipeline cursor is stalled.")).toBeInTheDocument();
  });

  it("links to the incident's detail page", () => {
    render(
      <MemoryRouter>
        <IncidentCard incident={makeIncident({ id: 42 })} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/incidents/42");
  });

  it("shows 'investigation pending' when there's no report yet", () => {
    render(
      <MemoryRouter>
        <IncidentCard incident={makeIncident({ reports: [] })} />
      </MemoryRouter>
    );

    expect(screen.getByText(/investigation pending/)).toBeInTheDocument();
  });

  it("shows 'report ready' once a report exists", () => {
    render(
      <MemoryRouter>
        <IncidentCard
          incident={makeIncident({
            reports: [
              {
                id: 1,
                incidentId: 3,
                status: "SUCCESS",
                model: "claude-sonnet-5",
                rootCause: "x",
                confidence: "high",
                affectedOrderIds: [],
                evidenceTrail: [],
                recommendedActions: [],
                errorMessage: null,
                generatedAt: new Date().toISOString(),
              },
            ],
          })}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/report ready/)).toBeInTheDocument();
  });
});
