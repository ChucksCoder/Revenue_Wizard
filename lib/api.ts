import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wraps a route handler with auth + error handling. */
export function withUser<Args extends unknown[]>(
  fn: (user: SessionUser, ...args: Args) => Promise<Response>,
  opts?: { roles?: SessionUser["role"][] }
) {
  return async (...args: Args): Promise<Response> => {
    const user = await getSession();
    if (!user) return err("Not authenticated", 401);
    if (opts?.roles && !opts.roles.includes(user.role))
      return err("Insufficient permissions", 403);
    try {
      return await fn(user, ...args);
    } catch (e) {
      console.error(e);
      return err(e instanceof Error ? e.message : "Server error", 500);
    }
  };
}
