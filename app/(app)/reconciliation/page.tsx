"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Th, Td, api } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { monthLabel } from "@/lib/engine";
import { buildRecRows } from "@/lib/rec";
import { useMonth } from "@/lib/month";
import MonthPicker from "@/components/MonthPicker";
import { Download } from "lucide-react";

export default function ReconciliationPage() {
  const { month: asOf } = useMonth();
  const [byContract, setByContract] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/rollforward").then((d) => {
      setByContract(d.byContract);
      setLoading(false);
    });
  }, []);

  const rows = useMemo(() => buildRecRows(byContract, asOf), [byContract, asOf]);
  const t = (get: (r: any) => number) => fmtMoney(rows.reduce((a, r) => a + get(r), 0));
  const checksPass = rows.every((r) => Math.abs(r.check) < 0.01);

  if (loading)
    return <div className="py-24 text-center text-slate-500">Building reconciliation...</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Deferred Revenue Reconciliation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Total consideration less revenue recognized, less future billings = deferred
            revenue. Revenue runs on the full contract; deferred only holds what&#39;s billed.
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
          ? `All ${rows.length} contracts tie: bridge method equals ledger method (billings - recognized) as of ${monthLabel(asOf)}.`
          : "Some contracts don't tie - their invoices don't sum to TCV. See the Check column."}
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
            {rows.map((r) => (
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
              <td className="sticky left-0 z-10 border-b border-slate-800/50 bg-slate-900 px-3 py-2 text-sm text-white">TOTAL</td>
              <Td right className="text-violet-300">{t((r) => r.licTotal)}</Td>
              <Td right className="text-slate-200">{t((r) => r.supTotal)}</Td>
              <Td right className="text-white">{t((r) => r.tcv)}</Td>
              <Td right className="text-violet-300">({t((r) => r.cumLic)})</Td>
              <Td right className="text-slate-200">({t((r) => r.cumSup)})</Td>
              <Td right className="text-slate-200">{t((r) => r.unearned)}</Td>
              <Td right className="text-amber-300">({t((r) => r.futureBill)})</Td>
              <Td right className="text-rose-400">({t((r) => r.unbilled)})</Td>
              <Td right className="text-indigo-300">{t((r) => r.deferred)}</Td>
              <Td right className="text-sky-300">{t((r) => r.contractAsset)}</Td>
              <Td />
            </tr>
          </tbody>
        </table>
        <p className="border-t border-slate-800/60 px-4 py-3 text-xs text-slate-500">
          Revenue is recognized on total consideration regardless of billing cadence. Deferred
          revenue = unearned consideration less amounts not yet billed. A negative bridge is a
          contract asset (earned, unbilled). The Check column ties this bridge to the ledger
          method (billed to date less recognized to date) - a variance means invoices don&#39;t
          sum to TCV on that contract. &quot;Unbilled Gap&quot; is TCV never scheduled for billing.
        </p>
      </Card>
    </div>
  );
}
