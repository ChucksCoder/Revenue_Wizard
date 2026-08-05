import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { labels } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const GET = withUser(async () => {
  const rows = await db.select().from(labels);
  return json({ labels: rows });
});

export const POST = withUser(async (user, req: NextRequest) => {
  const { name, color } = await req.json();
  if (!name?.trim()) return err("Label name required");
  const [row] = await db
    .insert(labels)
    .values({ name: name.trim(), color: color || "#6366f1" })
    .onConflictDoNothing()
    .returning();
  if (row) await logAudit(user, "label", row.id, "created", { name });
  return json({ label: row ?? null });
});

export const DELETE = withUser(async (user, req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return err("id required");
  await db.delete(labels).where(eq(labels.id, id));
  await logAudit(user, "label", id, "deleted");
  return json({ ok: true });
});
