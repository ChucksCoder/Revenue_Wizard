import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  contracts,
  customers,
  invoices,
  tranches,
  contractLabels,
  labels,
} from "@/lib/schema";
import { eq, or, ilike, sql, inArray } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Paged + searchable contract list. Invoices are fetched per-contract on
// expand (via /api/contracts/[id]) so this scales to thousands of contracts.
export const GET = withUser(async (_user, req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim();
  const review = p.get("review");
  const labelId = p.get("label");
  const limit = Math.min(Number(p.get("limit") ?? 50), 200);
  const offset = Math.max(Number(p.get("offset") ?? 0), 0);

  const base = db
    .select({
      contract: contracts,
      customerName: customers.name,
    })
    .from(contracts)
    .leftJoin(customers, eq(contracts.customerId, customers.id));

  const conditions = [];
  if (q)
    conditions.push(
      or(
        ilike(contracts.name, `%${q}%`),
        ilike(contracts.contractNumber, `%${q}%`),
        ilike(customers.name, `%${q}%`)
      )
    );
  if (review) conditions.push(eq(contracts.reviewStatus, review as any));

  const where = conditions.length
    ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
    : undefined;

  const [rows, countRows] = await Promise.all([
    where ? base.where(where as any) : base,
    db
      .select({ n: sql<number>`count(*)` })
      .from(contracts)
      .leftJoin(customers, eq(contracts.customerId, customers.id))
      .where((where as any) ?? sql`true`),
  ]);

  let data = rows
    .map((r) => ({ ...r.contract, customerName: r.customerName ?? "Unknown" }))
    .sort(
      (a, b) =>
        a.customerName.localeCompare(b.customerName) || a.name.localeCompare(b.name)
    );

  // label filter (join table) applied after the cheap query
  const labelRows = await db.select().from(labels);
  const allCl = labelId || data.length
    ? await db
        .select()
        .from(contractLabels)
        .where(inArray(contractLabels.contractId, data.map((c) => c.id).slice(0, 5000)))
    : [];
  if (labelId) {
    const tagged = new Set(allCl.filter((x) => x.labelId === labelId).map((x) => x.contractId));
    data = data.filter((c) => tagged.has(c.id));
  }
  const total = labelId ? data.length : Number(countRows[0]?.n ?? data.length);
  const page = data.slice(offset, offset + limit);

  // enrich only the page: labels, tranche count, invoice aggregates
  const ids = page.map((c) => c.id);
  const [pageTranches, invoiceAgg] = ids.length
    ? await Promise.all([
        db
          .select({ contractId: tranches.contractId, n: sql<number>`count(*)` })
          .from(tranches)
          .where(inArray(tranches.contractId, ids))
          .groupBy(tranches.contractId),
        db
          .select({
            contractId: invoices.contractId,
            n: sql<number>`count(*)`,
            amount: sql<string>`coalesce(sum(${invoices.amount}), 0)`,
          })
          .from(invoices)
          .where(inArray(invoices.contractId, ids))
          .groupBy(invoices.contractId),
      ])
    : [[], []];
  const labelById = new Map(labelRows.map((l) => [l.id, l]));
  const trancheN = new Map(pageTranches.map((t) => [t.contractId, Number(t.n)]));
  const invAgg = new Map(invoiceAgg.map((i) => [i.contractId, i]));

  return json({
    contracts: page.map((c) => ({
      ...c,
      labels: allCl
        .filter((x) => x.contractId === c.id)
        .map((x) => labelById.get(x.labelId))
        .filter(Boolean),
      trancheCount: trancheN.get(c.id) ?? 0,
      invoiceCount: Number(invAgg.get(c.id)?.n ?? 0),
      invoiceTotal: Number(invAgg.get(c.id)?.amount ?? 0),
    })),
    total,
    allLabels: labelRows,
  });
});

export const POST = withUser(async (user, req: NextRequest) => {
  const body = await req.json();
  const {
    customerName,
    name,
    contractNumber,
    billingModel,
    startDate,
    endDate,
    tcv,
    licensePct,
    billingFrequency,
    dayCount,
    notes,
  } = body;
  if (!customerName?.trim() || !name?.trim() || !startDate || !endDate)
    return err("Customer, name, start and end dates are required");
  if (endDate < startDate) return err("End date must be after start date");

  let customer = (
    await db.select().from(customers).where(eq(customers.name, customerName.trim()))
  )[0];
  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({ name: customerName.trim() })
      .returning();
  }
  const [row] = await db
    .insert(contracts)
    .values({
      customerId: customer.id,
      name: name.trim(),
      contractNumber: contractNumber || null,
      billingModel: billingModel || "flat",
      startDate,
      endDate,
      tcv: String(tcv ?? 0),
      licensePct: String(licensePct ?? 0.2),
      billingFrequency: billingFrequency || "annual",
      dayCount: dayCount || "inclusive",
      notes: notes || null,
      preparedById: user.id,
    })
    .returning();
  await logAudit(user, "contract", row.id, "created", { name, customerName, tcv });
  return json({ contract: row });
});
