"use client";

import { use, useCallback, useEffect, useState } from "react";
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
  api,
} from "@/components/ui";
import LabelPicker from "@/components/LabelPicker";
import ReviewActions from "@/components/ReviewActions";
import InvoiceModal from "@/components/InvoiceModal";
import { useUser } from "@/lib/useUser";
import { useMonth } from "@/lib/month";
import { fmtMoney, fmtDate, num } from "@/lib/format";
import { monthLabel } from "@/lib/engine";
import { campfireContractUrl, campfireInvoiceUrl } from "@/lib/links";
import { ArrowLeft, Plus, Trash2, Pencil, Wand2, ExternalLink, Flame, Cloud, FileText } from "lucide-react";

const TABS = ["Overview", "Tranches", "Invoices", "Schedule", "Activity"] as const;

export default function ContractDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useUser();
  const [contract, setContract] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [allLabels, setAllLabels] = useState<any[]>([]);
  const [computation, setComputation] = useState<any>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api(`/api/contracts/${id}`).then((d) => {
      setContract(d.contract);
      setActivity(d.activity);
    });
    api("/api/labels").then((d) => setAllLabels(d.labels));
    api(`/api/schedule/${id}`)
      .then((d) => setComputation(d.computation))
      .catch(() => setComputation(null));
  }, [id]);
  useEffect(load, [load]);

  if (!contract)
    return <div className="py-24 text-center text-slate-500">Loading contract...</div>;

  async function patch(fields: Record<string, unknown>) {
    setError("");
    try {
      await api(`/api/contracts/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/contracts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
        <ArrowLeft size={14} /> Contracts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">{contract.customerName}</h1>
            <ReviewBadge status={contract.reviewStatus} />
            <StatusBadge status={contract.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {contract.name}
            {contract.contractNumber ? ` · ${contract.contractNumber}` : ""} ·{" "}
            {fmtDate(contract.startDate)} → {fmtDate(contract.endDate)} · ${fmtMoney(contract.tcv)} TCV
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <LabelPicker
              allLabels={allLabels}
              selected={contract.labels}
              onChange={(labelIds) => patch({ labelIds })}
              onLabelsCreated={load}
            />
            {campfireContractUrl(contract.campfireId) && (
              <a
                href={campfireContractUrl(contract.campfireId)!}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-medium text-orange-300 hover:bg-orange-500/20"
              >
                <Flame size={11} /> Campfire <ExternalLink size={9} />
              </a>
            )}
            {contract.crmLink && (
              <a
                href={contract.crmLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20"
              >
                <Cloud size={11} /> Salesforce <ExternalLink size={9} />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReviewActions
            entity="contracts"
            id={id}
            reviewStatus={contract.reviewStatus}
            role={user?.role ?? ""}
            onDone={load}
            size="md"
          />
        </div>
      </div>

      {(contract.preparedAt || contract.approvedAt) && (
        <p className="text-xs text-slate-600">
          {contract.preparedAt && `Submitted ${new Date(contract.preparedAt).toLocaleString()}`}
          {contract.approvedAt && ` · Approved ${new Date(contract.approvedAt).toLocaleString()}`}
        </p>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-indigo-500 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
            {t === "Tranches" && contract.tranches.length > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-800 px-1.5 text-[10px]">{contract.tranches.length}</span>
            )}
            {t === "Invoices" && contract.invoices.length > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-800 px-1.5 text-[10px]">{contract.invoices.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview contract={contract} computation={computation} onSave={patch} />}
      {tab === "Tranches" && <Tranches contract={contract} reload={load} />}
      {tab === "Invoices" && <Invoices contract={contract} reload={load} role={user?.role ?? ""} allLabels={allLabels} />}
      {tab === "Schedule" && <Schedule computation={computation} />}
      {tab === "Activity" && <Activity activity={activity} />}
    </div>
  );
}

// ------------------------------------------------------------------ Overview

function Overview({ contract, computation, onSave }: { contract: any; computation: any; onSave: (f: any) => void }) {
  const [f, setF] = useState({
    name: contract.name,
    contractNumber: contract.contractNumber ?? "",
    billingModel: contract.billingModel,
    startDate: contract.startDate,
    endDate: contract.endDate,
    tcv: String(contract.tcv),
    licensePct: String(contract.licensePct),
    billingFrequency: contract.billingFrequency,
    dayCount: contract.dayCount,
    status: contract.status,
    notes: contract.notes ?? "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify({
    name: contract.name,
    contractNumber: contract.contractNumber ?? "",
    billingModel: contract.billingModel,
    startDate: contract.startDate,
    endDate: contract.endDate,
    tcv: String(contract.tcv),
    licensePct: String(contract.licensePct),
    billingFrequency: contract.billingFrequency,
    dayCount: contract.dayCount,
    status: contract.status,
    notes: contract.notes ?? "",
  });

  const lic = num(f.tcv) * num(f.licensePct);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="col-span-2 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Contract terms</h2>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Contract name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          <Input label="Contract #" value={f.contractNumber} onChange={(e) => set("contractNumber", e.target.value)} />
          <Input label="Start date" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
          <Input label="End date" type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
          <Input label="TCV" type="number" value={f.tcv} onChange={(e) => set("tcv", e.target.value)} />
          <Input label="License % (SSP)" type="number" step="0.01" value={f.licensePct} onChange={(e) => set("licensePct", e.target.value)} />
          <Select label="Billing model" value={f.billingModel} onChange={(e) => set("billingModel", e.target.value)}>
            <option value="flat">Flat</option>
            <option value="tranched">Tranched</option>
            <option value="tiered">Tiered</option>
          </Select>
          <Select label="Billing frequency" value={f.billingFrequency} onChange={(e) => set("billingFrequency", e.target.value)}>
            <option value="annual">Annual</option>
            <option value="quarterly">Quarterly</option>
            <option value="monthly">Monthly</option>
            <option value="upfront">Upfront</option>
            <option value="custom">Custom</option>
          </Select>
          <Select label="Day count" value={f.dayCount} onChange={(e) => set("dayCount", e.target.value)}>
            <option value="inclusive">Inclusive of start date</option>
            <option value="exclusive">Exclusive of start date</option>
          </Select>
          <Select label="Contract status" value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option>
            <option value="complete">Complete</option>
            <option value="cancelled">Cancelled (excluded from rev rec)</option>
          </Select>
          <div className="col-span-2">
            <Input label="Notes / fact pattern" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        {dirty && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <span className="text-xs text-amber-300">
              Unsaved changes{contract.reviewStatus === "approved" ? " - saving will reopen the approval" : ""}
            </span>
            <Button size="sm" onClick={() => onSave({ ...f, tcv: num(f.tcv), licensePct: num(f.licensePct) })}>
              Save changes
            </Button>
          </div>
        )}
      </Card>
      <div className="space-y-4">
        {contract.tranches.length > 0 && <LicenseRelease contract={contract} />}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">SSP allocation</h2>
          <SspBreakdown contract={contract} licensePct={num(f.licensePct)} tcv={num(f.tcv)} />
        </Card>
        {Array.isArray(contract.attachments) && contract.attachments.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-white">Order forms & attachments</h2>
            <p className="mb-3 text-xs text-slate-500">
              Stored in Campfire - streamed here on demand, never copied.
            </p>
            <div className="space-y-1.5">
              {contract.attachments.map((a: any) => (
                <a
                  key={a.id}
                  href={`/api/files/campfire/${a.id}?name=${encodeURIComponent(a.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300 hover:border-indigo-500/50 hover:text-white"
                >
                  <FileText size={14} className="shrink-0 text-slate-500" />
                  <span className="truncate">{a.name}</span>
                  <ExternalLink size={11} className="ml-auto shrink-0 text-slate-600" />
                </a>
              ))}
            </div>
          </Card>
        )}
        {computation && (
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">Current position</h2>
            {(() => {
              const nowMk = new Date().toISOString().slice(0, 7);
              const row =
                computation.rollforward.filter((r: any) => r.month <= nowMk).slice(-1)[0] ??
                computation.rollforward[0];
              if (!row) return <p className="text-sm text-slate-600">No schedule yet.</p>;
              return (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">As of</span><span className="text-slate-300">{monthLabel(row.month)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Deferred revenue</span><span className="tabular text-indigo-300">${fmtMoney(row.endDeferred)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Contract asset</span><span className="tabular text-sky-300">${fmtMoney(row.endContractAsset)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Rev this month</span><span className="tabular text-emerald-300">${fmtMoney(row.totalRec)}</span></div>
                </div>
              );
            })()}
          </Card>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- SSP breakdown

function SspBreakdown({
  contract,
  licensePct,
  tcv,
}: {
  contract: any;
  licensePct: number;
  tcv: number;
}) {
  const { month } = useMonth();
  const tranched = contract.tranches.length > 0;
  // tranched: allocation comes from the tranches; license splits into
  // released (tranches whose start month has arrived) vs future releases
  const base = tranched
    ? contract.tranches.reduce((a: number, t: any) => a + num(t.amount), 0)
    : tcv;
  const licTotal = base * licensePct;
  const releasedLic = tranched
    ? contract.tranches
        .filter((t: any) => t.startDate.slice(0, 7) <= month)
        .reduce((a: number, t: any) => a + num(t.amount) * licensePct, 0)
    : licTotal;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-slate-500">
          License ({(licensePct * 100).toFixed(0)}%{tranched ? ", released per tranche" : ", point-in-time"})
        </span>
        <span className="tabular text-slate-200">${fmtMoney(licTotal)}</span>
      </div>
      {tranched && (
        <>
          <div className="flex justify-between pl-4">
            <span className="text-slate-500">Released through {monthLabel(month)}</span>
            <span className="tabular text-violet-300">${fmtMoney(releasedLic)}</span>
          </div>
          <div className="flex justify-between pl-4">
            <span className="text-slate-500">Future tranche releases</span>
            <span className="tabular text-amber-300/90">${fmtMoney(licTotal - releasedLic)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between">
        <span className="text-slate-500">Support ({((1 - licensePct) * 100).toFixed(0)}%, ratable)</span>
        <span className="tabular text-slate-200">${fmtMoney(base - licTotal)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        {tranched ? (
          <div className="flex h-full">
            <div className="h-full bg-violet-500" style={{ width: `${(releasedLic / base) * 100}%` }} />
            <div className="h-full bg-amber-500/50" style={{ width: `${((licTotal - releasedLic) / base) * 100}%` }} />
          </div>
        ) : (
          <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${licensePct * 100}%` }} />
        )}
      </div>
      {tranched && (
        <p className="text-[11px] text-slate-600">
          Only released license has hit the P&L - see the release schedule for tranche dates.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------- License release

function LicenseRelease({ contract }: { contract: any }) {
  const { month } = useMonth();
  const pct = num(contract.licensePct);
  const tranches = [...contract.tranches].sort((a: any, b: any) =>
    a.startDate.localeCompare(b.startDate)
  );
  const released = tranches.filter((t: any) => t.startDate.slice(0, 7) <= month);
  const releasedLic = released.reduce((a: number, t: any) => a + num(t.amount) * pct, 0);
  const totalLic = tranches.reduce((a: number, t: any) => a + num(t.amount) * pct, 0);
  const releasedTCV = released.reduce((a: number, t: any) => a + num(t.amount), 0);
  const totalTCV = tranches.reduce((a: number, t: any) => a + num(t.amount), 0);
  const remainingTCV = totalTCV - releasedTCV;
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-white">License release schedule</h2>
      <p className="mb-3 text-xs text-slate-500">
        Licenses deliver per tranche - not all TCV up front. Through {monthLabel(month)}:{" "}
        <span className="text-violet-300">${fmtMoney(releasedLic)}</span> of ${fmtMoney(totalLic)}{" "}
        license released.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-slate-800 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Released TCV</div>
          <div className="tabular text-slate-200">${fmtMoney(releasedTCV)}</div>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-400/80">Not yet released</div>
          <div className="tabular text-amber-300">${fmtMoney(remainingTCV)}</div>
        </div>
      </div>
      <div className="space-y-1.5">
        {tranches.map((t: any) => {
          const isReleased = t.startDate.slice(0, 7) <= month;
          return (
            <div
              key={t.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm ${
                isReleased ? "border-violet-500/30 bg-violet-500/5" : "border-slate-800"
              }`}
            >
              <span className={isReleased ? "text-slate-200" : "text-slate-500"}>
                {t.name} · {fmtDate(t.startDate)}
              </span>
              <span className={`tabular ${isReleased ? "text-violet-300" : "text-slate-600"}`}>
                ${fmtMoney(num(t.amount) * pct)}
                <span className="ml-2 text-[10px] uppercase tracking-wider">
                  {isReleased ? "released" : "future"}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ Tranches

function Tranches({ contract, reload }: { contract: any; reload: () => void }) {
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const total = contract.tranches.reduce((a: number, t: any) => a + num(t.amount), 0);

  async function remove(id: string) {
    if (!confirm("Delete this tranche?")) return;
    await api(`/api/tranches/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Performance segments</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {contract.tranches.length === 0
              ? "No tranches - the whole contract is treated as one segment. Add tranches for ramped/tiered deals."
              : `License is taken point-in-time in each tranche's start month; support runs daily to the tranche end. Tranche total $${fmtMoney(total)} ${Math.abs(total - num(contract.tcv)) > 0.01 ? `(differs from TCV $${fmtMoney(contract.tcv)})` : "(ties to TCV)"}`}
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <span className="inline-flex items-center gap-1"><Plus size={13} /> Add tranche</span>
        </Button>
      </div>
      <div className="mt-3">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Tranche</Th>
              <Th>Start</Th>
              <Th>End</Th>
              <Th right>Seats</Th>
              <Th right>$ / seat / yr</Th>
              <Th right>Amount</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {contract.tranches.map((t: any) => (
              <tr key={t.id} className="hover:bg-slate-900/50">
                <Td className="text-slate-200">{t.name}</Td>
                <Td className="text-slate-400">{fmtDate(t.startDate)}</Td>
                <Td className="text-slate-400">{fmtDate(t.endDate)}</Td>
                <Td right className="text-slate-400">{t.seats ?? "-"}</Td>
                <Td right className="text-slate-400">{t.pricePerSeat ? fmtMoney(t.pricePerSeat) : "-"}</Td>
                <Td right className="font-medium text-slate-200">${fmtMoney(t.amount)}</Td>
                <Td right>
                  <button className="mr-2 text-slate-500 hover:text-slate-200" onClick={() => setEditing(t)}><Pencil size={14} /></button>
                  <button className="text-slate-500 hover:text-rose-400" onClick={() => remove(t.id)}><Trash2 size={14} /></button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(adding || editing) && (
        <TrancheModal
          contractId={contract.id}
          tranche={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </Card>
  );
}

function TrancheModal({
  contractId,
  tranche,
  onClose,
  onSaved,
}: {
  contractId: string;
  tranche: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: tranche?.name ?? "",
    startDate: tranche?.startDate ?? "",
    endDate: tranche?.endDate ?? "",
    seats: tranche?.seats != null ? String(tranche.seats) : "",
    pricePerSeat: tranche?.pricePerSeat != null ? String(tranche.pricePerSeat) : "",
    amount: tranche?.amount != null ? String(tranche.amount) : "",
    notes: tranche?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // convenience: amount = seats x price x term years if amount empty
  function suggestAmount() {
    if (f.seats && f.pricePerSeat && f.startDate && f.endDate) {
      const days =
        (new Date(f.endDate).getTime() - new Date(f.startDate).getTime()) / 86400000 + 1;
      const amt = num(f.seats) * num(f.pricePerSeat) * (days / 365.25);
      set("amount", amt.toFixed(2));
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    const payload = {
      name: f.name,
      startDate: f.startDate,
      endDate: f.endDate,
      seats: f.seats ? Number(f.seats) : null,
      pricePerSeat: f.pricePerSeat ? Number(f.pricePerSeat) : null,
      amount: Number(f.amount || 0),
      notes: f.notes || null,
    };
    try {
      if (tranche) {
        await api(`/api/tranches/${tranche.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api(`/api/contracts/${contractId}/tranches`, { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <Modal title={tranche ? "Edit tranche" : "Add tranche"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input label="Name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Tranche 1" />
        </div>
        <Input label="Start (license close month)" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
        <Input label="End (support runs to)" type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
        <Input label="Incremental seats (optional)" type="number" value={f.seats} onChange={(e) => set("seats", e.target.value)} />
        <Input label="Sales price / seat / yr (optional)" type="number" value={f.pricePerSeat} onChange={(e) => set("pricePerSeat", e.target.value)} onBlur={suggestAmount} />
        <div className="col-span-2">
          <Input label="Tranche amount ($)" type="number" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
        </div>
        <div className="col-span-2">
          <Input label="Notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !f.name || !f.startDate || !f.endDate || !f.amount}>
          {busy ? "Saving..." : "Save tranche"}
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Invoices

function Invoices({ contract, reload, role, allLabels }: { contract: any; reload: () => void; role: string; allLabels: any[] }) {
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const [genBusy, setGenBusy] = useState(false);

  async function remove(id: string) {
    if (!confirm("Delete this invoice?")) return;
    await api(`/api/invoices/${id}`, { method: "DELETE" });
    reload();
  }

  async function generate() {
    if (
      !confirm(
        `Generate draft invoices from the ${contract.billingFrequency} billing schedule? They'll be created as drafts for you to verify against Campfire.`
      )
    )
      return;
    setGenBusy(true);
    try {
      await api(`/api/contracts/${contract.id}/generate-invoices`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      reload();
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Invoices</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Campfire is the billing source of truth - key the Campfire reference on each
            invoice as you verify it.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={generate} disabled={genBusy}>
            <span className="inline-flex items-center gap-1"><Wand2 size={13} /> {genBusy ? "Generating..." : "Generate drafts"}</span>
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <span className="inline-flex items-center gap-1"><Plus size={13} /> Add invoice</span>
          </Button>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Invoice #</Th>
              <Th>Campfire Ref</Th>
              <Th>Date</Th>
              <Th>Service period</Th>
              <Th right>Amount</Th>
              <Th right>Tax</Th>
              <Th>Status</Th>
              <Th>Review</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {contract.invoices.length === 0 && (
              <tr><Td colSpan={9} className="py-8 text-center text-slate-600">No invoices yet.</Td></tr>
            )}
            {contract.invoices.map((i: any) => (
              <tr key={i.id} className="hover:bg-slate-900/50">
                <Td className="font-medium text-slate-200">{i.invoiceNumber}</Td>
                <Td>
                  {campfireInvoiceUrl(i.externalRef) ? (
                    <a
                      href={campfireInvoiceUrl(i.externalRef)!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-orange-300/90 hover:text-orange-200"
                    >
                      {i.externalRef} <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span className="text-slate-500">{i.externalRef ?? "-"}</span>
                  )}
                </Td>
                <Td className="text-slate-400">{fmtDate(i.invoiceDate)}</Td>
                <Td className="text-slate-500">
                  {i.periodStart ? `${fmtDate(i.periodStart)} → ${fmtDate(i.periodEnd)}` : "-"}
                </Td>
                <Td right className="text-slate-200">${fmtMoney(i.amount)}</Td>
                <Td right className="text-slate-500">${fmtMoney(i.taxAmount)}</Td>
                <Td><StatusBadge status={i.status} /></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <ReviewBadge status={i.reviewStatus} />
                    <ReviewActions entity="invoices" id={i.id} reviewStatus={i.reviewStatus} role={role} onDone={reload} />
                  </div>
                </Td>
                <Td right>
                  <button className="mr-2 text-slate-500 hover:text-slate-200" onClick={() => setEditing(i)}><Pencil size={14} /></button>
                  <button className="text-slate-500 hover:text-rose-400" onClick={() => remove(i.id)}><Trash2 size={14} /></button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(adding || editing) && (
        <InvoiceModal
          contractId={contract.id}
          invoice={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Schedule

function Schedule({ computation }: { computation: any }) {
  if (!computation)
    return <Card className="p-8 text-center text-sm text-slate-600">No schedule - check contract dates and TCV.</Card>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <Th>Month</Th>
            <Th right>License (PIT)</Th>
            <Th right>Support (ratable)</Th>
            <Th right>Total Rev</Th>
            <Th right>Billings</Th>
            <Th right>End Deferred</Th>
            <Th right>End Contract Asset</Th>
          </tr>
        </thead>
        <tbody>
          {computation.rollforward.map((r: any) => (
            <tr key={r.month} className={`hover:bg-slate-900/50 ${r.month === new Date().toISOString().slice(0, 7) ? "bg-indigo-500/5" : ""}`}>
              <Td className="font-medium text-slate-300">{monthLabel(r.month)}</Td>
              <Td right className={r.licenseRec ? "text-violet-300" : "text-slate-600"}>{fmtMoney(r.licenseRec)}</Td>
              <Td right className="text-slate-300">{fmtMoney(r.supportRec)}</Td>
              <Td right className="text-emerald-400">{fmtMoney(r.totalRec)}</Td>
              <Td right className={r.billings ? "text-slate-200" : "text-slate-600"}>{fmtMoney(r.billings)}</Td>
              <Td right className="text-indigo-300">{fmtMoney(r.endDeferred)}</Td>
              <Td right className="text-sky-300">{fmtMoney(r.endContractAsset)}</Td>
            </tr>
          ))}
          <tr className="bg-slate-900/80 font-semibold">
            <Td className="text-white">Total</Td>
            <Td right className="text-violet-300">{fmtMoney(computation.licenseTotal)}</Td>
            <Td right className="text-slate-200">{fmtMoney(computation.supportTotal)}</Td>
            <Td right className="text-emerald-400">{fmtMoney(computation.licenseTotal + computation.supportTotal)}</Td>
            <Td right className="text-slate-200">{fmtMoney(computation.rollforward.reduce((a: number, r: any) => a + r.billings, 0))}</Td>
            <Td /><Td />
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

// ------------------------------------------------------------------ Activity

function Activity({ activity }: { activity: any[] }) {
  return (
    <Card className="p-5">
      {activity.length === 0 && <p className="py-6 text-center text-sm text-slate-600">No activity yet.</p>}
      <div className="space-y-3">
        {activity.map((a) => (
          <div key={a.id} className="flex items-start gap-3 text-sm">
            <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
            <div>
              <span className="text-slate-200">{a.userName}</span>{" "}
              <span className="text-slate-500">{a.action}</span>{" "}
              <span className="text-slate-600">
                {new Date(a.createdAt).toLocaleString()}
              </span>
              {a.detail && (
                <div className="text-xs text-slate-600">{JSON.stringify(a.detail)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
