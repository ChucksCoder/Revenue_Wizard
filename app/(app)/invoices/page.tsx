"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Th, Td, ReviewBadge, StatusBadge, api } from "@/components/ui";
import LabelPicker from "@/components/LabelPicker";
import ReviewActions from "@/components/ReviewActions";
import InvoiceModal from "@/components/InvoiceModal";
import { useUser } from "@/lib/useUser";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Pencil, Search } from "lucide-react";

const PAGE_SIZE = 50;

export default function InvoicesPage() {
  const user = useUser();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [sums, setSums] = useState({ net: 0, tax: 0 });
  const [allLabels, setAllLabels] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      q,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (statusFilter) params.set("status", statusFilter);
    if (reviewFilter) params.set("review", reviewFilter);
    api(`/api/invoices?${params}`)
      .then((d) => {
        setInvoices(d.invoices);
        setTotal(d.total);
        setSums(d.sums);
        setAllLabels(d.allLabels);
      })
      .finally(() => setLoading(false));
  }, [q, page, statusFilter, reviewFilter]);
  useEffect(load, [load]);

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
          {total} invoices matching · ${fmtMoney(sums.net)} net (+${fmtMoney(sums.tax)} tax)
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setQ(search);
          }}
          className="relative"
        >
          <Search size={14} className="absolute left-3 top-2.5 text-slate-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice #, customer, contract, Campfire ref... press Enter"
            className="w-96 rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
          />
        </form>
        <select value={statusFilter} onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <select value={reviewFilter} onChange={(e) => { setPage(0); setReviewFilter(e.target.value); }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none">
          <option value="">All review states</option>
          <option value="draft">Draft</option>
          <option value="in_review">In review</option>
          <option value="approved">Approved</option>
        </select>
        <span className="text-xs text-slate-500">
          page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
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
            {!loading && invoices.length === 0 && (
              <tr><Td colSpan={11} className="py-10 text-center text-slate-600">No invoices found.</Td></tr>
            )}
            {!loading &&
              invoices.map((i) => (
                <tr key={i.id} className="hover:bg-slate-900/50">
                  <Td className="font-medium text-slate-200">{i.invoiceNumber}</Td>
                  <Td>
                    <Link href={`/contracts/${i.contractId}`} className="text-slate-300 hover:text-indigo-300">
                      {i.customerName}
                    </Link>
                  </Td>
                  <Td className="max-w-[220px] truncate text-slate-500">{i.contractName}</Td>
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
