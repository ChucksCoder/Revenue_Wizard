"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Stat, Th, Td, ReviewBadge, api } from "@/components/ui";
import MonthPicker from "@/components/MonthPicker";
import { useMonth } from "@/lib/month";
import { fmtMoney, fmtMoney0 } from "@/lib/format";
import { monthLabel } from "@/lib/engine";
import {
  Download,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  BookOpen,
  Search,
} from "lucide-react";

const PAGE = 50;

export default function ClosePage() {
  const { month } = useMonth();
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setShown(PAGE);
    api(`/api/close?month=${month}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [month]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    if (!q) return data.rows;
    return data.rows.filter(
      (r: any) =>
        r.customer.toLowerCase().includes(q) || r.contract.toLowerCase().includes(q)
    );
  }, [data, search]);

  if (loading || !data)
    return <div className="py-24 text-center text-slate-500">Loading the close...</div>;

  const { totals, flags, counts } = data;
  const newThisMonth = data.rows.filter((r: any) => r.startedThisMonth);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">{monthLabel(month)} Close</h1>
          <p className="mt-1 text-sm text-slate-500">
            {counts.active} contracts with activity or balances · {counts.approved} approved
            {counts.newThisMonth > 0 && ` · ${counts.newThisMonth} new this month`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker />
          <a href={`/api/export/workbook?asOf=${month}`}>
            <Button variant="secondary">
              <span className="inline-flex items-center gap-1.5"><Download size={14} /> Audit workbook</span>
            </Button>
          </a>
          <a href={`/api/export/netsuite?month=${month}`}>
            <Button variant="secondary">
              <span className="inline-flex items-center gap-1.5"><Download size={14} /> NetSuite CSV</span>
            </Button>
          </a>
          <Link href="/journals">
            <Button>
              <span className="inline-flex items-center gap-1.5"><BookOpen size={14} /> Journal entries</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Stat label="License Revenue" value={`$${fmtMoney0(totals.license)}`} sub="point-in-time, released tranches" accent="indigo" />
        <Stat label="Support Revenue" value={`$${fmtMoney0(totals.support)}`} sub="daily-rate ratable" />
        <Stat label="Total Revenue" value={`$${fmtMoney0(totals.total)}`} sub={`${monthLabel(month)} P&L`} accent="emerald" />
        <Stat label="Billings (net)" value={`$${fmtMoney0(totals.billings)}`} sub="invoices this month" />
        <Stat label="Deferred Revenue" value={`$${fmtMoney0(totals.endDeferred)}`} sub="ending balance" accent="indigo" />
        <Stat label="Contract Assets" value={`$${fmtMoney0(totals.endCA)}`} sub="ending balance" accent="sky" />
      </div>

      {flags.length > 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="text-sm">
              <span className="font-medium text-amber-300">
                {flags.length} contract{flags.length === 1 ? "" : "s"} need{flags.length === 1 ? "s" : ""} attention before sign-off
              </span>
              <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                {flags.map((f: any) => (
                  <Link key={f.contractId} href={`/contracts/${f.contractId}`} className="block text-slate-400 hover:text-amber-200">
                    {f.customer} — invoices vs TCV off by ${fmtMoney(f.amount)}{" "}
                    <span className="text-slate-600">({f.contract})</span>
                  </Link>
                ))}
              </div>
              <Link href="/reconciliation" className="mt-2 inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200">
                Open reconciliation <ArrowRight size={11} />
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        counts.active > 0 && (
          <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 size={15} />
              Every contract's invoices tie to its total consideration across all {counts.active} contracts.
            </div>
          </Card>
        )
      )}

      {newThisMonth.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles size={14} className="text-indigo-400" /> New in {monthLabel(month)} ({newThisMonth.length})
          </div>
          <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {newThisMonth.map((r: any) => (
              <Link
                key={r.contractId}
                href={`/contracts/${r.contractId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:border-indigo-500/50 hover:text-white"
              >
                {r.customer}
                {r.tranched && <span className="rounded bg-violet-500/15 px-1.5 text-[10px] text-violet-300">tranched</span>}
                <ReviewBadge status={r.reviewStatus} />
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <h2 className="text-sm font-semibold text-white">
            Revenue by contract — {monthLabel(month)}
            <span className="ml-2 text-xs font-normal text-slate-500">{rows.length} rows</span>
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-slate-600" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }}
                placeholder="Filter customer or contract..."
                className="w-64 rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <Link href="/rollforward" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
              Full worksheet <ArrowRight size={12} />
            </Link>
          </div>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-slate-800 bg-slate-900 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Customer / Contract
                </th>
                <Th right>License</Th>
                <Th right>Support</Th>
                <Th right>Total Rev</Th>
                <Th right>Billings</Th>
                <Th right>End Deferred</Th>
                <Th right>End Contract Asset</Th>
                <Th>Review</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <Td colSpan={8} className="py-12 text-center text-slate-600">
                    No activity in {monthLabel(month)}.
                  </Td>
                </tr>
              )}
              {rows.slice(0, shown).map((r: any) => (
                <tr key={r.contractId} className="hover:bg-slate-900/50">
                  <td className="sticky left-0 z-10 max-w-[280px] border-b border-slate-800/50 bg-slate-950 px-3 py-2 text-sm">
                    <Link href={`/contracts/${r.contractId}`} className="font-medium text-slate-200 hover:text-indigo-300">
                      {r.customer}
                    </Link>
                    {r.tranched && (
                      <span className="ml-2 rounded bg-violet-500/15 px-1.5 text-[10px] text-violet-300">tranched</span>
                    )}
                    <div className="truncate text-xs text-slate-600">{r.contract}</div>
                  </td>
                  <Td right className={r.license ? "text-violet-300" : "text-slate-700"}>{r.license ? fmtMoney(r.license) : "-"}</Td>
                  <Td right className={r.support ? "text-slate-300" : "text-slate-700"}>{r.support ? fmtMoney(r.support) : "-"}</Td>
                  <Td right className="font-medium text-emerald-400">{fmtMoney(r.total)}</Td>
                  <Td right className={r.billings ? "text-slate-200" : "text-slate-700"}>{r.billings ? fmtMoney(r.billings) : "-"}</Td>
                  <Td right className="text-indigo-300">{fmtMoney(r.endDeferred)}</Td>
                  <Td right className="text-sky-300">{fmtMoney(r.endCA)}</Td>
                  <Td><ReviewBadge status={r.reviewStatus} /></Td>
                </tr>
              ))}
              <tr className="bg-slate-900/80 font-semibold">
                <td className="sticky left-0 z-10 border-b border-slate-800/50 bg-slate-900 px-3 py-2 text-sm text-white">
                  TOTAL (all {counts.active})
                </td>
                <Td right className="text-violet-300">{fmtMoney(totals.license)}</Td>
                <Td right className="text-slate-200">{fmtMoney(totals.support)}</Td>
                <Td right className="text-emerald-400">{fmtMoney(totals.total)}</Td>
                <Td right className="text-slate-200">{fmtMoney(totals.billings)}</Td>
                <Td right className="text-indigo-300">{fmtMoney(totals.endDeferred)}</Td>
                <Td right className="text-sky-300">{fmtMoney(totals.endCA)}</Td>
                <Td />
              </tr>
            </tbody>
          </table>
        </div>
        {rows.length > shown && (
          <div className="border-t border-slate-800/60 p-3 text-center">
            <Button variant="secondary" size="sm" onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown} remaining
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
