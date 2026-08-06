import type { ContractComputation } from "./engine";

export interface RecRow {
  contractId: string;
  customerName: string;
  contractName: string;
  licTotal: number;
  supTotal: number;
  tcv: number;
  cumLic: number;
  cumSup: number;
  cumRec: number;
  unearned: number;
  futureBill: number;
  unbilled: number;
  deferred: number;
  contractAsset: number;
  check: number; // bridge vs ledger method; 0 when invoices tie to TCV
}

/**
 * Deferred revenue reconciliation ("the bridge"):
 *   TCV (total license + total support, recognized over the full term
 *   regardless of billing cadence)
 *   less revenue recognized to date            = unearned consideration
 *   less future billings and any unbilled gap  = deferred revenue
 * Negative result = contract asset (earned but unbilled).
 * `check` compares this to the ledger method (billed-to-date minus
 * recognized-to-date); nonzero means invoices don't sum to TCV.
 */
export function buildRecRows(byContract: ContractComputation[], asOf: string): RecRow[] {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  // A contract belongs to a close month only once it has STARTED (contract
  // start date, or an earlier invoice). firstMonth captures both, so a deal
  // signed in July that starts in August stays out of July's rec and flags
  // and appears in August's - months separate on start date, not sign date.
  return byContract.filter((c) => c.firstMonth <= asOf).map((c) => {
    const tcv = r2(c.licenseTotal + c.supportTotal);
    let cumLic = 0, cumSup = 0, cumBill = 0, futureBill = 0, totalBill = 0;
    for (const r of c.rollforward) {
      totalBill += r.billings;
      if (r.month <= asOf) {
        cumLic += r.licenseRec;
        cumSup += r.supportRec;
        cumBill += r.billings;
      } else {
        futureBill += r.billings;
      }
    }
    const unbilled = r2(tcv - totalBill);
    const unearned = r2(tcv - cumLic - cumSup);
    const net = r2(unearned - futureBill - unbilled);
    const ledgerNet = r2(cumBill - cumLic - cumSup);
    return {
      contractId: c.contractId,
      customerName: c.customerName,
      contractName: c.contractName,
      licTotal: r2(c.licenseTotal),
      supTotal: r2(c.supportTotal),
      tcv,
      cumLic: r2(cumLic),
      cumSup: r2(cumSup),
      cumRec: r2(cumLic + cumSup),
      unearned,
      futureBill: r2(futureBill),
      unbilled,
      deferred: Math.max(0, net),
      contractAsset: Math.max(0, -net),
      check: r2(net - ledgerNet),
    };
  });
}
