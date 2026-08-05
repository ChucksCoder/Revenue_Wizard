"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "./auth";

export function useUser(): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, []);
  return user;
}
