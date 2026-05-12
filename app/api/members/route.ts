import { db, schema } from "@/db/client";
import { asc, isNull } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select()
    .from(schema.members)
    .where(isNull(schema.members.archivedAt))
    .orderBy(asc(schema.members.sortOrder), asc(schema.members.id));
  return Response.json(rows);
}
