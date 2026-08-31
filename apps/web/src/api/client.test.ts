import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "./client";

function jsonResponse(body: unknown, ok = true, status = 200, statusText = "OK") {
  return {
    ok,
    status,
    statusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("requests pipeline stats from the expected path", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ totalOrders: 5 }));

    const result = await api.getPipelineStats();

    expect(fetch).toHaveBeenCalledWith("http://localhost:4000/api/pipeline/stats", expect.objectContaining({ headers: { "Content-Type": "application/json" } }));
    expect(result).toEqual({ totalOrders: 5 });
  });

  it("appends a status query param when listing incidents", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ count: 0, incidents: [] }));

    await api.listIncidents("OPEN");

    expect(fetch).toHaveBeenCalledWith("http://localhost:4000/api/incidents?status=OPEN", expect.anything());
  });

  it("omits the query string when listing incidents with no filter", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ count: 0, incidents: [] }));

    await api.listIncidents();

    expect(fetch).toHaveBeenCalledWith("http://localhost:4000/api/incidents", expect.anything());
  });

  it("builds a query string from multiple order list params", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ count: 0, orders: [] }));

    await api.listOrders({ status: "SYNCED", limit: 10 });

    expect(fetch).toHaveBeenCalledWith("http://localhost:4000/api/orders?status=SYNCED&limit=10", expect.anything());
  });

  it("POSTs to trigger an investigation", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ triggered: true }));

    await api.investigateIncident(42);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/incidents/42/investigate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws with status and body text on a non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "nope" }, false, 404, "Not Found"));

    await expect(api.getOrder(1)).rejects.toThrow("404 Not Found");
  });
});
