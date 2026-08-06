"use client";

import { useState } from "react";
import { Button, Input, Select, Modal, api } from "./ui";
import { fmtMoney, num } from "@/lib/format";

export default function InvoiceModal({
  contractId,
  invoice,
  onClose,
  onSaved,
}: {
  contractId: string;
  invoice: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    invoiceNumber: invoice?.invoiceNumber ?? "",
    externalRef: invoice?.externalRef ?? "",
    invoiceDate: invoice?.invoiceDate ?? "",
    periodStart: invoice?.periodStart ?? "",
    periodEnd: invoice?.periodEnd ?? "",
    amount: invoice?.amount != null ? String(invoice.amount) : "",
    taxRate: invoice?.taxRate != null ? String(invoice.taxRate) : "0",
    status: invoice?.status ?? "issued",
    description: invoice?.description ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const tax = Math.round(num(f.amount) * num(f.taxRate) * 100) / 100;

  async function submit() {
    setBusy(true);
    setError("");
    const payload = {
      contractId,
      invoiceNumber: f.invoiceNumber,
      externalRef: f.externalRef || null,
      invoiceDate: f.invoiceDate,
      periodStart: f.periodStart || null,
      periodEnd: f.periodEnd || null,
      amount: Number(f.amount || 0),
      taxRate: Number(f.taxRate || 0),
      status: f.status,
      description: f.description || null,
    };
    try {
      if (invoice) {
        await api(`/api/invoices/${invoice.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/invoices", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <Modal title={invoice ? `Edit ${invoice.invoiceNumber}` : "Add invoice"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Invoice number" value={f.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} placeholder="INV-1042" />
        <Input label="Campfire ref" value={f.externalRef} onChange={(e) => set("externalRef", e.target.value)} placeholder="CF-..." />
        <Input label="Invoice date" type="date" value={f.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} />
        <Select label="Status" value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="void">Void (excluded)</option>
        </Select>
        <Input label="Service period start" type="date" value={f.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
        <Input label="Service period end" type="date" value={f.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
        <Input label="Amount (pre-tax $)" type="number" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
        <Input label={`Sales tax rate (tax: $${fmtMoney(tax)})`} type="number" step="0.001" value={f.taxRate} onChange={(e) => set("taxRate", e.target.value)} />
        <div className="col-span-2">
          <Input label="Description" value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !f.invoiceNumber || !f.invoiceDate || !f.amount}>
          {busy ? "Saving..." : "Save invoice"}
        </Button>
      </div>
    </Modal>
  );
}
