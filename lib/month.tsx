"use client";

import { createContext, useContext, useEffect, useState } from "react";

// The close month anchors every screen. Default: last calendar month
// (you close July in August).
function defaultMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

const MonthContext = createContext<{
  month: string;
  setMonth: (m: string) => void;
}>({ month: defaultMonth(), setMonth: () => {} });

export function MonthProvider({ children }: { children: React.ReactNode }) {
  const [month, setMonthState] = useState(defaultMonth());
  useEffect(() => {
    const saved = window.localStorage.getItem("closeMonth");
    if (saved && /^\d{4}-\d{2}$/.test(saved)) setMonthState(saved);
  }, []);
  const setMonth = (m: string) => {
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    setMonthState(m);
    window.localStorage.setItem("closeMonth", m);
  };
  return (
    <MonthContext.Provider value={{ month, setMonth }}>{children}</MonthContext.Provider>
  );
}

export function useMonth() {
  return useContext(MonthContext);
}
