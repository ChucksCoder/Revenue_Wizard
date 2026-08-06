import { db } from "./db";
import { auditLog } from "./schema";
import type { SessionUser } from "./auth";

/**
 * Field-level diff for audit logging: { field: { from, to } } for every key
 * whose value actually changed. Values compared as strings so numeric columns
 * stored as strings diff correctly.
 */
export function buildChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys?: string[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys ?? Object.keys(after)) {
    const b = (before as any)[k] ?? null;
    const a = (after as any)[k] ?? null;
    if (String(b ?? "") !== String(a ?? "")) changes[k] = { from: b, to: a };
  }
  return changes;
}

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
