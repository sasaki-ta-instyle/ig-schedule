import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = await req.json();
  const allowed = [
    "title",
    "weekIso",
    "assigneeMemberId",
    "done",
    "notes",
    "sortOrder",
    "projectId",
  ] as const;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  const [row] = await db
    .update(schema.tasks)
    .set(update)
    .where(eq(schema.tasks.id, taskId))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
  return NextResponse.json({ ok: true });
}
