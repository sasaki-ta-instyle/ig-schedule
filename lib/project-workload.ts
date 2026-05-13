import { db, schema } from "@/db/client";
import { and, eq, isNull, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WorkloadBucket = {
  memberId: number;
  weekIso: string;
  hours: number;
};

/**
 * 指定された (memberId, weekIso) バケットの workload を、
 * アクティブな（archivedAt が NULL の）プロジェクトに属するタスクの
 * estimatedHours 合計で**上書き**する。
 *
 * これにより、プロジェクトをアーカイブ／削除した結果として
 * 「残り 0h」のバケットが発生したときに workload が必ず 0 に揃う。
 *
 * 注: 手動で workload を編集していた場合、対象バケットの値はクロッバーされる。
 * 「プロジェクトを消したのに工数が 0 にならない」という直感に合わせるためのトレードオフ。
 */
export async function recomputeWorkloadBuckets(
  tx: Tx,
  buckets: Map<string, WorkloadBucket>,
) {
  for (const b of buckets.values()) {
    const [agg] = await tx
      .select({
        total: sql<string>`COALESCE(SUM(${schema.tasks.estimatedHours})::numeric, 0)::text`,
      })
      .from(schema.tasks)
      .innerJoin(
        schema.projects,
        eq(schema.tasks.projectId, schema.projects.id),
      )
      .where(
        and(
          eq(schema.tasks.assigneeMemberId, b.memberId),
          eq(schema.tasks.weekIso, b.weekIso),
          isNull(schema.projects.archivedAt),
        ),
      );
    const totalStr = agg?.total ?? "0";

    await tx
      .insert(schema.workload)
      .values({
        memberId: b.memberId,
        weekIso: b.weekIso,
        plannedHours: totalStr,
      })
      .onConflictDoUpdate({
        target: [schema.workload.memberId, schema.workload.weekIso],
        set: {
          plannedHours: totalStr,
          updatedAt: sql`now()`,
        },
      });
  }
}

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

