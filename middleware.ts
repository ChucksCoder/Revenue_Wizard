import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/setup", "/api/auth/login", "/api/setup", "/api/cron"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  const token = req.cookies.get("revrec_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    // never verify sessions against the known dev fallback in production
    return NextResponse.json({ error: "Server misconfigured: AUTH_SECRET missing" }, { status: 500 });
  }
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret || "dev-secret-change-me"));
      return NextResponse.next();
    } catch {
      // fall through
    }
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
