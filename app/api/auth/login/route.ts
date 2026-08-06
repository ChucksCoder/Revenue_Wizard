import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { createSession, findUserByEmail } from "@/lib/auth";
import { json, err } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
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
