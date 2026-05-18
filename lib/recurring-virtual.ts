export type RecurringTaskDTO = {
  id: number;
  title: string;
  assigneeMemberId: number | null;
  recurrenceType: string;
  estimatedHours: string | null;
  notes: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecurringCompletionDTO = {
  id: number;
  recurringTaskId: number;
  weekIso: string;
  doneAt: string;
};

export type VirtualRecurringTask = {
  kind: "recurring";
  id: string;
  recurringId: number;
  title: string;
  assigneeMemberId: number | null;
  weekIso: string;
  done: boolean;
  estimatedHours: string | null;
  notes: string | null;
  sortOrder: number;
};

export function virtualRecurringId(recurringId: number, weekIso: string): string {
  return `r-${recurringId}-${weekIso}`;
}

export function buildVirtualRecurringTasks(
  recurring: RecurringTaskDTO[],
  completions: RecurringCompletionDTO[],
  weeks: string[],
): VirtualRecurringTask[] {
  const doneKeys = new Set(
    completions.map((c) => `${c.recurringTaskId}::${c.weekIso}`),
  );
  const out: VirtualRecurringTask[] = [];
  for (const r of recurring) {
    if (r.archivedAt) continue;
    if (r.recurrenceType !== "weekly") continue;
    for (const w of weeks) {
      out.push({
        kind: "recurring",
        id: virtualRecurringId(r.id, w),
        recurringId: r.id,
        title: r.title,
        assigneeMemberId: r.assigneeMemberId,
        weekIso: w,
        done: doneKeys.has(`${r.id}::${w}`),
        estimatedHours: r.estimatedHours,
        notes: r.notes,
        sortOrder: r.sortOrder,
      });
    }
  }
  return out;
}

/**
 * 人 × 週 ごとの定例工数を集計する。
 * keys は `${memberId}::${weekIso}` 形式。Dashboard 等で workload と合算して使う。
 */
export function recurringHoursByMemberWeek(
  recurring: RecurringTaskDTO[],
  weeks: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of recurring) {
    if (r.archivedAt) continue;
    if (r.recurrenceType !== "weekly") continue;
    if (r.assigneeMemberId == null) continue;
    const h = r.estimatedHours == null ? 0 : Number(r.estimatedHours);
    if (!Number.isFinite(h) || h <= 0) continue;
    for (const w of weeks) {
      const k = `${r.assigneeMemberId}::${w}`;
      out[k] = (out[k] ?? 0) + h;
    }
  }
  return out;
}
