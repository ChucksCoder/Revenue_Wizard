import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { invoices, invoiceLabels, labels } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit, buildChanges } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const STRINGS = [
  "invoiceNumber",
  "invoiceDate",
  "periodStart",
  "periodEnd",
  "status",
  "description",
  "externalRef",
] as const;
const NUMERICS = ["amount", "taxRate", "taxAmount"] as const;

export const PATCH = withUser(async (user, req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const [existing] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!existing) return err("Invoice not found", 404);

  const updates: Record<string, unknown> = {};
  for (const k of STRINGS) if (k in body) updates[k] = body[k] || null;
  if ("invoiceNumber" in body && !body.invoiceNumber) return err("Invoice number required");
  if ("invoiceDate" in body && !body.invoiceDate) return err("Invoice date required");
  if ("status" in body) updates.status = body.status;
  for (const k of NUMERICS) if (k in body) updates[k] = String(body[k] ?? 0);
  // recompute tax if amount or rate changed and taxAmount not explicitly sent
  if (("amount" in body || "taxRate" in body) && !("taxAmount" in body)) {
    const amount = "amount" in body ? Number(body.amount) : Number(existing.amount);
    const rate = "taxRate" in body ? Number(body.taxRate) : Number(existing.taxRate);
    updates.taxAmount = String(Math.round(amount * rate * 100) / 100);
  }

  // field-level before/after diff for the audit trail
  const changes = buildChanges(existing as any, updates);

  if ("labelIds" in body) {
    const ids: string[] = body.labelIds ?? [];
    const [oldJoin, allLabels] = await Promise.all([
      db.select().from(invoiceLabels).where(eq(invoiceLabels.invoiceId, id)),
      db.select().from(labels),
    ]);
    const nameOf = new Map(allLabels.map((l) => [l.id, l.name]));
    const oldNames = oldJoin.map((x) => nameOf.get(x.labelId)).filter(Boolean).sort().join(", ");
    const newNames = ids.map((x) => nameOf.get(x)).filter(Boolean).sort().join(", ");
    await db.delete(invoiceLabels).where(eq(invoiceLabels.invoiceId, id));
    if (ids.length)
      await db
        .insert(invoiceLabels)
        .values(ids.map((labelId) => ({ invoiceId: id, labelId })));
    if (oldNames !== newNames)
      changes.labels = { from: oldNames || "(none)", to: newNames || "(none)" };
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
    if (existing.reviewStatus === "approved") {
      updates.reviewStatus = "draft";
      updates.approvedById = null;
      updates.approvedAt = null;
      await logAudit(user, "invoice", id, "reopened", { reason: "edited after approval" });
    }
    await db.update(invoices).set(updates).where(eq(invoices.id, id));
  }
  if (Object.keys(changes).length > 0)
    await logAudit(user, "invoice", id, "updated", { changes });
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  return json({ invoice: row });
});

export const DELETE = withUser(async (user, _req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await db.delete(invoices).where(eq(invoices.id, id));
  await logAudit(user, "invoice", id, "deleted");
  return json({ ok: true });
});
