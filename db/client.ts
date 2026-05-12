import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const globalForPool = globalThis as unknown as { __pgPool?: Pool };

const pool =
  globalForPool.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.__pgPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
