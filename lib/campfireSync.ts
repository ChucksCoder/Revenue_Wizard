import { db } from "./db";
import { contracts, customers, invoices, labels, contractLabels, invoiceLabels } from "./schema";
import { eq, isNotNull } from "drizzle-orm";
import { logAudit } from "./audit";
import type { SessionUser } from "./auth";

// ---------------------------------------------------------------------------
// Campfire sync core (endpoints verified against docs.campfire.ai):
//   Contracts: GET /rr/api/v1/contracts        Invoices: GET /coa/api/v1/invoice/
//   Auth: Authorization: Token <API key>       Rate limit: 5 req/s (paced)
// Merge rules: new contracts -> drafts (tranches stay manual); existing
// contracts never overwritten (diffs -> conflicts); invoices upsert by
// Campfire id; approved invoices never changed (changes -> conflicts).
// Used by the manual Settings button and the daily cron.
// ---------------------------------------------------------------------------

const BASE = process.env.CAMPFIRE_API_BASE ?? "https://api.meetcampfire.com";
const CONTRACTS_PATH = process.env.CAMPFIRE_CONTRACTS_PATH ?? "/rr/api/v1/contracts";
const INVOICES_PATH = process.env.CAMPFIRE_INVOICES_PATH ?? "/coa/api/v1/invoice/";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SyncReport {
  window: string;
  contractsSeen: number;
  contractsCreated: number;
  invoicesSeen: number;
  invoicesCreated: number;
  invoicesUpdated: number;
  conflicts: string[];
  skipped: number;
}

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
    await sleep(250);
  }
  return out;
}

// Extract a custom field value from Campfire's contract_custom_fields, which
// may arrive as [{name/label: "Reseller", value: "AWS"}] or [{"Reseller": "AWS"}].
function extractCustomField(fields: any[] | null | undefined, keyMatch: string): string | null {
  for (const f of fields ?? []) {
    if (!f || typeof f !== "object") continue;
    const name = String((f as any).name ?? (f as any).label ?? (f as any).field ?? "").toLowerCase();
    if (name.includes(keyMatch)) {
      const v = (f as any).value ?? (f as any).values;
      if (v != null && v !== "") return Array.isArray(v) ? v.join(", ") : String(v);
    }
    for (const [k, v] of Object.entries(f)) {
      if (!k.toLowerCase().includes(keyMatch) || v == null || v === "") continue;
      if (Array.isArray(v)) return v.join(", ");
      if (typeof v !== "object") return String(v);
    }
  }
  return null;
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

export function campfireConfigured(): boolean {
  return Boolean(process.env.CAMPFIRE_API_KEY);
}

export async function runCampfireSync(
  user: SessionUser | null,
  from: string | null,
  to: string | null,
  opts?: { modifiedSince?: string } // ISO timestamp: only contracts created/changed since then
): Promise<SyncReport> {
  if (!campfireConfigured()) throw new Error("CAMPFIRE_API_KEY is not set");

  const report: SyncReport = {
    window: opts?.modifiedSince
      ? `modified since ${opts.modifiedSince.slice(0, 16)}Z${from || to ? `; invoices ${from ?? "..."} to ${to ?? "..."}` : ""}`
      : from || to
        ? `${from ?? "..."} to ${to ?? "..."}`
        : "all time",
    contractsSeen: 0,
    contractsCreated: 0,
    invoicesSeen: 0,
    invoicesCreated: 0,
    invoicesUpdated: 0,
    conflicts: [],
    skipped: 0,
  };

  const localContracts = await db
    .select({ id: contracts.id, campfireId: contracts.campfireId, tcv: contracts.tcv, name: contracts.name, crmLink: contracts.crmLink })
    .from(contracts)
    .where(isNotNull(contracts.campfireId));
  const byCfId = new Map(localContracts.map((c) => [c.campfireId!, c]));
  const customerRows = await db.select().from(customers);
  const custByName = new Map(customerRows.map((c) => [c.name, c.id]));
  const localInvoices = await db.select().from(invoices).where(isNotNull(invoices.externalRef));
  const byExtRef = new Map(localInvoices.map((i) => [i.externalRef!, i]));

  // label helpers for Campfire custom fields (Reseller, Billing portal)
  const labelRows = await db.select().from(labels);
  const labelIdByName = new Map(labelRows.map((l) => [l.name, l.id]));
  async function ensureLabel(name: string, color: string): Promise<string> {
    const hit = labelIdByName.get(name);
    if (hit) return hit;
    const [row] = await db
      .insert(labels)
      .values({ name, color })
      .onConflictDoNothing()
      .returning();
    const id = row?.id ?? (await db.select().from(labels).where(eq(labels.name, name)))[0].id;
    labelIdByName.set(name, id);
    return id;
  }
  async function tagContract(contractId: string, labelId: string) {
    await db.insert(contractLabels).values({ contractId, labelId }).onConflictDoNothing();
  }
  async function tagInvoice(invoiceId: string, labelId: string) {
    await db.insert(invoiceLabels).values({ invoiceId, labelId }).onConflictDoNothing();
  }

  // modifiedSince (cron): "new" means the contract RECORD was created since
  // the cutoff (created_at). Do NOT rely on last_modified_at alone - Campfire's
  // own nightly automation touches last_modified_at on every contract, which
  // would make the whole book look new. The server-side filter just trims the
  // payload; created_at is the real gate.
  // Otherwise (manual): pull all, filter locally on contract_start_date.
  const cfContracts = (
    await cfAll(
      CONTRACTS_PATH,
      opts?.modifiedSince ? { last_modified_at__gte: opts.modifiedSince } : {}
    )
  ).filter(
    (c) => !c.is_deleted && c.contract_start_date && (c.contract_end_date || c.working_end_date)
  );
  const inWindow = opts?.modifiedSince
    ? cfContracts.filter((c) => String(c.created_at ?? "") >= opts.modifiedSince!)
    : cfContracts.filter(
        (c) => (!from || c.contract_start_date >= from) && (!to || c.contract_start_date <= to)
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
      // backfill the Salesforce link if we don't have it (metadata, not accounting data)
      if (!existing.crmLink && c.crm_link)
        await db.update(contracts).set({ crmLink: c.crm_link }).where(eq(contracts.id, existing.id));
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
        crmLink: c.crm_link || null,
        notes: `Synced from Campfire ${new Date().toISOString().slice(0, 10)} (${c.client_campfire_id ?? ""}, status ${c.status}). Review vs signed contract; add tranches if licenses release over time.`,
        preparedById: user?.id ?? null,
      })
      .returning();
    byCfId.set(cfId, { id: row.id, campfireId: cfId, tcv: row.tcv, name: row.name, crmLink: row.crmLink });
    newLocalIds.push(row.id);
    report.contractsCreated++;
    await logAudit(user, "contract", row.id, "created", { source: "campfire-sync", cfId });
  }

  const seen = new Map<string, any>();
  const windowed = await cfAll(INVOICES_PATH, {
    ...(from ? { start_date: from } : {}),
    ...(to ? { end_date: to } : {}),
  });
  for (const i of windowed) seen.set(String(i.id), i);
  for (const c of inWindow) {
    const cfId = String(c.id);
    const local = byCfId.get(cfId);
    if (!local || !newLocalIds.includes(local.id)) continue;
    await sleep(250);
    const rows = await cfAll(INVOICES_PATH, { contract: cfId });
    for (const i of rows) seen.set(String(i.id), i);
  }

  for (const i of seen.values()) {
    if (i.is_deleted) continue;
    const local = byCfId.get(String(i.contract ?? ""));
    if (!local) { report.skipped++; continue; }
    report.invoicesSeen++;
    const extRef = String(i.id);
    const { pre, tax, voided } = invoiceAmounts(i);
    const existing = byExtRef.get(extRef);

    // Campfire custom fields -> labels (idempotent, applied even if unchanged)
    const reseller = extractCustomField(i.contract_custom_fields, "reseller");
    if (reseller)
      await tagContract(local.id, await ensureLabel(`Reseller: ${reseller}`, "#f59e0b"));
    const portalRaw = i.custom_field_billing_portal ?? extractCustomField(i.contract_custom_fields, "billing portal");
    const portal =
      portalRaw === true ? "Billing portal" : portalRaw ? `Billing portal: ${portalRaw}` : null;

    if (!existing) {
      if (voided) { report.skipped++; continue; }
      const inserted = await db.insert(invoices).values({
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
        preparedById: user?.id ?? null,
      }).returning();
      if (portal && inserted[0])
        await tagInvoice(inserted[0].id, await ensureLabel(portal, "#06b6d4"));
      report.invoicesCreated++;
      continue;
    }

    if (portal) await tagInvoice(existing.id, await ensureLabel(portal, "#06b6d4"));

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
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (Math.abs(Number(existing.amount) - pre) > 0.01)
      changes.amount = { from: existing.amount, to: pre };
    if (Math.abs(Number(existing.taxAmount) - tax) > 0.01)
      changes.taxAmount = { from: existing.taxAmount, to: tax };
    if (existing.invoiceDate !== i.invoice_date)
      changes.invoiceDate = { from: existing.invoiceDate, to: i.invoice_date };
    if (voided && existing.status !== "void")
      changes.status = { from: existing.status, to: "void" };
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
    await logAudit(user, "invoice", existing.id, "updated", { source: "campfire-sync", changes });
  }

  await logAudit(user, "settings", "campfire-sync", "updated", report);
  return report;
}
