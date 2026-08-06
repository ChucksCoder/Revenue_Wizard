import { json, withUser } from "@/lib/api";
import { loadEngineContracts } from "@/lib/data";
import { computePortfolio } from "@/lib/engine";

export const GET = withUser(async () => {
  const inputs = await loadEngineContracts();
  const { months, byContract } = computePortfolio(inputs);
  return json({ months, byContract });
});
