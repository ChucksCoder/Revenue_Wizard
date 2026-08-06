"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Th, Td, api } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { monthLabel } from "@/lib/engine";
import { useMonth } from "@/lib/month";
import MonthPicker from "@/components/MonthPicker";
import { Download } from "lucide-react";

const PAGE_SIZE = 100;

export default function ReconciliationPage() {
  const { month: asOf } = useMonth();
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(
      `/api/reconciliation?month=${asOf}&q=${encodeURIComponent(q)}&flagged=${flaggedOnly ? 1 : 0}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
    )
      .then(setData)
      .finally(() => setLoading(false));
  }, [asOf, q, flaggedOnly, page]);

  if (loading && !data)
    return <div className="py-24 text-center text-slate-500">Building reconciliation...</div>;

  const totals = data?.totals ?? {};
  const rows = data?.rows ?? [];
  const checksPass = (data?.flaggedCount ?? 0) === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Deferred Revenue Reconciliation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Total consideration less revenue recognized, less future billings = deferred revenue.
            Totals cover all {data?.allCount ?? 0} contracts; rows are paged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker />
          <a href={`/api/export/workbook?asOf=${asOf}`}>
            <Button variant="secondary">
              <span className="inline-flex items-center gap-1.5"><Download size={14} /> Audit workbook (.xlsx)</span>
            </Button>
          </a>
        </div>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          checksPass
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-rose-500/30 bg-rose-500/10 text-rose-300"
        }`}
      >
        {checksPass
          ? `All ${data?.allCount} contracts tie: bridge method equals ledger method as of ${monthLabel(asOf)}.`
          : `${data?.flaggedCount} of ${data?.allCount} contracts don't tie - invoices don't sum to TCV.`}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setQ(search);
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer or contract, press Enter..."
            className="w-80 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </form>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => {
              setPage(0);
              setFlaggedOnly(e.target.checked);
            }}
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-rose-500"
          />
          Exceptions only
        </label>
        <span className="text-xs text-slate-500">
          {data?.total ?? 0} rows · page {page + 1} of {Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE_SIZE >= (data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-slate-800 bg-slate-900 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Customer / Contract
              </th>
              <Th right>Total License</Th>
              <Th right>Total Support</Th>
              <Th right>TCV</Th>
              <Th right>License Rec&#39;d</Th>
              <Th right>Support Rec&#39;d</Th>
              <Th right>Unearned</Th>
              <Th right>Less: Future Billings</Th>
              <Th right>Less: Unbilled Gap</Th>
              <Th right>= Deferred Rev</Th>
              <Th right>Contract Asset</Th>
              <Th right>Check</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.contractId} className="hover:bg-slate-900/40">
                <td className="sticky left-0 z-10 max-w-[260px] border-b border-slate-800/50 bg-slate-950 px-3 py-2 text-sm">
                  <Link href={`/contracts/${r.contractId}`} className="text-slate-200 hover:text-indigo-300">
                    {r.customerName}
                  </Link>
                  <div className="truncate text-xs text-slate-600">{r.contractName}</div>
                </td>
                <Td right className="text-violet-300">{fmtMoney(r.licTotal)}</Td>
                <Td right className="text-slate-300">{fmtMoney(r.supTotal)}</Td>
                <Td right className="font-medium text-slate-200">{fmtMoney(r.tcv)}</Td>
                <Td right className="text-violet-300">({fmtMoney(r.cumLic)})</Td>
                <Td right className="text-slate-300">({fmtMoney(r.cumSup)})</Td>
                <Td right className="text-slate-200">{fmtMoney(r.unearned)}</Td>
                <Td right className="text-amber-300">({fmtMoney(r.futureBill)})</Td>
                <Td right className={r.unbilled ? "text-rose-400" : "text-slate-700"}>
                  {r.unbilled ? `(${fmtMoney(r.unbilled)})` : "-"}
                </Td>
                <Td right className="font-medium text-indigo-300">{fmtMoney(r.deferred)}</Td>
                <Td right className="font-medium text-sky-300">{fmtMoney(r.contractAsset)}</Td>
                <Td right className={Math.abs(r.check) < 0.01 ? "text-emerald-400" : "text-rose-400"}>
                  {Math.abs(r.check) < 0.01 ? "✓" : fmtMoney(r.check)}
                </Td>
              </tr>
            ))}
            <tr className="bg-slate-900/80 font-semibold">
              <td className="sticky left-0 z-10 border-b border-slate-800/50 bg-slate-900 px-3 py-2 text-sm text-white">
                TOTAL (all {data?.allCount})
              </td>
              <Td right className="text-violet-300">{fmtMoney(totals.licTotal)}</Td>
              <Td right className="text-slate-200">{fmtMoney(totals.supTotal)}</Td>
              <Td right className="text-white">{fmtMoney(totals.tcv)}</Td>
              <Td right className="text-violet-300">({fmtMoney(totals.cumLic)})</Td>
              <Td right className="text-slate-200">({fmtMoney(totals.cumSup)})</Td>
              <Td right className="text-slate-200">{fmtMoney(totals.unearned)}</Td>
              <Td right className="text-amber-300">({fmtMoney(totals.futureBill)})</Td>
              <Td right className="text-rose-400">({fmtMoney(totals.unbilled)})</Td>
              <Td right className="text-indigo-300">{fmtMoney(totals.deferred)}</Td>
              <Td right className="text-sky-300">{fmtMoney(totals.contractAsset)}</Td>
              <Td />
            </tr>
          </tbody>
        </table>
        <p className="border-t border-slate-800/60 px-4 py-3 text-xs text-slate-500">
          Revenue is recognized on total consideration regardless of billing cadence. Deferred
          revenue = unearned consideration less amounts not yet billed. A negative bridge is a
          contract asset (earned, unbilled). Nonzero Check means invoices don&#39;t sum to TCV.
        </p>
      </Card>
    </div>
  );
}
