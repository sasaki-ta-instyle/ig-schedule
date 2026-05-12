import { db, schema } from "@/db/client";
import { asc, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(schema.projects)
    .where(isNull(schema.projects.archivedAt))
    .orderBy(asc(schema.projects.sortOrder), asc(schema.projects.id));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, summary, dueDate, color, status, plannedMemberIds, tasks, aiSeed } =
    body ?? {};
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [project] = await db
    .insert(schema.projects)
    .values({
      name,
      summary: summary ?? "",
      dueDate: dueDate ?? null,
      color: color ?? "#38537B",
      status: status ?? "active",
      plannedMemberIds: Array.isArray(plannedMemberIds) ? plannedMemberIds : [],
      aiSeed: aiSeed ?? null,
    })
    .returning();

  type IncomingTask = {
    title: string;
    weekIso: string;
    assigneeMemberId?: number | null;
    notes?: string | null;
    sortOrder?: number;
    estimatedHours?: number | null;
  };

  if (Array.isArray(tasks) && tasks.length > 0) {
    await db.insert(schema.tasks).values(
      (tasks as IncomingTask[]).map((t, i) => ({
        projectId: project.id,
        title: t.title,
        weekIso: t.weekIso,
        assigneeMemberId: t.assigneeMemberId ?? null,
        notes: t.notes ?? null,
        sortOrder: t.sortOrder ?? i,
      })),
    );

    // member × week ごとの estimatedHours 合計を workload に加算
    const buckets = new Map<string, { memberId: number; weekIso: string; hours: number }>();
    for (const t of tasks as IncomingTask[]) {
      const h = Number(t.estimatedHours);
      if (!t.assigneeMemberId || !t.weekIso || !Number.isFinite(h) || h <= 0) continue;
      const key = `${t.assigneeMemberId}::${t.weekIso}`;
      const cur = buckets.get(key);
      if (cur) cur.hours += h;
      else buckets.set(key, { memberId: t.assigneeMemberId, weekIso: t.weekIso, hours: h });
    }

    for (const b of buckets.values()) {
      await db
        .insert(schema.workload)
        .values({
          memberId: b.memberId,
          weekIso: b.weekIso,
          plannedHours: b.hours.toString(),
        })
        .onConflictDoUpdate({
          target: [schema.workload.memberId, schema.workload.weekIso],
          set: {
            plannedHours: sql`${schema.workload.plannedHours} + ${b.hours}`,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  return NextResponse.json(project, { status: 201 });
}
