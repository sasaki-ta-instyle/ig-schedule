import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  clampHours,
  isValidWeekIso,
  sanitizeText,
  TEXT_LIMITS,
  toIntId,
} from "@/lib/validate";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = toIntId(id);
  if (!taskId) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };

  if ("title" in body) {
    const v = sanitizeText(body.title, TEXT_LIMITS.taskTitle);
    if (!v) {
      return NextResponse.json({ error: "invalid title" }, { status: 400 });
    }
    update.title = v;
  }
  if ("weekIso" in body) {
    if (!isValidWeekIso(body.weekIso)) {
      return NextResponse.json({ error: "invalid weekIso" }, { status: 400 });
    }
    update.weekIso = body.weekIso;
  }
  if ("assigneeMemberId" in body) {
    if (body.assigneeMemberId === null) {
      update.assigneeMemberId = null;
    } else {
      const v = toIntId(body.assigneeMemberId);
      if (!v) {
        return NextResponse.json(
          { error: "invalid assigneeMemberId" },
          { status: 400 },
        );
      }
      update.assigneeMemberId = v;
    }
  }
  if ("done" in body) {
    if (typeof body.done !== "boolean") {
      return NextResponse.json(
        { error: "done must be boolean" },
        { status: 400 },
      );
    }
    update.done = body.done;
  }
  if ("notes" in body) {
    if (body.notes === null) {
      update.notes = null;
    } else {
      const v = sanitizeText(body.notes, TEXT_LIMITS.taskNotes, {
        allowEmpty: true,
      });
      update.notes = v;
    }
  }
  if ("estimatedHours" in body) {
    if (body.estimatedHours === null) {
      update.estimatedHours = null;
    } else {
      const v = clampHours(body.estimatedHours);
      if (v == null) {
        return NextResponse.json(
          { error: "invalid estimatedHours" },
          { status: 400 },
        );
      }
      update.estimatedHours = v.toString();
    }
  }
  if ("sortOrder" in body) {
    if (
      typeof body.sortOrder === "number" &&
      Number.isInteger(body.sortOrder)
    ) {
      update.sortOrder = body.sortOrder;
    }
  }
  if ("projectId" in body) {
    const v = toIntId(body.projectId);
    if (!v) {
      return NextResponse.json({ error: "invalid projectId" }, { status: 400 });
    }
    update.projectId = v;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json(
      { error: "no updatable fields" },
      { status: 400 },
    );
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
  const taskId = toIntId(id);
  if (!taskId) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
  return NextResponse.json({ ok: true });
}
