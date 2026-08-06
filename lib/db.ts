import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

// Lazy init: don't connect at module load, or `next build` fails while
// collecting page data when DATABASE_URL isn't present at build time.
let _db: DB | null = null;

function getDb(): DB {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Add your Neon connection string to the environment."
      );
    }
    const sql = neon(process.env.DATABASE_URL);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const value = (getDb() as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(getDb()) : value;
  },
});

export { schema };
