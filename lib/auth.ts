import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const COOKIE = "revrec_session";

function secret() {
  // In production a missing AUTH_SECRET would mean sessions signed with a
  // publicly known fallback - forgeable by anyone. Hard-fail instead.
  if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "preparer" | "reviewer";
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as SessionUser["role"],
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new AuthError("Not authenticated");
  return s;
}

export class AuthError extends Error {}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as SessionUser["role"],
    };
  } catch {
    return null;
  }
}

export async function anyUsersExist(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

export async function findUserByEmail(email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

export const SESSION_COOKIE = COOKIE;
