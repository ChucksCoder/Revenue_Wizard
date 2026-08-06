import { NextRequest } from "next/server";
import { err, withUser } from "@/lib/api";
import { loadEngineContracts, loadAccountMap } from "@/lib/data";
import { journalEntriesForMonth, monthEnd, toISO } from "@/lib/engine";

export const dynamic = "force-dynamic";

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/export/netsuite?month=YYYY-MM
// NetSuite Journal Entry CSV import: one External ID per entry type so the
// billing JE and the recognition JE import as separate balanced journals.
export const GET = withUser(async (_user, req: NextRequest) => {
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return err("month query param required (YYYY-MM)");
  const [inputs, accounts] = await Promise.all([loadEngineContracts(), loadAccountMap()]);
  const lines = journalEntriesForMonth(inputs, month, accounts);
  const postingDate = toISO(monthEnd(month));

  const header = [
    "External ID", "Date", "Posting Period", "Memo (Main)",
    "Account", "Debit", "Credit", "Line Memo", "Entity",
  ];
  const [y, m] = month.split("-");
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const period = `${monthNames[Number(m) - 1]} ${y}`;

  const rows = [header.join(",")];
  for (const l of lines) {
    const extId = `REVHUB-${month}-${l.entryType === "billing" ? "BILL" : "REC"}-${l.sourceId.slice(0, 8)}`;
    const mainMemo =
      l.entryType === "billing"
        ? `Billing - ${l.customer} (${month})`
        : `Revenue recognition - ${l.customer} (${month})`;
    rows.push(
      [
        extId,
        postingDate,
        period,
        csvEscape(mainMemo),
        `${l.account} ${l.accountName}`,
        l.debit ? l.debit.toFixed(2) : "",
        l.credit ? l.credit.toFixed(2) : "",
        csvEscape(l.memo),
        csvEscape(l.customer),
      ].join(",")
    );
  }

  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="NetSuite_JE_Import_${month}.csv"`,
    },
  });
});
