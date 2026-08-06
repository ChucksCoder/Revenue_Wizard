import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { contracts, customers, invoices } from "@/lib/schema";
import { eq, isNotNull } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Campfire sync. Pulls contracts + invoices from the Campfire API and merges
// them with review-safe rules:
//   - NEW contracts   -> created as drafts (flat model) for review; tranches
//                        stay manual - Campfire doesn't know license releases.
//   - EXISTING        -> never overwritten; TCV/date differences are reported
//                        as conflicts for a human to resolve.
//   - NEW invoices    -> inserted as issued, keyed by Campfire invoice id.
//   - CHANGED invoices-> updated only if not approved; approved ones become
//                        conflicts.
// Config via env: CAMPFIRE_API_KEY (required), CAMPFIRE_API_BASE,
// CAMPFIRE_CONTRACTS_PATH, CAMPFIRE_INVOICES_PATH (defaults below - confirm
// against Campfire's API docs for your account).
// ---------------------------------------------------------------------------

const BASE = process.env.CAMPFIRE_API_BASE ?? "https://api.meetcampfire.com";
const CONTRACTS_PATH = process.env.CAMPFIRE_CONTRACTS_PATH ?? "/coa/api/v1/contracts/";
const INVOICES_PATH = process.env.CAMPFIRE_INVOICES_PATH ?? "/coa/api/v1/invoices/";

async function cf(path: string, params: Record<string, string>) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.CAMPFIRE_API_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Campfire ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function cfAll(path: string, extra: Record<string, string> = {}) {
  const out: any[] = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const d = await cf(path, { limit: "200", offset: String(offset), ...extra });
    const results = d.results ?? [];
    out.push(...results);
    if (out.length >= (d.count ?? out.length) || results.length === 0) break;
    offset += 200;
  }
  return out;
}

export const GET = withUser(async () => {
  return json({
    configured: Boolean(process.env.CAMPFIRE_API_KEY),
    base: BASE,
  });
});

export const POST = withUser(
  async (user, req: NextRequest) => {
    if (!process.env.CAMPFIRE_API_KEY)
      return err("CAMPFIRE_API_KEY is not set. Add it in Vercel -> Settings -> Environment Variables and redeploy.", 400);

    const body = await req.json().catch(() => ({}));
    // optional: only contracts starting on/after this date (YYYY-MM-DD)
    const startAfter: string | null = body.startAfter ?? null;

    const report = {
      contractsSeen: 0,
      contractsCreated: 0,
      invoicesSeen: 0,
      invoicesCreated: 0,
      invoicesUpdated: 0,
      conflicts: [] as string[],
      skipped: 0,
    };

    // ---- contracts ----
    const cfContracts = (await cfAll(CONTRACTS_PATH)).filter(
      (c) => !c.is_deleted && c.contract_start_date && c.contract_end_date
    );
    const scoped = startAfter
      ? cfContracts.filter((c) => c.contract_start_date >= startAfter)
      : cfContracts;
    report.contractsSeen = scoped.length;

    const localContracts = await db
      .select({ id: contracts.id, campfireId: contracts.campfireId, tcv: contracts.tcv, name: contracts.name })
      .from(contracts)
      .where(isNotNull(contracts.campfireId));
    const byCfId = new Map(localContracts.map((c) => [c.campfireId, c]));
    const customerRows = await db.select().from(customers);
    const custByName = new Map(customerRows.map((c) => [c.name, c.id]));

    const cfIdToLocal = new Map<string, string>(); // campfire contract id -> local id
    for (const c of scoped) {
      const cfId = String(c.id);
      const existing = byCfId.get(cfId);
      if (existing) {
        cfIdToLocal.set(cfId, existing.id);
        const localTcv = Number(existing.tcv);
        const cfTcv = Number(c.total_contract_value ?? 0);
        if (Math.abs(localTcv - cfTcv) > 0.01) {
          report.conflicts.push(
            `Contract "${existing.name}": Campfire TCV ${cfTcv.toFixed(2)} vs app ${localTcv.toFixed(2)} - not changed, review manually`
          );
        }
        continue;
      }
      // new contract
      let customerId = custByName.get(c.client_name);
      if (!customerId) {
        const [row] = await db.insert(customers).values({ name: c.client_name }).returning();
        customerId = row.id;
        custByName.set(c.client_name, customerId);
      }
      const [row] = await db
        .insert(contracts)
        .values({
          customerId,
          name: c.deal_name || `${c.client_name} contract ${cfId}`,
          billingModel: "flat",
          startDate: c.contract_start_date,
          endDate: c.contract_end_date,
          tcv: String(c.total_contract_value ?? 0),
          licensePct: "0.2",
          billingFrequency: "annual",
          dayCount: "exclusive",
          campfireId: cfId,
          notes: `Synced from Campfire ${new Date().toISOString().slice(0, 10)} (${c.client_campfire_id ?? ""}). Review terms vs signed contract; add tranches if licenses release over time.`,
          preparedById: user.id,
        })
        .returning();
      cfIdToLocal.set(cfId, row.id);
      report.contractsCreated++;
      await logAudit(user, "contract", row.id, "created", { source: "campfire-sync", cfId });
    }

    // ---- invoices (for synced contracts) ----
    const cfInvoices = (await cfAll(INVOICES_PATH)).filter(
      (i) => !i.is_deleted && cfIdToLocal.has(String(i.contract))
    );
    report.invoicesSeen = cfInvoices.length;

    const localInvoices = await db
      .select()
      .from(invoices)
      .where(isNotNull(invoices.externalRef));
    const byExtRef = new Map(localInvoices.map((i) => [i.externalRef, i]));

    for (const i of cfInvoices) {
      const extRef = String(i.id);
      const contractId = cfIdToLocal.get(String(i.contract))!;
      const lines: any[] = i.lines ?? [];
      const pre = lines.length
        ? Math.round(lines.reduce((a, l) => a + Number(l.amount ?? 0), 0) * 100) / 100
        : Math.round(Number(i.total_amount ?? 0) * 100) / 100;
      const tax = Math.round(lines.reduce((a, l) => a + Number(l.tax ?? 0), 0) * 100) / 100;
      const voided = Boolean(i.voided_date) || i.status === "voided";
      const existing = byExtRef.get(extRef);

      if (!existing) {
        if (voided) { report.skipped++; continue; }
        await db.insert(invoices).values({
          contractId,
          invoiceNumber: i.invoice_number || `CF-${extRef}`,
          invoiceDate: i.invoice_date,
          periodStart: i.period_start || null,
          periodEnd: i.period_end || null,
          amount: String(pre),
          taxRate: pre ? String(Math.round((tax / pre) * 100000) / 100000) : "0",
          taxAmount: String(tax),
          status: "issued",
          externalRef: extRef,
          description: `Campfire invoice ${i.invoice_number} (id ${extRef}), status ${i.status}`,
          preparedById: user.id,
        });
        report.invoicesCreated++;
        continue;
      }

      const changed =
        Math.abs(Number(existing.amount) - pre) > 0.01 ||
        Math.abs(Number(existing.taxAmount) - tax) > 0.01 ||
        existing.invoiceDate !== i.invoice_date ||
        (voided && existing.status !== "void");
      if (!changed) continue;

      if (existing.reviewStatus === "approved") {
        report.conflicts.push(
          `Invoice ${existing.invoiceNumber} is approved but changed in Campfire (amount ${pre.toFixed(2)}, date ${i.invoice_date}${voided ? ", VOIDED" : ""}) - reopen to accept`
        );
        continue;
      }
      await db
        .update(invoices)
        .set({
          amount: String(pre),
          taxAmount: String(tax),
          taxRate: pre ? String(Math.round((tax / pre) * 100000) / 100000) : "0",
          invoiceDate: i.invoice_date,
          periodStart: i.period_start || null,
          periodEnd: i.period_end || null,
          status: voided ? "void" : existing.status,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, existing.id));
      report.invoicesUpdated++;
      await logAudit(user, "invoice", existing.id, "updated", { source: "campfire-sync" });
    }

    await logAudit(user, "settings", "campfire-sync", "updated", report);
    return json({ ok: true, report });
  },
  { roles: ["admin", "preparer"] }
);
