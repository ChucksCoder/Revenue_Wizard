"use client";

import { useState } from "react";
import { Button, api } from "./ui";
import { CheckCircle2, Send, RotateCcw } from "lucide-react";

export default function ReviewActions({
  entity,
  id,
  reviewStatus,
  role,
  onDone,
  size = "sm",
}: {
  entity: "contracts" | "invoices";
  id: string;
  reviewStatus: string;
  role: string;
  onDone: () => void;
  size?: "sm" | "md";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/${entity}/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {reviewStatus === "draft" && ["preparer", "admin"].includes(role) && (
        <Button size={size} variant="secondary" disabled={busy} onClick={() => act("submit")}>
          <span className="inline-flex items-center gap-1"><Send size={12} /> Submit</span>
        </Button>
      )}
      {reviewStatus === "in_review" && ["reviewer", "admin"].includes(role) && (
        <Button size={size} variant="success" disabled={busy} onClick={() => act("approve")}>
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> Approve</span>
        </Button>
      )}
      {reviewStatus !== "draft" && (
        <Button size={size} variant="ghost" disabled={busy} onClick={() => act("reopen")}>
          <span className="inline-flex items-center gap-1"><RotateCcw size={12} /> Reopen</span>
        </Button>
      )}
      {error && <span className="max-w-[240px] text-[11px] text-rose-400">{error}</span>}
    </span>
  );
}
