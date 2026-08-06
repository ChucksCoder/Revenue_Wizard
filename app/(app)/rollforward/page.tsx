"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Th, Td, api } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { monthLabel, monthRange } from "@/lib/engine";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

type View = "matrix" | "monthly";

export default function RollforwardPage() {
  const [months, setMonths] = useState<any[]>([]);
  const [byContract, setByContract] = useState<any[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 7));
  const [view, setView] = useState<View>("matrix");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/rollforward").then((d) => {
      setMonths(d.months);
      setByContract(d.byContract);
      setLoading(false);
    });
  }, []);

  if (loading)
    return <div className="py-24 text-center text-slate-500">Building rollforward...</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Rollforward</h1>
          <p className="mt-1 text-sm text-slate-500">
            {view === "matrix"
              ? "Months horizontal: license & support revenue (P&L) and ending deferred balance (B/S) per contract."
              : "Deferred revenue and contract assets month by month. Click a month for by-contract detail."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {(["matrix", "monthly"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 text-sm font-medium capitalize ${
                  view === v ? "bg-indigo-500/20 text-indigo-300" : "text-slate-400 hover:bg-slate-800"
                }`}
              >
                {v === "matrix" ? "Matrix" : "Monthly"}
              </button>
            ))}
          </div>
          <input
            type="month"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
          />
          <a href={`/api/export/workbook?asOf=${asOf}`}>
            <Button variant="secondary">
              <span className="inline-flex items-center gap-1.5"><Download size={14} /> Audit workbook (.xlsx)</span>
            </Button>
          </a>
        </div>
      </div>

      {view === "matrix" ? (
        <Matrix months={months} byContract={byContract} />
      ) : (
        <Monthly
          months={months}
          byContract={byContract}
          expandedMonth={expandedMonth}
          setExpandedMonth={setExpandedMonth}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Matrix

function Matrix({ months, byContract }: { months: any[]; byContract: any[] }) {
  const mks: string[] = useMemo(() => {
    if (months.length === 0) return [];
    return monthRange(months[0].month, months[months.length - 1].month);
  }, [months]);

  const cell = (v: number, cls = "text-slate-300") =>
    v === 0 ? <span className="text-slate-700">-</span> : <span className={cls}>{fmtMoney(v)}</span>;

  const rowFor = (c: any, mk: string) => c.rollforward.find((r: any) => r.month === mk);

  return (
    <Card className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-slate-800 bg-slate-900 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Contract / Line
            </th>
            {mks.map((mk) => (
              <Th key={mk} right>{monthLabel(mk)}</Th>
            ))}
            <Th right>Total</Th>
          </tr>
        </thead>
        <tbody>
          {/* Portfolio totals */}
          {[
            { label: "TOTAL License Revenue", get: (m: any) => m.licenseRec, cls: "text-violet-300" },
            { label: "TOTAL Support Revenue", get: (m: any) => m.supportRec, cls: "text-slate-200" },
            { label: "TOTAL Revenue", get: (m: any) => m.totalRec, cls: "text-emerald-400" },
            { label: "TOTAL Deferred Revenue (EOM)", get: (m: any) => m.endDeferred, cls: "text-indigo-300", balance: true },
            { label: "TOTAL Contract Asset (EOM)", get: (m: any) => m.endContractAsset, cls: "text-sky-300", balance: true },
          ].map((row) => (
            <tr key={row.label} className="bg-slate-900/80 font-semibold">
              <td className="sticky left-0 z-10 whitespace-nowrap border-b border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white">
                {row.label}
              </td>
              {mks.map((mk) => {
                const m = months.find((x) => x.month === mk);
                return (
                  <Td key={mk} right>{cell(m ? row.get(m) : 0, row.cls)}</Td>
                );
              })}
              <Td right className="font-semibold">
                {row.balance
                  ? cell(months.length ? row.get(months[months.length - 1]) : 0, row.cls)
                  : cell(months.reduce((a, m) => a + row.get(m), 0), row.cls)}
              </Td>
            </tr>
          ))}
          <tr><td className="py-1" colSpan={mks.length + 2}></td></tr>

          {/* Per-contract blocks */}
          {byContract.map((c) => {
            const licTotal = c.rollforward.reduce((a: number, r: any) => a + r.licenseRec, 0);
            const supTotal = c.rollforward.reduce((a: number, r: any) => a + r.supportRec, 0);
            const lastDR = c.rollforward.length
              ? c.rollforward[c.rollforward.length - 1].endDeferred
              : 0;
            return (
              <FragmentRows
                key={c.contractId}
                c={c}
                mks={mks}
                rowFor={rowFor}
                cell={cell}
                licTotal={licTotal}
                supTotal={supTotal}
                lastDR={lastDR}
              />
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function FragmentRows({ c, mks, rowFor, cell, licTotal, supTotal, lastDR }: any) {
  const lines = [
    { label: "License", get: (r: any) => r.licenseRec, cls: "text-violet-300", total: licTotal },
    { label: "Support", get: (r: any) => r.supportRec, cls: "text-slate-300", total: supTotal },
    { label: "Deferred (EOM)", get: (r: any) => r.endDeferred, cls: "text-indigo-300", total: lastDR, balance: true },
  ];
  return (
    <>
      <tr>
        <td
          className="sticky left-0 z-10 whitespace-nowrap border-b border-slate-800/50 bg-slate-950 px-3 pb-1 pt-3 text-sm font-semibold text-white"
          colSpan={1}
        >
          <Link href={`/contracts/${c.contractId}`} className="hover:text-indigo-300">
            {c.customerName}
          </Link>
          <span className="ml-2 text-xs font-normal text-slate-600">{c.contractName}</span>
        </td>
        <td colSpan={mks.length + 1} className="border-b border-slate-800/50 bg-slate-950/50"></td>
      </tr>
      {lines.map((line) => (
        <tr key={line.label} className="hover:bg-slate-900/40">
          <td className="sticky left-0 z-10 whitespace-nowrap border-b border-slate-800/50 bg-slate-950 py-1.5 pl-6 pr-3 text-xs text-slate-500">
            {line.label}
          </td>
          {mks.map((mk: string) => {
            const r = rowFor(c, mk);
            return (
              <Td key={mk} right className="text-xs">
                {cell(r ? line.get(r) : line.balance && rowFor(c, mk) === undefined && mk > c.lastMonth ? lastDR : 0, line.cls)}
              </Td>
            );
          })}
          <Td right className="text-xs font-medium">{cell(line.total, line.cls)}</Td>
        </tr>
      ))}
    </>
  );
}

// ------------------------------------------------------------------- Monthly

function Monthly({
  months,
  byContract,
  expandedMonth,
  setExpandedMonth,
}: {
  months: any[];
  byContract: any[];
  expandedMonth: string | null;
  setExpandedMonth: (m: string | null) => void;
}) {
  const rows = useMemo(() => {
    let prevDR = 0;
    let prevCA = 0;
    return months.map((m) => {
      const row = { ...m, beginDeferred: prevDR, beginContractAsset: prevCA };
      prevDR = m.endDeferred;
      prevCA = m.endContractAsset;
      return row;
    });
  }, [months]);

  return (
    <Card className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <Th></Th>
            <Th>Month</Th>
            <Th right>Begin Deferred</Th>
            <Th right>Billings (net)</Th>
            <Th right>License Rec</Th>
            <Th right>Support Rec</Th>
            <Th right>Total Rec</Th>
            <Th right>End Deferred</Th>
            <Th right>End Contract Asset</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <MonthRow
              key={m.month}
              m={m}
              byContract={byContract}
              expanded={expandedMonth === m.month}
              onToggle={() => setExpandedMonth(expandedMonth === m.month ? null : m.month)}
            />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MonthRow({
  m,
  byContract,
  expanded,
  onToggle,
}: {
  m: any;
  byContract: any[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const nowMk = new Date().toISOString().slice(0, 7);
  const detail = expanded
    ? byContract
        .map((c) => ({
          customer: c.customerName,
          contract: c.contractName,
          contractId: c.contractId,
          row: c.rollforward.find((r: any) => r.month === m.month),
        }))
        .filter((d) => d.row && (d.row.billings || d.row.totalRec || d.row.endDeferred || d.row.endContractAsset))
    : [];

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-slate-900/60 ${m.month === nowMk ? "bg-indigo-500/5" : ""}`}
        onClick={onToggle}
      >
        <Td className="w-8 pl-4">
          {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        </Td>
        <Td className="font-medium text-slate-200">{monthLabel(m.month)}</Td>
        <Td right className="text-slate-400">{fmtMoney(m.beginDeferred)}</Td>
        <Td right className="text-slate-200">{fmtMoney(m.billings)}</Td>
        <Td right className="text-violet-300">({fmtMoney(m.licenseRec)})</Td>
        <Td right className="text-slate-300">({fmtMoney(m.supportRec)})</Td>
        <Td right className="text-emerald-400">({fmtMoney(m.totalRec)})</Td>
        <Td right className="font-medium text-indigo-300">{fmtMoney(m.endDeferred)}</Td>
        <Td right className="font-medium text-sky-300">{fmtMoney(m.endContractAsset)}</Td>
      </tr>
      {expanded && (
        <tr>
          <Td colSpan={9} className="bg-slate-950/60 !px-0 !py-0">
            <div className="mx-10 my-3 overflow-hidden rounded-xl border border-slate-800/80">
              <table className="w-full">
                <thead className="bg-slate-900/80">
                  <tr>
                    <Th>Customer / Contract</Th>
                    <Th right>Billings</Th>
                    <Th right>License</Th>
                    <Th right>Support</Th>
                    <Th right>End Deferred</Th>
                    <Th right>End Contract Asset</Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.map((d) => (
                    <tr key={d.contractId} className="hover:bg-slate-900/40">
                      <Td>
                        <Link href={`/contracts/${d.contractId}`} className="text-slate-200 hover:text-indigo-300">
                          {d.customer}
                        </Link>
                        <span className="ml-2 text-xs text-slate-600">{d.contract}</span>
                      </Td>
                      <Td right className="text-slate-300">{fmtMoney(d.row.billings)}</Td>
                      <Td right className="text-violet-300">{fmtMoney(d.row.licenseRec)}</Td>
                      <Td right className="text-slate-300">{fmtMoney(d.row.supportRec)}</Td>
                      <Td right className="text-indigo-300">{fmtMoney(d.row.endDeferred)}</Td>
                      <Td right className="text-sky-300">{fmtMoney(d.row.endContractAsset)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Td>
        </tr>
      )}
    </>
  );
}
