"use client";

import useSWR, { mutate } from "swr";
import { useEffect, useMemo, useState } from "react";
import { fetcher, postJson, del } from "@/lib/api";
import { useEditMode } from "@/hooks/useEditMode";

type Member = { id: number; name: string; color: string };
type RecurringTask = {
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

const RECURRING_KEY = "/api/recurring-tasks?archived=1";
const REFRESH_MS = 5000;

export function RecurringList() {
  const { isEdit } = useEditMode();
  const [showArchived, setShowArchived] = useState(false);
  const [keyword, setKeyword] = useState<string>("");
  const [filterMember, setFilterMember] = useState<number | "all" | "unassigned">("all");

  const { data: members } = useSWR<Member[]>("/api/members", fetcher);
  const { data: items } = useSWR<RecurringTask[]>(RECURRING_KEY, fetcher, {
    refreshInterval: REFRESH_MS,
  });

  const memberById = useMemo(() => {
    const m: Record<number, Member> = {};
    for (const x of members ?? []) m[x.id] = x;
    return m;
  }, [members]);

  const trimmedKeyword = keyword.trim().toLowerCase();

  const visible = useMemo(() => {
    const list = items ?? [];
    return list.filter((r) => {
      if (!showArchived && r.archivedAt) return false;
      if (filterMember === "unassigned") {
        if (r.assigneeMemberId != null) return false;
      } else if (filterMember !== "all") {
        if (r.assigneeMemberId !== filterMember) return false;
      }
      if (trimmedKeyword) {
        const haystack = [r.title, r.notes ?? ""].join("\n").toLowerCase();
        if (!haystack.includes(trimmedKeyword)) return false;
      }
      return true;
    });
  }, [items, showArchived, filterMember, trimmedKeyword]);

  async function updateField(r: RecurringTask, patch: Record<string, unknown>) {
    await postJson(`/api/recurring-tasks/${r.id}`, patch, "PATCH");
    mutate(RECURRING_KEY);
  }

  async function remove(r: RecurringTask) {
    await del(`/api/recurring-tasks/${r.id}`);
    mutate(RECURRING_KEY);
  }

  async function setArchived(r: RecurringTask, archived: boolean) {
    await postJson(
      `/api/recurring-tasks/${r.id}`,
      { archivedAt: archived ? new Date().toISOString() : null },
      "PATCH",
    );
    mutate(RECURRING_KEY);
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
          <span className="eyebrow">RECURRING</span>
          <h2 className="t-h3" style={{ marginTop: 4 }}>
            定例タスク
          </h2>
          <p className="t-small muted" style={{ marginTop: 4, maxWidth: 640 }}>
            毎週繰り返すタスクのテンプレート。プロジェクトに紐付かず、ダッシュボードの該当週に「定例」として表示されます。工数を入れると担当者の週合計に動的加算されます。
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            className="input"
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="定例タスクを検索"
            style={{ width: 200 }}
            aria-label="定例タスクを検索"
          />
          <select
            className="input"
            value={String(filterMember)}
            onChange={(e) => {
              const v = e.target.value;
              setFilterMember(
                v === "all" || v === "unassigned" ? v : Number(v),
              );
            }}
            style={{ width: 140 }}
          >
            <option value="all">担当: すべて</option>
            <option value="unassigned">未割当</option>
            {members?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <label
            className="t-small muted"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            アーカイブ済みも表示
          </label>
        </div>
      </header>

      <div className="glass-card" style={{ padding: 16 }}>
        {!items ? (
          <p className="muted">読み込み中…</p>
        ) : visible.length === 0 ? (
          trimmedKeyword || filterMember !== "all" ? (
            <p className="muted t-small">
              条件に一致する定例タスクは見つかりませんでした。
            </p>
          ) : (
            <p className="muted t-small">
              まだ定例タスクがありません。{isEdit && "下のフォームから追加できます。"}
            </p>
          )
        ) : (
          <ul
            className="task-list"
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {visible.map((r) => (
              <li
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: isEdit
                    ? "1fr 120px 64px auto auto"
                    : "1fr 120px 64px auto",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 8px",
                  borderRadius: "var(--r-sm)",
                  background: r.archivedAt
                    ? "rgba(0,0,0,.025)"
                    : "transparent",
                  opacity: r.archivedAt ? 0.55 : 1,
                }}
              >
                {isEdit ? (
                  <input
                    className="input editable-only"
                    defaultValue={r.title}
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (v && v !== r.title) updateField(r, { title: v });
                    }}
                    style={{ fontSize: ".8125rem" }}
                  />
                ) : (
                  <span style={{ fontSize: ".8125rem" }}>{r.title}</span>
                )}
                <select
                  className="input editable-only"
                  value={r.assigneeMemberId ?? ""}
                  onChange={(e) =>
                    updateField(r, {
                      assigneeMemberId: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  disabled={!isEdit}
                  style={{ fontSize: ".75rem", padding: "4px 8px" }}
                >
                  <option value="">未割当</option>
                  {members?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <HoursCell
                  value={r.estimatedHours}
                  isEdit={isEdit}
                  onChange={(h) => updateField(r, { estimatedHours: h })}
                />
                {!isEdit && (
                  <span className="t-small muted">
                    {r.assigneeMemberId != null
                      ? memberById[r.assigneeMemberId]?.name ?? ""
                      : ""}
                  </span>
                )}
                {isEdit && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm edit-only"
                      onClick={() => setArchived(r, !r.archivedAt)}
                      title={r.archivedAt ? "復帰" : "アーカイブ"}
                      style={{ fontSize: ".75rem" }}
                    >
                      {r.archivedAt ? "↺" : "📦"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm edit-only"
                      onClick={() => {
                        if (confirm(`「${r.title}」を完全に削除しますか？\n（過去の完了履歴も消えます）`))
                          remove(r);
                      }}
                      title="削除"
                      style={{ fontSize: ".75rem" }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {isEdit && (
          <NewRecurringInline
            members={members ?? []}
            onCreated={() => mutate(RECURRING_KEY)}
          />
        )}
      </div>
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

function NewRecurringInline({
  members,
  onCreated,
}: {
  members: Member[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const [hours, setHours] = useState<string>("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="edit-only"
      style={{
        display: "flex",
        gap: 6,
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px dashed rgba(0,0,0,.08)",
        alignItems: "center",
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const h = hours === "" ? null : Number(hours);
        setPending(true);
        try {
          await postJson("/api/recurring-tasks", {
            title: title.trim(),
            assigneeMemberId: assigneeId === "" ? null : assigneeId,
            estimatedHours: h != null && Number.isFinite(h) ? h : null,
          });
          setTitle("");
          setHours("");
          setAssigneeId("");
          onCreated();
        } finally {
          setPending(false);
        }
      }}
    >
      <input
        className="input"
        placeholder="＋ 定例タスクを追加（例: 週次ミーティング議事録作成）"
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
        style={{ width: 120, fontSize: ".75rem" }}
      >
        <option value="">未割当</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
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
        style={{ width: 64, fontSize: ".75rem", textAlign: "right" }}
      />
      <button
        type="submit"
        className="btn btn-secondary btn-sm"
        disabled={pending || !title.trim()}
      >
        追加
      </button>
    </form>
  );
}
