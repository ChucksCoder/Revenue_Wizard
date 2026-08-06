// Minimal in-memory rate limiter for hot endpoints (login, setup).
// Serverless caveat: state is per-instance, so this slows attacks rather than
// hard-capping them globally - combined with bcrypt's cost per attempt that's
// an effective brake for an internal tool. No external dependency needed.

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  if (b.count > max)
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
