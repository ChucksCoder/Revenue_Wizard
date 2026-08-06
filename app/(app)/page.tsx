"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Stat, Th, Td, ReviewBadge, api } from "@/components/ui";
import MonthPicker from "@/components/MonthPicker";
import { useMonth } from "@/lib/month";
import { fmtMoney, fmtMoney0, fmtDate } from "@/lib/format";
import { monthLabel } from "@/lib/engine";
import { buildRecRows } from "@/lib/rec";
import {
  Download,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  BookOpen,
} from "lucide-react";

export default function ClosePage() {
  const { month } = useMonth();
  const [byContract, setByContract] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api("/api/rollforward"), api("/api/contracts")])
      .then(([rf, c]) => {
        setByContract(rf.byContract);
        setContracts(c.contracts);
      })
      .finally(() => setLoading(false));
  }, []);

  const contractById = useMemo(
    () => new Map(contracts.map((c: any) => [c.id, c])),
    [contracts]
  );

  // one line per contract for the selected month
  const rows = useMemo(() => {
    return byContract
      .map((c) => {
        const r = c.rollforward.find((x: any) => x.month === month);
        const last =
          c.rollforward.filter((x: any) => x.month <= month).slice(-1)[0] ?? null;
        const meta = contractById.get(c.contractId);
        return {
          contractId: c.contractId,
          customer: c.customerName,
          contract: c.contractName,
          license: r?.licenseRec ?? 0,
          support: r?.supportRec ?? 0,
          total: r?.totalRec ?? 0,
          billings: r?.billings ?? 0,
          endDeferred: last?.endDeferred ?? 0,
          endCA: last?.endContractAsset ?? 0,
          reviewStatus: meta?.reviewStatus ?? "draft",
          tranched: (meta?.tranches?.length ?? 0) > 0,
          startedThisMonth: meta?.startDate?.slice(0, 7) === month,
        };
      })
      .filter(
        (r) =>
          r.license || r.support || r.billings || r.endDeferred || r.endCA
      )
      .sort((a, b) => b.total - a.total);
  }, [byContract, contractById, month]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          license: a.license + r.license,
          support: a.support + r.support,
          total: a.total + r.total,
          billings: a.billings + r.billings,
          endDeferred: a.endDeferred + r.endDeferred,
          endCA: a.endCA + r.endCA,
        }),
        { license: 0, support: 0, total: 0, billings: 0, endDeferred: 0, endCA: 0 }
      ),
    [rows]
  );

  const flags = useMemo(
    () =>
      buildRecRows(byContract, month).filter(
        (r) => Math.abs(r.check) >= 0.01 || Math.abs(r.unbilled) >= 0.01
      ),
    [byContract, month]
  );

  const approved = rows.filter((r) => r.reviewStatus === "approved").length;
  const newThisMonth = rows.filter((r) => r.startedThisMonth);

  if (loading)
    return <div className="py-24 text-center text-slate-500">Loading the close...</div>;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {monthLabel(month)} Close
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {rows.length} contracts with activity or balances · {approved} of {rows.length} approved
            {newThisMonth.length > 0 && ` · ${newThisMonth.length} new this month`}
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

      {/* the month at a glance: P&L on the left, balance sheet on the right */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Stat label="License Revenue" value={`$${fmtMoney(totals.license)}`} sub="point-in-time, released tranches" accent="indigo" />
        <Stat label="Support Revenue" value={`$${fmtMoney(totals.support)}`} sub="daily-rate ratable" />
        <Stat label="Total Revenue" value={`$${fmtMoney(totals.total)}`} sub={`${monthLabel(month)} P&L`} accent="emerald" />
        <Stat label="Billings (net)" value={`$${fmtMoney(totals.billings)}`} sub="invoices this month" />
        <Stat label="Deferred Revenue" value={`$${fmtMoney0(totals.endDeferred)}`} sub="ending balance" accent="indigo" />
        <Stat label="Contract Assets" value={`$${fmtMoney0(totals.endCA)}`} sub="ending balance" accent="sky" />
      </div>

      {/* tie-out flags */}
      {flags.length > 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="text-sm">
              <span className="font-medium text-amber-300">
                {flags.length} contract{flags.length === 1 ? "" : "s"} need{flags.length === 1 ? "s" : ""} attention before sign-off
              </span>
              <div className="mt-1.5 space-y-1">
                {flags.map((f) => (
                  <Link
                    key={f.contractId}
                    href={`/contracts/${f.contractId}`}
                    className="block text-slate-400 hover:text-amber-200"
                  >
                    {f.customerName} — invoices vs TCV off by $
                    {fmtMoney(Math.abs(f.check) >= 0.01 ? f.check : f.unbilled)}{" "}
                    <span className="text-slate-600">({f.contractName})</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        rows.length > 0 && (
          <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 size={15} />
              Every contract's invoices tie to its total consideration - the bridge equals the ledger on all {rows.length}.
            </div>
          </Card>
        )
      )}

      {/* new contracts this month */}
      {newThisMonth.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles size={14} className="text-indigo-400" /> New in {monthLabel(month)}
          </div>
          <div className="flex flex-wrap gap-2">
            {newThisMonth.map((r) => (
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

      {/* the month, contract by contract */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-sm font-semibold text-white">
            Revenue by contract — {monthLabel(month)}
          </h2>
          <Link href="/rollforward" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
            Full worksheet <ArrowRight size={12} />
          </Link>
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
                    No activity in {monthLabel(month)}. Pick another close month above, or add
                    contracts under Records.
                  </Td>
                </tr>
              )}
              {rows.map((r) => (
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
              {rows.length > 0 && (
                <tr className="bg-slate-900/80 font-semibold">
                  <td className="sticky left-0 z-10 border-b border-slate-800/50 bg-slate-900 px-3 py-2 text-sm text-white">TOTAL</td>
                  <Td right className="text-violet-300">{fmtMoney(totals.license)}</Td>
                  <Td right className="text-slate-200">{fmtMoney(totals.support)}</Td>
                  <Td right className="text-emerald-400">{fmtMoney(totals.total)}</Td>
                  <Td right className="text-slate-200">{fmtMoney(totals.billings)}</Td>
                  <Td right className="text-indigo-300">{fmtMoney(totals.endDeferred)}</Td>
                  <Td right className="text-sky-300">{fmtMoney(totals.endCA)}</Td>
                  <Td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
