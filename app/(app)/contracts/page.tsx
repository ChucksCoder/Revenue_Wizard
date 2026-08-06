"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  Input,
  Select,
  Modal,
  Th,
  Td,
  ReviewBadge,
  StatusBadge,
  LabelChip,
  api,
} from "@/components/ui";
import LabelPicker from "@/components/LabelPicker";
import ReviewActions from "@/components/ReviewActions";
import { useUser } from "@/lib/useUser";
import { fmtMoney, fmtDate } from "@/lib/format";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";

const PAGE_SIZE = 50;

export default function ContractsPage() {
  const user = useUser();
  const [contracts, setContracts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [allLabels, setAllLabels] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [page, setPage] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      q,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (reviewFilter) params.set("review", reviewFilter);
    if (labelFilter) params.set("label", labelFilter);
    api(`/api/contracts?${params}`)
      .then((d) => {
        setContracts(d.contracts);
        setTotal(d.total);
        setAllLabels(d.allLabels);
      })
      .finally(() => setLoading(false));
  }, [q, page, reviewFilter, labelFilter]);
  useEffect(load, [load]);

  async function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!detail[id]) {
        const d = await api(`/api/contracts/${id}`);
        setDetail((prev) => ({ ...prev, [id]: d.contract }));
      }
    }
    setExpanded(next);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Contracts</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} contracts · expand a row for its invoices
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <span className="inline-flex items-center gap-1.5"><Plus size={15} /> New contract</span>
        </Button>
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
            placeholder="Search customer, contract, number... press Enter"
            className="w-80 rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
          />
        </form>
        <select
          value={labelFilter}
          onChange={(e) => { setPage(0); setLabelFilter(e.target.value); }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
        >
          <option value="">All labels</option>
          {allLabels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select
          value={reviewFilter}
          onChange={(e) => { setPage(0); setReviewFilter(e.target.value); }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
        >
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

      <Card>
        <table className="w-full">
          <thead>
            <tr>
              <Th></Th>
              <Th>Customer / Contract</Th>
              <Th>Model</Th>
              <Th>Term</Th>
              <Th right>TCV</Th>
              <Th right>Invoices</Th>
              <Th>Labels</Th>
              <Th>Review</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><Td colSpan={9} className="py-10 text-center text-slate-600">Loading...</Td></tr>
            )}
            {!loading && contracts.length === 0 && (
              <tr><Td colSpan={9} className="py-10 text-center text-slate-600">No contracts match.</Td></tr>
            )}
            {!loading &&
              contracts.map((c) => (
                <ContractRows
                  key={c.id}
                  c={c}
                  detail={detail[c.id]}
                  expanded={expanded.has(c.id)}
                  onToggle={() => toggle(c.id)}
                  allLabels={allLabels}
                  role={user?.role ?? ""}
                  reload={load}
                />
              ))}
          </tbody>
        </table>
      </Card>

      {showNew && (
        <NewContractModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ContractRows({
  c,
  detail,
  expanded,
  onToggle,
  allLabels,
  role,
  reload,
}: {
  c: any;
  detail: any;
  expanded: boolean;
  onToggle: () => void;
  allLabels: any[];
  role: string;
  reload: () => void;
}) {
  async function setLabels(labelIds: string[]) {
    await api(`/api/contracts/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ labelIds }),
    });
    reload();
  }

  return (
    <>
      <tr className="cursor-pointer hover:bg-slate-900/60" onClick={onToggle}>
        <Td className="w-8 pl-4">
          {expanded ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-500" />}
        </Td>
        <Td>
          <Link
            href={`/contracts/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-slate-100 hover:text-indigo-300"
          >
            {c.customerName}
          </Link>
          {c.trancheCount > 0 && (
            <span className="ml-2 rounded bg-violet-500/15 px-1.5 text-[10px] text-violet-300">
              {c.trancheCount} tranches
            </span>
          )}
          <div className="max-w-md truncate text-xs text-slate-500">
            {c.name}
            {c.contractNumber ? ` · ${c.contractNumber}` : ""}
          </div>
        </Td>
        <Td><span className="capitalize text-slate-400">{c.billingModel}</span></Td>
        <Td className="text-slate-400">
          {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
        </Td>
        <Td right className="font-medium text-slate-200">${fmtMoney(c.tcv)}</Td>
        <Td right className="text-slate-400">
          {c.invoiceCount} · ${fmtMoney(c.invoiceTotal)}
        </Td>
        <Td>
          <div onClick={(e) => e.stopPropagation()}>
            <LabelPicker
              allLabels={allLabels}
              selected={c.labels}
              onChange={setLabels}
              onLabelsCreated={reload}
            />
          </div>
        </Td>
        <Td><ReviewBadge status={c.reviewStatus} /></Td>
        <Td>
          <div onClick={(e) => e.stopPropagation()}>
            <ReviewActions
              entity="contracts"
              id={c.id}
              reviewStatus={c.reviewStatus}
              role={role}
              onDone={reload}
            />
          </div>
        </Td>
      </tr>
      {expanded && (
        <tr>
          <Td colSpan={9} className="bg-slate-950/60 !px-0 !py-0">
            <div className="mx-10 my-3 overflow-hidden rounded-xl border border-slate-800/80">
              {!detail ? (
                <div className="py-4 text-center text-xs text-slate-600">Loading invoices...</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-900/80">
                    <tr>
                      <Th>Invoice #</Th>
                      <Th>Campfire Ref</Th>
                      <Th>Date</Th>
                      <Th>Service Period</Th>
                      <Th right>Amount</Th>
                      <Th right>Tax</Th>
                      <Th>Status</Th>
                      <Th>Review</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.invoices.length === 0 && (
                      <tr><Td colSpan={8} className="py-4 text-center text-xs text-slate-600">No invoices - add them on the contract page</Td></tr>
                    )}
                    {detail.invoices.map((i: any) => (
                      <tr key={i.id} className="hover:bg-slate-900/40">
                        <Td>
                          <Link href={`/contracts/${c.id}`} className="text-slate-200 hover:text-indigo-300">
                            {i.invoiceNumber}
                          </Link>
                        </Td>
                        <Td className="text-slate-500">{i.externalRef ?? "-"}</Td>
                        <Td className="text-slate-400">{fmtDate(i.invoiceDate)}</Td>
                        <Td className="text-slate-500">
                          {i.periodStart ? `${fmtDate(i.periodStart)} → ${fmtDate(i.periodEnd)}` : "-"}
                        </Td>
                        <Td right className="text-slate-200">${fmtMoney(i.amount)}</Td>
                        <Td right className="text-slate-500">${fmtMoney(i.taxAmount)}</Td>
                        <Td><StatusBadge status={i.status} /></Td>
                        <Td><ReviewBadge status={i.reviewStatus} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Td>
        </tr>
      )}
    </>
  );
}

function NewContractModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [f, setF] = useState({
    customerName: "",
    name: "",
    contractNumber: "",
    billingModel: "flat",
    startDate: "",
    endDate: "",
    tcv: "",
    licensePct: "0.2",
    billingFrequency: "annual",
    dayCount: "exclusive",
    notes: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api("/api/contracts", {
        method: "POST",
        body: JSON.stringify({ ...f, tcv: Number(f.tcv || 0), licensePct: Number(f.licensePct) }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <Modal title="New contract" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Customer" value={f.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="Acme Corp" />
        <Input label="Contract name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme // New Business // 2026" />
        <Input label="Contract # (optional)" value={f.contractNumber} onChange={(e) => set("contractNumber", e.target.value)} />
        <Select label="Billing model" value={f.billingModel} onChange={(e) => set("billingModel", e.target.value)}>
          <option value="flat">Flat (single fee)</option>
          <option value="tranched">Tranched (licenses release over time)</option>
          <option value="tiered">Tiered (stepped pricing)</option>
        </Select>
        <Input label="Start date" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
        <Input label="End date" type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
        <Input label="Total contract value (TCV)" type="number" value={f.tcv} onChange={(e) => set("tcv", e.target.value)} />
        <Select label="Billing frequency" value={f.billingFrequency} onChange={(e) => set("billingFrequency", e.target.value)}>
          <option value="annual">Annual</option>
          <option value="quarterly">Quarterly</option>
          <option value="monthly">Monthly</option>
          <option value="upfront">Upfront</option>
          <option value="custom">Custom</option>
        </Select>
        <Input label="License % (SSP)" type="number" step="0.01" value={f.licensePct} onChange={(e) => set("licensePct", e.target.value)} />
        <Select label="Day count (support ratable)" value={f.dayCount} onChange={(e) => set("dayCount", e.target.value)}>
          <option value="exclusive">Exclusive of start date (house standard)</option>
          <option value="inclusive">Inclusive of start date</option>
        </Select>
        <div className="col-span-2">
          <Input label="Notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Fact pattern, SFDC opp, anything an auditor should know" />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        For tranched deals, add tranches on the contract page after creating - license
        recognizes point-in-time in each tranche&apos;s start month; support runs daily to
        the tranche end.
      </p>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !f.customerName || !f.name || !f.startDate || !f.endDate}>
          {busy ? "Creating..." : "Create contract"}
        </Button>
      </div>
    </Modal>
  );
}
