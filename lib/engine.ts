// ============================================================================
// ASC 606 Revenue Recognition Engine
//
// Policy (per Coder accounting policy):
//   - SSP split: license % (default 20%) point-in-time, support/PCS %
//     (default 80%) ratable.
//   - License is recognized in full in the month the performance segment
//     starts (the "close month"), even on multi-year contracts with annual
//     billing. This is what creates contract assets.
//   - Support is recognized on a daily rate: supportFee / termDays * days
//     elapsed in the month. Final month is plugged so cumulative support
//     equals the support fee exactly (no rounding drift).
//   - Per-contract net balance: cumulative billings - cumulative recognition.
//     Positive => deferred revenue (liability); negative => contract asset.
//   - Within a month, invoices first relieve any contract asset balance,
//     the remainder credits deferred revenue. Recognition first relieves
//     deferred revenue, the excess debits contract asset.
//
// All math is done in integer cents to be penny-exact for audit.
// ============================================================================

export type DayCount = "inclusive" | "exclusive";

export interface EngineSegment {
  id: string;
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  amount: number; // segment TCV, dollars
}

export interface EngineInvoice {
  id: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  amount: number; // pre-tax dollars
  taxAmount: number; // dollars
  status: string; // void invoices are excluded
}

export interface EngineContractInput {
  id: string;
  name: string;
  customerName: string;
  start: string;
  end: string;
  tcv: number;
  licensePct: number; // 0.2
  dayCount: DayCount;
  segments: EngineSegment[]; // empty => single implicit segment from contract
  invoices: EngineInvoice[];
}

export interface MonthlyRecognition {
  month: string; // YYYY-MM
  license: number; // dollars
  support: number;
  total: number;
  bySegment: { segmentId: string; segmentName: string; license: number; support: number }[];
}

export interface RollforwardRow {
  month: string;
  beginDeferred: number;
  beginContractAsset: number;
  billings: number; // net of tax
  licenseRec: number;
  supportRec: number;
  totalRec: number;
  endDeferred: number;
  endContractAsset: number;
}

export interface JournalLine {
  account: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string;
  customer: string;
  contractId: string;
  contractName: string;
  entryType: "billing" | "recognition";
  sourceId: string; // invoice id or contract id
}

export interface ContractComputation {
  contractId: string;
  contractName: string;
  customerName: string;
  licenseTotal: number;
  supportTotal: number;
  recognition: MonthlyRecognition[];
  rollforward: RollforwardRow[];
  firstMonth: string;
  lastMonth: string;
}

export interface AccountMap {
  ar: { number: string; name: string };
  deferredRevenue: { number: string; name: string };
  contractAsset: { number: string; name: string };
  licenseRevenue: { number: string; name: string };
  supportRevenue: { number: string; name: string };
  salesTaxPayable: { number: string; name: string };
}

export const DEFAULT_ACCOUNTS: AccountMap = {
  ar: { number: "1100", name: "Accounts Receivable" },
  deferredRevenue: { number: "2400", name: "Deferred Revenue" },
  contractAsset: { number: "1300", name: "Contract Asset" },
  licenseRevenue: { number: "4100", name: "Revenue - License" },
  supportRevenue: { number: "4200", name: "Revenue - Support & PCS" },
  salesTaxPayable: { number: "2200", name: "Sales Tax Payable" },
};

// ---------------------------------------------------------------- date utils

export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function monthEnd(mk: string): Date {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)); // day 0 of next month
}

export function monthStart(mk: string): Date {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

export function addMonths(mk: string, n: number): string {
  const [y, m] = mk.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

export function monthLabel(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[m - 1]}-${String(y).slice(2)}`;
}

const MS_DAY = 86400000;

function daysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

/** Term days under the contract's day count convention. */
export function termDays(start: string, end: string, dc: DayCount): number {
  const d = daysDiff(parseDate(start), parseDate(end));
  return dc === "inclusive" ? d + 1 : d;
}

/**
 * Days of service falling in month `mk` for a segment running start->end.
 * Inclusive convention counts both endpoints; exclusive counts start-day-
 * exclusive (matches schedules built as "period end minus period start").
 */
function daysInMonth(mk: string, start: string, end: string, dc: DayCount): number {
  const ms = monthStart(mk);
  const me = monthEnd(mk);
  const s = parseDate(start);
  const e = parseDate(end);
  if (dc === "inclusive") {
    const lo = s > ms ? s : ms;
    const hi = e < me ? e : me;
    const d = daysDiff(lo, hi) + 1;
    return d > 0 ? d : 0;
  } else {
    // exclusive: count days in (start, end] intersected with month
    const lo = s > new Date(ms.getTime() - MS_DAY) ? s : new Date(ms.getTime() - MS_DAY);
    const hi = e < me ? e : me;
    const d = daysDiff(lo, hi);
    return d > 0 ? d : 0;
  }
}

// ------------------------------------------------------------------- helpers

const toCents = (x: number) => Math.round(x * 100);
const toDollars = (c: number) => c / 100;

export function effectiveSegments(c: EngineContractInput): EngineSegment[] {
  if (c.segments.length > 0)
    return [...c.segments].sort((a, b) => a.start.localeCompare(b.start));
  return [
    { id: c.id, name: "Contract", start: c.start, end: c.end, amount: c.tcv },
  ];
}

// -------------------------------------------------------------- computation

export function computeContract(c: EngineContractInput): ContractComputation {
  const segments = effectiveSegments(c);
  const invoices = c.invoices.filter((i) => i.status !== "void");

  // horizon: from earliest activity to latest of (segment ends, invoice months)
  const startMonths = [
    ...segments.map((s) => monthKey(s.start)),
    ...invoices.map((i) => monthKey(i.date)),
  ];
  const endMonths = [
    ...segments.map((s) => monthKey(s.end)),
    ...invoices.map((i) => monthKey(i.date)),
  ];
  const firstMonth = startMonths.length ? startMonths.reduce((a, b) => (a < b ? a : b)) : monthKey(c.start);
  const lastMonth = endMonths.length ? endMonths.reduce((a, b) => (a > b ? a : b)) : monthKey(c.end);
  const months = monthRange(firstMonth, lastMonth);

  // per-segment cents
  type SegCalc = {
    seg: EngineSegment;
    licenseCents: number;
    supportCents: number;
    supportByMonth: Map<string, number>;
  };
  const segCalcs: SegCalc[] = segments.map((seg) => {
    const totalCents = toCents(seg.amount);
    const licenseCents = Math.round(totalCents * c.licensePct);
    const supportCents = totalCents - licenseCents;
    const tDays = termDays(seg.start, seg.end, c.dayCount);
    const supportByMonth = new Map<string, number>();
    if (tDays > 0 && supportCents !== 0) {
      const segMonths = monthRange(monthKey(seg.start), monthKey(seg.end));
      let cum = 0;
      let cumDays = 0;
      for (const mk of segMonths) {
        const d = daysInMonth(mk, seg.start, seg.end, c.dayCount);
        cumDays += d;
        // cumulative rounding: exact daily-rate accrual, penny-true
        const cumTarget =
          cumDays >= tDays
            ? supportCents
            : Math.round((supportCents * cumDays) / tDays);
        const thisMonth = cumTarget - cum;
        cum = cumTarget;
        if (thisMonth !== 0) supportByMonth.set(mk, thisMonth);
      }
    }
    return { seg, licenseCents, supportCents, supportByMonth };
  });

  const recognition: MonthlyRecognition[] = months.map((mk) => {
    const bySegment = segCalcs.map((sc) => ({
      segmentId: sc.seg.id,
      segmentName: sc.seg.name,
      license: monthKey(sc.seg.start) === mk ? toDollars(sc.licenseCents) : 0,
      support: toDollars(sc.supportByMonth.get(mk) ?? 0),
    }));
    const license = bySegment.reduce((a, s) => a + toCents(s.license), 0);
    const support = bySegment.reduce((a, s) => a + toCents(s.support), 0);
    return {
      month: mk,
      license: toDollars(license),
      support: toDollars(support),
      total: toDollars(license + support),
      bySegment: bySegment.filter((s) => s.license !== 0 || s.support !== 0),
    };
  });

  // billings by month (net of tax)
  const billingsByMonth = new Map<string, number>();
  for (const inv of invoices) {
    const mk = monthKey(inv.date);
    billingsByMonth.set(mk, (billingsByMonth.get(mk) ?? 0) + toCents(inv.amount));
  }

  // rollforward with net balance sequencing (billings relieve CA first;
  // recognition relieves DR first)
  const rollforward: RollforwardRow[] = [];
  let drBal = 0; // cents, credit balance
  let caBal = 0; // cents, debit balance
  for (const r of recognition) {
    const beginDeferred = drBal;
    const beginCA = caBal;
    const billed = billingsByMonth.get(r.month) ?? 0;
    const relieveCA = Math.min(caBal, billed);
    caBal -= relieveCA;
    drBal += billed - relieveCA;
    const rec = toCents(r.total);
    const fromDR = Math.min(drBal, rec);
    drBal -= fromDR;
    caBal += rec - fromDR;
    rollforward.push({
      month: r.month,
      beginDeferred: toDollars(beginDeferred),
      beginContractAsset: toDollars(beginCA),
      billings: toDollars(billed),
      licenseRec: r.license,
      supportRec: r.support,
      totalRec: r.total,
      endDeferred: toDollars(drBal),
      endContractAsset: toDollars(caBal),
    });
  }

  return {
    contractId: c.id,
    contractName: c.name,
    customerName: c.customerName,
    licenseTotal: toDollars(segCalcs.reduce((a, s) => a + s.licenseCents, 0)),
    supportTotal: toDollars(segCalcs.reduce((a, s) => a + s.supportCents, 0)),
    recognition,
    rollforward,
    firstMonth,
    lastMonth,
  };
}

// ------------------------------------------------------------ journal entries

// Invoicing lives in NetSuite: the invoice itself posts Dr AR / Cr Deferred /
// Cr Sales Tax there, so Revenue Hub JEs default to RECOGNITION ONLY
// (Dr Deferred or Contract Asset / Cr License & Support revenue). The billing
// math still runs internally - it sequences the DR/CA balances the recognition
// entries relieve. Pass kinds=["billing","recognition"] to also emit billing
// lines (used by engine self-tests).
export function journalEntriesForMonth(
  contracts: EngineContractInput[],
  month: string,
  accounts: AccountMap = DEFAULT_ACCOUNTS,
  kinds: ReadonlyArray<"billing" | "recognition"> = ["recognition"]
): JournalLine[] {
  const lines: JournalLine[] = [];
  const wantBilling = kinds.includes("billing");

  for (const c of contracts) {
    const comp = computeContract(c);
    const invoices = c.invoices.filter(
      (i) => i.status !== "void" && monthKey(i.date) === month
    );

    // reconstruct balances entering this month
    let caBal = 0;
    let drBal = 0;
    for (const r of comp.rollforward) {
      if (r.month >= month) break;
      caBal = toCents(r.endContractAsset);
      drBal = toCents(r.endDeferred);
    }

    // --- billing entries (per invoice) ---
    for (const inv of invoices) {
      const net = toCents(inv.amount);
      const tax = toCents(inv.taxAmount);
      const relieveCA = Math.min(caBal, net);
      caBal -= relieveCA;
      drBal += net - relieveCA;
      if (!wantBilling) continue; // NetSuite invoices post these entries
      const memo = `Invoice ${inv.invoiceNumber} - ${c.name}`;
      lines.push({
        account: accounts.ar.number, accountName: accounts.ar.name,
        debit: toDollars(net + tax), credit: 0, memo,
        customer: c.customerName, contractId: c.id, contractName: c.name,
        entryType: "billing", sourceId: inv.id,
      });
      if (relieveCA > 0)
        lines.push({
          account: accounts.contractAsset.number, accountName: accounts.contractAsset.name,
          debit: 0, credit: toDollars(relieveCA), memo: `${memo} (relieve contract asset)`,
          customer: c.customerName, contractId: c.id, contractName: c.name,
          entryType: "billing", sourceId: inv.id,
        });
      if (net - relieveCA > 0)
        lines.push({
          account: accounts.deferredRevenue.number, accountName: accounts.deferredRevenue.name,
          debit: 0, credit: toDollars(net - relieveCA), memo,
          customer: c.customerName, contractId: c.id, contractName: c.name,
          entryType: "billing", sourceId: inv.id,
        });
      if (tax > 0)
        lines.push({
          account: accounts.salesTaxPayable.number, accountName: accounts.salesTaxPayable.name,
          debit: 0, credit: toDollars(tax), memo: `${memo} (sales tax)`,
          customer: c.customerName, contractId: c.id, contractName: c.name,
          entryType: "billing", sourceId: inv.id,
        });
    }

    // --- recognition entry (per contract) ---
    const rec = comp.recognition.find((r) => r.month === month);
    if (rec && toCents(rec.total) !== 0) {
      const recC = toCents(rec.total);
      const fromDR = Math.min(drBal, recC);
      const toCA = recC - fromDR;
      const memo = `Rev rec ${monthLabel(month)} - ${c.name}`;
      if (fromDR > 0)
        lines.push({
          account: accounts.deferredRevenue.number, accountName: accounts.deferredRevenue.name,
          debit: toDollars(fromDR), credit: 0, memo,
          customer: c.customerName, contractId: c.id, contractName: c.name,
          entryType: "recognition", sourceId: c.id,
        });
      if (toCA > 0)
        lines.push({
          account: accounts.contractAsset.number, accountName: accounts.contractAsset.name,
          debit: toDollars(toCA), credit: 0, memo: `${memo} (contract asset build)`,
          customer: c.customerName, contractId: c.id, contractName: c.name,
          entryType: "recognition", sourceId: c.id,
        });
      if (toCents(rec.license) !== 0)
        lines.push({
          account: accounts.licenseRevenue.number, accountName: accounts.licenseRevenue.name,
          debit: 0, credit: rec.license, memo: `${memo} (license, point-in-time)`,
          customer: c.customerName, contractId: c.id, contractName: c.name,
          entryType: "recognition", sourceId: c.id,
        });
      if (toCents(rec.support) !== 0)
        lines.push({
          account: accounts.supportRevenue.number, accountName: accounts.supportRevenue.name,
          debit: 0, credit: rec.support, memo: `${memo} (support, ratable)`,
          customer: c.customerName, contractId: c.id, contractName: c.name,
          entryType: "recognition", sourceId: c.id,
        });
    }
  }

  return lines;
}

// ------------------------------------------------- portfolio-level aggregates

export interface PortfolioMonth {
  month: string;
  billings: number;
  licenseRec: number;
  supportRec: number;
  totalRec: number;
  endDeferred: number;
  endContractAsset: number;
}

export function computePortfolio(
  contracts: EngineContractInput[]
): { months: PortfolioMonth[]; byContract: ContractComputation[] } {
  const byContract = contracts.map(computeContract);
  if (byContract.length === 0) return { months: [], byContract: [] };
  const first = byContract.map((c) => c.firstMonth).reduce((a, b) => (a < b ? a : b));
  const last = byContract.map((c) => c.lastMonth).reduce((a, b) => (a > b ? a : b));
  const months = monthRange(first, last).map((mk) => {
    let billings = 0, lic = 0, sup = 0, dr = 0, ca = 0;
    for (const c of byContract) {
      const row = c.rollforward.find((r) => r.month === mk);
      if (row) {
        billings += row.billings;
        lic += row.licenseRec;
        sup += row.supportRec;
        dr += row.endDeferred;
        ca += row.endContractAsset;
      } else if (c.lastMonth < mk) {
        const lastRow = c.rollforward[c.rollforward.length - 1];
        if (lastRow) {
          dr += lastRow.endDeferred;
          ca += lastRow.endContractAsset;
        }
      }
    }
    const r2 = (x: number) => Math.round(x * 100) / 100;
    return {
      month: mk,
      billings: r2(billings),
      licenseRec: r2(lic),
      supportRec: r2(sup),
      totalRec: r2(lic + sup),
      endDeferred: r2(dr),
      endContractAsset: r2(ca),
    };
  });
  return { months, byContract };
}
