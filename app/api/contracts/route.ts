import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  contracts,
  customers,
  invoices,
  tranches,
  contractLabels,
  invoiceLabels,
  labels,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Full contract list with customer, labels, tranches and invoices (for the
// contract view with invoice children).
export const GET = withUser(async () => {
  const [contractRows, customerRows, invoiceRows, trancheRows, cl, il, labelRows] =
    await Promise.all([
      db.select().from(contracts),
      db.select().from(customers),
      db.select().from(invoices),
      db.select().from(tranches),
      db.select().from(contractLabels),
      db.select().from(invoiceLabels),
      db.select().from(labels),
    ]);
  const custById = new Map(customerRows.map((c) => [c.id, c]));
  const labelById = new Map(labelRows.map((l) => [l.id, l]));
  const data = contractRows.map((c) => ({
    ...c,
    customerName: custById.get(c.customerId)?.name ?? "Unknown",
    labels: cl
      .filter((x) => x.contractId === c.id)
      .map((x) => labelById.get(x.labelId))
      .filter(Boolean),
    tranches: trancheRows
      .filter((t) => t.contractId === c.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate)),
    invoices: invoiceRows
      .filter((i) => i.contractId === c.id)
      .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
      .map((i) => ({
        ...i,
        labels: il
          .filter((x) => x.invoiceId === i.id)
          .map((x) => labelById.get(x.labelId))
          .filter(Boolean),
      })),
  }));
  data.sort(
    (a, b) =>
      a.customerName.localeCompare(b.customerName) || a.name.localeCompare(b.name)
  );
  return json({ contracts: data, allLabels: labelRows });
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
