"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Th, Td, ReviewBadge, api } from "@/components/ui";
import { Download, Search } from "lucide-react";

const PAGE_SIZE = 100;

const ACTION_STYLES: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-400",
  submitted: "bg-amber-500/15 text-amber-400",
  reopened: "bg-orange-500/15 text-orange-400",
  created: "bg-sky-500/15 text-sky-400",
  updated: "bg-slate-700/60 text-slate-300",
  deleted: "bg-rose-500/15 text-rose-400",
};

export default function AuditPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [userQ, setUserQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);
    if (userQ) params.set("user", userQ);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api(`/api/audit?${params}`)
      .then((d) => {
        setEntries(d.entries);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }, [entityType, action, userQ, from, to, page]);
  useEffect(load, [load]);

  const dlParams = new URLSearchParams();
  if (from) dlParams.set("from", from);
  if (to) dlParams.set("to", to);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Audit Trail</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every change, submission and approval - who, what, when. The download includes a
            sign-off status sheet for every contract and invoice.
          </p>
        </div>
        <a href={`/api/export/audit?${dlParams}`}>
          <Button>
            <span className="inline-flex items-center gap-1.5">
              <Download size={14} /> Download audit log (.xlsx)
            </span>
          </Button>
        </a>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <select value={entityType} onChange={(e) => { setPage(0); setEntityType(e.target.value); }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none">
          <option value="">All types</option>
          <option value="contract">Contracts</option>
          <option value="invoice">Invoices</option>
          <option value="tranche">Tranches</option>
          <option value="user">Users</option>
          <option value="label">Labels</option>
          <option value="settings">Settings / Sync</option>
        </select>
        <select value={action} onChange={(e) => { setPage(0); setAction(e.target.value); }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none">
          <option value="">All actions</option>
          <option value="approved">Approved</option>
          <option value="submitted">Submitted</option>
          <option value="reopened">Reopened</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="deleted">Deleted</option>
        </select>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2.5 text-slate-600" />
          <input
            value={userQ}
            onChange={(e) => { setPage(0); setUserQ(e.target.value); }}
            placeholder="Filter by user..."
            className="w-44 rounded-lg border border-slate-700 bg-slate-900 py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">From</span>
          <input type="date" value={from} onChange={(e) => { setPage(0); setFrom(e.target.value); }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">To</span>
          <input type="date" value={to} onChange={(e) => { setPage(0); setTo(e.target.value); }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none" />
        </label>
        <span className="pb-2 text-xs text-slate-500">
          {total} entries · page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </span>
        <div className="flex gap-1 pb-1">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>User</Th>
              <Th>Action</Th>
              <Th>Type</Th>
              <Th>Entity</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><Td colSpan={6} className="py-10 text-center text-slate-600">Loading...</Td></tr>
            )}
            {!loading && entries.length === 0 && (
              <tr><Td colSpan={6} className="py-10 text-center text-slate-600">No audit entries match.</Td></tr>
            )}
            {!loading &&
              entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-900/50">
                  <Td className="whitespace-nowrap text-slate-400">
                    {new Date(e.createdAt).toLocaleString()}
                  </Td>
                  <Td className="text-slate-200">{e.userName}</Td>
                  <Td>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${ACTION_STYLES[e.action] ?? ACTION_STYLES.updated}`}>
                      {e.action}
                    </span>
                  </Td>
                  <Td className="capitalize text-slate-500">{e.entityType}</Td>
                  <Td>
                    {e.entityType === "contract" ? (
                      <Link href={`/contracts/${e.entityId}`} className="text-slate-300 hover:text-indigo-300">
                        {e.entityName}
                      </Link>
                    ) : (
                      <span className="text-slate-300">{e.entityName}</span>
                    )}
                  </Td>
                  <td className="max-w-lg border-b border-slate-800/50 px-3 py-2 text-xs">
                    {e.detail?.changes && Object.keys(e.detail.changes).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(e.detail.changes).map(([k, v]: [string, any]) => (
                          <span key={k} className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-1.5 py-0.5">
                            <span className="text-slate-400">{k}:</span>
                            <span className="text-rose-300/80 line-through">{String(v?.from ?? "—")}</span>
                            <span className="text-slate-600">→</span>
                            <span className="text-emerald-300">{String(v?.to ?? "—")}</span>
                          </span>
                        ))}
                        {e.detail.source === "campfire-sync" && (
                          <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-orange-300">via Campfire sync</span>
                        )}
                      </div>
                    ) : e.detail ? (
                      <span className="block truncate text-slate-600" title={JSON.stringify(e.detail)}>
                        {JSON.stringify(e.detail)}
                      </span>
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
