import { db, schema } from "@/db/client";
import { asc, isNull } from "drizzle-orm";
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

  if (Array.isArray(tasks) && tasks.length > 0) {
    await db.insert(schema.tasks).values(
      tasks.map(
        (t: {
          title: string;
          weekIso: string;
          assigneeMemberId?: number | null;
          notes?: string | null;
          sortOrder?: number;
        }, i: number) => ({
          projectId: project.id,
          title: t.title,
          weekIso: t.weekIso,
          assigneeMemberId: t.assigneeMemberId ?? null,
          notes: t.notes ?? null,
          sortOrder: t.sortOrder ?? i,
        }),
      ),
    );
  }

  return NextResponse.json(project, { status: 201 });
}
