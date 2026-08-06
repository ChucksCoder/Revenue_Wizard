import { NextRequest } from "next/server";
import { json, err, withUser } from "@/lib/api";
import { runCampfireSync, campfireConfigured } from "@/lib/campfireSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withUser(async () => {
  return json({
    configured: campfireConfigured(),
    slackConfigured: Boolean(process.env.SLACK_WEBHOOK_URL),
    cronConfigured: Boolean(process.env.CRON_SECRET),
  });
});

export const POST = withUser(
  async (user, req: NextRequest) => {
    if (!campfireConfigured())
      return err(
        "CAMPFIRE_API_KEY is not set. Add it in Vercel -> Settings -> Environment Variables and redeploy.",
        400
      );
    const body = await req.json().catch(() => ({}));
    try {
      const report = await runCampfireSync(user, body.from || null, body.to || null);
      return json({ ok: true, report });
    } catch (e) {
      return err(e instanceof Error ? e.message : "Sync failed", 502);
    }
  },
  { roles: ["admin", "preparer"] }
);
