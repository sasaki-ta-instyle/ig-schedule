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
};

const WEEK_COUNT = 6;
const REFRESH_MS = 5000;

export function Dashboard() {
  const { isEdit } = useEditMode();
  const [anchorWeek, setAnchorWeek] = useState<string>(currentWeekIso());
  const weeks = useMemo(() => weekIsoRange(anchorWeek, WEEK_COUNT), [anchorWeek]);
  const weekFrom = weeks[0];
  const weekTo = weeks[weeks.length - 1];

  const { data: members } = useSWR<Member[]>("/api/members", fetcher, {
    refreshInterval: REFRESH_MS,
  });
  const { data: projects } = useSWR<Project[]>("/api/projects", fetcher, {
    refreshInterval: REFRESH_MS,
  });
  const tasksKey = `/api/tasks?weekFrom=${weekFrom}&weekTo=${weekTo}`;
  const { data: tasks } = useSWR<Task[]>(tasksKey, fetcher, {
    refreshInterval: REFRESH_MS,
  });
  const workloadKey = `/api/workload?weekFrom=${weekFrom}&weekTo=${weekTo}`;
  const { data: workload } = useSWR<Workload[]>(workloadKey, fetcher, {
    refreshInterval: REFRESH_MS,
  });

  const projectsById = useMemo(() => {
    const m: Record<number, Project> = {};
    for (const p of projects ?? []) m[p.id] = p;
    return m;
  }, [projects]);

  const workloadByKey = useMemo(() => {
    const m: Record<string, Workload> = {};
    for (const w of workload ?? []) m[`${w.memberId}::${w.weekIso}`] = w;
    return m;
  }, [workload]);

  const tasksByKey = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of tasks ?? []) {
      if (t.assigneeMemberId == null) continue;
      const key = `${t.assigneeMemberId}::${t.weekIso}`;
      (m[key] ??= []).push(t);
    }
    return m;
  }, [tasks]);

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
          <span className="eyebrow">DASHBOARD</span>
          <h2 className="t-h3" style={{ marginTop: 4 }}>
            メンバー × 週
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
                    padding: 0,
                    border: "none",
                    zIndex: 4,
                  }}
                  aria-hidden="true"
                ></th>
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
                          style={{
                            listStyle: "none",
                            margin: "8px 0 0",
                            padding: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          {cellTasks.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              project={projectsById[t.projectId]}
                              isEdit={isEdit}
                              onToggle={() => toggleDone(t)}
                            />
                          ))}
                        </ul>
                        {isEdit && (projects?.length ?? 0) > 0 && (
                          <QuickAdd
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

function TaskRow({
  task,
  project,
  isEdit,
  onToggle,
}: {
  task: Task;
  project: Project | undefined;
  isEdit: boolean;
  onToggle: () => void;
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
    </li>
  );
}

function QuickAdd({
  projects,
  onAdd,
}: {
  projects: Project[];
  onAdd: (projectId: number, title: string) => void;
}) {
  const [projectId, setProjectId] = useState<number>(projects[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  return (
    <form
      className="edit-only"
      style={{ display: "flex", gap: 4, marginTop: 6 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && projectId) {
          onAdd(projectId, title);
          setTitle("");
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
