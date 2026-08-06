import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { MonthProvider } from "@/lib/month";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <MonthProvider>
      <div className="flex min-h-screen">
        <Sidebar user={user} />
        <main className="ml-60 min-w-0 flex-1 p-8">{children}</main>
      </div>
    </MonthProvider>
  );
}
