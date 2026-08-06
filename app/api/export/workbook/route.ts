import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { err, withUser } from "@/lib/api";
import { loadEngineContracts, loadAccountMap } from "@/lib/data";
import { computePortfolio, journalEntriesForMonth, monthLabel } from "@/lib/engine";
import { buildRecRows } from "@/lib/rec";
import { db } from "@/lib/db";
import { contracts, customers, invoices, users } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Audit workbook, kept simple on purpose: six tabs, no per-contract sheets,
// and live Excel formulas for every derived number so an auditor can trace
// the math (Unearned, Deferred, Contract Asset, Check, totals, JE balance).
// Tabs: Summary / Deferred Rev Rec / Revenue by Month / Journal Entries /
//       Invoice Register / Sign-off Status
// ---------------------------------------------------------------------------

const MONEY = '#,##0.00;[Red](#,##0.00)';
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E293B" },
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = HEADER_FILL;
    c.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 24;
}

function addTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string) {
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 14 };
  const s = ws.addRow([subtitle]);
  s.font = { size: 10, color: { argb: "FF64748B" } };
  ws.addRow([]);
}

export const GET = withUser(async (user, req: NextRequest) => {
  const asOf = req.nextUrl.searchParams.get("asOf");
  if (!asOf || !/^\d{4}-\d{2}$/.test(asOf)) return err("asOf query param required (YYYY-MM)");

  const [inputs, accounts, contractRows, invoiceRows, userRows] = await Promise.all([
    loadEngineContracts(),
    loadAccountMap(),
    db
      .select({ c: contracts, customerName: customers.name })
      .from(contracts)
      .leftJoin(customers, eq(contracts.customerId, customers.id)),
    db.select().from(invoices),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const { months, byContract } = computePortfolio(inputs);
  const recRows = buildRecRows(byContract, asOf);
  const monthsToDate = months.filter((m) => m.month <= asOf);
  const generated = `Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC by ${user.name} - Coder Revenue Hub`;
  const userById = new Map(userRows.map((u) => [u.id, u.name]));
  const uname = (id: string | null) => (id ? userById.get(id) ?? "?" : "");
  const contractById = new Map(contractRows.map((r) => [r.c.id, r]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Coder Revenue Hub";

  // create Summary first so it's the first tab; fill it last
  const wsSummary = wb.addWorksheet("Summary");

  // ------------------------------------------------------ Deferred Rev Rec
  // Values: C TotLic, D TotSup, F LicRec'd, G SupRec'd, I FutureBill, J Billed.
  // Formulas: E TCV, H Unearned, K Unbilled Gap, L Deferred, M CA, N Check.
  const wsRec = wb.addWorksheet("Deferred Rev Rec");
  let recTotalRow = 0;
  {
    const ws = wsRec;
    addTitle(ws, `Deferred Revenue Reconciliation - as of ${monthLabel(asOf)}`, generated);
    styleHeader(
      ws.addRow([
        "Customer", "Contract", "Total License", "Total Support", "TCV",
        "License Rec'd", "Support Rec'd", "Unearned", "Future Billings",
        "Billed to Date", "Unbilled Gap", "Deferred Revenue", "Contract Asset", "Check",
      ])
    );
    const startRow = ws.rowCount + 1;
    for (const r of recRows.sort((a, b) => b.deferred + b.contractAsset - (a.deferred + a.contractAsset))) {
      const billed = Math.round((r.tcv - r.futureBill - r.unbilled) * 100) / 100;
      const n = ws.rowCount + 1;
      ws.addRow([
        r.customerName,
        r.contractName,
        r.licTotal,
        r.supTotal,
        { formula: `C${n}+D${n}` },
        r.cumLic,
        r.cumSup,
        { formula: `E${n}-F${n}-G${n}` },
        r.futureBill,
        billed,
        { formula: `E${n}-J${n}-I${n}` },
        { formula: `MAX(0,H${n}-I${n}-K${n})` },
        { formula: `MAX(0,-(H${n}-I${n}-K${n}))` },
        { formula: `ROUND((H${n}-I${n}-K${n})-(J${n}-F${n}-G${n}),2)` },
      ]);
      for (let col = 3; col <= 14; col++) ws.getRow(n).getCell(col).numFmt = MONEY;
    }
    const endRow = ws.rowCount;
    recTotalRow = endRow + 1;
    const tr = ws.addRow([
      "TOTAL", "",
      ...["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"].map((col) => ({
        formula: `SUM(${col}${startRow}:${col}${endRow})`,
      })),
    ]);
    tr.font = { bold: true };
    for (let col = 3; col <= 14; col++) tr.getCell(col).numFmt = MONEY;
    ws.addRow([]);
    ws.addRow([
      "Every derived column is a live formula. TCV = License + Support. Unearned = TCV - recognized to date. Deferred = Unearned less amounts not yet billed; negative = Contract Asset. Check ties the bridge to the ledger method (billed - recognized); nonzero means invoices don't sum to TCV.",
    ]).getCell(1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    [22, 34, 13, 13, 13, 13, 13, 13, 14, 13, 12, 14, 14, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: "A4", to: "N4" };
  }

  // ------------------------------------------------------ Revenue by Month
  const wsRev = wb.addWorksheet("Revenue by Month");
  let asOfRevRow = 0;
  let revTotalRow = 0;
  {
    const ws = wsRev;
    addTitle(ws, "Portfolio Revenue by Month (inception to close month)", generated);
    styleHeader(
      ws.addRow(["Month", "License Revenue", "Support Revenue", "Total Revenue", "Billings (net)", "End Deferred Rev", "End Contract Asset"])
    );
    const startRow = ws.rowCount + 1;
    for (const m of monthsToDate) {
      const n = ws.rowCount + 1;
      ws.addRow([
        monthLabel(m.month),
        m.licenseRec,
        m.supportRec,
        { formula: `B${n}+C${n}` },
        m.billings,
        m.endDeferred,
        m.endContractAsset,
      ]);
      for (let col = 2; col <= 7; col++) ws.getRow(n).getCell(col).numFmt = MONEY;
      if (m.month === asOf) {
        asOfRevRow = n;
        ws.getRow(n).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
        ws.getRow(n).font = { bold: true };
      }
    }
    const endRow = ws.rowCount;
    revTotalRow = endRow + 1;
    const tr = ws.addRow([
      "TOTAL (P&L to date)",
      { formula: `SUM(B${startRow}:B${endRow})` },
      { formula: `SUM(C${startRow}:C${endRow})` },
      { formula: `SUM(D${startRow}:D${endRow})` },
      { formula: `SUM(E${startRow}:E${endRow})` },
      { formula: `F${endRow}` },
      { formula: `G${endRow}` },
    ]);
    tr.font = { bold: true };
    for (let col = 2; col <= 7; col++) tr.getCell(col).numFmt = MONEY;
    [16, 16, 16, 16, 16, 17, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  // ------------------------------------------------------- Journal Entries
  const wsJE = wb.addWorksheet("Journal Entries");
  let jeDebitTotalCell = "";
  let jeCreditTotalCell = "";
  {
    const ws = wsJE;
    addTitle(ws, `Journal Entries - ${monthLabel(asOf)}`, generated);
    styleHeader(ws.addRow(["Type", "Customer", "Contract", "Account", "Account Name", "Memo", "Debit", "Credit"]));
    const lines = journalEntriesForMonth(inputs, asOf, accounts);
    const startRow = ws.rowCount + 1;
    for (const l of lines) {
      const row = ws.addRow([
        l.entryType, l.customer, l.contractName, l.account, l.accountName, l.memo,
        l.debit || null, l.credit || null,
      ]);
      row.getCell(7).numFmt = MONEY;
      row.getCell(8).numFmt = MONEY;
    }
    const endRow = ws.rowCount;
    const tr = ws.addRow([
      "", "", "", "", "", "TOTAL",
      { formula: `SUM(G${startRow}:G${endRow})` },
      { formula: `SUM(H${startRow}:H${endRow})` },
    ]);
    tr.font = { bold: true };
    tr.getCell(7).numFmt = MONEY;
    tr.getCell(8).numFmt = MONEY;
    jeDebitTotalCell = `G${tr.number}`;
    jeCreditTotalCell = `H${tr.number}`;
    const check = ws.addRow([
      "", "", "", "", "", "Balance check",
      { formula: `IF(ROUND(${jeDebitTotalCell}-${jeCreditTotalCell},2)=0,"BALANCED","OUT OF BALANCE")` },
    ]);
    check.getCell(7).font = { bold: true };
    [12, 22, 32, 10, 24, 48, 15, 15].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: "A4", to: "H4" };
  }

  // ------------------------------------------------------- Invoice Register
  {
    const ws = wb.addWorksheet("Invoice Register");
    addTitle(ws, "Invoice Register (all invoices)", generated);
    styleHeader(
      ws.addRow([
        "Customer", "Contract", "Invoice #", "Campfire Ref", "Date",
        "Period Start", "Period End", "Amount (net)", "Tax", "Gross", "Status", "Review",
      ])
    );
    const startRow = ws.rowCount + 1;
    for (const i of invoiceRows.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))) {
      const parent = contractById.get(i.contractId);
      const n = ws.rowCount + 1;
      ws.addRow([
        parent?.customerName ?? "",
        parent?.c.name ?? "",
        i.invoiceNumber,
        i.externalRef ?? "",
        i.invoiceDate,
        i.periodStart ?? "",
        i.periodEnd ?? "",
        Number(i.amount),
        Number(i.taxAmount),
        { formula: `H${n}+I${n}` },
        i.status,
        i.reviewStatus,
      ]);
      for (let col = 8; col <= 10; col++) ws.getRow(n).getCell(col).numFmt = MONEY;
    }
    const endRow = ws.rowCount;
    const tr = ws.addRow([
      "TOTAL", "", "", "", "", "", "",
      { formula: `SUM(H${startRow}:H${endRow})` },
      { formula: `SUM(I${startRow}:I${endRow})` },
      { formula: `SUM(J${startRow}:J${endRow})` },
    ]);
    tr.font = { bold: true };
    for (let col = 8; col <= 10; col++) tr.getCell(col).numFmt = MONEY;
    [22, 32, 16, 12, 12, 12, 12, 14, 12, 14, 10, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: "A4", to: "L4" };
  }

  // -------------------------------------------------------- Sign-off Status
  {
    const ws = wb.addWorksheet("Sign-off Status");
    addTitle(ws, "Sign-off Status - approvals on every contract and invoice", generated);
    styleHeader(
      ws.addRow(["Type", "Customer", "Item", "Review Status", "Prepared By", "Prepared At", "Approved By", "Approved At"])
    );
    for (const { c, customerName } of contractRows.sort((a, b) => (a.customerName ?? "").localeCompare(b.customerName ?? ""))) {
      ws.addRow([
        "Contract", customerName ?? "", c.name, c.reviewStatus,
        uname(c.preparedById),
        c.preparedAt ? new Date(c.preparedAt).toISOString().slice(0, 16).replace("T", " ") : "",
        uname(c.approvedById),
        c.approvedAt ? new Date(c.approvedAt).toISOString().slice(0, 16).replace("T", " ") : "",
      ]);
    }
    for (const i of invoiceRows.sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber))) {
      const parent = contractById.get(i.contractId);
      ws.addRow([
        "Invoice", parent?.customerName ?? "", `${i.invoiceNumber} (${parent?.c.name ?? ""})`, i.reviewStatus,
        uname(i.preparedById),
        i.preparedAt ? new Date(i.preparedAt).toISOString().slice(0, 16).replace("T", " ") : "",
        uname(i.approvedById),
        i.approvedAt ? new Date(i.approvedAt).toISOString().slice(0, 16).replace("T", " ") : "",
      ]);
    }
    [10, 24, 44, 12, 16, 17, 16, 17].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: "A4", to: "H4" };
  }

  // ---------------------------------------------------------------- Summary
  {
    const ws = wsSummary;
    addTitle(ws, `Revenue Summary - as of ${monthLabel(asOf)}`, generated);
    const rows: [string, ExcelJS.CellValue][] = [
      ["License revenue (month)", asOfRevRow ? { formula: `'Revenue by Month'!B${asOfRevRow}` } : 0],
      ["Support revenue (month)", asOfRevRow ? { formula: `'Revenue by Month'!C${asOfRevRow}` } : 0],
      ["Total revenue (month)", asOfRevRow ? { formula: `'Revenue by Month'!D${asOfRevRow}` } : 0],
      ["Billings (month, net)", asOfRevRow ? { formula: `'Revenue by Month'!E${asOfRevRow}` } : 0],
      ["", ""],
      ["Deferred revenue (ending)", { formula: `'Deferred Rev Rec'!L${recTotalRow}` }],
      ["Contract assets (ending)", { formula: `'Deferred Rev Rec'!M${recTotalRow}` }],
      ["Cumulative revenue to date", { formula: `'Revenue by Month'!D${revTotalRow}` }],
      ["Cumulative billings to date", { formula: `'Revenue by Month'!E${revTotalRow}` }],
      ["", ""],
      ["JE debits (month)", { formula: `'Journal Entries'!${jeDebitTotalCell}` }],
      ["JE credits (month)", { formula: `'Journal Entries'!${jeCreditTotalCell}` }],
      ["Contracts", contractRows.length],
      ["Invoices", invoiceRows.length],
    ];
    for (const [label, val] of rows) {
      const r = ws.addRow([label, val]);
      if (label) r.getCell(1).font = { bold: !label.startsWith(" ") };
      if (typeof val !== "number" || label.match(/Contracts|Invoices/) === null)
        r.getCell(2).numFmt = MONEY;
    }
    ws.getColumn(1).width = 36;
    ws.getColumn(2).width = 20;
    ws.addRow([]);
    ws.addRow(["All figures pull live from the other tabs via formulas."]).getCell(1).font = {
      italic: true, size: 9, color: { argb: "FF64748B" },
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Revenue_Workbook_${asOf}.xlsx"`,
    },
  });
});
