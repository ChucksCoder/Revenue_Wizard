import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { contracts, customers, invoices } from "@/lib/schema";
import { eq, isNotNull } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Campfire sync (endpoints verified against docs.campfire.ai):
//   Contracts: GET /rr/api/v1/contracts        (limit/offset pagination)
//   Invoices:  GET /coa/api/v1/invoice/        (start_date/end_date filter
//                                               on invoice_date, contract filter)
//   Auth:      Authorization: Token <API key>
//   Rate limit: 5 req/s -> we pace requests.
//
// Merge rules:
//   - NEW contracts (start date in the window) -> created as drafts. Tranches
//     stay manual: Campfire doesn't know license release schedules.
//   - EXISTING contracts are never overwritten; differences -> conflicts.
//   - Invoices upsert by Campfire invoice id; approved invoices are never
//     changed - Campfire-side changes surface as conflicts.
// ---------------------------------------------------------------------------

const BASE = process.env.CAMPFIRE_API_BASE ?? "https://api.meetcampfire.com";
const CONTRACTS_PATH = process.env.CAMPFIRE_CONTRACTS_PATH ?? "/rr/api/v1/contracts";
const INVOICES_PATH = process.env.CAMPFIRE_INVOICES_PATH ?? "/coa/api/v1/invoice/";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cf(path: string, params: Record<string, string>) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${process.env.CAMPFIRE_API_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? 2);
    await sleep(wait * 1000);
    return cf(path, params);
  }
  if (!res.ok)
    throw new Error(`Campfire ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function cfAll(path: string, extra: Record<string, string> = {}) {
  const out: any[] = [];
  let offset = 0;
  for (let i = 0; i < 100; i++) {
    const d = await cf(path, { limit: "200", offset: String(offset), ...extra });
    const results = d.results ?? [];
    out.push(...results);
    if (out.length >= (d.count ?? out.length) || results.length === 0) break;
    offset += 200;
    await sleep(250); // stay under 5 req/s
  }
  return out;
}

function invoiceAmounts(i: any) {
  const lines: any[] = i.lines ?? [];
  const pre = lines.length
    ? Math.round(lines.reduce((a, l) => a + Number(l.amount ?? 0), 0) * 100) / 100
    : Math.round(Number(i.total_amount ?? 0) * 100) / 100;
  const tax = Math.round(lines.reduce((a, l) => a + Number(l.tax ?? 0), 0) * 100) / 100;
  const voided =
    Boolean(i.voided_date) || i.status === "voided" || i.payment_status === "voided";
  return { pre, tax, voided };
}

export const GET = withUser(async () => {
  return json({ configured: Boolean(process.env.CAMPFIRE_API_KEY), base: BASE });
});

export const POST = withUser(
  async (user, req: NextRequest) => {
    if (!process.env.CAMPFIRE_API_KEY)
      return err(
        "CAMPFIRE_API_KEY is not set. Add it in Vercel -> Settings -> Environment Variables and redeploy.",
        400
      );

    const body = await req.json().catch(() => ({}));
    // window applies to contract start dates AND invoice dates (YYYY-MM-DD)
    const from: string | null = body.from || null;
    const to: string | null = body.to || null;

    const report = {
      window: from || to ? `${from ?? "..."} to ${to ?? "..."}` : "all time",
      contractsSeen: 0,
      contractsCreated: 0,
      invoicesSeen: 0,
      invoicesCreated: 0,
      invoicesUpdated: 0,
      conflicts: [] as string[],
      skipped: 0,
    };

    // ---- local state ----
    const localContracts = await db
      .select({ id: contracts.id, campfireId: contracts.campfireId, tcv: contracts.tcv, name: contracts.name })
      .from(contracts)
      .where(isNotNull(contracts.campfireId));
    const byCfId = new Map(localContracts.map((c) => [c.campfireId!, c]));
    const customerRows = await db.select().from(customers);
    const custByName = new Map(customerRows.map((c) => [c.name, c.id]));
    const localInvoices = await db.select().from(invoices).where(isNotNull(invoices.externalRef));
    const byExtRef = new Map(localInvoices.map((i) => [i.externalRef!, i]));

    // ---- contracts: pull, filter to window on contract_start_date ----
    const cfContracts = (await cfAll(CONTRACTS_PATH)).filter(
      (c) => !c.is_deleted && c.contract_start_date && (c.contract_end_date || c.working_end_date)
    );
    const inWindow = cfContracts.filter(
      (c) =>
        (!from || c.contract_start_date >= from) && (!to || c.contract_start_date <= to)
    );
    report.contractsSeen = inWindow.length;

    const newLocalIds: string[] = [];
    for (const c of inWindow) {
      const cfId = String(c.id);
      const existing = byCfId.get(cfId);
      if (existing) {
        const cfTcv = Number(c.total_contract_value ?? 0);
        if (Math.abs(Number(existing.tcv) - cfTcv) > 0.01)
          report.conflicts.push(
            `Contract "${existing.name}": Campfire TCV ${cfTcv.toFixed(2)} vs app ${Number(existing.tcv).toFixed(2)} - not changed, review manually`
          );
        continue;
      }
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
          endDate: c.contract_end_date || c.working_end_date,
          tcv: String(c.total_contract_value ?? 0),
          licensePct: "0.2",
          billingFrequency: "annual",
          dayCount: "exclusive",
          campfireId: cfId,
          notes: `Synced from Campfire ${new Date().toISOString().slice(0, 10)} (${c.client_campfire_id ?? ""}, status ${c.status}). Review vs signed contract; add tranches if licenses release over time.`,
          preparedById: user.id,
        })
        .returning();
      byCfId.set(cfId, { id: row.id, campfireId: cfId, tcv: row.tcv, name: row.name });
      newLocalIds.push(row.id);
      report.contractsCreated++;
      await logAudit(user, "contract", row.id, "created", { source: "campfire-sync", cfId });
    }

    // ---- invoices ----
    // one date-windowed pull (catches new invoices on ANY tracked contract),
    // plus per-new-contract pulls so brand-new deals get their full schedule.
    const seen = new Map<string, any>();
    const windowed = await cfAll(INVOICES_PATH, {
      ...(from ? { start_date: from } : {}),
      ...(to ? { end_date: to } : {}),
    });
    for (const i of windowed) seen.set(String(i.id), i);
    for (const c of inWindow) {
      const cfId = String(c.id);
      if (!byCfId.has(cfId)) continue;
      // full schedule for contracts created this sync
      const isNew = newLocalIds.includes(byCfId.get(cfId)!.id);
      if (!isNew) continue;
      await sleep(250);
      const rows = await cfAll(INVOICES_PATH, { contract: cfId });
      for (const i of rows) seen.set(String(i.id), i);
    }

    for (const i of seen.values()) {
      if (i.is_deleted) continue;
      const contractCfId = String(i.contract ?? "");
      const local = byCfId.get(contractCfId);
      if (!local) { report.skipped++; continue; } // invoice for a contract we don't track
      report.invoicesSeen++;
      const extRef = String(i.id);
      const { pre, tax, voided } = invoiceAmounts(i);
      const existing = byExtRef.get(extRef);

      if (!existing) {
        if (voided) { report.skipped++; continue; }
        await db.insert(invoices).values({
          contractId: local.id,
          invoiceNumber: i.invoice_number || `CF-${extRef}`,
          invoiceDate: i.invoice_date,
          periodStart: i.period_start || null,
          periodEnd: i.period_end || null,
          amount: String(pre),
          taxRate: pre ? String(Math.round((tax / pre) * 100000) / 100000) : "0",
          taxAmount: String(tax),
          status: "issued",
          externalRef: extRef,
          description: `Campfire invoice ${i.invoice_number} (id ${extRef}), status ${i.status ?? i.payment_status}`,
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
