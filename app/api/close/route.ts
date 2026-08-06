import { NextRequest } from "next/server";
import { json, err, withUser } from "@/lib/api";
import { loadEngineContracts } from "@/lib/data";
import { computeContract } from "@/lib/engine";
import { buildRecRows } from "@/lib/rec";
import { db } from "@/lib/db";
import { contracts } from "@/lib/schema";

export const dynamic = "force-dynamic";

const r2 = (x: number) => Math.round(x * 100) / 100;

// Server-side close summary: one compact line per contract for the month.
// Scales to thousands of contracts (~150 bytes per row) instead of shipping
// full schedules to the browser.
export const GET = withUser(async (_user, req: NextRequest) => {
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return err("month required (YYYY-MM)");

  const [inputs, contractRows] = await Promise.all([
    loadEngineContracts(),
    db
      .select({
        id: contracts.id,
        reviewStatus: contracts.reviewStatus,
        startDate: contracts.startDate,
        billingModel: contracts.billingModel,
      })
      .from(contracts),
  ]);
  const meta = new Map(contractRows.map((c) => [c.id, c]));
  const computations = inputs.map(computeContract);

  const rows: any[] = [];
  const totals = { license: 0, support: 0, total: 0, billings: 0, endDeferred: 0, endCA: 0 };
  for (const c of computations) {
    const r = c.rollforward.find((x) => x.month === month);
    const last = c.rollforward.filter((x) => x.month <= month).slice(-1)[0] ?? null;
    const m = meta.get(c.contractId);
    const row = {
      contractId: c.contractId,
      customer: c.customerName,
      contract: c.contractName,
      license: r2(r?.licenseRec ?? 0),
      support: r2(r?.supportRec ?? 0),
      total: r2(r?.totalRec ?? 0),
      billings: r2(r?.billings ?? 0),
      endDeferred: r2(last?.endDeferred ?? 0),
      endCA: r2(last?.endContractAsset ?? 0),
      reviewStatus: m?.reviewStatus ?? "draft",
      tranched: m?.billingModel === "tranched",
      startedThisMonth: m?.startDate?.slice(0, 7) === month,
    };
    if (row.license || row.support || row.billings || row.endDeferred || row.endCA) {
      rows.push(row);
      totals.license += row.license;
      totals.support += row.support;
      totals.total += row.total;
      totals.billings += row.billings;
      totals.endDeferred += row.endDeferred;
      totals.endCA += row.endCA;
    }
  }
  rows.sort((a, b) => b.total - a.total);

  const flags = buildRecRows(computations, month)
    .filter((r) => Math.abs(r.check) >= 0.01 || Math.abs(r.unbilled) >= 0.01)
    .map((r) => ({
      contractId: r.contractId,
      customer: r.customerName,
      contract: r.contractName,
      amount: r2(Math.abs(r.check) >= 0.01 ? r.check : r.unbilled),
    }));

  return json({
    month,
    totals: {
      license: r2(totals.license),
      support: r2(totals.support),
      total: r2(totals.total),
      billings: r2(totals.billings),
      endDeferred: r2(totals.endDeferred),
      endCA: r2(totals.endCA),
    },
    rows,
    flags,
    counts: {
      active: rows.length,
      approved: rows.filter((r) => r.reviewStatus === "approved").length,
      newThisMonth: rows.filter((r) => r.startedThisMonth).length,
    },
  });
});
