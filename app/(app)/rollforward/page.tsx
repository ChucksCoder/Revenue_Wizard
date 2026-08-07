"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Th, Td, api } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { monthLabel, monthRange } from "@/lib/engine";
import { useMonth } from "@/lib/month";
import MonthPicker from "@/components/MonthPicker";
import { ChevronDown, ChevronRight, Download, Maximize2, X } from "lucide-react";

type View = "matrix" | "monthly";

const PAGE_SIZE = 25;

export default function RollforwardPage() {
  const { month: asOf } = useMonth();
  const [months, setMonths] = useState<any[]>([]);
  const [byContract, setByContract] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [view, setView] = useState<View>("matrix");
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/api/rollforward?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&q=${encodeURIComponent(q)}`)
      .then((d) => {
        setMonths(d.months);
        setByContract(d.byContract);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }, [page, q]);

  if (loading)
    return <div className="py-24 text-center text-slate-500">Building rollforward...</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Worksheet</h1>
          <p className="mt-1 text-sm text-slate-500">
            {view === "matrix"
              ? "Months horizontal: license & support revenue (P&L) and ending deferred balance (B/S) per contract. Close month highlighted."
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
          <MonthPicker />
          <a href={`/api/export/workbook?asOf=${asOf}`}>
            <Button variant="secondary">
              <span className="inline-flex items-center gap-1.5"><Download size={14} /> Audit workbook (.xlsx)</span>
            </Button>
          </a>
          {view === "matrix" && (
            <Button variant="secondary" onClick={() => setFull(true)}>
              <span className="inline-flex items-center gap-1.5"><Maximize2 size={14} /> Full screen</span>
            </Button>
          )}
        </div>
      </div>

      {view === "matrix" && (
        <div className="flex flex-wrap items-center gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setQ(search);
            }}
            className="relative"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or contract, press Enter..."
              className="w-80 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </form>
          <span className="text-xs text-slate-500">
            {total} contracts{q ? ` matching "${q}"` : ""} · sorted by balance · page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
            <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      {view === "matrix" ? (
        <Matrix
          months={months}
          byContract={byContract}
          closeMonth={asOf}
          full={full}
          onCloseFull={() => setFull(false)}
        />
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

const STICKY = "sticky left-0 z-10 w-60 min-w-60 max-w-60 border-r border-slate-800 shadow-[10px_0_14px_-10px_rgba(0,0,0,0.9)]";

function Matrix({
  months,
  byContract,
  closeMonth,
  full,
  onCloseFull,
}: {
  months: any[];
  byContract: any[];
  closeMonth: string;
  full: boolean;
  onCloseFull: () => void;
}) {
  const mks: string[] = useMemo(() => {
    if (months.length === 0) return [];
    return monthRange(months[0].month, months[months.length - 1].month);
  }, [months]);

  // Full-screen: lock page scroll and close on Escape.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseFull();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [full, onCloseFull]);

  const cell = (v: number, cls = "text-slate-300", mk?: string) =>
    v === 0 ? (
      <span className="text-slate-700">-</span>
    ) : (
      <span className={`${cls} ${mk === closeMonth ? "font-semibold" : ""}`}>{fmtMoney(v)}</span>
    );

  const rowFor = (c: any, mk: string) => c.rollforward.find((r: any) => r.month === mk);

  const table = (
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 w-60 min-w-60 max-w-60 border-b border-r border-slate-800 bg-slate-900 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 shadow-[10px_0_14px_-10px_rgba(0,0,0,0.9)]">
              Contract / Line
            </th>
            {mks.map((mk) => (
              <th
                key={mk}
                className={`sticky top-0 z-20 whitespace-nowrap border-b border-slate-800 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider ${
                  mk === closeMonth ? "bg-indigo-950 text-indigo-300" : "bg-slate-900 text-slate-500"
                }`}
              >
                {monthLabel(mk)}
              </th>
            ))}
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-slate-800 bg-slate-900 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total / End
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Portfolio totals */}
          {[
            { label: "License Revenue", get: (m: any) => m.licenseRec, cls: "text-violet-300" },
            { label: "Support Revenue", get: (m: any) => m.supportRec, cls: "text-slate-200" },
            { label: "Total Revenue", get: (m: any) => m.totalRec, cls: "text-emerald-400" },
            { label: "Deferred Rev (EOM)", get: (m: any) => m.endDeferred, cls: "text-indigo-300", balance: true },
            { label: "Contract Asset (EOM)", get: (m: any) => m.endContractAsset, cls: "text-sky-300", balance: true },
          ].map((row, i) => (
            <tr key={row.label} className="bg-slate-900/80 font-semibold">
              <td className={`${STICKY} border-b border-slate-800/60 bg-slate-900 px-3 py-1.5`}>
                <div className="flex items-baseline justify-end gap-2">
                  <span className={`text-[11px] font-medium ${row.cls}`}>{row.label}</span>
                </div>
              </td>
              {mks.map((mk) => {
                const m = months.find((x) => x.month === mk);
                return (
                  <Td key={mk} right className={mk === closeMonth ? "bg-indigo-500/10" : ""}>
                    {cell(m ? row.get(m) : 0, row.cls, mk)}
                  </Td>
                );
              })}
              <Td right className="font-semibold">
                {row.balance
                  ? cell(months.length ? row.get(months[months.length - 1]) : 0, row.cls)
                  : cell(months.reduce((a, m) => a + row.get(m), 0), row.cls)}
              </Td>
            </tr>
          ))}

          {/* Per-contract blocks: 3 compact rows, no header row */}
          {byContract.map((c) => {
            const licTotal = c.rollforward.reduce((a: number, r: any) => a + r.licenseRec, 0);
            const supTotal = c.rollforward.reduce((a: number, r: any) => a + r.supportRec, 0);
            const lastDR = c.rollforward.length
              ? c.rollforward[c.rollforward.length - 1].endDeferred
              : 0;
            const lines = [
              { label: "License", get: (r: any) => r.licenseRec, cls: "text-violet-300", total: licTotal, balance: false },
              { label: "Support", get: (r: any) => r.supportRec, cls: "text-slate-300", total: supTotal, balance: false },
              { label: "Deferred", get: (r: any) => r.endDeferred, cls: "text-indigo-300", total: lastDR, balance: true },
            ];
            return lines.map((line, li) => (
              <tr key={`${c.contractId}-${line.label}`} className="group hover:bg-slate-800/50">
                <td
                  className={`${STICKY} bg-slate-950 px-3 py-1.5 group-hover:bg-slate-900 ${li === 0 ? "border-t-2 border-t-slate-800" : ""} ${li === 2 ? "border-b border-slate-800/40" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    {li === 0 ? (
                      <Link
                        href={`/contracts/${c.contractId}`}
                        title={c.contractName}
                        className="truncate text-sm font-semibold text-slate-200 hover:text-indigo-300"
                      >
                        {c.customerName}
                      </Link>
                    ) : (
                      <span />
                    )}
                    <span className="shrink-0 text-[11px] text-slate-500">{line.label}</span>
                  </div>
                </td>
                {mks.map((mk: string) => {
                  const r = rowFor(c, mk);
                  const v = r
                    ? line.get(r)
                    : line.balance && mk > c.lastMonth
                      ? lastDR
                      : 0;
                  return (
                    <td
                      key={mk}
                      className={`whitespace-nowrap px-3 py-1.5 text-right text-xs tabular ${
                        li === 0 ? "border-t-2 border-t-slate-800" : ""
                      } ${li === 2 ? "border-b border-slate-800/40" : ""} ${mk === closeMonth ? "bg-indigo-500/10" : ""}`}
                    >
                      {cell(v, line.cls, mk)}
                    </td>
                  );
                })}
                <td
                  className={`whitespace-nowrap px-3 py-1.5 text-right text-xs font-medium tabular ${
                    li === 0 ? "border-t-2 border-t-slate-800" : ""
                  } ${li === 2 ? "border-b border-slate-800/40" : ""}`}
                >
                  {cell(line.total, line.cls)}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
  );

  if (full)
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-300">
            Worksheet <span className="text-slate-600">·</span> close month {monthLabel(closeMonth)}
          </div>
          <button
            onClick={onCloseFull}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            <X size={14} /> Exit full screen (Esc)
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-800">{table}</div>
      </div>
    );

  return <Card className="max-h-[75vh] overflow-auto">{table}</Card>;
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
