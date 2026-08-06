import { NextRequest } from "next/server";
import { json, err, withUser } from "@/lib/api";
import { loadEngineContracts } from "@/lib/data";
import { computeContract } from "@/lib/engine";
import { buildRecRows } from "@/lib/rec";

export const dynamic = "force-dynamic";

const r2 = (x: number) => Math.round(x * 100) / 100;

// Server-side reconciliation: totals across the WHOLE book, rows paged.
export const GET = withUser(async (_user, req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const month = p.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return err("month required (YYYY-MM)");
  const q = (p.get("q") ?? "").toLowerCase().trim();
  const flaggedOnly = p.get("flagged") === "1";
  const limit = Math.min(Number(p.get("limit") ?? 100), 500);
  const offset = Math.max(Number(p.get("offset") ?? 0), 0);

  const inputs = await loadEngineContracts();
  const all = buildRecRows(inputs.map(computeContract), month);

  const totals = all.reduce(
    (a, r) => ({
      licTotal: a.licTotal + r.licTotal,
      supTotal: a.supTotal + r.supTotal,
      tcv: a.tcv + r.tcv,
      cumLic: a.cumLic + r.cumLic,
      cumSup: a.cumSup + r.cumSup,
      unearned: a.unearned + r.unearned,
      futureBill: a.futureBill + r.futureBill,
      unbilled: a.unbilled + r.unbilled,
      deferred: a.deferred + r.deferred,
      contractAsset: a.contractAsset + r.contractAsset,
    }),
    { licTotal: 0, supTotal: 0, tcv: 0, cumLic: 0, cumSup: 0, unearned: 0, futureBill: 0, unbilled: 0, deferred: 0, contractAsset: 0 }
  );

  let filtered = all;
  if (q)
    filtered = filtered.filter(
      (r) =>
        r.customerName.toLowerCase().includes(q) ||
        r.contractName.toLowerCase().includes(q)
    );
  if (flaggedOnly)
    filtered = filtered.filter(
      (r) => Math.abs(r.check) >= 0.01 || Math.abs(r.unbilled) >= 0.01
    );
  filtered.sort((a, b) => b.deferred + b.contractAsset - (a.deferred + a.contractAsset));

  return json({
    month,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, r2(v)])),
    total: filtered.length,
    flaggedCount: all.filter((r) => Math.abs(r.check) >= 0.01 || Math.abs(r.unbilled) >= 0.01).length,
    allCount: all.length,
    rows: filtered.slice(offset, offset + limit),
  });
});
