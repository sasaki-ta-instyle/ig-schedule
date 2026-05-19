"use client";

import useSWR, { mutate } from "swr";
import { useEffect, useMemo, useState } from "react";
import { addWeeks, currentWeekIso, weekIsoLabel, weekIsoRange } from "@/lib/week";
import { fetcher, postJson, del } from "@/lib/api";
import { useEditMode } from "@/hooks/useEditMode";
import { restoreDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import type { Company } from "@/lib/companies";
import { CompanyChip } from "@/components/CompanyChip";

type Member = { id: number; name: string; color: string };
type Project = {
  id: number;
  name: string;
  color: string;
  status: string;
  company: Company | null;
};
type Task = {
  id: number;
  projectId: number;
  title: string;
  assigneeMemberId: number | null;
  weekIso: string;
  done: boolean;
  notes: string | null;
  estimatedHours: string | null;
};

const REFRESH_MS = 5000;
const RANGE = 12;
const EXPANDED_STORAGE_KEY = "ig-schedule:project-expanded";
const PAGE_SIZE_STORAGE_KEY = "ig-schedule:projects-page-size";
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 10;

export function TaskBoard() {
  const { isEdit } = useEditMode();
  const [anchorWeek] = useState<string>(addWeeks(currentWeekIso(), -2));
  const weeks = useMemo(() => weekIsoRange(anchorWeek, RANGE), [anchorWeek]);
  const weekFrom = weeks[0];
  const weekTo = weeks[weeks.length - 1];

  const [filterMember, setFilterMember] = useState<number | "all">("all");
  const [filterProject, setFilterProject] = useState<number | "all">("all");
  const [filterDone, setFilterDone] = useState<"all" | "open" | "done">("all");
  const [keyword, setKeyword] = useState<string>("");

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [expandedHydrated, setExpandedHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) {
          setExpanded(
            new Set(arr.filter((v): v is number => typeof v === "number"))
          );
        }
      }
    } catch {
      // localStorage 不在・JSON 破損は無視
    }
    setExpandedHydrated(true);
  }, []);

  useEffect(() => {
    if (!expandedHydrated) return;
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...expanded]));
    } catch {
      // quota 等は無視
    }
  }, [expanded, expandedHydrated]);

  function toggleExpanded(projectId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
      if (raw) {
        const n = Number(raw);
        if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) {
          setPageSize(n as PageSize);
        }
      }
    } catch {
      // 無視
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
    } catch {
      // 無視
    }
  }, [pageSize]);

  const { data: members } = useSWR<Member[]>("/api/members", fetcher);
  const { data: projects } = useSWR<Project[]>("/api/projects", fetcher);
  const tasksKey = `/api/tasks?weekFrom=${weekFrom}&weekTo=${weekTo}`;
  const { data: tasks } = useSWR<Task[]>(tasksKey, fetcher, {
    refreshInterval: REFRESH_MS,
  });

  const memberById = useMemo(() => {
    const m: Record<number, Member> = {};
    for (const x of members ?? []) m[x.id] = x;
    return m;
  }, [members]);

  const projectNameById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const p of projects ?? []) m[p.id] = p.name;
    return m;
  }, [projects]);

  const trimmedKeyword = keyword.trim().toLowerCase();

  const filtered = useMemo(() => {
    return (tasks ?? []).filter((t) => {
      if (filterMember !== "all" && t.assigneeMemberId !== filterMember) return false;
      if (filterProject !== "all" && t.projectId !== filterProject) return false;
      if (filterDone === "open" && t.done) return false;
      if (filterDone === "done" && !t.done) return false;
      if (trimmedKeyword) {
        const haystack = [
          t.title,
          t.notes ?? "",
          projectNameById[t.projectId] ?? "",
        ]
          .join("\n")
          .toLowerCase();
        if (!haystack.includes(trimmedKeyword)) return false;
      }
      return true;
    });
  }, [tasks, filterMember, filterProject, filterDone, trimmedKeyword, projectNameById]);

  const grouped = useMemo(() => {
    const m: Record<number, Task[]> = {};
    for (const t of filtered) (m[t.projectId] ??= []).push(t);
    return m;
  }, [filtered]);

  const visibleProjects = useMemo(() => {
    return (projects ?? [])
      .filter((p) => filterProject === "all" || p.id === filterProject)
      .filter((p) => !trimmedKeyword || (grouped[p.id]?.length ?? 0) > 0);
  }, [projects, filterProject, trimmedKeyword, grouped]);

  const totalPages = Math.max(1, Math.ceil(visibleProjects.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [filterMember, filterProject, filterDone, trimmedKeyword, pageSize]);

  const pagedProjects = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return visibleProjects.slice(start, start + pageSize);
  }, [visibleProjects, safePage, pageSize]);

  const workloadKey = `/api/workload?weekFrom=${weekFrom}&weekTo=${weekTo}`;

  async function toggleDone(t: Task) {
    await postJson(`/api/tasks/${t.id}`, { done: !t.done }, "PATCH");
    mutate(tasksKey);
  }
  async function updateField(t: Task, patch: Record<string, unknown>) {
    await postJson(`/api/tasks/${t.id}`, patch, "PATCH");
    mutate(tasksKey);
    mutate(workloadKey);
  }
  async function remove(t: Task) {
    await del(`/api/tasks/${t.id}`);
    mutate(tasksKey);
    mutate(workloadKey);
  }

  return (
    <section className="glass-panel" style={{ padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span className="eyebrow">TASK BOARD</span>
          <h2 className="t-h3" style={{ marginTop: 4 }}>
            プロジェクト別タスク
          </h2>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="タスク・メモ・プロジェクト名を検索"
            style={{ width: 240 }}
            aria-label="タスクを検索"
          />
          <select
            className="input"
            value={String(filterProject)}
            onChange={(e) =>
              setFilterProject(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            style={{ width: 180 }}
          >
            <option value="all">プロジェクト: すべて</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={String(filterMember)}
            onChange={(e) =>
              setFilterMember(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            style={{ width: 140 }}
          >
            <option value="all">担当: すべて</option>
            {members?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filterDone}
            onChange={(e) => setFilterDone(e.target.value as "all" | "open" | "done")}
            style={{ width: 130 }}
          >
            <option value="all">状態: すべて</option>
            <option value="open">未完了のみ</option>
            <option value="done">完了のみ</option>
          </select>
          <select
            className="input"
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
            style={{ width: 130 }}
            aria-label="1ページあたりのプロジェクト件数"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} 件 / ページ
              </option>
            ))}
          </select>
        </div>
      </header>

      {!projects ? (
        <p className="muted">読み込み中…</p>
      ) : projects.length === 0 ? (
        <p className="muted">
          プロジェクトがありません。「プロジェクト管理」ページから追加してください。
        </p>
      ) : trimmedKeyword && filtered.length === 0 ? (
        <p className="muted">
          「{keyword.trim()}」に一致するタスクは見つかりませんでした。
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pagedProjects.map((p) => {
              const list = grouped[p.id] ?? [];
              const isCollapsed = trimmedKeyword
                ? false
                : !expanded.has(p.id);
              const panelId = `project-panel-${p.id}`;
              return (
                <div key={p.id} className="glass-card" style={{ padding: 16 }}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(p.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={panelId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: isCollapsed ? 0 : 10,
                      width: "100%",
                      padding: 0,
                      border: 0,
                      background: "transparent",
                      color: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-flex",
                        width: 14,
                        justifyContent: "center",
                        color: "var(--color-text-light)",
                        fontSize: ".75rem",
                        transform: isCollapsed
                          ? "rotate(-90deg)"
                          : "rotate(0deg)",
                        transition: "transform .15s ease",
                      }}
                    >
                      ▾
                    </span>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: p.color,
                      }}
                    />
                    <strong className="t-h4" style={{ fontSize: "1rem" }}>
                      {p.name}
                    </strong>
                    {p.company && <CompanyChip company={p.company} size="sm" />}
                    <span className="muted t-small">
                      ({list.filter((t) => t.done).length}/{list.length})
                    </span>
                  </button>
                  <div id={panelId} hidden={isCollapsed}>
                  {list.length === 0 ? (
                    <p className="muted t-small">該当タスクなし</p>
                  ) : (
                    <ul
                      className="task-list"
                      style={{
                        listStyle: "none",
                        padding: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {list.map((t) => (
                        <li
                          key={t.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "auto 1fr 110px 110px 64px auto",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 8px",
                            borderRadius: "var(--r-sm)",
                          }}
                        >
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={t.done}
                            onChange={() => toggleDone(t)}
                            disabled={!isEdit}
                          />
                          {isEdit ? (
                            <input
                              className="input editable-only"
                              defaultValue={t.title}
                              onBlur={(e) => {
                                const v = e.currentTarget.value.trim();
                                if (v && v !== t.title) updateField(t, { title: v });
                              }}
                              style={{ fontSize: ".8125rem" }}
                            />
                          ) : (
                            <span
                              style={{
                                textDecoration: t.done ? "line-through" : "none",
                                color: t.done ? "var(--color-text-light)" : undefined,
                                fontSize: ".8125rem",
                              }}
                            >
                              {t.title}
                            </span>
                          )}
                          <select
                            className="input editable-only"
                            value={t.assigneeMemberId ?? ""}
                            onChange={(e) =>
                              updateField(t, {
                                assigneeMemberId: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                            disabled={!isEdit}
                            style={{
                              fontSize: ".75rem",
                              padding: "4px 8px",
                            }}
                          >
                            <option value="">未割当</option>
                            {members?.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <WeekPicker
                            weekIso={t.weekIso}
                            weeks={weeks}
                            isEdit={isEdit}
                            onChange={(w) => updateField(t, { weekIso: w })}
                          />
                          <HoursCell
                            value={t.estimatedHours}
                            isEdit={isEdit}
                            onChange={(h) => updateField(t, { estimatedHours: h })}
                          />
                          {isEdit && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm edit-only"
                              onClick={() => {
                                if (confirm(`「${t.title}」を削除しますか？`)) remove(t);
                              }}
                              title="削除"
                              style={{ fontSize: ".75rem" }}
                            >
                              ×
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {isEdit && (
                    <NewTaskInline
                      projectId={p.id}
                      members={members ?? []}
                      weeks={weeks}
                      onCreated={() => mutate(tasksKey)}
                    />
                  )}
                  </div>
                </div>
              );
            })}
          {visibleProjects.length > pageSize && (
            <nav
              aria-label="プロジェクトのページ送り"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                marginTop: 8,
              }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                aria-label="前のページ"
              >
                ← 前へ
              </button>
              <span className="muted t-small" aria-live="polite">
                {safePage} / {totalPages} ページ（全 {visibleProjects.length} 件）
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={safePage >= totalPages}
                aria-label="次のページ"
              >
                次へ →
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}

function HoursCell({
  value,
  isEdit,
  onChange,
}: {
  value: string | null;
  isEdit: boolean;
  onChange: (h: number | null) => void;
}) {
  const initial = value == null ? "" : String(Number(value));
  const [draft, setDraft] = useState<string>(initial);
  useEffect(() => {
    setDraft(initial);
  }, [initial]);
  if (!isEdit) {
    return (
      <span
        className="t-small mono muted"
        style={{ textAlign: "right", paddingRight: 4 }}
      >
        {value == null || Number(value) === 0 ? "—" : `${Number(value)}h`}
      </span>
    );
  }
  return (
    <input
      className="input editable-only"
      type="number"
      min={0}
      max={40}
      step={0.5}
      value={draft}
      placeholder="h"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === "") {
          if (value != null) onChange(null);
          return;
        }
        const n = Number(draft);
        if (Number.isFinite(n) && n !== Number(value ?? 0)) onChange(n);
      }}
      style={{ fontSize: ".75rem", padding: "4px 6px", textAlign: "right" }}
    />
  );
}

function WeekPicker({
  weekIso,
  weeks,
  isEdit,
  onChange,
}: {
  weekIso: string;
  weeks: string[];
  isEdit: boolean;
  onChange: (w: string) => void;
}) {
  const all = useMemo(() => {
    return weeks.includes(weekIso) ? weeks : [weekIso, ...weeks].sort();
  }, [weeks, weekIso]);
  if (!isEdit) {
    return (
      <span className="t-small mono muted" title={weekIso}>
        {weekIsoLabel(weekIso)}
      </span>
    );
  }
  return (
    <select
      className="input editable-only"
      value={weekIso}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontSize: ".75rem", padding: "4px 8px" }}
      title={weekIso}
    >
      {all.map((w) => (
        <option key={w} value={w}>
          {weekIsoLabel(w)}
        </option>
      ))}
    </select>
  );
}

type NewTaskDraft = {
  title: string;
  weekIso: string;
  assigneeId: number | "";
  hours: string;
};
const NEW_TASK_DRAFT_VERSION = 1;
const newTaskDraftKey = (projectId: number) =>
  `ig-schedule:draft:new-task:${projectId}`;

function NewTaskInline({
  projectId,
  members,
  weeks,
  onCreated,
}: {
  projectId: number;
  members: Member[];
  weeks: string[];
  onCreated: () => void;
}) {
  const draftKey = newTaskDraftKey(projectId);
  const [initial] = useState<NewTaskDraft | null>(() =>
    restoreDraft<NewTaskDraft>(draftKey, NEW_TASK_DRAFT_VERSION),
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [weekIso, setWeekIso] = useState(
    initial?.weekIso ?? weeks[2] ?? weeks[0],
  );
  const [assigneeId, setAssigneeId] = useState<number | "">(
    initial?.assigneeId ?? "",
  );
  const [hours, setHours] = useState<string>(initial?.hours ?? "");

  const snapshot = useMemo<NewTaskDraft>(
    () => ({ title, weekIso, assigneeId, hours }),
    [title, weekIso, assigneeId, hours],
  );
  const { clear: clearStoredDraft } = useAutosaveDraft(
    draftKey,
    NEW_TASK_DRAFT_VERSION,
    snapshot,
  );

  return (
    <form
      className="edit-only"
      style={{
        display: "flex",
        gap: 6,
        marginTop: 8,
        alignItems: "center",
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const h = hours === "" ? null : Number(hours);
        await postJson("/api/tasks", {
          projectId,
          title: title.trim(),
          weekIso,
          assigneeMemberId: assigneeId === "" ? null : assigneeId,
          estimatedHours: h != null && Number.isFinite(h) ? h : null,
        });
        setTitle("");
        setHours("");
        clearStoredDraft();
        onCreated();
      }}
    >
      <input
        className="input"
        placeholder="＋ 新規タスク"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ flex: 1, fontSize: ".8125rem" }}
      />
      <select
        className="input"
        value={assigneeId}
        onChange={(e) =>
          setAssigneeId(e.target.value === "" ? "" : Number(e.target.value))
        }
        style={{ width: 110, fontSize: ".75rem" }}
      >
        <option value="">未割当</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select
        className="input"
        value={weekIso}
        onChange={(e) => setWeekIso(e.target.value)}
        style={{ width: 110, fontSize: ".75rem" }}
        title={weekIso}
      >
        {weeks.map((w) => (
          <option key={w} value={w}>
            {weekIsoLabel(w)}
          </option>
        ))}
      </select>
      <input
        className="input"
        type="number"
        min={0}
        max={40}
        step={0.5}
        placeholder="h"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        style={{ width: 56, fontSize: ".75rem", textAlign: "right" }}
      />
      <button type="submit" className="btn btn-secondary btn-sm">
        追加
      </button>
    </form>
  );
}
