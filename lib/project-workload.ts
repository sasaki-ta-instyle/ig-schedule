import { db, schema } from "@/db/client";
import { and, eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WorkloadBucket = {
  memberId: number;
  weekIso: string;
  hours: number;
};

export async function collectWorkloadBuckets(
  tx: Tx,
  projectId: number,
): Promise<Map<string, WorkloadBucket>> {
  const taskRows = await tx
    .select({
      assigneeMemberId: schema.tasks.assigneeMemberId,
      weekIso: schema.tasks.weekIso,
      estimatedHours: schema.tasks.estimatedHours,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.projectId, projectId));

  const buckets = new Map<string, WorkloadBucket>();
  for (const t of taskRows) {
    if (!t.assigneeMemberId || !t.weekIso || t.estimatedHours == null) continue;
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
  return buckets;
}

export async function subtractWorkloadBuckets(
  tx: Tx,
  buckets: Map<string, WorkloadBucket>,
) {
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
}

export async function addWorkloadBuckets(
  tx: Tx,
  buckets: Map<string, WorkloadBucket>,
) {
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
