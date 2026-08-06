import { db } from "./db";
import { auditLog } from "./schema";
import type { SessionUser } from "./auth";

export async function logAudit(
  user: SessionUser | null,
  entityType: string,
  entityId: string,
  action: string,
  detail?: unknown
) {
  await db.insert(auditLog).values({
    entityType,
    entityId,
    action,
    userId: user?.id ?? null,
    userName: user?.name ?? "system",
    detail: detail ?? null,
  });
}
