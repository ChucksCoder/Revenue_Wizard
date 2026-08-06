import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { json, err, withUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const GET = withUser(async () => {
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users);
  return json({ users: rows });
});

export const POST = withUser(
  async (user, req: NextRequest) => {
    const { email, name, password, role } = await req.json();
    if (!email || !name || !password || password.length < 8)
      return err("Email, name and a password of 8+ characters are required");
    if (!["admin", "preparer", "reviewer"].includes(role)) return err("Invalid role");
    const [row] = await db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        name,
        passwordHash: await bcrypt.hash(password, 10),
        role,
      })
      .returning();
    await logAudit(user, "user", row.id, "created", { email, role });
    return json({ ok: true, id: row.id });
  },
  { roles: ["admin"] }
);

export const PATCH = withUser(
  async (user, req: NextRequest) => {
    const { id, role, password } = await req.json();
    if (!id) return err("id required");
    if (role) {
      if (!["admin", "preparer", "reviewer"].includes(role)) return err("Invalid role");
      await db.update(users).set({ role }).where(eq(users.id, id));
      await logAudit(user, "user", id, "updated", { role });
    }
    if (password) {
      if (password.length < 8) return err("Password must be 8+ characters");
      await db
        .update(users)
        .set({ passwordHash: await bcrypt.hash(password, 10) })
        .where(eq(users.id, id));
      await logAudit(user, "user", id, "updated", { passwordReset: true });
    }
    return json({ ok: true });
  },
  { roles: ["admin"] }
);
