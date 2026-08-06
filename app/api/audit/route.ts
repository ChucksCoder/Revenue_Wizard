import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, contracts, invoices, customers } from "@/lib/schema";
import { desc, eq, and, gte, lte, ilike, sql, inArray } from "drizzle-orm";
import { json, withUser } from "@/lib/api";

export const dynamic = "force-dynamic";

// Filterable, paged audit log with entity names resolved for display.
export const GET = withUser(async (_user, req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const entityType = p.get("entityType");
  const entityId = p.get("entityId");
  const action = p.get("action");
  const user = p.get("user");
  const from = p.get("from"); // YYYY-MM-DD
  const to = p.get("to");
  const limit = Math.min(Number(p.get("limit") ?? 100), 500);
  const offset = Math.max(Number(p.get("offset") ?? 0), 0);

  const conditions = [];
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (entityId) conditions.push(eq(auditLog.entityId, entityId));
  if (action) conditions.push(eq(auditLog.action, action));
  if (user) conditions.push(ilike(auditLog.userName, `%${user}%`));
  if (from) conditions.push(gte(auditLog.createdAt, new Date(from + "T00:00:00Z")));
  if (to) conditions.push(lte(auditLog.createdAt, new Date(to + "T23:59:59Z")));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)` }).from(auditLog).where(where),
  ]);

  // resolve display names for the page's entities
  const contractIds = rows.filter((r) => r.entityType === "contract").map((r) => r.entityId);
  const invoiceIds = rows.filter((r) => r.entityType === "invoice").map((r) => r.entityId);
  const [contractRows, invoiceRows] = await Promise.all([
    contractIds.length
      ? db
          .select({ id: contracts.id, name: contracts.name, customerName: customers.name })
          .from(contracts)
          .leftJoin(customers, eq(contracts.customerId, customers.id))
          .where(inArray(contracts.id, contractIds))
      : Promise.resolve([]),
    invoiceIds.length
      ? db
          .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, contractId: invoices.contractId })
          .from(invoices)
          .where(inArray(invoices.id, invoiceIds))
      : Promise.resolve([]),
  ]);
  const cName = new Map(contractRows.map((c) => [c.id, `${c.customerName ?? ""} — ${c.name}`]));
  const iName = new Map(invoiceRows.map((i) => [i.id, `Invoice ${i.invoiceNumber}`]));

  return json({
    entries: rows.map((r) => ({
      ...r,
      entityName:
        r.entityType === "contract"
          ? cName.get(r.entityId) ?? "(deleted contract)"
          : r.entityType === "invoice"
            ? iName.get(r.entityId) ?? "(deleted invoice)"
            : r.entityId,
    })),
    total: Number(countRows[0]?.n ?? 0),
  });
});
