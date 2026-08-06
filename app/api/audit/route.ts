import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/schema";
import { desc, eq, and } from "drizzle-orm";
import { json, withUser } from "@/lib/api";

export const GET = withUser(async (_user, req: NextRequest) => {
  const entityType = req.nextUrl.searchParams.get("entityType");
  const entityId = req.nextUrl.searchParams.get("entityId");
  const conditions = [];
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (entityId) conditions.push(eq(auditLog.entityId, entityId));
  const rows = await db
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(200);
  return json({ entries: rows });
});
