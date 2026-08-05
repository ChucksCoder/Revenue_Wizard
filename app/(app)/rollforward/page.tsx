"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Th, Td, api } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { monthLabel } from "@/lib/engine";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

export default function RollforwardPage() {
  const [months, setMonths] = useState<any[]>([]);
  const [byContract, setByContract] = useState<any[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/rollforward").then((d) => {
      setMonths(d.months);
      setByContract(d.byContract);
      setLoading(false);
    });
  }, []);

  const rows = useMemo(() => {
    // rollforward presentation: begin DR, billings, rev rec, end DR + CA
    let prevDR = 0;
    let prevCA = 0;
    return months.map((m) => {
      const row = {
        ...m,
        beginDeferred: prevDR,
        beginContractAsset: prevCA,
      };
      prevDR = m.endDeferred;
      prevCA = m.endContractAsset;
      return row;
    });
  }, [months]);

  if (loading)
    return <div className="py-24 text-center text-slate-500">Building rollforward...</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Rollforward</h1>
          <p className="mt-1 text-sm text-slate-500">
            Deferred revenue and contract assets, every month from inception. Click a month for the by-contract detail.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                onToggle={() =>
                  setExpandedMonth(expandedMonth === m.month ? null : m.month)
                }
              />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
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
