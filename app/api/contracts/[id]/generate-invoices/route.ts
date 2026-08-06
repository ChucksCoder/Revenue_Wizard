import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { contracts, invoices, tranches } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { parseDate, toISO } from "@/lib/engine";
import { num } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

function addMonthsToDate(iso: string, n: number): string {
  const d = parseDate(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toISO(target);
}

function prevDay(iso: string): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return toISO(d);
}

/**
 * Generate DRAFT invoices from the contract's billing frequency across its
 * segments (tranches, or the contract itself if flat). Periods are split by
 * the billing cadence; amounts are day-weighted within each segment with a
 * final-period plug so drafts total the segment amount exactly. Drafts are
 * meant to be reviewed and edited - Campfire remains the billing source of
 * truth, so paste the Campfire reference on each invoice as you verify them.
 */
export const POST = withUser(async (user, req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const taxRate = Number(body.taxRate ?? 0);
  const [c] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!c) return err("Contract not found", 404);
  const trancheRows = await db.select().from(tranches).where(eq(tranches.contractId, id));
  const segments =
    trancheRows.length > 0
      ? trancheRows
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
          .map((t) => ({ name: t.name, start: t.startDate, end: t.endDate, amount: num(t.amount) }))
      : [{ name: "Contract", start: c.startDate, end: c.endDate, amount: num(c.tcv) }];

  const stepMonths =
    c.billingFrequency === "monthly" ? 1 : c.billingFrequency === "quarterly" ? 3 : 12;
  const upfront = c.billingFrequency === "upfront" || c.billingFrequency === "custom";

  const existing = await db.select().from(invoices).where(eq(invoices.contractId, id));
  let n = existing.length + 1;
  const drafts: (typeof invoices.$inferInsert)[] = [];

  for (const seg of segments) {
    if (upfront) {
      const amount = Math.round(seg.amount * 100) / 100;
      drafts.push({
        contractId: id,
        invoiceNumber: `DRAFT-${String(n++).padStart(3, "0")}`,
        invoiceDate: seg.start,
        periodStart: seg.start,
        periodEnd: seg.end,
        amount: String(amount),
        taxRate: String(taxRate),
        taxAmount: String(Math.round(amount * taxRate * 100) / 100),
        status: "draft",
        description: `${seg.name} - upfront billing (draft, verify vs Campfire)`,
        preparedById: user.id,
      });
      continue;
    }
    // build periods
    const periods: { start: string; end: string }[] = [];
    let ps = seg.start;
    while (ps <= seg.end) {
      const nextStart = addMonthsToDate(ps, stepMonths);
      const pe = prevDay(nextStart) < seg.end ? prevDay(nextStart) : seg.end;
      periods.push({ start: ps, end: pe });
      ps = nextStart;
    }
    const totalDays = periods.reduce(
      (a, p) => a + (parseDate(p.end).getTime() - parseDate(p.start).getTime()) / 86400000 + 1,
      0
    );
    const totalCents = Math.round(seg.amount * 100);
    let allocated = 0;
    periods.forEach((p, i) => {
      const days =
        (parseDate(p.end).getTime() - parseDate(p.start).getTime()) / 86400000 + 1;
      const cents =
        i === periods.length - 1
          ? totalCents - allocated
          : Math.round((totalCents * days) / totalDays);
      allocated += cents;
      const amount = cents / 100;
      drafts.push({
        contractId: id,
        invoiceNumber: `DRAFT-${String(n++).padStart(3, "0")}`,
        invoiceDate: p.start,
        periodStart: p.start,
        periodEnd: p.end,
        amount: String(amount),
        taxRate: String(taxRate),
        taxAmount: String(Math.round(amount * taxRate * 100) / 100),
        status: "draft",
        description: `${seg.name} - ${c.billingFrequency} billing (draft, verify vs Campfire)`,
        preparedById: user.id,
      });
    });
  }

  if (drafts.length === 0) return err("Nothing to generate");
  const rows = await db.insert(invoices).values(drafts).returning();
  await logAudit(user, "contract", id, "updated", {
    generatedInvoices: rows.length,
  });
  return json({ invoices: rows });
});
