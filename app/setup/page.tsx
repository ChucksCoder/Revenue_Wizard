"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, api } from "@/components/ui";
import { Sparkles } from "lucide-react";

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/setup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/30">
            <Sparkles size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-white">Welcome to Revenue Hub</h1>
          <p className="mt-1 text-center text-sm text-slate-500">
            Create the first admin account. You can add preparers and reviewers in
            Settings afterward.
          </p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
        >
          <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input
            label="Password (8+ characters)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating..." : "Create admin account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
