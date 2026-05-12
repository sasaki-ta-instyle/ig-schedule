import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = await req.json();
  const allowed = [
    "name",
    "summary",
    "dueDate",
    "color",
    "status",
    "plannedMemberIds",
    "sortOrder",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
  }
  const [row] = await db
    .update(schema.projects)
    .set(update)
    .where(eq(schema.projects.id, projectId))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const deletedTasks = await db
    .delete(schema.tasks)
    .where(eq(schema.tasks.projectId, projectId))
    .returning({ id: schema.tasks.id });
  const [row] = await db
    .update(schema.projects)
    .set({ archivedAt: new Date() })
    .where(eq(schema.projects.id, projectId))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deletedTaskCount: deletedTasks.length });
}
