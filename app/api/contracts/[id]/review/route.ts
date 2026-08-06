import { NextRequest } from "next/server";
import { contracts } from "@/lib/schema";
import { json, err, withUser } from "@/lib/api";
import { reviewAction } from "@/lib/review";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { action } = await req.json();
  if (!["submit", "approve", "reopen"].includes(action)) return err("Invalid action");
  const result = await reviewAction(user, contracts, "contract", id, action);
  if ("error" in result) return err(result.error, result.status);
  return json({ ok: true });
});
