import type { Incident, Order, PipelineStats } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getPipelineStats: () => request<PipelineStats>("/api/pipeline/stats"),
  triggerScan: () => request<{ triggered: boolean }>("/api/pipeline/scan", { method: "POST" }),

  listIncidents: (status?: string) =>
    request<{ count: number; incidents: Incident[] }>(`/api/incidents${status ? `?status=${status}` : ""}`),
  getIncident: (id: number) => request<Incident>(`/api/incidents/${id}`),
  investigateIncident: (id: number) =>
    request<{ triggered: boolean }>(`/api/incidents/${id}/investigate`, { method: "POST" }),
  resolveIncident: (id: number) => request<Incident>(`/api/incidents/${id}/resolve`, { method: "POST" }),

  listOrders: (params: { status?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return request<{ count: number; orders: Order[] }>(`/api/orders${qs ? `?${qs}` : ""}`);
  },
  getOrder: (id: number) => request<Order>(`/api/orders/${id}`),
};
