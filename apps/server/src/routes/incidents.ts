import { Router } from "express";
import { getPrismaClient, IncidentStatus } from "@tracewell/db";
import { runInvestigation } from "../agent";

const prisma = getPrismaClient();
export const incidentsRouter = Router();

incidentsRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? (req.query.status as IncidentStatus) : undefined;

  const incidents = await prisma.incident.findMany({
    where: status ? { status } : undefined,
    orderBy: { detectedAt: "desc" },
    include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } },
  });

  res.json({ count: incidents.length, incidents });
});

incidentsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid incident id" });

  const incident = await prisma.incident.findUnique({
    where: { id },
    include: { reports: { orderBy: { generatedAt: "desc" } } },
  });
  if (!incident) return res.status(404).json({ error: "Incident not found" });

  const relatedOrders = await prisma.order.findMany({
    where: { id: { in: incident.relatedOrderIds } },
    orderBy: { sequenceNumber: "asc" },
  });

  res.json({ ...incident, relatedOrders });
});

incidentsRouter.post("/:id/investigate", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid incident id" });

  const incident = await prisma.incident.findUnique({ where: { id } });
  if (!incident) return res.status(404).json({ error: "Incident not found" });

  runInvestigation(id).catch((err) => console.error(`[api] manual investigation of incident #${id} failed:`, err));
  res.json({ triggered: true });
});

incidentsRouter.post("/:id/resolve", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid incident id" });

  const incident = await prisma.incident.update({
    where: { id },
    data: { status: IncidentStatus.RESOLVED, resolvedAt: new Date() },
  });
  res.json(incident);
});
