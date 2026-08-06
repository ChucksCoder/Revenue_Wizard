import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { anyUsersExist, createSession } from "@/lib/auth";
import { json, err } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { ensureSchema } from "@/lib/migrate";

export async function GET() {
  try {
    await ensureSchema(); // creates tables on first run, no-op afterward
    const exists = await anyUsersExist();
    return json({ needsSetup: !exists });
  } catch (e) {
    console.error(e);
    return err(e instanceof Error ? e.message : "Database connection failed", 500);
  }
}

// Bootstrap the first admin account. Only works when no users exist.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    if (await anyUsersExist())
      return err("Setup already completed. Ask an admin to create your account.", 403);
    const { email, name, password } = await req.json();
    if (!email || !name || !password || password.length < 8)
      return err("Email, name and a password of 8+ characters are required");
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        name,
        passwordHash: await bcrypt.hash(password, 10),
        role: "admin",
      })
      .returning();
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    await logAudit(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      "user",
      user.id,
      "created",
      { bootstrap: true }
    );
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return err(e instanceof Error ? e.message : "Setup failed", 500);
  }
}
