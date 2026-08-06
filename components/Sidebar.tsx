"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  TrendingUp,
  Scale,
  BookOpen,
  ShieldCheck,
  Tag,
  Settings,
  LogOut,
  Sparkles,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";

const NAV: { section: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    section: "Monthly close",
    items: [
      { href: "/", label: "Close", icon: LayoutDashboard },
      { href: "/rollforward", label: "Worksheet", icon: TrendingUp },
      { href: "/reconciliation", label: "Reconciliation", icon: Scale },
      { href: "/journals", label: "Journal Entries", icon: BookOpen },
      { href: "/audit", label: "Audit Trail", icon: ShieldCheck },
    ],
  },
  {
    section: "Records",
    items: [
      { href: "/contracts", label: "Contracts", icon: FileText },
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/labels", label: "Labels", icon: Tag },
    ],
  },
  {
    section: "Admin",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-800/80 bg-slate-950">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
          <Sparkles size={18} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Revenue Hub</div>
          <div className="text-[11px] text-slate-500">Coder Technologies</div>
        </div>
      </div>
      <nav className="mt-2 flex-1 space-y-4 overflow-y-auto px-3">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              {section}
            </div>
            <div className="space-y-0.5">
              {items.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-indigo-500/10 text-indigo-300"
                        : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    }`}
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-800/80 p-4">
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-indigo-300">
            {user.name
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-200">{user.name}</div>
            <div className="text-[11px] capitalize text-slate-500">{user.role}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-300"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  );
}
