"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  Th,
  Td,
  ReviewBadge,
  StatusBadge,
  api,
} from "@/components/ui";
import LabelPicker from "@/components/LabelPicker";
import ReviewActions from "@/components/ReviewActions";
import InvoiceModal from "@/components/InvoiceModal";
import { useUser } from "@/lib/useUser";
import { fmtMoney, fmtDate, num } from "@/lib/format";
import { Pencil, Search } from "lucide-react";

export default function InvoicesPage() {
  const user = useUser();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [allLabels, setAllLabels] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api("/api/invoices").then((d) => {
      setInvoices(d.invoices);
      setAllLabels(d.allLabels);
      setLoading(false);
    });
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter((i) => {
      if (
        q &&
        ![i.invoiceNumber, i.customerName, i.contractName, i.externalRef ?? ""].some((s) =>
          s.toLowerCase().includes(q)
        )
      )
        return false;
      if (labelFilter && !i.labels.some((l: any) => l.id === labelFilter)) return false;
      if (statusFilter && i.status !== statusFilter) return false;
      if (reviewFilter && i.reviewStatus !== reviewFilter) return false;
      return true;
    });
  }, [invoices, search, labelFilter, statusFilter, reviewFilter]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (a, i) =>
          i.status === "void"
            ? a
            : { net: a.net + num(i.amount), tax: a.tax + num(i.taxAmount) },
        { net: 0, tax: 0 }
      ),
    [filtered]
  );

  async function setLabels(invoiceId: string, labelIds: string[]) {
    await api(`/api/invoices/${invoiceId}`, {
      method: "PATCH",
      body: JSON.stringify({ labelIds }),
    });
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Invoices</h1>
        <p className="mt-1 text-sm text-slate-500">
          {filtered.length} invoices · ${fmtMoney(totals.net)} net (+${fmtMoney(totals.tax)} tax) · contract shown as a data point
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, customer, Campfire ref..."
            className="w-72 rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none">
          <option value="">All labels</option>
          {allLabels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none">
          <option value="">All review states</option>
          <option value="draft">Draft</option>
          <option value="in_review">In review</option>
          <option value="approved">Approved</option>
        </select>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Invoice #</Th>
              <Th>Customer</Th>
              <Th>Contract</Th>
              <Th>Campfire Ref</Th>
              <Th>Date</Th>
              <Th right>Amount</Th>
              <Th right>Tax</Th>
              <Th>Status</Th>
              <Th>Labels</Th>
              <Th>Review</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><Td colSpan={11} className="py-10 text-center text-slate-600">Loading...</Td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><Td colSpan={11} className="py-10 text-center text-slate-600">No invoices found.</Td></tr>
            )}
            {filtered.map((i) => (
              <tr key={i.id} className="hover:bg-slate-900/50">
                <Td className="font-medium text-slate-200">{i.invoiceNumber}</Td>
                <Td>
                  <Link href={`/contracts/${i.contractId}`} className="text-slate-300 hover:text-indigo-300">
                    {i.customerName}
                  </Link>
                </Td>
                <Td className="text-slate-500">{i.contractName}</Td>
                <Td className="text-slate-500">{i.externalRef ?? "-"}</Td>
                <Td className="text-slate-400">{fmtDate(i.invoiceDate)}</Td>
                <Td right className="text-slate-200">${fmtMoney(i.amount)}</Td>
                <Td right className="text-slate-500">${fmtMoney(i.taxAmount)}</Td>
                <Td><StatusBadge status={i.status} /></Td>
                <Td>
                  <LabelPicker
                    allLabels={allLabels}
                    selected={i.labels}
                    onChange={(ids) => setLabels(i.id, ids)}
                    onLabelsCreated={load}
                  />
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <ReviewBadge status={i.reviewStatus} />
                    <ReviewActions entity="invoices" id={i.id} reviewStatus={i.reviewStatus} role={user?.role ?? ""} onDone={load} />
                  </div>
                </Td>
                <Td right>
                  <button className="text-slate-500 hover:text-slate-200" onClick={() => setEditing(i)}>
                    <Pencil size={14} />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editing && (
        <InvoiceModal
          contractId={editing.contractId}
          invoice={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
