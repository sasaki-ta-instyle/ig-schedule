import { db, schema } from "@/db/client";
import { asc, isNotNull, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  clampHours,
  isPositiveIntArray,
  isValidColor,
  isValidProjectStatus,
  isValidWeekIso,
  sanitizeText,
  TEXT_LIMITS,
  toIntId,
} from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const archived = url.searchParams.get("archived") === "1";
  const rows = await db
    .select()
    .from(schema.projects)
    .where(
      archived
        ? isNotNull(schema.projects.archivedAt)
        : isNull(schema.projects.archivedAt),
    )
    .orderBy(
      archived
        ? asc(schema.projects.archivedAt)
        : asc(schema.projects.sortOrder),
      asc(schema.projects.id),
    );
  return NextResponse.json(rows);
}

type IncomingTask = {
  title: unknown;
  weekIso: unknown;
  assigneeMemberId?: unknown;
  notes?: unknown;
  sortOrder?: unknown;
  estimatedHours?: unknown;
};

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = sanitizeText(body.name, TEXT_LIMITS.projectName);
  if (!name) {
    return NextResponse.json(
      { error: `name must be 1..${TEXT_LIMITS.projectName} chars` },
      { status: 400 },
    );
  }
  const summary = sanitizeText(body.summary, TEXT_LIMITS.projectSummary, {
    allowEmpty: true,
  }) ?? "";
  const dueDate =
    typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
      ? body.dueDate
      : null;
  const color = isValidColor(body.color) ? body.color : "#38537B";
  const status = isValidProjectStatus(body.status) ? body.status : "active";
  const plannedMemberIds = isPositiveIntArray(body.plannedMemberIds)
    ? (body.plannedMemberIds as number[])
    : [];

  // タスク配列の事前検証（上限を厳格化）
  const MAX_INCOMING_TASKS = 50;
  const incoming = Array.isArray(body.tasks)
    ? (body.tasks as IncomingTask[]).slice(0, MAX_INCOMING_TASKS)
    : [];
  type CleanTask = {
    title: string;
    weekIso: string;
    assigneeMemberId: number | null;
    notes: string | null;
    sortOrder: number;
    estimatedHours: number | null;
  };
  const cleanTasks: CleanTask[] = [];
  for (let i = 0; i < incoming.length; i++) {
    const t = incoming[i];
    const title = sanitizeText(t.title, TEXT_LIMITS.taskTitle);
    if (!title) continue;
    if (!isValidWeekIso(t.weekIso)) continue;
    const assignee =
      t.assigneeMemberId == null ? null : toIntId(t.assigneeMemberId);
    if (t.assigneeMemberId != null && assignee == null) continue;
    const notes =
      t.notes == null
        ? null
        : sanitizeText(t.notes, TEXT_LIMITS.taskNotes, { allowEmpty: true });
    const estimated = t.estimatedHours == null ? null : clampHours(t.estimatedHours);
    cleanTasks.push({
      title,
      weekIso: t.weekIso as string,
      assigneeMemberId: assignee,
      notes,
      sortOrder:
        typeof t.sortOrder === "number" && Number.isInteger(t.sortOrder)
          ? (t.sortOrder as number)
          : i,
      estimatedHours: estimated,
    });
  }

  type AiSeed = {
    summary: string;
    dueDate?: string;
    plannedMemberIds: number[];
    model?: string;
  } | null;
  const aiSeed: AiSeed =
    body.aiSeed && typeof body.aiSeed === "object"
      ? (body.aiSeed as AiSeed)
      : null;

  const project = await db.transaction(async (tx) => {
    const [projectRow] = await tx
      .insert(schema.projects)
      .values({
        name,
        summary,
        dueDate,
        color,
        status,
        plannedMemberIds,
        aiSeed,
      })
      .returning();

    if (cleanTasks.length > 0) {
      await tx.insert(schema.tasks).values(
        cleanTasks.map((t) => ({
          projectId: projectRow.id,
          title: t.title,
          weekIso: t.weekIso,
          assigneeMemberId: t.assigneeMemberId,
          notes: t.notes,
          sortOrder: t.sortOrder,
          estimatedHours:
            t.estimatedHours == null ? null : t.estimatedHours.toString(),
        })),
      );

      const buckets = new Map<
        string,
        { memberId: number; weekIso: string; hours: number }
      >();
      for (const t of cleanTasks) {
        if (!t.assigneeMemberId || t.estimatedHours == null) continue;
        if (t.estimatedHours <= 0) continue;
        const key = `${t.assigneeMemberId}::${t.weekIso}`;
        const cur = buckets.get(key);
        if (cur) cur.hours += t.estimatedHours;
        else
          buckets.set(key, {
            memberId: t.assigneeMemberId,
            weekIso: t.weekIso,
            hours: t.estimatedHours,
          });
      }

      for (const b of buckets.values()) {
        await tx
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

    return projectRow;
  });

  return NextResponse.json(project, { status: 201 });
}
