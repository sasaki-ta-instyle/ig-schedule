import { db, schema } from "@/db/client";
import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const weekFrom = url.searchParams.get("weekFrom");
  const weekTo = url.searchParams.get("weekTo");
  const memberIds = url.searchParams.get("memberIds");
  const projectIds = url.searchParams.get("projectIds");

  const conds = [] as Array<ReturnType<typeof gte> | ReturnType<typeof lte> | ReturnType<typeof inArray>>;
  if (weekFrom) conds.push(gte(schema.tasks.weekIso, weekFrom));
  if (weekTo) conds.push(lte(schema.tasks.weekIso, weekTo));
  if (memberIds) {
    const ids = memberIds.split(",").map(Number).filter(Number.isFinite);
    if (ids.length) conds.push(inArray(schema.tasks.assigneeMemberId, ids));
  }
  if (projectIds) {
    const ids = projectIds.split(",").map(Number).filter(Number.isFinite);
    if (ids.length) conds.push(inArray(schema.tasks.projectId, ids));
  }

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(schema.tasks.weekIso), asc(schema.tasks.sortOrder), asc(schema.tasks.id));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { projectId, title, weekIso, assigneeMemberId, notes, sortOrder } = body ?? {};
  if (!projectId || !title || !weekIso) {
    return NextResponse.json(
      { error: "projectId, title, weekIso are required" },
      { status: 400 },
    );
  }
  const [row] = await db
    .insert(schema.tasks)
    .values({
      projectId: Number(projectId),
      title,
      weekIso,
      assigneeMemberId: assigneeMemberId ?? null,
      notes: notes ?? null,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
