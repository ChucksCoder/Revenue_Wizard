import { NextRequest } from "next/server";
import { err, withUser } from "@/lib/api";

export const dynamic = "force-dynamic";

// Streams a Campfire attachment through to the browser using the server-side
// API key. Nothing is stored - the file lives in Campfire; we only pass it
// through, gated behind our session auth.
const BASE = process.env.CAMPFIRE_API_BASE ?? "https://api.meetcampfire.com";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (_user, req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return err("Invalid file id");
  if (!process.env.CAMPFIRE_API_KEY) return err("CAMPFIRE_API_KEY is not set", 400);

  const name = req.nextUrl.searchParams.get("name") ?? `campfire-file-${id}`;
  const upstream = await fetch(`${BASE}/ca/api/file/${id}/download`, {
    headers: { Authorization: `Token ${process.env.CAMPFIRE_API_KEY}` },
    cache: "no-store",
    redirect: "follow",
  });
  if (!upstream.ok || !upstream.body)
    return err(`Campfire file fetch failed (HTTP ${upstream.status})`, 502);

  const safeName = name.replace(/[^\w.\- ()]/g, "_");
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});
