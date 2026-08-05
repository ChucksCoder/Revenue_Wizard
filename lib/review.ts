import { db } from "./db";
import { contracts, invoices } from "./schema";
import { eq } from "drizzle-orm";
import { logAudit } from "./audit";
import type { SessionUser } from "./auth";

type Table = typeof contracts | typeof invoices;

/**
 * Shared review workflow with segregation of duties:
 *  - submit:  preparer or admin; draft -> in_review, stamps preparer
 *  - approve: reviewer or admin; must not be the preparer; -> approved
 *  - reopen:  any authenticated user; -> draft, clears approval
 */
export async function reviewAction(
  user: SessionUser,
  table: Table,
  entityType: "contract" | "invoice",
  id: string,
  action: "submit" | "approve" | "reopen"
): Promise<{ ok: true } | { error: string; status: number }> {
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) return { error: `${entityType} not found`, status: 404 };

  if (action === "submit") {
    if (!["preparer", "admin"].includes(user.role))
      return { error: "Only preparers or admins can submit for review", status: 403 };
    await db
      .update(table)
      .set({
        reviewStatus: "in_review",
        preparedById: user.id,
        preparedAt: new Date(),
        approvedById: null,
        approvedAt: null,
      })
      .where(eq(table.id, id));
    await logAudit(user, entityType, id, "submitted");
    return { ok: true };
  }

  if (action === "approve") {
    if (!["reviewer", "admin"].includes(user.role))
      return { error: "Only reviewers or admins can approve", status: 403 };
    if (row.reviewStatus !== "in_review")
      return { error: "Must be submitted for review before approval", status: 400 };
    if (row.preparedById === user.id)
      return {
        error: "Segregation of duties: you prepared this item and cannot approve it",
        status: 403,
      };
    await db
      .update(table)
      .set({ reviewStatus: "approved", approvedById: user.id, approvedAt: new Date() })
      .where(eq(table.id, id));
    await logAudit(user, entityType, id, "approved");
    return { ok: true };
  }

  // reopen
  await db
    .update(table)
    .set({ reviewStatus: "draft", approvedById: null, approvedAt: null })
    .where(eq(table.id, id));
  await logAudit(user, entityType, id, "reopened");
  return { ok: true };
}
