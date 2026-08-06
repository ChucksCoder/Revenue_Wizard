"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Select, Th, Td, LabelChip, api } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { Plus, Trash2, RefreshCw } from "lucide-react";

function CampfireSync() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [cronConfigured, setCronConfigured] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/sync/campfire")
      .then((d) => {
        setConfigured(d.configured);
        setSlackConfigured(Boolean(d.slackConfigured));
        setCronConfigured(Boolean(d.cronConfigured));
      })
      .catch(() => setConfigured(false));
  }, []);

  async function sync() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const d = await api("/api/sync/campfire", {
        method: "POST",
        body: JSON.stringify({ from: from || null, to: to || null }),
      });
      setResult(d.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-white">Campfire sync</h2>
      <p className="mb-3 text-xs text-slate-500">
        Pulls contracts and invoices from Campfire. New contracts arrive as drafts for review;
        approved items are never overwritten - changes to them surface as conflicts. Tranches
        (license release schedules) stay manual: enter them from the signed order form.
      </p>
      {configured === false && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          CAMPFIRE_API_KEY is not set. Add it in Vercel → Settings → Environment Variables
          (never share the key in chat or email), redeploy, and this button goes live.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Input label="From (optional)" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To (optional)" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button onClick={sync} disabled={busy || configured === false}>
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            {busy ? "Syncing..." : "Sync from Campfire"}
          </span>
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-slate-600">
        The window applies to contract start dates and invoice dates - e.g. 2026-08-01 to
        2026-08-05 grabs deals and billings from those days. Leave blank for everything.
        New contracts also pull their full future invoice schedule automatically.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className={`rounded-full px-2 py-0.5 ${cronConfigured ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
          Daily 9am MT auto-sync: {cronConfigured ? "on" : "off - set CRON_SECRET"}
        </span>
        <span className={`rounded-full px-2 py-0.5 ${slackConfigured ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
          Slack summary: {slackConfigured ? "on" : "off - set SLACK_WEBHOOK_URL"}
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      {result && (
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-slate-300">
            {result.contractsSeen} contracts seen · <span className="text-emerald-400">{result.contractsCreated} created</span> ·{" "}
            {result.invoicesSeen} invoices seen · <span className="text-emerald-400">{result.invoicesCreated} created</span>,{" "}
            {result.invoicesUpdated} updated
          </p>
          {result.conflicts.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-1 text-xs font-semibold text-amber-300">
                {result.conflicts.length} conflicts (nothing changed - resolve manually):
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-400">
                {result.conflicts.map((c: string, i: number) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const user = useUser();
  const [users, setUsers] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "preparer" });
  const [newLabel, setNewLabel] = useState({ name: "", color: "#6366f1" });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(() => {
    api("/api/labels").then((d) => setLabels(d.labels));
    api("/api/users").then((d) => setUsers(d.users)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function addUser() {
    setError("");
    setOk("");
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(newUser) });
      setNewUser({ name: "", email: "", password: "", role: "preparer" });
      setOk("User created");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function addLabel() {
    if (!newLabel.name.trim()) return;
    await api("/api/labels", { method: "POST", body: JSON.stringify(newLabel) });
    setNewLabel({ name: "", color: "#6366f1" });
    load();
  }

  async function deleteLabel(id: string) {
    if (!confirm("Delete this label? It will be removed from all contracts and invoices.")) return;
    await api(`/api/labels?id=${id}`, { method: "DELETE" });
    load();
  }

  async function setRole(id: string, role: string) {
    await api("/api/users", { method: "PATCH", body: JSON.stringify({ id, role }) });
    load();
  }

  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Team, roles and labels.</p>
      </div>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-white">Team</h2>
        <p className="mb-4 text-xs text-slate-500">
          Preparers create and submit; reviewers approve. Segregation of duties is enforced -
          nobody can approve an item they prepared. Admins can do both (on different items).
        </p>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td className="text-slate-200">{u.name}</Td>
                <Td className="text-slate-400">{u.email}</Td>
                <Td>
                  {isAdmin && u.id !== user?.id ? (
                    <select
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none"
                    >
                      <option value="preparer">Preparer</option>
                      <option value="reviewer">Reviewer</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className="capitalize text-slate-400">{u.role}</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {isAdmin && (
          <div className="mt-4 grid grid-cols-5 items-end gap-3 border-t border-slate-800 pt-4">
            <Input label="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <Input label="Email" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <Input label="Password" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <Select label="Role" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="preparer">Preparer</option>
              <option value="reviewer">Reviewer</option>
              <option value="admin">Admin</option>
            </Select>
            <Button onClick={addUser} disabled={!newUser.name || !newUser.email || newUser.password.length < 8}>
              <span className="inline-flex items-center gap-1"><Plus size={14} /> Add user</span>
            </Button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
        {ok && <p className="mt-2 text-sm text-emerald-400">{ok}</p>}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-white">Labels</h2>
        <p className="mb-4 text-xs text-slate-500">
          Tag contracts and invoices - e.g. &quot;Multi-year&quot;, &quot;Ramp deal&quot;, &quot;Audit sample FY26&quot;, &quot;Needs Campfire recon&quot;.
        </p>
        <div className="flex flex-wrap gap-2">
          {labels.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1">
              <LabelChip name={l.name} color={l.color} />
              <button onClick={() => deleteLabel(l.id)} className="text-slate-600 hover:text-rose-400">
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-end gap-3">
          <Input label="New label" value={newLabel.name} onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })} placeholder="Ramp deal" />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Color</span>
            <input
              type="color"
              value={newLabel.color}
              onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value })}
              className="h-9 w-14 cursor-pointer rounded-lg border border-slate-700 bg-slate-900"
            />
          </label>
          <Button onClick={addLabel} disabled={!newLabel.name.trim()}>
            <span className="inline-flex items-center gap-1"><Plus size={14} /> Add label</span>
          </Button>
        </div>
      </Card>

      <CampfireSync />

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-white">Accounting policy</h2>
        <div className="space-y-1 text-sm text-slate-400">
          <p>SSP split default: 20% license (point-in-time, close month) / 80% support (ratable, daily rate). Overridable per contract.</p>
          <p>Multi-year contracts with annual billing recognize full license upfront - the excess of recognition over billings is carried as a contract asset and relieved by subsequent invoices.</p>
          <p>Billing source of truth: Campfire. JE export target: NetSuite (CSV journal import).</p>
        </div>
      </Card>
    </div>
  );
}
