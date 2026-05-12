import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { members } from "./schema";

const SEED_MEMBERS = [
  { name: "佐々木", color: "#38537B", role: null },
  { name: "田邉",   color: "#7BB785", role: null },
  { name: "山田",   color: "#D4772C", role: null },
  { name: "中野",   color: "#A86B91", role: null },
  { name: "柏木",   color: "#5C8FA8", role: null },
  { name: "和田",   color: "#8A7B5C", role: null },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  console.log("seeding members…");
  const existing = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from members`,
  );
  if (Number(existing.rows[0].count) > 0) {
    console.log("members already seeded, skipping. (count =", existing.rows[0].count, ")");
  } else {
    await db.insert(members).values(
      SEED_MEMBERS.map((m, i) => ({ ...m, sortOrder: i })),
    );
    console.log(`inserted ${SEED_MEMBERS.length} members.`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
