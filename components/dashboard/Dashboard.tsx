"use client";

import useSWR, { mutate } from "swr";
import { useEffect, useMemo, useState } from "react";
import {
  addWeeks,
  currentWeekIso,
  weekIsoLabel,
  weekIsoRange,
} from "@/lib/week";
import { weeklyCapacityHours } from "@/lib/capacity";
import { holidaysInWeek } from "@/lib/holidays";
import { WORK_RULES } from "@/lib/work-rules";
import { fetcher, postJson } from "@/lib/api";
import { useEditMode } from "@/hooks/useEditMode";
import { restoreDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import type { Company } from "@/lib/companies";
import { CompanyChip } from "@/components/CompanyChip";

type Member = {
  id: number;
  name: string;
  color: string;
  role: string | null;
  sortOrder: number;
};
type Task = {
  id: number;
  projectId: number;
  title: string;
  assigneeMemberId: number | null;
  weekIso: string;
  done: boolean;
  sortOrder: number;
  notes: string | null;
  estimatedHours: string | null;
};
type Workload = {
  id: number;
  memberId: number;
  weekIso: string;
  plannedHours: string;
  note: string | null;
};
type Project = {
  id: number;
  name: string;
  color: string;
  status: string;
  company: Company | null;
};

const WEEK_COUNT = 6;
const REFRESH_MS = 5000;

export function Dashboard({ archived = false }: { archived?: boolean } = {}) {
  const { isEdit: editToggled } = useEditMode();
  // アーカイブビューでは閲覧専用に固定する
  const isEdit = editToggled && !archived;
  const [anchorWeek, setAnchorWeek] = useState<string>(currentWeekIso());
  const weeks = useMemo(() => weekIsoRange(anchorWeek, WEEK_COUNT), [anchorWeek]);
  const weekFrom = weeks[0];
  const weekTo = weeks[weeks.length - 1];

  const { data: members } = useSWR<Member[]>("/api/members", fetcher, {
    refreshInterval: REFRESH_MS,
  });
  const projectsKey = archived ? "/api/projects?archived=1" : "/api/projects";
  const { data: projects } = useSWR<Project[]>(projectsKey, fetcher, {
    refreshInterval: REFRESH_MS,
  });
  const tasksKey = `/api/tasks?weekFrom=${weekFrom}&weekTo=${weekTo}`;
  const { data: tasks } = useSWR<Task[]>(tasksKey, fetcher, {
    refreshInterval: REFRESH_MS,
  });
  const workloadKey = `/api/workload?weekFrom=${weekFrom}&weekTo=${weekTo}`;
  const { data: workload } = useSWR<Workload[]>(workloadKey, fetcher, {
    refreshInterval: archived ? 0 : REFRESH_MS,
  });

  const projectsById = useMemo(() => {
    const m: Record<number, Project> = {};
    for (const p of projects ?? []) m[p.id] = p;
    return m;
  }, [projects]);

  // タスクは projectsById に含まれるプロジェクトのものだけを使う
  // （アーカイブビューならアーカイブ済みプロジェクトのタスクだけ、
  //   通常ビューならアクティブプロジェクトのタスクだけが残る）
  const visibleTasks = useMemo(
    () => (tasks ?? []).filter((t) => projectsById[t.projectId]),
    [tasks, projectsById],
  );

  // workload: 通常はテーブル値。アーカイブビューでは表示中タスクから合計を算出
  const workloadByKey = useMemo(() => {
    const m: Record<string, Workload> = {};
    if (archived) {
      const sums = new Map<string, number>();
      for (const t of visibleTasks) {
        if (t.assigneeMemberId == null || t.estimatedHours == null) continue;
        const h = Number(t.estimatedHours);
        if (!Number.isFinite(h) || h <= 0) continue;
        const key = `${t.assigneeMemberId}::${t.weekIso}`;
        sums.set(key, (sums.get(key) ?? 0) + h);
      }
      let synthId = -1;
      for (const [key, hours] of sums) {
        const [mid, wk] = key.split("::");
        m[key] = {
          id: synthId--,
          memberId: Number(mid),
          weekIso: wk,
          plannedHours: hours.toString(),
          note: null,
        } as Workload;
      }
    } else {
      for (const w of workload ?? []) m[`${w.memberId}::${w.weekIso}`] = w;
    }
    return m;
  }, [workload, archived, visibleTasks]);

  const tasksByKey = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of visibleTasks) {
      if (t.assigneeMemberId == null) continue;
      const key = `${t.assigneeMemberId}::${t.weekIso}`;
      (m[key] ??= []).push(t);
    }
    return m;
  }, [visibleTasks]);

  async function setHours(memberId: number, weekIso: string, hours: number) {
    const next = Math.max(0, Math.min(168, hours));
    await postJson(
      `/api/workload`,
      { memberId, weekIso, plannedHours: next },
      "PUT",
    );
    mutate(workloadKey);
  }

  async function toggleDone(task: Task) {
    await postJson(`/api/tasks/${task.id}`, { done: !task.done }, "PATCH");
    mutate(tasksKey);
  }

  async function addQuickTask(
    memberId: number,
    weekIso: string,
    projectId: number,
    title: string,
  ) {
    if (!title.trim()) return;
    await postJson("/api/tasks", {
      projectId,
      assigneeMemberId: memberId,
      weekIso,
      title: title.trim(),
    });
    mutate(tasksKey);
  }

  function applyWorkloadDelta(
    prev: Workload[],
    moves: Array<{
      memberId: number;
      fromWeek: string;
      toWeek: string;
      hours: number;
    }>,
  ): Workload[] {
    const map = new Map<string, Workload>();
    for (const w of prev) map.set(`${w.memberId}::${w.weekIso}`, { ...w });
    for (const mv of moves) {
      if (mv.hours <= 0) continue;
      const fromKey = `${mv.memberId}::${mv.fromWeek}`;
      const f = map.get(fromKey);
      if (f) {
        map.set(fromKey, {
          ...f,
          plannedHours: String(Math.max(0, Number(f.plannedHours) - mv.hours)),
        });
      }
      const toKey = `${mv.memberId}::${mv.toWeek}`;
      const t = map.get(toKey);
      if (t) {
        map.set(toKey, {
          ...t,
          plannedHours: String(Number(t.plannedHours) + mv.hours),
        });
      } else {
        map.set(toKey, {
          id: -Date.now() - Math.floor(Math.random() * 1000),
          memberId: mv.memberId,
          weekIso: mv.toWeek,
          plannedHours: String(mv.hours),
          note: null,
        } as Workload);
      }
    }
    return Array.from(map.values());
  }

  async function shiftWeek(task: Task, delta: -1 | 1) {
    const targetWeek = addWeeks(task.weekIso, delta);
    const hours = task.estimatedHours ? Number(task.estimatedHours) : 0;
    const movesWorkload =
      task.assigneeMemberId != null && hours > 0;

    // tasks の楽観的更新: async fn 内で PATCH を完了させ、その後 revalidate を1回だけ走らせる
    try {
      await mutate(
        tasksKey,
        async () => {
          await postJson(
            `/api/tasks/${task.id}`,
            { weekIso: targetWeek },
            "PATCH",
          );
          return undefined; // 終了後に再フェッチを走らせる
        },
        {
          optimisticData: (prev: Task[] | undefined) =>
            (prev ?? []).map((t) =>
              t.id === task.id ? { ...t, weekIso: targetWeek } : t,
            ),
          rollbackOnError: true,
          populateCache: false,
          revalidate: true,
        },
      );
    } catch (e) {
      console.error("shift failed", e);
    }
    // workload も in-flight 中はクロッバーされないように optimisticData で更新
    if (movesWorkload) {
      mutate(
        workloadKey,
        async () => undefined,
        {
          optimisticData: (prev: Workload[] | undefined) =>
            applyWorkloadDelta(prev ?? [], [
              {
                memberId: task.assigneeMemberId!,
                fromWeek: task.weekIso,
                toWeek: targetWeek,
                hours,
              },
            ]),
          rollbackOnError: true,
          populateCache: false,
          revalidate: true,
        },
      );
    } else {
      mutate(workloadKey);
    }
  }

  async function shiftAllUnfinishedToNextWeek(cellTasks: Task[]) {
    const undone = cellTasks.filter((t) => !t.done);
    if (undone.length === 0) return;
    if (
      !confirm(
        `未完了の ${undone.length} 件を翌週へ移動します。よろしいですか？`,
      )
    )
      return;
    const idMap = new Map(
      undone.map((t) => [t.id, addWeeks(t.weekIso, 1)] as const),
    );
    mutate(
      tasksKey,
      (prev: Task[] = []) =>
        prev.map((t) =>
          idMap.has(t.id) ? { ...t, weekIso: idMap.get(t.id)! } : t,
        ),
      { revalidate: false },
    );
    const moves = undone
      .map((t) => {
        const h = t.estimatedHours ? Number(t.estimatedHours) : 0;
        if (!t.assigneeMemberId || h <= 0) return null;
        return {
          memberId: t.assigneeMemberId,
          fromWeek: t.weekIso,
          toWeek: addWeeks(t.weekIso, 1),
          hours: h,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (moves.length > 0) {
      mutate(
        workloadKey,
        (prev: Workload[] = []) => applyWorkloadDelta(prev, moves),
        { revalidate: false },
      );
    }
    try {
      // 1リクエストで原子的に更新（途中失敗で部分反映を防ぐ）
      await postJson("/api/tasks/batch", {
        ops: undone.map((t) => ({
          id: t.id,
          patch: { weekIso: addWeeks(t.weekIso, 1) },
        })),
      });
    } catch (e) {
      console.error("bulk shift failed", e);
    }
    mutate(tasksKey);
    mutate(workloadKey);
  }

  async function reorderInCell(
    cellTasks: Task[],
    index: number,
    delta: -1 | 1,
  ) {
    const target = index + delta;
    if (target < 0 || target >= cellTasks.length) return;
    const next = [...cellTasks];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);

    // 楽観的更新: SWR キャッシュの該当タスクに即時 sortOrder を反映
    const idToOrder = new Map(next.map((t, i) => [t.id, i] as const));
    mutate(
      tasksKey,
      (prev: Task[] = []) => {
        const updated = prev.map((t) =>
          idToOrder.has(t.id)
            ? { ...t, sortOrder: idToOrder.get(t.id)! }
            : t,
        );
        return [...updated].sort(
          (a, b) =>
            a.weekIso.localeCompare(b.weekIso) ||
            a.sortOrder - b.sortOrder ||
            a.id - b.id,
        );
      },
      { revalidate: false },
    );

    try {
      // 1リクエストで原子的に sortOrder 再付与
      await postJson("/api/tasks/batch", {
        ops: next.map((t, i) => ({
          id: t.id,
          patch: { sortOrder: i },
        })),
      });
    } catch (e) {
      console.error("reorder failed", e);
    }
    mutate(tasksKey);
  }

  return (
    <section
      className="glass-panel allow-sticky"
      style={{ padding: 24 }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span className="eyebrow">
            {archived ? "ARCHIVED" : "DASHBOARD"}
          </span>
          <h2 className="t-h3" style={{ marginTop: 4 }}>
            {archived ? "アーカイブ（メンバー × 週）" : "メンバー × 週"}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setAnchorWeek(addWeeks(anchorWeek, -WEEK_COUNT))}
          >
            ◀ 前
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setAnchorWeek(currentWeekIso())}
          >
            今週
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setAnchorWeek(addWeeks(anchorWeek, WEEK_COUNT))}
          >
            次 ▶
          </button>
        </div>
      </header>

      {!members ? (
        <p className="muted">読み込み中…</p>
      ) : members.length === 0 ? (
        <p className="muted">
          メンバーが未登録です。<code>pnpm seed</code> を実行してください。
        </p>
      ) : (
        <div>
          <table style={{ borderCollapse: "separate", borderSpacing: 6, width: "100%" }}>
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    top: "var(--header-h)",
                    background: "rgba(237, 233, 224, 0.86)",
                    backdropFilter: "saturate(180%) blur(16px)",
                    WebkitBackdropFilter: "saturate(180%) blur(16px)",
                    width: 110,
                    padding: "6px 10px",
                    border: "none",
                    zIndex: 4,
                    textAlign: "left",
                    color: "var(--color-text)",
                    fontWeight: 600,
                    fontSize: ".8125rem",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {weeks[0]?.slice(0, 4) ?? ""}
                </th>
                {weeks.map((w) => {
                  const hol = holidaysInWeek(w);
                  return (
                    <th
                      key={w}
                      style={{
                        position: "sticky",
                        top: "var(--header-h)",
                        background: "rgba(237, 233, 224, 0.86)",
                        backdropFilter: "saturate(180%) blur(16px)",
                        WebkitBackdropFilter: "saturate(180%) blur(16px)",
                        minWidth: 200,
                        padding: "6px 8px",
                        textAlign: "left",
                        zIndex: 3,
                        borderRadius: "var(--r-sm)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        <span
                          style={{
                            fontSize: ".8125rem",
                            fontWeight: 600,
                            color: "var(--color-text)",
                          }}
                          title={w}
                        >
                          {weekIsoLabel(w)}
                        </span>
                        {hol.length > 0 && (
                          <span
                            className="t-small"
                            style={{ color: "var(--color-warning)" }}
                          >
                            {hol.map((h) => h.name).join(" / ")}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <th
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "rgba(243,241,238,.78)",
                      backdropFilter: "blur(12px)",
                      padding: "10px",
                      textAlign: "left",
                      borderRadius: "var(--r-sm)",
                      zIndex: 1,
                      verticalAlign: "top",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: m.color,
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>{m.name}</span>
                    </div>
                  </th>
                  {weeks.map((w) => {
                    const cellKey = `${m.id}::${w}`;
                    const wl = workloadByKey[cellKey];
                    const planned = wl ? Number(wl.plannedHours) : 0;
                    const capacity = weeklyCapacityHours(w);
                    const over = planned > capacity;
                    const cellTasks = tasksByKey[cellKey] ?? [];
                    return (
                      <td
                        key={w}
                        className="glass-cell"
                        style={{ verticalAlign: "top", minWidth: 200 }}
                      >
                        <HoursBadge
                          memberId={m.id}
                          weekIso={w}
                          planned={planned}
                          capacity={capacity}
                          over={over}
                          isEdit={isEdit}
                          onChange={(h) => setHours(m.id, w, h)}
                        />
                        <ul
                          className="cell-task-list"
                          style={{
                            listStyle: "none",
                            margin: "8px 0 0",
                            padding: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 0,
                          }}
                        >
                          {cellTasks.map((t, idx) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              project={projectsById[t.projectId]}
                              isEdit={isEdit}
                              onToggle={() => toggleDone(t)}
                              canMoveUp={idx > 0}
                              canMoveDown={idx < cellTasks.length - 1}
                              onMoveUp={() => reorderInCell(cellTasks, idx, -1)}
                              onMoveDown={() =>
                                reorderInCell(cellTasks, idx, 1)
                              }
                              onShiftPrev={() => shiftWeek(t, -1)}
                              onShiftNext={() => shiftWeek(t, 1)}
                            />
                          ))}
                        </ul>
                        {isEdit &&
                          cellTasks.some((t) => !t.done) &&
                          cellTasks.length > 0 && (
                            <button
                              type="button"
                              className="edit-only"
                              onClick={() =>
                                shiftAllUnfinishedToNextWeek(cellTasks)
                              }
                              style={{
                                marginTop: 6,
                                fontSize: ".6875rem",
                                color: "var(--color-text-muted)",
                                background: "rgba(255,255,255,.42)",
                                border: "1px dashed rgba(255,255,255,.62)",
                                borderRadius: 6,
                                padding: "3px 8px",
                                cursor: "pointer",
                                width: "100%",
                                textAlign: "left",
                              }}
                              title="このセルの未完了タスクをすべて翌週に移す"
                            >
                              未完了を翌週へ →
                            </button>
                          )}
                        {isEdit && (projects?.length ?? 0) > 0 && (
                          <QuickAdd
                            memberId={m.id}
                            weekIso={w}
                            projects={projects ?? []}
                            onAdd={(projectId, title) =>
                              addQuickTask(m.id, w, projectId, title)
                            }
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid rgba(255,255,255,.45)",
        }}
        className="t-small muted"
      >
        <span>
          基準容量: 通常週 {WORK_RULES.workDays.length * WORK_RULES.dailyWorkHours - WORK_RULES.weeklyMtgHours}h
          ・実働 {WORK_RULES.dailyWorkHours}h/日 ・MTG 控除 {WORK_RULES.weeklyMtgHours}h/週
        </span>
        <span>残業上限: 月 {WORK_RULES.monthlyOvertimeLimitHours}h まで</span>
      </footer>
    </section>
  );
}

function HoursBadge({
  planned,
  capacity,
  over,
  isEdit,
  onChange,
}: {
  memberId: number;
  weekIso: string;
  planned: number;
  capacity: number;
  over: boolean;
  isEdit: boolean;
  onChange: (h: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(planned));
  useEffect(() => {
    setDraft(String(planned));
  }, [planned]);
  if (!isEdit) {
    return (
      <div
        className={`badge ${over ? "badge-error" : planned === 0 ? "" : "badge-ok"}`}
        style={{ width: "fit-content" }}
      >
        <strong className="mono">{planned || "—"}</strong>
        <span className="muted">/ {capacity}h</span>
      </div>
    );
  }
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 6, width: "fit-content" }}
      className="editable-only"
    >
      <input
        className="input"
        type="number"
        min={0}
        max={168}
        step={0.5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isFinite(next) && next !== planned) onChange(next);
        }}
        style={{ width: 64, padding: "4px 8px", fontSize: ".75rem" }}
      />
      <span className="t-small muted">/ {capacity}h</span>
      {over && (
        <span className="badge badge-error" style={{ fontSize: ".625rem" }}>
          超過
        </span>
      )}
    </div>
  );
}

const moveBtnStyle: React.CSSProperties = {
  fontSize: ".625rem",
  lineHeight: 1,
  padding: "2px 4px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--color-text-muted)",
  minWidth: 16,
  textAlign: "center",
};

function TaskRow({
  task,
  project,
  isEdit,
  onToggle,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onShiftPrev,
  onShiftNext,
}: {
  task: Task;
  project: Project | undefined;
  isEdit: boolean;
  onToggle: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onShiftPrev?: () => void;
  onShiftNext?: () => void;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        fontSize: ".75rem",
        lineHeight: 1.4,
      }}
    >
      <input
        type="checkbox"
        className="checkbox"
        checked={task.done}
        onChange={onToggle}
        disabled={!isEdit}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {project?.company && (
          <span style={{ marginRight: 5, verticalAlign: "middle" }}>
            <CompanyChip company={project.company} size="xs" />
          </span>
        )}
        {project && (
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: 999,
              background: project.color,
              marginRight: 5,
              verticalAlign: "middle",
            }}
          />
        )}
        <span
          style={{
            textDecoration: task.done ? "line-through" : "none",
            color: task.done ? "var(--color-text-light)" : "var(--color-text)",
          }}
        >
          {task.title}
        </span>
      </div>
      {isEdit && (onMoveUp || onMoveDown || onShiftPrev || onShiftNext) && (
        <div
          className="edit-only"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="上へ"
            style={moveBtnStyle}
          >
            ↑
          </button>
          <div style={{ display: "flex", gap: 0 }}>
            {onShiftPrev && (
              <button
                type="button"
                onClick={onShiftPrev}
                title="前週へ戻す"
                style={moveBtnStyle}
              >
                ←
              </button>
            )}
            {onShiftNext && (
              <button
                type="button"
                onClick={onShiftNext}
                title="翌週へ移動"
                style={moveBtnStyle}
              >
                →
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="下へ"
            style={moveBtnStyle}
          >
            ↓
          </button>
        </div>
      )}
    </li>
  );
}

type QuickAddDraft = { projectId: number; title: string };
const QUICK_ADD_DRAFT_VERSION = 1;
const quickAddDraftKey = (memberId: number, weekIso: string) =>
  `ig-schedule:draft:quick-add:${memberId}:${weekIso}`;

function QuickAdd({
  memberId,
  weekIso,
  projects,
  onAdd,
}: {
  memberId: number;
  weekIso: string;
  projects: Project[];
  onAdd: (projectId: number, title: string) => void;
}) {
  const draftKey = quickAddDraftKey(memberId, weekIso);
  const [initial] = useState<QuickAddDraft | null>(() =>
    restoreDraft<QuickAddDraft>(draftKey, QUICK_ADD_DRAFT_VERSION),
  );
  const [projectId, setProjectId] = useState<number>(
    initial?.projectId ?? projects[0]?.id ?? 0,
  );
  const [title, setTitle] = useState(initial?.title ?? "");

  const snapshot = useMemo<QuickAddDraft>(
    () => ({ projectId, title }),
    [projectId, title],
  );
  const { clear: clearStoredDraft } = useAutosaveDraft(
    draftKey,
    QUICK_ADD_DRAFT_VERSION,
    snapshot,
  );

  return (
    <form
      className="edit-only"
      style={{ display: "flex", gap: 4, marginTop: 6 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && projectId) {
          onAdd(projectId, title);
          setTitle("");
          clearStoredDraft();
        }
      }}
    >
      <select
        className="input"
        value={projectId}
        onChange={(e) => setProjectId(Number(e.target.value))}
        style={{ padding: "4px 6px", fontSize: ".6875rem", width: 64 }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        className="input"
        placeholder="タスクを追加"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ padding: "4px 8px", fontSize: ".6875rem", flex: 1 }}
      />
    </form>
  );
}
