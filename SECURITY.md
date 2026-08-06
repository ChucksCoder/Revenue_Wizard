# Revenue Hub Security Posture

Assessed against the ARR Tracker audit checklist (2026-06-10). Architecture:
Next.js on Vercel, Neon Postgres, session-cookie auth, Campfire sync server-side.

## Scorecard

| Area | Status | Notes |
|------|--------|-------|
| API authentication | SAFE | Every `/api/*` route requires a signed httpOnly session cookie (JWT, 14d) except login/setup/cron. Role checks (admin/preparer/reviewer) on sensitive routes; segregation of duties on approvals. |
| Secrets in client bundle | SAFE | No tokens ship to the browser. Session cookie is httpOnly + secure; Campfire key, Slack webhook, cron secret are server-side env only. |
| Database exposure | OPS ACTION | Neon is internet-reachable by design (TLS enforced by Neon). Treat `DATABASE_URL` as a secret. Optional hardening: Neon IP Allow (paid plans) restricted to Vercel egress; use a role scoped to this schema instead of the owner role. |
| TLS / security headers | FIXED | HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy set on every response (next.config.ts). |
| Rate limiting | FIXED (scoped) | Login: 10 attempts / 5 min per IP; setup: 5 / 10 min. In-memory per serverless instance - a brake, not a global cap; bcrypt cost adds ~100ms per attempt. All other routes require a valid session. |
| Request body size | PLATFORM | Vercel caps request bodies (~4.5 MB) before they reach the app. |
| Container as root | N/A | No container; Vercel managed runtime. |
| Audit trail | SAFE (better) | Per-user audit log on every create/update/delete/submit/approve with field-level before/after diffs. Sign-off status exportable. |
| SQL injection | SAFE | All queries via Drizzle ORM with bound parameters; search inputs are bound values, never concatenated. |
| Campfire API key | SAFE | Outbound-only from server routes; never in responses or client code. |
| CSRF | SAFE (default) | Cookie is SameSite=Lax; state-changing routes are POST/PATCH/DELETE, which Lax excludes cross-site. |
| Session forgery | FIXED | Production refuses to run without AUTH_SECRET (no known-fallback signing). Cron endpoint uses constant-time secret comparison. |

## Operator checklist

1. `AUTH_SECRET`: long random value in Vercel (production now hard-fails without it).
2. `CRON_SECRET`: long random value; rotate if ever pasted anywhere.
3. `DATABASE_URL`: keep secret; Neon enforces TLS. Optional: Neon IP Allow.
4. `CAMPFIRE_API_KEY` / `SLACK_WEBHOOK_URL`: env only, never in chat/email/commits.
5. Rotate any secret that leaks; all are single-place env vars.
6. Team accounts: use the reviewer role for segregation of duties; remove users promptly in Settings when people leave.
