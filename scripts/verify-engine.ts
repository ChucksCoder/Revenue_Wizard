/**
 * Verifies the engine against Coder's existing Excel schedules:
 *  1. Wayve tranched deal (inclusive day count) - Wayve_Revenue_Recognition_Schedule.xlsx
 *  2. CSSF flat deal (exclusive day count) - Contract_Asset_ASC606_July2026.xlsx
 * Run: npx tsx scripts/verify-engine.ts
 */
import {
  computeContract,
  journalEntriesForMonth,
  type EngineContractInput,
} from "../lib/engine";

let failures = 0;
function check(label: string, actual: number, expected: number, tol = 0.02) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${actual.toFixed(2)}, expected ${expected.toFixed(2)}`);
}

// ---------------------------------------------------------------- Wayve deal
const wayveTranches = [
  { n: 1, start: "2026-06-30", amount: 1094197.117 },
  { n: 2, start: "2026-09-30", amount: 35686.33281 },
  { n: 3, start: "2026-12-30", amount: 30600.30541 },
  { n: 4, start: "2027-03-30", amount: 25570.16843 },
  { n: 5, start: "2027-06-30", amount: 20428.25062 },
  { n: 6, start: "2027-09-30", amount: 15286.33281 },
  { n: 7, start: "2027-12-30", amount: 10200.30541 },
  { n: 8, start: "2028-03-30", amount: 5127.868852 },
];

const wayve: EngineContractInput = {
  id: "wayve",
  name: "Wayve 2yr ramp",
  customerName: "Wayve Technologies",
  start: "2026-06-30",
  end: "2028-06-29",
  tcv: 1237096.681,
  licensePct: 0.2,
  dayCount: "inclusive",
  segments: wayveTranches.map((t) => ({
    id: `t${t.n}`,
    name: `Tranche ${t.n}`,
    start: t.start,
    end: "2028-06-29",
    amount: t.amount,
  })),
  invoices: [
    {
      id: "w1",
      invoiceNumber: "INV-W1",
      date: "2026-06-30",
      amount: 546720,
      taxAmount: 0,
      status: "issued",
    },
  ],
};

console.log("=== Wayve (tranched, inclusive day count) ===");
const w = computeContract(wayve);
const jun = w.recognition.find((r) => r.month === "2026-06")!;
const jul = w.recognition.find((r) => r.month === "2026-07")!;
const sep = w.recognition.find((r) => r.month === "2026-09")!;
check("Jun-26 license (T1 PIT)", jun.license, 218839.42);
check("Jun-26 support (1 day)", jun.support, 1197.48);
check("Jul-26 support", jul.support, 37121.87);
check("Sep-26 license (T2 PIT)", sep.license, 7137.27);
check("Sep-26 support (T1 30d + T2 1d)", sep.support, 35924.39 + 44.68);
// workbook contract asset / (liability): Jun-26 -326,683.10 (liability); Mar-27 +32,172.89 (asset)
const junRF = w.rollforward.find((r) => r.month === "2026-06")!;
const marRF = w.rollforward.find((r) => r.month === "2027-03")!;
check("Jun-26 deferred rev", junRF.endDeferred, 326683.10);
check("Jun-26 contract asset", junRF.endContractAsset, 0);
check("Mar-27 contract asset", marRF.endContractAsset, 32172.89);
check("Mar-27 deferred rev", marRF.endDeferred, 0);
// totals tie to contract
check("License total", w.licenseTotal, 247419.34);
// workbook carries sub-cent tranche values (e.g. 1,094,197.117); the engine is
// penny-exact per tranche, so allow 1c per tranche of drift on the total
check("Support total", w.supportTotal, 989677.34, 0.08);
const lastRF = w.rollforward[w.rollforward.length - 1];
check("Cumulative rec = TCV at term end",
  w.recognition.reduce((a, r) => a + r.total, 0), 1237096.68);

// ---------------------------------------------------------------- CSSF deal
const cssf: EngineContractInput = {
  id: "cssf",
  name: "CSSF 3yr",
  customerName: "CSSF",
  start: "2026-02-01",
  end: "2029-01-31",
  tcv: 180000,
  licensePct: 0.2,
  dayCount: "exclusive",
  segments: [],
  invoices: [
    { id: "c1", invoiceNumber: "INV-C1", date: "2026-02-01", amount: 60000, taxAmount: 0, status: "issued" },
    { id: "c2", invoiceNumber: "INV-C2", date: "2027-02-28", amount: 60000, taxAmount: 0, status: "issued" },
  ],
};

console.log("\n=== CSSF (flat, exclusive day count, annual billing) ===");
const c = computeContract(cssf);
const feb = c.recognition.find((r) => r.month === "2026-02")!;
const mar = c.recognition.find((r) => r.month === "2026-03")!;
check("Feb-26 license PIT (36,000)", feb.license, 36000);
check("Feb-26 support (27 days)", feb.support, 3550.68);
check("Mar-26 support (31 days)", mar.support, 4076.71);
// workbook: Jul-26 running deferred balance 328.77; Aug-26 contract asset 3,747.95
const julC = c.rollforward.find((r) => r.month === "2026-07")!;
const augC = c.rollforward.find((r) => r.month === "2026-08")!;
const janC = c.rollforward.find((r) => r.month === "2027-01")!;
const febC = c.rollforward.find((r) => r.month === "2027-02")!;
check("Jul-26 deferred rev", julC.endDeferred, 328.77);
check("Aug-26 contract asset", augC.endContractAsset, 3747.95);
check("Jan-27 contract asset", janC.endContractAsset, 23868.49);
check("Feb-27 after Yr2 invoice: deferred", febC.endDeferred, 32449.32);
check("Feb-27 after Yr2 invoice: contract asset", febC.endContractAsset, 0);

// ------------------------------------------------------------- JE integrity
console.log("\n=== Journal entry integrity ===");
for (const month of ["2026-02", "2026-06", "2026-08", "2027-02", "2027-03"]) {
  const lines = journalEntriesForMonth([wayve, cssf], month);
  const d = lines.reduce((a, l) => a + l.debit, 0);
  const cr = lines.reduce((a, l) => a + l.credit, 0);
  check(`JEs balance ${month} (${lines.length} lines)`, d, cr, 0.001);
}
// tax entry check
const taxContract: EngineContractInput = {
  ...cssf,
  id: "taxed",
  invoices: [{ id: "t1", invoiceNumber: "INV-T1", date: "2026-02-01", amount: 60000, taxAmount: 5250, status: "issued" }],
};
const taxLines = journalEntriesForMonth([taxContract], "2026-02", undefined, ["billing", "recognition"]);
const ar = taxLines.find((l) => l.account === "1100")!;
const taxLine = taxLines.find((l) => l.account === "2200")!;
check("AR gross includes tax", ar.debit, 65250);
check("Sales tax payable credited", taxLine.credit, 5250);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
