"use client";

import { useEffect, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import type { SessionUser } from "@/lib/auth";

/**
 * Client shell that lets the sidebar collapse out of the way so the data
 * area gets the full viewport width. Preference persists in localStorage.
 */
export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("sidebarHidden") === "1") setHidden(true);
  }, []);

  function toggle() {
    setHidden((h) => {
      localStorage.setItem("sidebarHidden", h ? "0" : "1");
      return !h;
    });
  }

  return (
    <div className="flex min-h-screen">
      {!hidden && <Sidebar user={user} onHide={toggle} />}
      {hidden && (
        <button
          onClick={toggle}
          title="Show sidebar"
          className="fixed left-3 top-3 z-40 rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 shadow-lg hover:bg-slate-800 hover:text-slate-200"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}
      <main className={`min-w-0 flex-1 ${hidden ? "ml-0 py-8 pl-16 pr-8" : "ml-60 p-8"}`}>
        {children}
      </main>
    </div>
  );
}
