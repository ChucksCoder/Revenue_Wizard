import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/schema";
import { json, err, withUser } from "@/lib/api";

export const GET = withUser(async () => {
  const rows = await db.select().from(customers);
  return json({ customers: rows.sort((a, b) => a.name.localeCompare(b.name)) });
});

export const POST = withUser(async (_user, req: NextRequest) => {
  const { name } = await req.json();
  if (!name?.trim()) return err("Customer name required");
  const [row] = await db
    .insert(customers)
    .values({ name: name.trim() })
    .onConflictDoNothing()
    .returning();
  return json({ customer: row ?? null });
});
