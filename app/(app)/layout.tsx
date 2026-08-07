import AppShell from "@/components/AppShell";
import { getSession } from "@/lib/auth";
import { MonthProvider } from "@/lib/month";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <MonthProvider>
      <AppShell user={user}>{children}</AppShell>
    </MonthProvider>
  );
}
