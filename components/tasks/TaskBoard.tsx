"use client";

import useSWR, { mutate } from "swr";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { addWeeks, currentWeekIso, weekIsoLabel, weekIsoRange } from "@/lib/week";
import { fetcher, postJson, del } from "@/lib/api";
import { SWR_REFRESH_MS } from "@/lib/swr-config";
import { useEditMode } from "@/hooks/useEditMode";
import { restoreDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { useTaskHistory } from "@/hooks/useTaskHistory";
import type { Company } from "@/lib/companies";
import { CompanyChip } from "@/components/CompanyChip";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const ROW_GRID_TASKBOARD = "20px auto 1fr 110px 110px 64px auto";

const baseRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: ROW_GRID_TASKBOARD,
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  borderRadius: "var(--r-sm)",
};

const dragHandleStyle: CSSProperties = {
  padding: "2px 2px",
  fontSize: ".875rem",
  lineHeight: 1,
  color: "var(--color-text-light)",
  cursor: "grab",
  touchAction: "none",
};

const dragHandleStyleDragging: CSSProperties = {
  ...dragHandleStyle,
  cursor: "grabbing",
};

const doneRowStyle: CSSProperties = {
  ...baseRowStyle,
  opacity: 0.55,
};

const doneRowHandleStyle: CSSProperties = {
  fontSize: ".875rem",
  lineHeight: 1,
  color: "var(--color-text-light)",
  textAlign: "center",
  cursor: "not-allowed",
};

const removeBtnStyle: CSSProperties = { fontSize: ".75rem" };

const taskListStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

// ドラッグ中のオーバーレイ。元の行は薄くなり、こちらが浮いて追従する。
// 「何を運んでいるか」を一瞥で示すため、プロジェクト名 → タスク名 → 担当/工数
// の 3 段で表示するカード型に。
const dragOverlayCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "var(--space-3) var(--space-4)",
  borderRadius: "var(--r)",
  background: "var(--glass-light)",
  backdropFilter: "var(--glass-blur-sm)",
  WebkitBackdropFilter: "var(--glass-blur-sm)",
  boxShadow: "var(--glass-shadow)",
  border: "1px solid var(--glass-border-l)",
  cursor: "grabbing",
  minWidth: 240,
  maxWidth: 360,
};

const dragOverlayProjectStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: ".6875rem",
  color: "var(--color-text-muted)",
  letterSpacing: ".04em",
  textTransform: "uppercase",
};

const dragOverlayProjectDotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  flexShrink: 0,
};

const dragOverlayTitleStyle: CSSProperties = {
  fontSize: ".875rem",
  fontWeight: 600,
  color: "var(--color-text)",
  lineHeight: 1.35,
};

const dragOverlayMetaStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  fontSize: ".75rem",
  color: "var(--color-text-muted)",
};

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
  sortOrder: number;
};

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

  const [filterMember, setFilterMember] = useState<
    number | "all" | "unassigned"
  >("all");
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
  const [pageSizeHydrated, setPageSizeHydrated] = useState(false);

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
    setPageSizeHydrated(true);
  }, []);

  useEffect(() => {
    if (!pageSizeHydrated) return;
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
    } catch {
      // 無視
    }
  }, [pageSize, pageSizeHydrated]);

  // DnD 中はポーリングを止めて transform 計算と干渉させない。
  // activeId が非 null の間は自動 revalidate を停止し、楽観更新だけが UI に反映される。
  const [activeId, setActiveId] = useState<number | null>(null);
  const isDragging = activeId != null;

  const { data: members } = useSWR<Member[]>("/api/members", fetcher);
  const { data: projects } = useSWR<Project[]>("/api/projects", fetcher);
  const tasksKey = `/api/tasks?weekFrom=${weekFrom}&weekTo=${weekTo}`;
  // SWR v2 の mergeObjects は単純 spread のため `undefined` を渡すと provider 値を
  // 踏み潰す。明示的に SWR_REFRESH_MS を入れて provider 値と同期させる。
  const { data: tasks } = useSWR<Task[]>(tasksKey, fetcher, {
    refreshInterval: isDragging ? 0 : SWR_REFRESH_MS,
    revalidateOnFocus: !isDragging,
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

  // 検索フィルタは入力ごとに全タスク走査 + groupedByWeek / visibleProjects 連鎖が
  // 走る。React 19 の useDeferredValue で「タイプ中は古い結果を表示しつつ、裏で
  // 新しい結果を計算する」モードに切り替えると、入力欄のラグが消える。
  const deferredKeyword = useDeferredValue(keyword);
  const trimmedKeyword = deferredKeyword.trim().toLowerCase();

  const filtered = useMemo(() => {
    return (tasks ?? []).filter((t) => {
      if (filterMember === "unassigned") {
        if (t.assigneeMemberId != null) return false;
      } else if (filterMember !== "all") {
        if (t.assigneeMemberId !== filterMember) return false;
      }
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

  // (projectId, weekIso) ごとに「未完了 → sortOrder → id」「完了は下（done=true）」の順で並べる
  // openIds は SortableContext.items 用に毎レンダー新規生成しないように bucket 構築時に併せて作る。
  type WeekBucket = {
    weekIso: string;
    open: Task[];
    done: Task[];
    openIds: number[];
  };
  const groupedByWeek = useMemo(() => {
    const m: Record<number, WeekBucket[]> = {};
    for (const projectId of Object.keys(grouped).map(Number)) {
      const byWeek = new Map<string, WeekBucket>();
      for (const t of grouped[projectId]) {
        let b = byWeek.get(t.weekIso);
        if (!b) {
          b = { weekIso: t.weekIso, open: [], done: [], openIds: [] };
          byWeek.set(t.weekIso, b);
        }
        if (t.done) {
          b.done.push(t);
        } else {
          b.open.push(t);
          b.openIds.push(t.id);
        }
      }
      const buckets = [...byWeek.values()].sort((a, b) =>
        a.weekIso.localeCompare(b.weekIso),
      );
      m[projectId] = buckets;
    }
    return m;
  }, [grouped]);

  // タスクID → タスク本体のルックアップ。最上位 DndContext の onDragEnd で
  // active.id だけから projectId/weekIso を引くために使う。
  const tasksById = useMemo(() => {
    const m = new Map<number, Task>();
    for (const t of tasks ?? []) m.set(t.id, t);
    return m;
  }, [tasks]);
  const tasksByIdRef = useRef(tasksById);
  useEffect(() => {
    tasksByIdRef.current = tasksById;
  }, [tasksById]);

  // 担当 / 状態 / キーワードのいずれかでタスク側を絞り込んでいるとき、該当タスクが
  // 0 件のプロジェクトカードは「空カードがフィルタを素通りして見える」誤解を生むため
  // 非表示にする。プロジェクトフィルタだけがアクティブな場合は、そのプロジェクトの
  // カードを意図的に出したい運用なので空でも残す。
  const hideEmptyProjects =
    trimmedKeyword !== "" || filterMember !== "all" || filterDone !== "all";
  const visibleProjects = useMemo(() => {
    return (projects ?? [])
      .filter((p) => filterProject === "all" || p.id === filterProject)
      .filter((p) => !hideEmptyProjects || (grouped[p.id]?.length ?? 0) > 0);
  }, [projects, filterProject, hideEmptyProjects, grouped]);

  const totalPages = Math.max(1, Math.ceil(visibleProjects.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    setPage(1);
  }, [filterMember, filterProject, filterDone, trimmedKeyword, pageSize]);

  const pagedProjects = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return visibleProjects.slice(start, start + pageSize);
  }, [visibleProjects, safePage, pageSize]);

  const workloadKey = `/api/workload?weekFrom=${weekFrom}&weekTo=${weekTo}`;

  const { pushHistory } = useTaskHistory();

  // tasksKey の楽観更新ヘルパ。refreshInterval との交錯を避けるため
  // 全ての書込みは mutate({ optimisticData, rollbackOnError, revalidate: false }) で行う。
  const commitTaskPatch = useCallback(async (
    id: number,
    patch: Record<string, unknown>,
    apply: (t: Task) => Task,
    opts: { affectsWorkload: boolean },
  ) => {
    await mutate<Task[]>(
      tasksKey,
      async (current) => {
        await postJson(`/api/tasks/${id}`, patch, "PATCH");
        return (current ?? []).map((t) => (t.id === id ? apply(t) : t));
      },
      {
        optimisticData: (current) =>
          (current ?? []).map((t) => (t.id === id ? apply(t) : t)),
        rollbackOnError: true,
        populateCache: true,
        revalidate: false,
      },
    );
    if (opts.affectsWorkload) mutate(workloadKey);
  }, [tasksKey, workloadKey]);

  const toggleDone = useCallback(async (t: Task) => {
    const newDone = !t.done;
    const oldDone = t.done;
    try {
      await commitTaskPatch(
        t.id,
        { done: newDone },
        (x) => ({ ...x, done: newDone }),
        { affectsWorkload: false },
      );
    } catch (e) {
      console.error("toggleDone failed", e);
      return;
    }
    pushHistory({
      label: "完了切替",
      do: () =>
        commitTaskPatch(
          t.id,
          { done: newDone },
          (x) => ({ ...x, done: newDone }),
          { affectsWorkload: false },
        ),
      undo: () =>
        commitTaskPatch(
          t.id,
          { done: oldDone },
          (x) => ({ ...x, done: oldDone }),
          { affectsWorkload: false },
        ),
    });
  }, [commitTaskPatch, pushHistory]);

  const updateField = useCallback(async (t: Task, patch: Record<string, unknown>) => {
    // API は `"key" in body` で判定し null=明示NULL, キー欠落=更新しない の分離をしている。
    // 旧値が undefined のキーは oldPatch に含めず、誤って null で上書きしないようにする。
    const oldPatch: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) {
      const v = (t as unknown as Record<string, unknown>)[k];
      if (v !== undefined) oldPatch[k] = v;
    }
    const affectsWorkload =
      "estimatedHours" in patch ||
      "assigneeMemberId" in patch ||
      "weekIso" in patch;

    const applyPatch = (p: Record<string, unknown>) => (x: Task): Task =>
      ({ ...x, ...p }) as Task;

    try {
      await commitTaskPatch(t.id, patch, applyPatch(patch), { affectsWorkload });
    } catch (e) {
      console.error("updateField failed", e);
      return;
    }
    pushHistory({
      label: "編集",
      do: () => commitTaskPatch(t.id, patch, applyPatch(patch), { affectsWorkload }),
      undo: () =>
        commitTaskPatch(t.id, oldPatch, applyPatch(oldPatch), { affectsWorkload }),
    });
  }, [commitTaskPatch, pushHistory]);

  const remove = useCallback(async (t: Task) => {
    await del(`/api/tasks/${t.id}`);
    mutate(tasksKey);
    mutate(workloadKey);
  }, [tasksKey, workloadKey]);

  function applyOptimisticOrder(map: Map<number, number>) {
    return (prev: Task[] = []) =>
      [...prev]
        .map((t) => (map.has(t.id) ? { ...t, sortOrder: map.get(t.id)! } : t))
        .sort(
          (a, b) =>
            a.weekIso.localeCompare(b.weekIso) ||
            a.sortOrder - b.sortOrder ||
            a.id - b.id,
        );
  }

  async function commitReorderMap(map: Map<number, number>) {
    await mutate<Task[]>(
      tasksKey,
      async (current) => {
        await postJson("/api/tasks/batch", {
          ops: [...map.entries()].map(([id, sortOrder]) => ({
            id,
            patch: { sortOrder },
          })),
        });
        return applyOptimisticOrder(map)(current);
      },
      {
        optimisticData: applyOptimisticOrder(map),
        rollbackOnError: true,
        populateCache: true,
        revalidate: false,
      },
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function reorderInWeekGroup(
    projectId: number,
    weekIso: string,
    fromId: number,
    toId: number,
  ) {
    if (fromId === toId) return;
    const bucket = (groupedByWeek[projectId] ?? []).find((b) => b.weekIso === weekIso);
    if (!bucket) return;
    const fromIdx = bucket.open.findIndex((t) => t.id === fromId);
    const toIdx = bucket.open.findIndex((t) => t.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const nextOpen = arrayMove(bucket.open, fromIdx, toIdx);

    // prev / next とも 0-indexed の連番で送る（対称性確保）。
    // bucket.open は表示時点の並び順なので、その並びを 0,1,2... に正規化したものが「元の順序」。
    const prevOrderMap = new Map(
      bucket.open.map((t, i) => [t.id, i] as const),
    );
    const nextOrderMap = new Map(nextOpen.map((t, i) => [t.id, i] as const));

    try {
      await commitReorderMap(nextOrderMap);
      pushHistory({
        label: "並び替え",
        do: () => commitReorderMap(nextOrderMap),
        undo: () => commitReorderMap(prevOrderMap),
      });
    } catch (e) {
      console.error("taskboard reorder failed", e);
      // 楽観更新の rollback が SWR 側で非同期に走るため、UI と最新サーバ状態の
      // 整合を保証するために手動 revalidate を await する
      try {
        await mutate(tasksKey);
      } catch {
        // 二重失敗は無視
      }
    }
  }

  const activeTask =
    activeId != null ? tasksById.get(activeId) ?? null : null;
  const activeProject =
    activeTask != null
      ? (projects ?? []).find((p) => p.id === activeTask.projectId) ?? null
      : null;
  const activeAssignee =
    activeTask?.assigneeMemberId != null
      ? memberById[activeTask.assigneeMemberId] ?? null
      : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e: DragStartEvent) => {
        const id = Number(e.active.id);
        if (Number.isFinite(id)) setActiveId(id);
      }}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={(e: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = e;
        if (!over) return;
        const fromId = Number(active.id);
        const toId = Number(over.id);
        if (!Number.isFinite(fromId) || !Number.isFinite(toId)) return;
        if (fromId === toId) return;
        const fromTask = tasksByIdRef.current.get(fromId);
        const overTask = tasksByIdRef.current.get(toId);
        if (!fromTask || !overTask) return;
        if (fromTask.projectId !== overTask.projectId) return;
        if (fromTask.weekIso !== overTask.weekIso) return;
        void reorderInWeekGroup(
          fromTask.projectId,
          fromTask.weekIso,
          fromId,
          toId,
        );
      }}
    >
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
            onChange={(e) => {
              const v = e.target.value;
              if (v === "all") setFilterMember("all");
              else if (v === "unassigned") setFilterMember("unassigned");
              else setFilterMember(Number(v));
            }}
            style={{ width: 140 }}
          >
            <option value="all">担当: すべて</option>
            {members?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="unassigned">未担当</option>
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
      ) : hideEmptyProjects && filtered.length === 0 ? (
        <p className="muted">
          {trimmedKeyword
            ? `「${keyword.trim()}」に一致するタスクは見つかりませんでした。`
            : "条件に一致するタスクはありません。"}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pagedProjects.map((p) => {
              const list = grouped[p.id] ?? [];
              const buckets = groupedByWeek[p.id] ?? [];
              const completedTasks = list
                .filter((t) => t.done)
                .sort(
                  (a, b) =>
                    a.weekIso.localeCompare(b.weekIso) ||
                    a.sortOrder - b.sortOrder ||
                    a.id - b.id,
                );
              const hasOpen = buckets.some((b) => b.open.length > 0);
              // 何かしらのタスク絞り込みが効いている間は、開閉トグルを無視して
              // 強制的に展開する（該当タスクをすぐ見せたい）。
              const isCollapsed = hideEmptyProjects
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
                    aria-disabled={hideEmptyProjects ? true : undefined}
                    disabled={hideEmptyProjects}
                    title={
                      hideEmptyProjects
                        ? "絞り込み中はすべて展開されます"
                        : undefined
                    }
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
                      cursor: hideEmptyProjects ? "default" : "pointer",
                      font: "inherit",
                      opacity: 1,
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
                  {isEdit && (
                    <div style={{ marginBottom: 10 }}>
                      <NewTaskInline
                        projectId={p.id}
                        members={members ?? []}
                        weeks={weeks}
                        onCreated={() => mutate(tasksKey)}
                      />
                    </div>
                  )}
                  {list.length === 0 ? (
                    <p className="muted t-small">該当タスクなし</p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {!hasOpen && (
                        <p className="muted t-small" style={{ padding: "2px 8px" }}>
                          未完了タスクはありません
                        </p>
                      )}
                      {buckets
                        .filter((b) => b.open.length > 0)
                        .map((bucket) => (
                        <div key={bucket.weekIso}>
                          <div
                            style={{
                              fontSize: ".6875rem",
                              color: "var(--color-text-light)",
                              letterSpacing: ".06em",
                              textTransform: "uppercase",
                              padding: "2px 8px 4px",
                            }}
                          >
                            {weekIsoLabel(bucket.weekIso)}
                          </div>
                          <SortableContext
                            items={bucket.openIds}
                            strategy={verticalListSortingStrategy}
                          >
                            <ul
                              className="task-list"
                              style={taskListStyle}
                            >
                              {bucket.open.map((t) => (
                                <SortableTaskRow
                                  key={t.id}
                                  task={t}
                                  isEdit={isEdit}
                                  members={members ?? []}
                                  weeks={weeks}
                                  onToggleDone={toggleDone}
                                  onUpdate={updateField}
                                  onRemove={remove}
                                />
                              ))}
                            </ul>
                          </SortableContext>
                        </div>
                      ))}
                      {completedTasks.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <div
                            style={{
                              fontSize: ".6875rem",
                              color: "var(--color-text-light)",
                              letterSpacing: ".06em",
                              textTransform: "uppercase",
                              padding: "2px 8px 4px",
                            }}
                          >
                            完了済み（{completedTasks.length}）
                          </div>
                          <ul
                            className="task-list"
                            style={taskListStyle}
                          >
                            {completedTasks.map((t) => (
                              <DoneTaskRow
                                key={t.id}
                                task={t}
                                isEdit={isEdit}
                                members={members ?? []}
                                weeks={weeks}
                                onToggleDone={toggleDone}
                                onUpdate={updateField}
                                onRemove={remove}
                              />
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
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
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                aria-label="前のページ"
              >
                ← 前へ
              </button>
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="muted t-small"
              >
                {safePage} / {totalPages} ページ（全 {visibleProjects.length} 件）
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
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
    <DragOverlay>
      {activeTask ? (
        <div style={dragOverlayCardStyle}>
          {activeProject && (
            <div style={dragOverlayProjectStyle}>
              <span
                style={{
                  ...dragOverlayProjectDotStyle,
                  background: activeProject.color,
                }}
                aria-hidden="true"
              />
              {activeProject.name}
            </div>
          )}
          <div style={dragOverlayTitleStyle}>{activeTask.title}</div>
          <div style={dragOverlayMetaStyle}>
            <span>
              {activeAssignee ? activeAssignee.name : "未割当"}
            </span>
            <span>{weekIsoLabel(activeTask.weekIso)}</span>
            {activeTask.estimatedHours != null && (
              <span className="mono">
                {Number(activeTask.estimatedHours)}h
              </span>
            )}
          </div>
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}

const TaskRowCells = memo(function TaskRowCells({
  task,
  isEdit,
  members,
  weeks,
  onToggleDone,
  onUpdate,
  onRemove,
  dimmed,
}: {
  task: Task;
  isEdit: boolean;
  members: Member[];
  weeks: string[];
  onToggleDone: (t: Task) => void;
  onUpdate: (t: Task, patch: Record<string, unknown>) => void;
  onRemove: (t: Task) => void;
  dimmed?: boolean;
}) {
  return (
    <>
      <input
        type="checkbox"
        className="checkbox"
        checked={task.done}
        onChange={() => onToggleDone(task)}
        disabled={!isEdit}
      />
      {isEdit ? (
        <input
          className="input editable-only"
          defaultValue={task.title}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== task.title) onUpdate(task, { title: v });
          }}
          style={{
            fontSize: ".8125rem",
            opacity: dimmed ? 0.55 : 1,
          }}
        />
      ) : (
        <span
          style={{
            textDecoration: task.done ? "line-through" : "none",
            color: task.done ? "var(--color-text-light)" : undefined,
            fontSize: ".8125rem",
            opacity: dimmed ? 0.6 : 1,
          }}
        >
          {task.title}
        </span>
      )}
      <select
        className="input editable-only"
        value={task.assigneeMemberId ?? ""}
        onChange={(e) =>
          onUpdate(task, {
            assigneeMemberId: e.target.value ? Number(e.target.value) : null,
          })
        }
        disabled={!isEdit}
        style={{ fontSize: ".75rem", padding: "4px 8px", opacity: dimmed ? 0.6 : 1 }}
      >
        <option value="">未割当</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <WeekPicker
        weekIso={task.weekIso}
        weeks={weeks}
        isEdit={isEdit}
        onChange={(w) => onUpdate(task, { weekIso: w })}
      />
      <HoursCell
        value={task.estimatedHours}
        isEdit={isEdit}
        onChange={(h) => onUpdate(task, { estimatedHours: h })}
      />
      {isEdit && (
        <button
          type="button"
          className="btn btn-ghost btn-sm edit-only"
          onClick={() => {
            if (confirm(`「${task.title}」を削除しますか？`)) onRemove(task);
          }}
          title="削除"
          style={removeBtnStyle}
        >
          ×
        </button>
      )}
    </>
  );
});

const SortableTaskRow = memo(function SortableTaskRow({
  task,
  isEdit,
  members,
  weeks,
  onToggleDone,
  onUpdate,
  onRemove,
}: {
  task: Task;
  isEdit: boolean;
  members: Member[];
  weeks: string[];
  onToggleDone: (t: Task) => void;
  onUpdate: (t: Task, patch: Record<string, unknown>) => void;
  onRemove: (t: Task) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  // transform / transition / isDragging が変わったときだけ style オブジェクトを
  // 再生成する。ドラッグ非対象の行の style 参照は安定し、useSortable で内部の
  // re-render が起きてもこの style props は変わらないので memo が機能する。
  const style = useMemo<CSSProperties>(
    () => ({
      ...baseRowStyle,
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : 1,
      background: isDragging ? "rgba(255,255,255,.42)" : undefined,
      position: "relative",
      zIndex: isDragging ? 2 : "auto",
    }),
    [transform, transition, isDragging],
  );

  return (
    <li ref={setNodeRef} style={style}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="この行を並び替え"
        title="ドラッグで並び替え"
        className="btn btn-ghost btn-sm"
        style={isDragging ? dragHandleStyleDragging : dragHandleStyle}
      >
        ⋮⋮
      </button>
      <TaskRowCells
        task={task}
        isEdit={isEdit}
        members={members}
        weeks={weeks}
        onToggleDone={onToggleDone}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </li>
  );
});

const DoneTaskRow = memo(function DoneTaskRow({
  task,
  isEdit,
  members,
  weeks,
  onToggleDone,
  onUpdate,
  onRemove,
}: {
  task: Task;
  isEdit: boolean;
  members: Member[];
  weeks: string[];
  onToggleDone: (t: Task) => void;
  onUpdate: (t: Task, patch: Record<string, unknown>) => void;
  onRemove: (t: Task) => void;
}) {
  return (
    <li style={doneRowStyle}>
      <span
        aria-hidden="true"
        title="完了タスクは並び替えできません"
        style={doneRowHandleStyle}
      >
        ⋮⋮
      </span>
      <TaskRowCells
        task={task}
        isEdit={isEdit}
        members={members}
        weeks={weeks}
        onToggleDone={onToggleDone}
        onUpdate={onUpdate}
        onRemove={onRemove}
        dimmed
      />
    </li>
  );
});

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
