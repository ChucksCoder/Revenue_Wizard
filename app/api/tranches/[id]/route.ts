import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { tranches } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit, buildChanges } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser(async (user, req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const [existing] = await db.select().from(tranches).where(eq(tranches.id, id));
  if (!existing) return err("Tranche not found", 404);
  const updates: Record<string, unknown> = {};
  for (const k of ["name", "startDate", "endDate", "seats", "sortOrder", "notes"]) {
    if (k in body) updates[k] = body[k];
  }
  for (const k of ["pricePerSeat", "amount"]) {
    if (k in body) updates[k] = body[k] != null ? String(body[k]) : null;
  }
  if (Object.keys(updates).length === 0) return err("Nothing to update");
  const changes = buildChanges(existing as any, updates);
  await db.update(tranches).set(updates).where(eq(tranches.id, id));
  if (Object.keys(changes).length > 0)
    await logAudit(user, "tranche", id, "updated", { changes, tranche: existing.name });
  const [row] = await db.select().from(tranches).where(eq(tranches.id, id));
  return json({ tranche: row });
});

export const DELETE = withUser(async (user, _req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await db.delete(tranches).where(eq(tranches.id, id));
  await logAudit(user, "tranche", id, "deleted");
  return json({ ok: true });
});
