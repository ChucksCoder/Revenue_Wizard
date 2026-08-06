"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, Th, Td, ReviewBadge, StatusBadge, LabelChip, api } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/format";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type SortKey = "name" | "contractCount" | "invoiceCount" | "contractTcv" | "invoiceNet";

export default function LabelsReportPage() {
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"any" | "all">("any");
  const [sortKey, setSortKey] = useState<SortKey>("contractTcv");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/labels/report")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return [...data.labels].sort((a: any, b: any) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return cmp * sortDir;
    });
  }, [data, sortKey, sortDir]);

  const matches = useMemo(() => {
    if (!data || selected.size === 0) return { contracts: [], invoices: [] };
    const sel = [...selected];
    const test = (labelIds: string[]) =>
      mode === "any"
        ? sel.some((id) => labelIds.includes(id))
        : sel.every((id) => labelIds.includes(id));
    return {
      contracts: (Object.values(data.contracts) as any[])
        .filter((c) => test(c.labelIds))
        .sort((a, b) => b.tcv - a.tcv),
      invoices: (Object.values(data.invoices) as any[])
        .filter((i) => test(i.labelIds))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [data, selected, mode]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === 1 ? -1 : 1);
    else {
      setSortKey(key);
      setSortDir(key === "name" ? 1 : -1);
    }
  }
  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const SortTh = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`cursor-pointer select-none whitespace-nowrap border-b border-slate-800 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 ${right ? "text-right" : "text-left"}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k ? (sortDir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-40" />}
      </span>
    </th>
  );

  if (loading || !data)
    return <div className="py-24 text-center text-slate-500">Loading labels...</div>;

  const totalMatchTcv = matches.contracts.reduce((a: number, c: any) => a + c.tcv, 0);
  const totalMatchInv = matches.invoices
    .filter((i: any) => i.status !== "void")
    .reduce((a: number, i: any) => a + i.amount, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Labels</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every label with what it&apos;s attached to. Click column headers to sort; check
          labels to see the matching contracts and invoices below.
        </p>
      </div>

      <Card>
        <table className="w-full">
          <thead>
            <tr>
              <Th></Th>
              <SortTh k="name">Label</SortTh>
              <SortTh k="contractCount" right>Contracts</SortTh>
              <SortTh k="contractTcv" right>Contract TCV</SortTh>
              <SortTh k="invoiceCount" right>Invoices</SortTh>
              <SortTh k="invoiceNet" right>Invoice Net</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><Td colSpan={6} className="py-10 text-center text-slate-600">No labels yet - add them on contracts and invoices, or sync from Campfire.</Td></tr>
            )}
            {rows.map((l: any) => (
              <tr
                key={l.id}
                className={`cursor-pointer hover:bg-slate-900/50 ${selected.has(l.id) ? "bg-indigo-500/5" : ""}`}
                onClick={() => toggleSelect(l.id)}
              >
                <Td className="w-10 pl-4">
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggleSelect(l.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-indigo-500"
                  />
                </Td>
                <Td><LabelChip name={l.name} color={l.color} /></Td>
                <Td right className="text-slate-300">{l.contractCount || "-"}</Td>
                <Td right className="text-slate-200">{l.contractTcv ? `$${fmtMoney(l.contractTcv)}` : "-"}</Td>
                <Td right className="text-slate-300">{l.invoiceCount || "-"}</Td>
                <Td right className="text-slate-200">{l.invoiceNet ? `$${fmtMoney(l.invoiceNet)}` : "-"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {selected.size > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">
              {selected.size} label{selected.size > 1 ? "s" : ""} selected · matching:
            </span>
            <div className="flex overflow-hidden rounded-lg border border-slate-700">
              {(["any", "all"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium uppercase ${
                    mode === m ? "bg-indigo-500/20 text-indigo-300" : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {m === "any" ? "Any label" : "All labels"}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              {matches.contracts.length} contracts (${fmtMoney(totalMatchTcv)} TCV) ·{" "}
              {matches.invoices.length} invoices (${fmtMoney(totalMatchInv)} net)
            </span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 underline hover:text-slate-300">
              Clear
            </button>
          </div>

          {matches.contracts.length > 0 && (
            <Card>
              <h2 className="px-5 pt-4 text-sm font-semibold text-white">
                Contracts ({matches.contracts.length})
              </h2>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Customer / Contract</Th>
                      <Th>Term</Th>
                      <Th right>TCV</Th>
                      <Th>Labels</Th>
                      <Th>Review</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.contracts.map((c: any) => (
                      <tr key={c.id} className="hover:bg-slate-900/50">
                        <Td>
                          <Link href={`/contracts/${c.id}`} className="font-medium text-slate-200 hover:text-indigo-300">
                            {c.customer}
                          </Link>
                          <div className="max-w-md truncate text-xs text-slate-600">{c.name}</div>
                        </Td>
                        <Td className="text-slate-400">{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</Td>
                        <Td right className="text-slate-200">${fmtMoney(c.tcv)}</Td>
                        <Td>
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {c.labelIds.map((id: string) => {
                              const l = data.labels.find((x: any) => x.id === id);
                              return l ? <LabelChip key={id} name={l.name} color={l.color} /> : null;
                            })}
                          </div>
                        </Td>
                        <Td><ReviewBadge status={c.reviewStatus} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {matches.invoices.length > 0 && (
            <Card>
              <h2 className="px-5 pt-4 text-sm font-semibold text-white">
                Invoices ({matches.invoices.length})
              </h2>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Invoice #</Th>
                      <Th>Customer</Th>
                      <Th>Date</Th>
                      <Th right>Amount</Th>
                      <Th>Status</Th>
                      <Th>Labels</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.invoices.map((i: any) => (
                      <tr key={i.id} className="hover:bg-slate-900/50">
                        <Td>
                          <Link href={`/contracts/${i.contractId}`} className="font-medium text-slate-200 hover:text-indigo-300">
                            {i.invoiceNumber}
                          </Link>
                        </Td>
                        <Td className="text-slate-300">{i.customer}</Td>
                        <Td className="text-slate-400">{fmtDate(i.invoiceDate)}</Td>
                        <Td right className="text-slate-200">${fmtMoney(i.amount)}</Td>
                        <Td><StatusBadge status={i.status} /></Td>
                        <Td>
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {i.labelIds.map((id: string) => {
                              const l = data.labels.find((x: any) => x.id === id);
                              return l ? <LabelChip key={id} name={l.name} color={l.color} /> : null;
                            })}
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
