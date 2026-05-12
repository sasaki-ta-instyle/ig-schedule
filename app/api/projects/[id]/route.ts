import { db, schema } from "@/db/client";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  isPositiveIntArray,
  isValidColor,
  isValidProjectStatus,
  sanitizeText,
  TEXT_LIMITS,
  toIntId,
} from "@/lib/validate";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = toIntId(id);
  if (!projectId) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};

  if ("name" in body) {
    const v = sanitizeText(body.name, TEXT_LIMITS.projectName);
    if (!v) {
      return NextResponse.json({ error: "invalid name" }, { status: 400 });
    }
    update.name = v;
  }
  if ("summary" in body) {
    const v = sanitizeText(body.summary, TEXT_LIMITS.projectSummary, {
      allowEmpty: true,
    });
    update.summary = v ?? "";
  }
  if ("dueDate" in body) {
    if (body.dueDate === null) {
      update.dueDate = null;
    } else if (
      typeof body.dueDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
    ) {
      update.dueDate = body.dueDate;
    } else {
      return NextResponse.json(
        { error: "dueDate must be YYYY-MM-DD or null" },
        { status: 400 },
      );
    }
  }
  if ("color" in body) {
    if (!isValidColor(body.color)) {
      return NextResponse.json({ error: "invalid color" }, { status: 400 });
    }
    update.color = body.color;
  }
  if ("status" in body) {
    if (!isValidProjectStatus(body.status)) {
      return NextResponse.json(
        { error: "invalid status" },
        { status: 400 },
      );
    }
    update.status = body.status;
  }
  if ("plannedMemberIds" in body) {
    if (!isPositiveIntArray(body.plannedMemberIds)) {
      return NextResponse.json(
        { error: "plannedMemberIds must be number[]" },
        { status: 400 },
      );
    }
    update.plannedMemberIds = body.plannedMemberIds;
  }
  if ("sortOrder" in body) {
    if (
      typeof body.sortOrder === "number" &&
      Number.isInteger(body.sortOrder)
    ) {
      update.sortOrder = body.sortOrder;
    } else {
      return NextResponse.json(
        { error: "sortOrder must be integer" },
        { status: 400 },
      );
    }
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
  const projectId = toIntId(id);
  if (!projectId) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1) プロジェクトの存在確認
      const [exists] = await tx
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1);
      if (!exists) {
        throw new Error("PROJECT_NOT_FOUND");
      }

      // 2) 対象タスクの (member, week, hours) を取得して workload 減算分を集計
      const taskRows = await tx
        .select({
          assigneeMemberId: schema.tasks.assigneeMemberId,
          weekIso: schema.tasks.weekIso,
          estimatedHours: schema.tasks.estimatedHours,
        })
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, projectId));

      const buckets = new Map<
        string,
        { memberId: number; weekIso: string; hours: number }
      >();
      for (const t of taskRows) {
        if (!t.assigneeMemberId || !t.weekIso || t.estimatedHours == null)
          continue;
        const h = Number(t.estimatedHours);
        if (!Number.isFinite(h) || h <= 0) continue;
        const key = `${t.assigneeMemberId}::${t.weekIso}`;
        const cur = buckets.get(key);
        if (cur) cur.hours += h;
        else
          buckets.set(key, {
            memberId: t.assigneeMemberId,
            weekIso: t.weekIso,
            hours: h,
          });
      }

      // 3) workload を減算（負値防止のため GREATEST で 0 に丸める）
      for (const b of buckets.values()) {
        await tx
          .update(schema.workload)
          .set({
            plannedHours: sql`GREATEST(0, ${schema.workload.plannedHours}::numeric - ${b.hours})`,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(schema.workload.memberId, b.memberId),
              eq(schema.workload.weekIso, b.weekIso),
            ),
          );
      }

      // 4) タスクを物理削除
      const deletedTasks = await tx
        .delete(schema.tasks)
        .where(eq(schema.tasks.projectId, projectId))
        .returning({ id: schema.tasks.id });

      // 5) プロジェクトを soft-archive
      await tx
        .update(schema.projects)
        .set({ archivedAt: new Date() })
        .where(eq(schema.projects.id, projectId));

      return {
        deletedTaskCount: deletedTasks.length,
        adjustedWorkloadBuckets: buckets.size,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if ((e as Error).message === "PROJECT_NOT_FOUND") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    throw e;
  }
}
