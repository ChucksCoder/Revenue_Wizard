import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  contracts,
  customers,
  tranches,
  invoices,
  contractLabels,
  labels,
  auditLog,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit, buildChanges } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (_user, _req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const [c] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!c) return err("Contract not found", 404);
  const [cust, trancheRows, invoiceRows, cl, labelRows, activity] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, c.customerId)),
    db.select().from(tranches).where(eq(tranches.contractId, id)),
    db.select().from(invoices).where(eq(invoices.contractId, id)),
    db.select().from(contractLabels).where(eq(contractLabels.contractId, id)),
    db.select().from(labels),
    db.select().from(auditLog).where(eq(auditLog.entityId, id)),
  ]);
  const labelById = new Map(labelRows.map((l) => [l.id, l]));
  return json({
    contract: {
      ...c,
      customerName: cust[0]?.name ?? "Unknown",
      labels: cl.map((x) => labelById.get(x.labelId)).filter(Boolean),
      tranches: trancheRows.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate)
      ),
      invoices: invoiceRows.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate)),
    },
    activity: activity
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 50),
  });
});

const EDITABLE = [
  "name",
  "contractNumber",
  "billingModel",
  "startDate",
  "endDate",
  "tcv",
  "licensePct",
  "billingFrequency",
  "dayCount",
  "status",
  "notes",
] as const;

export const PATCH = withUser(async (user, req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const [existing] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!existing) return err("Contract not found", 404);

  const updates: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    if (k in body) updates[k] = ["tcv", "licensePct"].includes(k) ? String(body[k]) : body[k];
  }

  // field-level before/after diff for the audit trail
  const changes = buildChanges(existing as any, updates);

  if ("labelIds" in body) {
    const ids: string[] = body.labelIds ?? [];
    const [oldJoin, allLabels] = await Promise.all([
      db.select().from(contractLabels).where(eq(contractLabels.contractId, id)),
      db.select().from(labels),
    ]);
    const nameOf = new Map(allLabels.map((l) => [l.id, l.name]));
    const oldNames = oldJoin.map((x) => nameOf.get(x.labelId)).filter(Boolean).sort().join(", ");
    const newNames = ids.map((x) => nameOf.get(x)).filter(Boolean).sort().join(", ");
    await db.delete(contractLabels).where(eq(contractLabels.contractId, id));
    if (ids.length)
      await db
        .insert(contractLabels)
        .values(ids.map((labelId) => ({ contractId: id, labelId })));
    if (oldNames !== newNames)
      changes.labels = { from: oldNames || "(none)", to: newNames || "(none)" };
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
    // editing an approved contract reopens it
    if (existing.reviewStatus === "approved") {
      updates.reviewStatus = "draft";
      updates.approvedById = null;
      updates.approvedAt = null;
      await logAudit(user, "contract", id, "reopened", {
        reason: "edited after approval",
      });
    }
    await db.update(contracts).set(updates).where(eq(contracts.id, id));
  }
  if (Object.keys(changes).length > 0)
    await logAudit(user, "contract", id, "updated", { changes });
  const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
  return json({ contract: row });
});

export const DELETE = withUser(async (user, _req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await db.delete(contracts).where(eq(contracts.id, id));
  await logAudit(user, "contract", id, "deleted");
  return json({ ok: true });
});
