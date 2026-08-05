import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { err, withUser } from "@/lib/api";
import { loadEngineContracts, loadAccountMap } from "@/lib/data";
import {
  computePortfolio,
  computeContract,
  journalEntriesForMonth,
  monthLabel,
  monthRange,
} from "@/lib/engine";
import { db } from "@/lib/db";
import { contracts, customers, invoices } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    c.border = { bottom: { style: "thin", color: { argb: "FF334155" } } };
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

// GET /api/export/workbook?asOf=YYYY-MM  -> audit-ready Excel workbook
export const GET = withUser(async (user, req: NextRequest) => {
  const asOf = req.nextUrl.searchParams.get("asOf");
  if (!asOf || !/^\d{4}-\d{2}$/.test(asOf)) return err("asOf query param required (YYYY-MM)");

  const [inputs, accounts, contractRows, customerRows, invoiceRows] = await Promise.all([
    loadEngineContracts(),
    loadAccountMap(),
    db.select().from(contracts),
    db.select().from(customers),
    db.select().from(invoices),
  ]);
  const { months, byContract } = computePortfolio(inputs);
  const custById = new Map(customerRows.map((c) => [c.id, c]));
  const generated = `Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC by ${user.name} - Coder Revenue Hub`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Coder Revenue Hub";

  // ---------------------------------------------------------------- Summary
  {
    const ws = wb.addWorksheet("Summary");
    addTitle(ws, `Revenue Summary - as of ${monthLabel(asOf)}`, generated);
    const asOfRow = months.find((m) => m.month === asOf);
    const last = months.filter((m) => m.month <= asOf);
    const cumRec = last.reduce((a, m) => a + m.totalRec, 0);
    const cumBill = last.reduce((a, m) => a + m.billings, 0);
    const rows: [string, number][] = [
      ["Revenue recognized (month)", asOfRow?.totalRec ?? 0],
      ["  License (point-in-time)", asOfRow?.licenseRec ?? 0],
      ["  Support / PCS (ratable)", asOfRow?.supportRec ?? 0],
      ["Billings (month, net of tax)", asOfRow?.billings ?? 0],
      ["Deferred revenue (ending)", asOfRow?.endDeferred ?? 0],
      ["Contract assets (ending)", asOfRow?.endContractAsset ?? 0],
      ["Cumulative revenue (inception to date)", cumRec],
      ["Cumulative billings (inception to date)", cumBill],
    ];
    for (const [label, val] of rows) {
      const r = ws.addRow([label, val]);
      r.getCell(2).numFmt = MONEY;
      if (!label.startsWith("  ")) r.getCell(1).font = { bold: true };
    }
    ws.getColumn(1).width = 42;
    ws.getColumn(2).width = 18;
  }

  // ------------------------------------------------- Deferred Rev Rollforward
  {
    const ws = wb.addWorksheet("Deferred Rev Rollforward");
    addTitle(ws, "Deferred Revenue Rollforward by Contract", generated);
    styleHeader(
      ws.addRow([
        "Customer", "Contract", "Month", "Beginning DR", "Billings (net)",
        "License Rec", "Support Rec", "Total Rec", "Ending DR",
      ])
    );
    for (const c of byContract) {
      for (const r of c.rollforward.filter((r) => r.month <= asOf)) {
        const row = ws.addRow([
          c.customerName, c.contractName, monthLabel(r.month),
          r.beginDeferred, r.billings, -r.licenseRec, -r.supportRec, -r.totalRec, r.endDeferred,
        ]);
        for (let i = 4; i <= 9; i++) row.getCell(i).numFmt = MONEY;
      }
    }
    // totals by month
    ws.addRow([]);
    styleHeader(ws.addRow(["PORTFOLIO TOTAL", "", "Month", "", "Billings", "License", "Support", "Total Rec", "Ending DR"]));
    for (const m of months.filter((m) => m.month <= asOf)) {
      const row = ws.addRow(["", "", monthLabel(m.month), "", m.billings, -m.licenseRec, -m.supportRec, -m.totalRec, m.endDeferred]);
      for (let i = 5; i <= 9; i++) row.getCell(i).numFmt = MONEY;
      row.font = { bold: true };
    }
    [22, 30, 10, 15, 15, 15, 15, 15, 15].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  // ------------------------------------------------ Contract Asset Rollforward
  {
    const ws = wb.addWorksheet("Contract Asset Rollforward");
    addTitle(ws, "Contract Asset Rollforward by Contract", generated);
    styleHeader(
      ws.addRow(["Customer", "Contract", "Month", "Beginning CA", "Additions (rec > billed)", "Relieved by billings", "Ending CA"])
    );
    for (const c of byContract) {
      for (const r of c.rollforward.filter((r) => r.month <= asOf)) {
        const additions = Math.max(0, r.endContractAsset - r.beginContractAsset + Math.min(r.beginContractAsset, r.billings));
        const relieved = Math.min(r.beginContractAsset, r.billings);
        if (r.beginContractAsset === 0 && r.endContractAsset === 0 && additions === 0) continue;
        const row = ws.addRow([
          c.customerName, c.contractName, monthLabel(r.month),
          r.beginContractAsset, additions, -relieved, r.endContractAsset,
        ]);
        for (let i = 4; i <= 7; i++) row.getCell(i).numFmt = MONEY;
      }
    }
    [22, 30, 10, 16, 22, 20, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  // --------------------------------------------------------- Revenue by Month
  {
    const ws = wb.addWorksheet("Revenue by Contract");
    addTitle(ws, "Monthly Revenue Recognition by Contract", generated);
    const first = months.length ? months[0].month : asOf;
    const mks = monthRange(first, asOf);
    styleHeader(ws.addRow(["Customer", "Contract", "Component", ...mks.map(monthLabel), "Total"]));
    for (const c of byContract) {
      for (const comp of ["License", "Support"] as const) {
        const vals = mks.map((mk) => {
          const r = c.recognition.find((x) => x.month === mk);
          return r ? (comp === "License" ? r.license : r.support) : 0;
        });
        const total = vals.reduce((a, b) => a + b, 0);
        if (total === 0) continue;
        const row = ws.addRow([c.customerName, c.contractName, comp, ...vals, Math.round(total * 100) / 100]);
        for (let i = 4; i <= 4 + mks.length; i++) row.getCell(i).numFmt = MONEY;
      }
    }
    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 30;
    ws.views = [{ state: "frozen", xSplit: 3, ySplit: 4 }];
  }

  // -------------------------------------------------------- Journal Entries
  {
    const ws = wb.addWorksheet("Journal Entries");
    addTitle(ws, `Journal Entries - ${monthLabel(asOf)}`, generated);
    styleHeader(
      ws.addRow(["Type", "Customer", "Contract", "Account", "Account Name", "Memo", "Debit", "Credit"])
    );
    const lines = journalEntriesForMonth(inputs, asOf, accounts);
    for (const l of lines) {
      const row = ws.addRow([
        l.entryType, l.customer, l.contractName, l.account, l.accountName, l.memo,
        l.debit || null, l.credit || null,
      ]);
      row.getCell(7).numFmt = MONEY;
      row.getCell(8).numFmt = MONEY;
    }
    const totals = lines.reduce(
      (a, l) => ({ d: a.d + l.debit, c: a.c + l.credit }),
      { d: 0, c: 0 }
    );
    const tr = ws.addRow(["", "", "", "", "", "TOTAL (must balance)", totals.d, totals.c]);
    tr.font = { bold: true };
    tr.getCell(7).numFmt = MONEY;
    tr.getCell(8).numFmt = MONEY;
    [12, 22, 30, 10, 24, 46, 15, 15].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  // -------------------------------------------------------- Invoice Register
  {
    const ws = wb.addWorksheet("Invoice Register");
    addTitle(ws, "Invoice Register (all invoices)", generated);
    styleHeader(
      ws.addRow([
        "Customer", "Contract", "Invoice #", "Campfire Ref", "Date",
        "Period Start", "Period End", "Amount (net)", "Tax", "Gross", "Status", "Review",
      ])
    );
    const contractById = new Map(contractRows.map((c) => [c.id, c]));
    for (const i of invoiceRows.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))) {
      const c = contractById.get(i.contractId);
      const amount = Number(i.amount);
      const tax = Number(i.taxAmount);
      const row = ws.addRow([
        c ? custById.get(c.customerId)?.name ?? "" : "",
        c?.name ?? "",
        i.invoiceNumber,
        i.externalRef ?? "",
        i.invoiceDate,
        i.periodStart ?? "",
        i.periodEnd ?? "",
        amount, tax, amount + tax,
        i.status,
        i.reviewStatus,
      ]);
      for (let k = 8; k <= 10; k++) row.getCell(k).numFmt = MONEY;
    }
    [22, 30, 14, 14, 12, 12, 12, 14, 12, 14, 10, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  // ------------------------------------------ per-contract detail (schedules)
  for (const input of inputs.slice(0, 40)) {
    const comp = computeContract(input);
    const safe = `${comp.customerName}`.replace(/[\\/*?[\]:]/g, "").slice(0, 24);
    const ws = wb.addWorksheet(`Sched - ${safe}`.slice(0, 31));
    addTitle(ws, `${comp.customerName} - ${comp.contractName}`, generated);
    styleHeader(
      ws.addRow(["Month", "License Rev", "Support Rev", "Total Rev", "Billings", "End Deferred Rev", "End Contract Asset"])
    );
    for (const r of comp.rollforward) {
      const row = ws.addRow([
        monthLabel(r.month), r.licenseRec, r.supportRec, r.totalRec, r.billings, r.endDeferred, r.endContractAsset,
      ]);
      for (let i = 2; i <= 7; i++) row.getCell(i).numFmt = MONEY;
      if (r.month === asOf) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    }
    [10, 15, 15, 15, 15, 17, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Revenue_Workbook_${asOf}.xlsx"`,
    },
  });
});
