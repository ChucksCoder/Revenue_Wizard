import { getSession } from "@/lib/auth";
import { json } from "@/lib/api";

export async function GET() {
  const user = await getSession();
  return json({ user });
}
