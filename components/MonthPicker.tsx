"use client";

import { useMonth } from "@/lib/month";
import { CalendarDays } from "lucide-react";

export default function MonthPicker() {
  const { month, setMonth } = useMonth();
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
      <CalendarDays size={14} className="text-indigo-400" />
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Close month</span>
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="bg-transparent text-sm font-semibold text-white outline-none"
      />
    </label>
  );
}
