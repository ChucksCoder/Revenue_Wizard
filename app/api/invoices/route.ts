import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  invoices,
  contracts,
  customers,
  invoiceLabels,
  labels,
} from "@/lib/schema";
import { json, err, withUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Flat invoice view: paged + searchable so it scales to thousands.
export const GET = withUser(async (_user, req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim();
  const status = p.get("status");
  const review = p.get("review");
  const limit = Math.min(Number(p.get("limit") ?? 50), 200);
  const offset = Math.max(Number(p.get("offset") ?? 0), 0);

  const { or, ilike, eq, sql, inArray, desc } = await import("drizzle-orm");

  const conditions: any[] = [];
  if (q)
    conditions.push(
      or(
        ilike(invoices.invoiceNumber, `%${q}%`),
        ilike(invoices.externalRef, `%${q}%`),
        ilike(contracts.name, `%${q}%`),
        ilike(customers.name, `%${q}%`)
      )
    );
  if (status) conditions.push(eq(invoices.status, status as any));
  if (review) conditions.push(eq(invoices.reviewStatus, review as any));
  const where = conditions.length
    ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
    : sql`true`;

  const joined = db
    .select({ invoice: invoices, contractName: contracts.name, customerName: customers.name })
    .from(invoices)
    .leftJoin(contracts, eq(invoices.contractId, contracts.id))
    .leftJoin(customers, eq(contracts.customerId, customers.id))
    .where(where as any)
    .orderBy(desc(invoices.invoiceDate))
    .limit(limit)
    .offset(offset);

  const countQ = db
    .select({ n: sql<number>`count(*)` })
    .from(invoices)
    .leftJoin(contracts, eq(invoices.contractId, contracts.id))
    .leftJoin(customers, eq(contracts.customerId, customers.id))
    .where(where as any);

  const sumQ = db
    .select({
      net: sql<string>`coalesce(sum(${invoices.amount}),0)`,
      tax: sql<string>`coalesce(sum(${invoices.taxAmount}),0)`,
    })
    .from(invoices)
    .leftJoin(contracts, eq(invoices.contractId, contracts.id))
    .leftJoin(customers, eq(contracts.customerId, customers.id))
    .where(sql`${where} AND ${invoices.status} != 'void'`);

  const [rows, countRows, sums, labelRows] = await Promise.all([
    joined,
    countQ,
    sumQ,
    db.select().from(labels),
  ]);

  const ids = rows.map((r) => r.invoice.id);
  const il = ids.length
    ? await db.select().from(invoiceLabels).where(inArray(invoiceLabels.invoiceId, ids))
    : [];
  const labelById = new Map(labelRows.map((l) => [l.id, l]));

  return json({
    invoices: rows.map((r) => ({
      ...r.invoice,
      contractName: r.contractName ?? "Unknown",
      customerName: r.customerName ?? "Unknown",
      labels: il
        .filter((x) => x.invoiceId === r.invoice.id)
        .map((x) => labelById.get(x.labelId))
        .filter(Boolean),
    })),
    total: Number(countRows[0]?.n ?? 0),
    sums: { net: Number(sums[0]?.net ?? 0), tax: Number(sums[0]?.tax ?? 0) },
    allLabels: labelRows,
  });
});

export const POST = withUser(async (user, req: NextRequest) => {
  const body = await req.json();
  const {
    contractId,
    invoiceNumber,
    invoiceDate,
    periodStart,
    periodEnd,
    amount,
    taxRate,
    status,
    description,
    externalRef,
  } = body;
  if (!contractId || !invoiceNumber || !invoiceDate || amount == null)
    return err("Contract, invoice number, date and amount are required");
  const rate = Number(taxRate ?? 0);
  const taxAmount =
    body.taxAmount != null
      ? Number(body.taxAmount)
      : Math.round(Number(amount) * rate * 100) / 100;
  const [row] = await db
    .insert(invoices)
    .values({
      contractId,
      invoiceNumber,
      invoiceDate,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      amount: String(amount),
      taxRate: String(rate),
      taxAmount: String(taxAmount),
      status: status || "draft",
      description: description || null,
      externalRef: externalRef || null,
      preparedById: user.id,
    })
    .returning();
  await logAudit(user, "invoice", row.id, "created", {
    invoiceNumber,
    amount,
    contractId,
  });
  return json({ invoice: row });
});
