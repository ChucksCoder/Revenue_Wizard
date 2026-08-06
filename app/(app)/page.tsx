"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Stat, Th, Td, ReviewBadge, api } from "@/components/ui";
import { fmtMoney, fmtMoney0 } from "@/lib/format";
import { monthLabel } from "@/lib/engine";
import { ArrowRight } from "lucide-react";

interface PortfolioMonth {
  month: string;
  billings: number;
  licenseRec: number;
  supportRec: number;
  totalRec: number;
  endDeferred: number;
  endContractAsset: number;
}

export default function Dashboard() {
  const [months, setMonths] = useState<PortfolioMonth[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api("/api/rollforward"), api("/api/contracts")])
      .then(([rf, c]) => {
        setMonths(rf.months);
        setContracts(c.contracts);
      })
      .finally(() => setLoading(false));
  }, []);

  const nowMk = new Date().toISOString().slice(0, 7);
  const current =
    months.filter((m) => m.month <= nowMk).slice(-1)[0] ?? months[0];
  const pendingContracts = contracts.filter((c) => c.reviewStatus === "in_review");
  const draftContracts = contracts.filter((c) => c.reviewStatus === "draft");
  const pendingInvoices = contracts.flatMap((c: any) =>
    c.invoices.filter((i: any) => i.reviewStatus === "in_review").map((i: any) => ({ ...i, contractName: c.name, customerName: c.customerName }))
  );

  if (loading)
    return <div className="py-24 text-center text-slate-500">Loading portfolio...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {current ? `Position as of ${monthLabel(current.month)}` : "Add your first contract to get started"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Deferred Revenue"
          value={`$${fmtMoney0(current?.endDeferred ?? 0)}`}
          sub="ending balance"
          accent="indigo"
        />
        <Stat
          label="Contract Assets"
          value={`$${fmtMoney0(current?.endContractAsset ?? 0)}`}
          sub="ending balance"
          accent="sky"
        />
        <Stat
          label="Revenue This Month"
          value={`$${fmtMoney0(current?.totalRec ?? 0)}`}
          sub={current ? `license $${fmtMoney0(current.licenseRec)} / support $${fmtMoney0(current.supportRec)}` : ""}
          accent="emerald"
        />
        <Stat
          label="Awaiting Review"
          value={String(pendingContracts.length + pendingInvoices.length)}
          sub={`${pendingContracts.length} contracts, ${pendingInvoices.length} invoices`}
          accent="amber"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Next 12 months</h2>
            <Link href="/rollforward" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
              Full rollforward <ArrowRight size={12} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th right>Billings</Th>
                  <Th right>Revenue</Th>
                  <Th right>Deferred</Th>
                  <Th right>Contract Asset</Th>
                </tr>
              </thead>
              <tbody>
                {months
                  .filter((m) => m.month >= nowMk)
                  .slice(0, 12)
                  .map((m) => (
                    <tr key={m.month} className="hover:bg-slate-900/60">
                      <Td>{monthLabel(m.month)}</Td>
                      <Td right>{fmtMoney(m.billings)}</Td>
                      <Td right className="text-emerald-400">{fmtMoney(m.totalRec)}</Td>
                      <Td right>{fmtMoney(m.endDeferred)}</Td>
                      <Td right>{fmtMoney(m.endContractAsset)}</Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Review queue</h2>
            <Link href="/contracts" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
              All contracts <ArrowRight size={12} />
            </Link>
          </div>
          {pendingContracts.length + pendingInvoices.length + draftContracts.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">
              Nothing waiting on review.
            </p>
          ) : (
            <div className="space-y-1.5">
              {pendingContracts.map((c) => (
                <Link
                  key={c.id}
                  href={`/contracts/${c.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-800/60 px-3 py-2 hover:bg-slate-900"
                >
                  <div>
                    <div className="text-sm text-slate-200">{c.customerName}</div>
                    <div className="text-xs text-slate-500">{c.name}</div>
                  </div>
                  <ReviewBadge status={c.reviewStatus} />
                </Link>
              ))}
              {pendingInvoices.slice(0, 6).map((i: any) => (
                <Link
                  key={i.id}
                  href={`/contracts/${i.contractId}`}
                  className="flex items-center justify-between rounded-lg border border-slate-800/60 px-3 py-2 hover:bg-slate-900"
                >
                  <div>
                    <div className="text-sm text-slate-200">
                      {i.invoiceNumber} <span className="text-slate-500">· {i.customerName}</span>
                    </div>
                    <div className="text-xs text-slate-500">${fmtMoney(i.amount)}</div>
                  </div>
                  <ReviewBadge status={i.reviewStatus} />
                </Link>
              ))}
              {draftContracts.slice(0, 4).map((c) => (
                <Link
                  key={c.id}
                  href={`/contracts/${c.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-800/60 px-3 py-2 opacity-70 hover:bg-slate-900"
                >
                  <div>
                    <div className="text-sm text-slate-200">{c.customerName}</div>
                    <div className="text-xs text-slate-500">{c.name}</div>
                  </div>
                  <ReviewBadge status={c.reviewStatus} />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
