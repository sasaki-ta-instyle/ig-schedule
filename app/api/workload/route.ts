import { db, schema } from "@/db/client";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const weekFrom = url.searchParams.get("weekFrom");
  const weekTo = url.searchParams.get("weekTo");
  const memberIds = url.searchParams.get("memberIds");

  const conds = [] as Array<ReturnType<typeof gte> | ReturnType<typeof lte> | ReturnType<typeof inArray>>;
  if (weekFrom) conds.push(gte(schema.workload.weekIso, weekFrom));
  if (weekTo) conds.push(lte(schema.workload.weekIso, weekTo));
  if (memberIds) {
    const ids = memberIds.split(",").map(Number).filter(Number.isFinite);
    if (ids.length) conds.push(inArray(schema.workload.memberId, ids));
  }

  const rows = await db
    .select()
    .from(schema.workload)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(schema.workload.weekIso), asc(schema.workload.memberId));
  return NextResponse.json(rows);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { memberId, weekIso, plannedHours, note } = body ?? {};
  if (!memberId || !weekIso || plannedHours === undefined) {
    return NextResponse.json(
      { error: "memberId, weekIso, plannedHours are required" },
      { status: 400 },
    );
  }
  const hoursStr = String(plannedHours);

  const [row] = await db
    .insert(schema.workload)
    .values({
      memberId: Number(memberId),
      weekIso,
      plannedHours: hoursStr,
      note: note ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.workload.memberId, schema.workload.weekIso],
      set: {
        plannedHours: hoursStr,
        note: note ?? null,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const memberId = Number(url.searchParams.get("memberId"));
  const weekIso = url.searchParams.get("weekIso");
  if (!Number.isFinite(memberId) || !weekIso) {
    return NextResponse.json(
      { error: "memberId and weekIso are required" },
      { status: 400 },
    );
  }
  await db
    .delete(schema.workload)
    .where(
      and(eq(schema.workload.memberId, memberId), eq(schema.workload.weekIso, weekIso)),
    );
  return NextResponse.json({ ok: true });
}
