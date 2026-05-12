import { db, schema } from "@/db/client";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  clampHours,
  isValidWeekIso,
  sanitizeText,
  TEXT_LIMITS,
  toIntId,
} from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const weekFrom = url.searchParams.get("weekFrom");
  const weekTo = url.searchParams.get("weekTo");
  const memberIds = url.searchParams.get("memberIds");

  const conds = [] as Array<
    ReturnType<typeof gte> | ReturnType<typeof lte> | ReturnType<typeof inArray>
  >;
  if (weekFrom && isValidWeekIso(weekFrom))
    conds.push(gte(schema.workload.weekIso, weekFrom));
  if (weekTo && isValidWeekIso(weekTo))
    conds.push(lte(schema.workload.weekIso, weekTo));
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
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const memberId = toIntId(body.memberId);
  const weekIso = body.weekIso;
  const hours = clampHours(body.plannedHours);
  if (!memberId) {
    return NextResponse.json(
      { error: "memberId must be a positive integer" },
      { status: 400 },
    );
  }
  if (!isValidWeekIso(weekIso)) {
    return NextResponse.json(
      { error: "weekIso must match YYYY-Www" },
      { status: 400 },
    );
  }
  if (hours == null) {
    return NextResponse.json(
      { error: "plannedHours must be a number in 0..200" },
      { status: 400 },
    );
  }
  const note =
    body.note === undefined || body.note === null
      ? null
      : sanitizeText(body.note, TEXT_LIMITS.workloadNote, { allowEmpty: true });

  const hoursStr = hours.toString();

  const [row] = await db
    .insert(schema.workload)
    .values({
      memberId,
      weekIso,
      plannedHours: hoursStr,
      note,
    })
    .onConflictDoUpdate({
      target: [schema.workload.memberId, schema.workload.weekIso],
      set: {
        plannedHours: hoursStr,
        note,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const memberId = toIntId(url.searchParams.get("memberId"));
  const weekIso = url.searchParams.get("weekIso");
  if (!memberId) {
    return NextResponse.json(
      { error: "memberId must be a positive integer" },
      { status: 400 },
    );
  }
  if (!isValidWeekIso(weekIso)) {
    return NextResponse.json(
      { error: "weekIso must match YYYY-Www" },
      { status: 400 },
    );
  }
  await db
    .delete(schema.workload)
    .where(
      and(
        eq(schema.workload.memberId, memberId),
        eq(schema.workload.weekIso, weekIso),
      ),
    );
  return NextResponse.json({ ok: true });
}
