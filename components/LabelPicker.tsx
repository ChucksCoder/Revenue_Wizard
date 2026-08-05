"use client";

import { useState } from "react";
import { Tag, Plus } from "lucide-react";
import { LabelChip, api } from "./ui";

export interface LabelData {
  id: string;
  name: string;
  color: string;
}

const PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#f43f5e", "#84cc16"];

export default function LabelPicker({
  allLabels,
  selected,
  onChange,
  onLabelsCreated,
}: {
  allLabels: LabelData[];
  selected: LabelData[];
  onChange: (labelIds: string[]) => void;
  onLabelsCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const selectedIds = new Set(selected.map((l) => l.id));

  async function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  async function createLabel() {
    if (!newName.trim()) return;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const d = await api("/api/labels", {
      method: "POST",
      body: JSON.stringify({ name: newName.trim(), color }),
    });
    setNewName("");
    onLabelsCreated?.();
    if (d.label) onChange([...selectedIds, d.label.id]);
  }

  return (
    <div className="relative inline-block">
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((l) => (
          <LabelChip key={l.id} name={l.name} color={l.color} />
        ))}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-700 px-2 py-0.5 text-[11px] text-slate-500 hover:border-slate-500 hover:text-slate-300"
        >
          <Tag size={10} /> {selected.length === 0 ? "Add label" : ""}
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
            {allLabels.map((l) => (
              <button
                key={l.id}
                onClick={() => toggle(l.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-800 ${
                  selectedIds.has(l.id) ? "bg-slate-800/80" : ""
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="flex-1">{l.name}</span>
                {selectedIds.has(l.id) && <span className="text-indigo-400">✓</span>}
              </button>
            ))}
            <div className="mt-1 flex items-center gap-1 border-t border-slate-800 pt-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createLabel()}
                placeholder="New label..."
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-indigo-500"
              />
              <button onClick={createLabel} className="rounded-md bg-indigo-500 p-1 text-white hover:bg-indigo-400">
                <Plus size={12} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
