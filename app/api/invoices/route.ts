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

// Flat invoice view: every invoice with its contract/customer as data points.
export const GET = withUser(async () => {
  const [invoiceRows, contractRows, customerRows, il, labelRows] = await Promise.all([
    db.select().from(invoices),
    db.select().from(contracts),
    db.select().from(customers),
    db.select().from(invoiceLabels),
    db.select().from(labels),
  ]);
  const contractById = new Map(contractRows.map((c) => [c.id, c]));
  const custById = new Map(customerRows.map((c) => [c.id, c]));
  const labelById = new Map(labelRows.map((l) => [l.id, l]));
  const data = invoiceRows
    .map((i) => {
      const c = contractById.get(i.contractId);
      return {
        ...i,
        contractName: c?.name ?? "Unknown",
        customerName: c ? custById.get(c.customerId)?.name ?? "Unknown" : "Unknown",
        labels: il
          .filter((x) => x.invoiceId === i.id)
          .map((x) => labelById.get(x.labelId))
          .filter(Boolean),
      };
    })
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  return json({ invoices: data, allLabels: labelRows });
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
