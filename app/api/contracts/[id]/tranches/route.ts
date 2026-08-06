import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { tranches } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const { name, startDate, endDate, seats, pricePerSeat, amount, sortOrder, notes } = body;
  if (!name || !startDate || !endDate || amount == null)
    return err("Name, dates and amount are required");
  const existing = await db.select().from(tranches).where(eq(tranches.contractId, id));
  const [row] = await db
    .insert(tranches)
    .values({
      contractId: id,
      name,
      startDate,
      endDate,
      seats: seats ?? null,
      pricePerSeat: pricePerSeat != null ? String(pricePerSeat) : null,
      amount: String(amount),
      sortOrder: sortOrder ?? existing.length,
      notes: notes || null,
    })
    .returning();
  await logAudit(user, "tranche", row.id, "created", { contractId: id, name, amount });
  return json({ tranche: row });
});
