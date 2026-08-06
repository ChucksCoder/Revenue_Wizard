import { db } from "@/lib/db";
import {
  labels,
  contracts,
  customers,
  invoices,
  contractLabels,
  invoiceLabels,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { json, withUser } from "@/lib/api";

export const dynamic = "force-dynamic";

const r2 = (x: number) => Math.round(x * 100) / 100;

// Label report: per-label counts + dollar totals, plus the labeled entities
// themselves (only labeled ones ship, so this stays small at scale). The
// client does multi-select filtering instantly with no refetch.
export const GET = withUser(async () => {
  const [labelRows, cl, il] = await Promise.all([
    db.select().from(labels),
    db
      .select({
        labelId: contractLabels.labelId,
        contractId: contracts.id,
        name: contracts.name,
        customer: customers.name,
        tcv: contracts.tcv,
        reviewStatus: contracts.reviewStatus,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
      })
      .from(contractLabels)
      .innerJoin(contracts, eq(contractLabels.contractId, contracts.id))
      .leftJoin(customers, eq(contracts.customerId, customers.id)),
    db
      .select({
        labelId: invoiceLabels.labelId,
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        amount: invoices.amount,
        taxAmount: invoices.taxAmount,
        invoiceDate: invoices.invoiceDate,
        status: invoices.status,
        contractId: invoices.contractId,
        customer: customers.name,
      })
      .from(invoiceLabels)
      .innerJoin(invoices, eq(invoiceLabels.invoiceId, invoices.id))
      .leftJoin(contracts, eq(invoices.contractId, contracts.id))
      .leftJoin(customers, eq(contracts.customerId, customers.id)),
  ]);

  // entity maps with their full label sets
  const contractMap: Record<string, any> = {};
  for (const r of cl) {
    const c = (contractMap[r.contractId] ??= {
      id: r.contractId,
      name: r.name,
      customer: r.customer ?? "Unknown",
      tcv: Number(r.tcv),
      reviewStatus: r.reviewStatus,
      startDate: r.startDate,
      endDate: r.endDate,
      labelIds: [] as string[],
    });
    c.labelIds.push(r.labelId);
  }
  const invoiceMap: Record<string, any> = {};
  for (const r of il) {
    const i = (invoiceMap[r.invoiceId] ??= {
      id: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      customer: r.customer ?? "Unknown",
      contractId: r.contractId,
      amount: Number(r.amount),
      taxAmount: Number(r.taxAmount),
      invoiceDate: r.invoiceDate,
      status: r.status,
      labelIds: [] as string[],
    });
    i.labelIds.push(r.labelId);
  }

  // per-label summary
  const summary = labelRows.map((l) => {
    const cs = Object.values(contractMap).filter((c: any) => c.labelIds.includes(l.id));
    const is = Object.values(invoiceMap).filter((i: any) => i.labelIds.includes(l.id));
    return {
      id: l.id,
      name: l.name,
      color: l.color,
      contractCount: cs.length,
      invoiceCount: is.length,
      contractTcv: r2(cs.reduce((a: number, c: any) => a + c.tcv, 0)),
      invoiceNet: r2(is.filter((i: any) => i.status !== "void").reduce((a: number, i: any) => a + i.amount, 0)),
    };
  });

  return json({ labels: summary, contracts: contractMap, invoices: invoiceMap });
});
