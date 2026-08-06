import { NextRequest } from "next/server";
import { json, err, withUser } from "@/lib/api";
import { loadEngineContracts } from "@/lib/data";
import { computeContract } from "@/lib/engine";

type Ctx = { params: Promise<{ contractId: string }> };

export const GET = withUser(async (_user, _req: NextRequest, ctx: Ctx) => {
  const { contractId } = await ctx.params;
  const [input] = await loadEngineContracts([contractId]);
  if (!input) return err("Contract not found", 404);
  return json({ computation: computeContract(input) });
});
