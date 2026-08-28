import { Router } from "express";
import { getPrismaClient, OrderStatus } from "@tracewell/db";

const prisma = getPrismaClient();
export const ordersRouter = Router();

ordersRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? (req.query.status as OrderStatus) : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursorParam = req.query.before ? Number(req.query.before) : undefined;

  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { sequenceNumber: "desc" },
    take: limit,
    skip: cursorParam ? 1 : 0,
    cursor: cursorParam ? { sequenceNumber: cursorParam } : undefined,
  });

  res.json({ count: orders.length, orders });
});

ordersRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid order id" });

  const order = await prisma.order.findUnique({
    where: { id },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });

  res.json(order);
});
