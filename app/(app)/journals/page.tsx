"use client";

import { useEffect, useState } from "react";
import { Button, Card, Th, Td, api } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { monthLabel } from "@/lib/engine";
import { useMonth } from "@/lib/month";
import MonthPicker from "@/components/MonthPicker";
import { Download, CheckCircle2, AlertTriangle } from "lucide-react";

export default function JournalsPage() {
  const { month } = useMonth();
  const [lines, setLines] = useState<any[]>([]);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/api/journals?month=${month}`)
      .then((d) => {
        setLines(d.lines);
        setTotals(d.totals);
      })
      .finally(() => setLoading(false));
  }, [month]);

  const balanced = Math.abs(totals.debit - totals.credit) < 0.005;
  const billing = lines.filter((l) => l.entryType === "billing");
  const recognition = lines.filter((l) => l.entryType === "recognition");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Journal Entries</h1>
          <p className="mt-1 text-sm text-slate-500">
            System-computed JEs for {monthLabel(month)} - billings (AR / deferred / tax) and revenue recognition.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker />
          <a href={`/api/export/netsuite?month=${month}`}>
            <Button variant="secondary">
              <span className="inline-flex items-center gap-1.5"><Download size={14} /> NetSuite CSV</span>
            </Button>
          </a>
          <a href={`/api/export/workbook?asOf=${month}`}>
            <Button variant="secondary">
              <span className="inline-flex items-center gap-1.5"><Download size={14} /> Excel</span>
            </Button>
          </a>
        </div>
      </div>

      <div
        className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
          balanced
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-rose-500/30 bg-rose-500/10 text-rose-300"
        }`}
      >
        {balanced ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        Debits ${fmtMoney(totals.debit)} / Credits ${fmtMoney(totals.credit)}
        {balanced ? " - entry balances" : " - OUT OF BALANCE, do not post"}
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500">Computing entries...</div>
      ) : (
        <>
          <JeTable title={`Revenue recognition (${recognition.length} lines)`} lines={recognition} />
          <JeTable title={`Billings (${billing.length} lines)`} lines={billing} />
        </>
      )}
    </div>
  );
}

function JeTable({ title, lines }: { title: string; lines: any[] }) {
  return (
    <Card>
      <h2 className="px-5 pt-4 text-sm font-semibold text-white">{title}</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Account</Th>
              <Th>Memo</Th>
              <Th right>Debit</Th>
              <Th right>Credit</Th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><Td colSpan={5} className="py-6 text-center text-slate-600">No entries this month.</Td></tr>
            )}
            {lines.map((l, i) => (
              <tr key={i} className="hover:bg-slate-900/50">
                <Td className="text-slate-300">{l.customer}</Td>
                <Td className="text-slate-400">
                  <span className="mr-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">{l.account}</span>
                  {l.accountName}
                </Td>
                <Td className="max-w-md truncate text-slate-500">{l.memo}</Td>
                <Td right className="text-slate-200">{l.debit ? fmtMoney(l.debit) : ""}</Td>
                <Td right className="text-slate-200">{l.credit ? fmtMoney(l.credit) : ""}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
