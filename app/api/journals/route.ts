import { NextRequest } from "next/server";
import { json, err, withUser } from "@/lib/api";
import { loadEngineContracts, loadAccountMap } from "@/lib/data";
import { journalEntriesForMonth } from "@/lib/engine";

export const GET = withUser(async (_user, req: NextRequest) => {
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return err("month query param required (YYYY-MM)");
  const [inputs, accounts] = await Promise.all([
    loadEngineContracts(),
    loadAccountMap(),
  ]);
  const lines = journalEntriesForMonth(inputs, month, accounts);
  const totals = lines.reduce(
    (a, l) => ({ debit: a.debit + l.debit, credit: a.credit + l.credit }),
    { debit: 0, credit: 0 }
  );
  return json({
    month,
    lines,
    totals: {
      debit: Math.round(totals.debit * 100) / 100,
      credit: Math.round(totals.credit * 100) / 100,
    },
  });
});
