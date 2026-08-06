import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { runCampfireSync, campfireConfigured } from "@/lib/campfireSync";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily Campfire sync, invoked by Vercel Cron (see vercel.json).
// Vercel sends Authorization: Bearer <CRON_SECRET> automatically when the
// CRON_SECRET env var is set. Window: trailing 3 days (idempotent upserts
// make the overlap harmless; it just catches stragglers).
// Afterwards posts a summary to Slack via SLACK_WEBHOOK_URL if configured.

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function postSlack(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return res.ok;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (
    !process.env.CRON_SECRET ||
    !secretsMatch(auth, `Bearer ${process.env.CRON_SECRET}`)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!campfireConfigured()) {
    await postSlack(":warning: Revenue Hub daily sync skipped - CAMPFIRE_API_KEY is not set.");
    return Response.json({ ok: false, error: "CAMPFIRE_API_KEY not set" }, { status: 200 });
  }

  // Contracts: only ones created/modified in Campfire in the last ~25h
  // (the sync itself only creates contracts we don't already have).
  // Invoices: dated in the trailing 3 days, plus full schedules for any
  // newly created contracts. All upserts are idempotent.
  const now = new Date();
  const modifiedSince = new Date(now.getTime() - 25 * 3600000).toISOString();
  const to = now;
  const from = new Date(now.getTime() - 3 * 86400000);
  const appUrl = process.env.APP_URL ?? "https://revenue-wizard.vercel.app";

  try {
    const report = await runCampfireSync(null, iso(from), iso(to), { modifiedSince });
    const lines = [
      `:fire: *Revenue Hub - daily Campfire sync* (new/changed in last 24h)`,
      `Contracts: ${report.contractsSeen} seen, *${report.contractsCreated} new* (created as drafts${report.contractsCreated > 0 ? " - review + add tranches for ramp deals" : ""})`,
      `Invoices: ${report.invoicesSeen} seen, *${report.invoicesCreated} new*, ${report.invoicesUpdated} updated`,
    ];
    if (report.conflicts.length > 0) {
      lines.push(`:rotating_light: *${report.conflicts.length} conflicts need review:*`);
      for (const c of report.conflicts.slice(0, 8)) lines.push(`• ${c}`);
      if (report.conflicts.length > 8) lines.push(`• ...and ${report.conflicts.length - 8} more`);
    } else {
      lines.push(":white_check_mark: No conflicts.");
    }
    lines.push(`<${appUrl}|Open Revenue Hub> · <${appUrl}/reconciliation|Reconciliation>`);
    const slackOk = await postSlack(lines.join("\n"));
    return Response.json({ ok: true, report, slackPosted: slackOk });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await postSlack(`:x: *Revenue Hub daily Campfire sync failed:* ${msg}`);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
