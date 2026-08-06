import { NextRequest } from "next/server";
import { json, withUser } from "@/lib/api";
import { loadEngineContracts } from "@/lib/data";
import { computePortfolio } from "@/lib/engine";

export const dynamic = "force-dynamic";

const r2 = (x: number) => Math.round(x * 100) / 100;

// Portfolio months always cover the whole book; per-contract detail is paged
// and searchable so the payload stays small at thousands of contracts.
export const GET = withUser(async (_user, req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").toLowerCase().trim();
  const limit = Math.min(Number(p.get("limit") ?? 25), 100);
  const offset = Math.max(Number(p.get("offset") ?? 0), 0);

  const inputs = await loadEngineContracts();
  const { months, byContract } = computePortfolio(inputs);

  let filtered = byContract;
  if (q)
    filtered = filtered.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.contractName.toLowerCase().includes(q)
    );
  // biggest balances first so the default page is the most relevant
  const score = (c: (typeof byContract)[number]) => {
    const last = c.rollforward[c.rollforward.length - 1];
    const cur = c.rollforward.find((r) => r.month === new Date().toISOString().slice(0, 7)) ?? last;
    return (cur?.endDeferred ?? 0) + (cur?.endContractAsset ?? 0);
  };
  filtered = [...filtered].sort((a, b) => score(b) - score(a));

  const page = filtered.slice(offset, offset + limit).map((c) => ({
    contractId: c.contractId,
    contractName: c.contractName,
    customerName: c.customerName,
    licenseTotal: r2(c.licenseTotal),
    supportTotal: r2(c.supportTotal),
    firstMonth: c.firstMonth,
    lastMonth: c.lastMonth,
    // slim rows: only what the worksheet renders
    rollforward: c.rollforward.map((r) => ({
      month: r.month,
      licenseRec: r2(r.licenseRec),
      supportRec: r2(r.supportRec),
      billings: r2(r.billings),
      endDeferred: r2(r.endDeferred),
      endContractAsset: r2(r.endContractAsset),
      totalRec: r2(r.totalRec),
    })),
  }));

  return json({ months, byContract: page, total: filtered.length });
});
