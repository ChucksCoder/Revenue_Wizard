import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { createSession, findUserByEmail } from "@/lib/auth";
import { json, err } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    // brake brute-force: 10 attempts per 5 minutes per IP
    const rl = rateLimit(`login:${clientIp(req)}`, 10, 5 * 60 * 1000);
    if (!rl.ok)
      return err(`Too many login attempts - try again in ${rl.retryAfterSec}s`, 429);

    const { email, password } = await req.json();
    if (!email || !password) return err("Email and password required");
    const user = await findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return err("Invalid email or password", 401);
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    return json({ ok: true, role: user.role, name: user.name });
  } catch (e) {
    console.error(e);
    return err("Login failed", 500);
  }
}
