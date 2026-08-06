import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { withUser } from "@/lib/api";
import { db } from "@/lib/db";
import { auditLog, contracts, invoices, customers, users } from "@/lib/schema";
import { desc, and, gte, lte, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E293B" },
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = HEADER_FILL;
  });
  row.height = 22;
}

// GET /api/export/audit?from=YYYY-MM-DD&to=YYYY-MM-DD
// Two sheets: Sign-off Status (who prepared/approved every contract and
// invoice) and Activity Log (every change, filterable window).
export const GET = withUser(async (user, req: NextRequest) => {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const conditions = [];
  if (from) conditions.push(gte(auditLog.createdAt, new Date(from + "T00:00:00Z")));
  if (to) conditions.push(lte(auditLog.createdAt, new Date(to + "T23:59:59Z")));

  const [logRows, contractRows, invoiceRows, userRows] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(10000),
    db
      .select({ c: contracts, customerName: customers.name })
      .from(contracts)
      .leftJoin(customers, eq(contracts.customerId, customers.id)),
    db.select().from(invoices),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ]);

  const userById = new Map(userRows.map((u) => [u.id, u]));
  const uname = (id: string | null) => (id ? userById.get(id)?.name ?? "?" : "");
  const contractById = new Map(contractRows.map((r) => [r.c.id, r]));
  const invoiceName = new Map(invoiceRows.map((i) => [i.id, `Invoice ${i.invoiceNumber}`]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Coder Revenue Hub";
  const generated = `Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC by ${user.name}`;

  // ------------------------------------------------------- Sign-off Status
  {
    const ws = wb.addWorksheet("Sign-off Status");
    ws.addRow(["Sign-off Status - every contract and invoice"]).font = { bold: true, size: 13 };
    ws.addRow([generated]).font = { size: 9, color: { argb: "FF64748B" } };
    ws.addRow([]);
    styleHeader(
      ws.addRow([
        "Type", "Customer", "Item", "Review Status",
        "Prepared By", "Prepared At", "Approved By", "Approved At", "Notes",
      ])
    );
    for (const { c, customerName } of contractRows.sort((a, b) =>
      (a.customerName ?? "").localeCompare(b.customerName ?? "")
    )) {
      ws.addRow([
        "Contract",
        customerName ?? "",
        c.name,
        c.reviewStatus,
        uname(c.preparedById),
        c.preparedAt ? new Date(c.preparedAt).toISOString().slice(0, 16).replace("T", " ") : "",
        uname(c.approvedById),
        c.approvedAt ? new Date(c.approvedAt).toISOString().slice(0, 16).replace("T", " ") : "",
        c.notes ?? "",
      ]);
    }
    for (const i of invoiceRows.sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber))) {
      const parent = contractById.get(i.contractId);
      ws.addRow([
        "Invoice",
        parent?.customerName ?? "",
        `${i.invoiceNumber} (${parent?.c.name ?? ""})`,
        i.reviewStatus,
        uname(i.preparedById),
        i.preparedAt ? new Date(i.preparedAt).toISOString().slice(0, 16).replace("T", " ") : "",
        uname(i.approvedById),
        i.approvedAt ? new Date(i.approvedAt).toISOString().slice(0, 16).replace("T", " ") : "",
        i.description ?? "",
      ]);
    }
    [10, 24, 40, 12, 16, 17, 16, 17, 50].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: "A4", to: "I4" };
  }

  // --------------------------------------------------------- Activity Log
  {
    const ws = wb.addWorksheet("Activity Log");
    ws.addRow([`Activity Log${from || to ? ` (${from ?? "..."} to ${to ?? "..."})` : ""} - newest first`]).font = { bold: true, size: 13 };
    ws.addRow([generated]).font = { size: 9, color: { argb: "FF64748B" } };
    ws.addRow([]);
    styleHeader(ws.addRow(["Timestamp (UTC)", "User", "Action", "Entity Type", "Entity", "Detail"]));
    for (const r of logRows) {
      const name =
        r.entityType === "contract"
          ? (() => {
              const c = contractById.get(r.entityId);
              return c ? `${c.customerName ?? ""} — ${c.c.name}` : "(deleted contract)";
            })()
          : r.entityType === "invoice"
            ? invoiceName.get(r.entityId) ?? "(deleted invoice)"
            : r.entityId;
      ws.addRow([
        new Date(r.createdAt).toISOString().slice(0, 19).replace("T", " "),
        r.userName ?? "",
        r.action,
        r.entityType,
        name,
        r.detail ? JSON.stringify(r.detail).slice(0, 500) : "",
      ]);
    }
    [18, 16, 12, 12, 44, 60].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: "A4", to: "F4" };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Audit_Log_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
});
