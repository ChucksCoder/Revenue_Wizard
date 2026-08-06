import { db } from "./db";
import { contracts, customers, tranches, invoices, settings } from "./schema";
import { eq, inArray } from "drizzle-orm";
import type { EngineContractInput, AccountMap } from "./engine";
import { DEFAULT_ACCOUNTS } from "./engine";
import { num } from "./format";

export async function loadEngineContracts(
  contractIds?: string[]
): Promise<EngineContractInput[]> {
  const contractRows = contractIds
    ? await db.select().from(contracts).where(inArray(contracts.id, contractIds))
    : await db.select().from(contracts);
  const active = contractRows.filter((c) => c.status !== "cancelled");
  if (active.length === 0) return [];
  const ids = active.map((c) => c.id);
  const [customerRows, trancheRows, invoiceRows] = await Promise.all([
    db.select().from(customers),
    db.select().from(tranches).where(inArray(tranches.contractId, ids)),
    db.select().from(invoices).where(inArray(invoices.contractId, ids)),
  ]);
  const custById = new Map(customerRows.map((c) => [c.id, c]));
  return active.map((c) => ({
    id: c.id,
    name: c.name,
    customerName: custById.get(c.customerId)?.name ?? "Unknown",
    start: c.startDate,
    end: c.endDate,
    tcv: num(c.tcv),
    licensePct: num(c.licensePct),
    dayCount: c.dayCount,
    segments: trancheRows
      .filter((t) => t.contractId === c.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate))
      .map((t) => ({
        id: t.id,
        name: t.name,
        start: t.startDate,
        end: t.endDate,
        amount: num(t.amount),
      })),
    invoices: invoiceRows
      .filter((i) => i.contractId === c.id)
      .map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        date: i.invoiceDate,
        amount: num(i.amount),
        taxAmount: num(i.taxAmount),
        status: i.status,
      })),
  }));
}

export async function loadAccountMap(): Promise<AccountMap> {
  const rows = await db.select().from(settings).where(eq(settings.key, "accounts"));
  if (rows.length === 0) return DEFAULT_ACCOUNTS;
  return { ...DEFAULT_ACCOUNTS, ...(rows[0].value as Partial<AccountMap>) };
}
