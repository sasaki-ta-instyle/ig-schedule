"use client";

import useSWR, { mutate } from "swr";
import { useEffect, useState } from "react";
import { fetcher, postJson, del } from "@/lib/api";
import { useEditMode } from "@/hooks/useEditMode";
import { ProjectCreateModal } from "./ProjectCreateModal";
import { COMPANIES, type Company } from "@/lib/companies";
import { CompanyChip } from "@/components/CompanyChip";
import { LinkifiedText } from "@/components/LinkifiedText";

type Member = { id: number; name: string; color: string };
type Project = {
  id: number;
  name: string;
  summary: string;
  notes: string;
  company: Company | null;
  dueDate: string | null;
  color: string;
  status: string;
  plannedMemberIds: number[];
};

const COLORS = [
  "#38537B",
  "#7BB785",
  "#D4772C",
  "#A86B91",
  "#5C8FA8",
  "#8A7B5C",
  "#9C1212",
  "#2F6F3A",
];

export function AdminPanel() {
  const { isEdit } = useEditMode();
  const { data: members } = useSWR<Member[]>("/api/members", fetcher);
  const { data: projects } = useSWR<Project[]>("/api/projects", fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 編集モードを抜けたら選択をクリア
  useEffect(() => {
    if (!isEdit) setSelectedIds(new Set());
  }, [isEdit]);

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelectedIds(new Set((projects ?? []).map((p) => p.id)));
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  function revalidateAll() {
    mutate("/api/projects");
    mutate((key) => typeof key === "string" && key.startsWith("/api/projects?archived"));
    mutate((key) => typeof key === "string" && key.startsWith("/api/tasks"));
    mutate((key) => typeof key === "string" && key.startsWith("/api/workload"));
  }

  async function bulkArchive() {
    const targets = (projects ?? []).filter((p) => selectedIds.has(p.id));
    if (targets.length === 0) return;
    if (
      !confirm(
        `選択中の ${targets.length} 件をアーカイブします。\nダッシュボードからは消えますが、アーカイブページから復元できます。`,
      )
    )
      return;
    for (const p of targets) {
      try {
        await postJson(`/api/projects/${p.id}/archive`, {});
      } catch (e) {
        console.error("archive failed", p.id, e);
      }
    }
    clearSelection();
    revalidateAll();
  }
  async function bulkDelete() {
    const targets = (projects ?? []).filter((p) => selectedIds.has(p.id));
    if (targets.length === 0) return;
    if (
      !confirm(
        `選択中の ${targets.length} 件を完全に削除します。\n関連するタスク・工数もすべて削除され、復元できません。本当に削除しますか？`,
      )
    )
      return;
    for (const p of targets) {
      try {
        await del(`/api/projects/${p.id}`);
      } catch (e) {
        console.error("delete failed", p.id, e);
      }
    }
    clearSelection();
    revalidateAll();
  }

  async function updateProject(p: Project, patch: Partial<Project>) {
    mutate(
      "/api/projects",
      (prev: Project[] = []) =>
        prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)),
      { revalidate: false },
    );
    await postJson(`/api/projects/${p.id}`, patch, "PATCH");
    mutate("/api/projects");
  }
  async function archiveProject(p: Project) {
    if (
      !confirm(
        `「${p.name}」をアーカイブします。\nダッシュボードからは消えますが、アーカイブページからいつでも復元できます。`,
      )
    )
      return;
    await postJson(`/api/projects/${p.id}/archive`, {});
    mutate("/api/projects");
    mutate((key) => typeof key === "string" && key.startsWith("/api/projects?archived"));
    mutate((key) => typeof key === "string" && key.startsWith("/api/workload"));
  }
  async function deleteProject(p: Project) {
    if (
      !confirm(
        `「${p.name}」を完全に削除します。\n関連するタスク・工数もすべて削除され、復元できません。本当に削除しますか？`,
      )
    )
      return;
    await del(`/api/projects/${p.id}`);
    mutate("/api/projects");
    mutate((key) => typeof key === "string" && key.startsWith("/api/tasks"));
    mutate((key) => typeof key === "string" && key.startsWith("/api/workload"));
  }
  function togglePlannedMember(p: Project, memberId: number) {
    const next = p.plannedMemberIds.includes(memberId)
      ? p.plannedMemberIds.filter((x) => x !== memberId)
      : [...p.plannedMemberIds, memberId];
    return updateProject(p, { plannedMemberIds: next });
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
          <span className="eyebrow">PROJECTS</span>
          <h2 className="t-h3" style={{ marginTop: 4 }}>
            プロジェクト管理
          </h2>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!isEdit && (
            <span className="t-small muted">
              編集するにはヘッダの「編集」モードに切替
            </span>
          )}
          {isEdit && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm edit-only"
                onClick={async () => {
                  if (
                    !confirm(
                      "全メンバー×全週の工数を、アクティブなプロジェクトのタスク見積から再計算します。\n手動で入力した工数値は上書きされます。",
                    )
                  )
                    return;
                  await postJson("/api/workload/recalc", {});
                  mutate(
                    (key) =>
                      typeof key === "string" &&
                      key.startsWith("/api/workload"),
                  );
                }}
                title="アクティブタスクの見積合計で workload を再計算"
                style={{ fontSize: ".75rem" }}
              >
                工数を再計算
              </button>
              <button
                type="button"
                className="btn btn-primary edit-only"
                onClick={() => setShowCreate(true)}
              >
                ＋ 新規プロジェクト
              </button>
            </>
          )}
        </div>
      </header>

      {isEdit && (projects?.length ?? 0) > 0 && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "8px 12px",
            marginBottom: 12,
            background: "rgba(255,255,255,.42)",
            border: "1px solid rgba(255,255,255,.6)",
            borderRadius: "var(--r-sm)",
          }}
        >
          <span className="t-small" style={{ fontWeight: 600 }}>
            {selectedIds.size > 0
              ? `${selectedIds.size} 件選択中`
              : "複数選択して一括操作"}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={
              selectedIds.size === (projects?.length ?? 0)
                ? clearSelection
                : selectAll
            }
            style={{ fontSize: ".75rem" }}
          >
            {selectedIds.size === (projects?.length ?? 0)
              ? "選択解除"
              : "すべて選択"}
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={bulkArchive}
            disabled={selectedIds.size === 0}
            style={{ fontSize: ".75rem" }}
          >
            一括アーカイブ
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={bulkDelete}
            disabled={selectedIds.size === 0}
            style={{ fontSize: ".75rem", color: "var(--color-error)" }}
          >
            一括削除
          </button>
        </div>
      )}

      {!projects ? (
        <p className="muted">読み込み中…</p>
      ) : projects.length === 0 ? (
        <p className="muted">
          まだプロジェクトがありません。
          {isEdit && "「＋ 新規プロジェクト」から AI でタスク洗い出しまでまとめて作成できます。"}
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              members={members ?? []}
              isEdit={isEdit}
              selected={selectedIds.has(p.id)}
              onToggleSelected={() => toggleSelected(p.id)}
              onUpdate={(patch) => updateProject(p, patch)}
              onToggleMember={(id) => togglePlannedMember(p, id)}
              onArchive={() => archiveProject(p)}
              onDelete={() => deleteProject(p)}
            />
          ))}
        </ul>
      )}

      {showCreate && (
        <ProjectCreateModal
          members={members ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            mutate("/api/projects");
            mutate(
              (key) =>
                typeof key === "string" &&
                (key.startsWith("/api/tasks") || key.startsWith("/api/workload")),
            );
          }}
        />
      )}
    </section>
  );
}

function ProjectRow({
  project: p,
  members,
  isEdit,
  selected,
  onToggleSelected,
  onUpdate,
  onToggleMember,
  onArchive,
  onDelete,
}: {
  project: Project;
  members: Member[];
  isEdit: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onUpdate: (patch: Partial<Project>) => void | Promise<void>;
  onToggleMember: (memberId: number) => void | Promise<void>;
  onArchive: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const memberById: Record<number, Member> = {};
  for (const m of members) memberById[m.id] = m;

  return (
    <li
      className="glass-card"
      style={{
        padding: 14,
        outline: selected ? "2px solid var(--color-accent, #38537B)" : "none",
        outlineOffset: -2,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isEdit
            ? "auto auto 1fr 120px 140px auto auto auto"
            : "auto 1fr auto 140px auto",
          gap: 10,
          alignItems: "center",
        }}
      >
        {isEdit && (
          <input
            type="checkbox"
            className="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            title="一括操作の対象に追加"
            aria-label={`${p.name} を選択`}
          />
        )}
        {isEdit ? (
          <input
            type="color"
            value={p.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            style={{
              width: 28,
              height: 28,
              border: "1px solid rgba(255,255,255,.7)",
              borderRadius: 999,
              background: "transparent",
              cursor: "pointer",
            }}
            list={`palette-${p.id}`}
          />
        ) : (
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: p.color,
            }}
          />
        )}
        <datalist id={`palette-${p.id}`}>
          {COLORS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {isEdit ? (
          <input
            className="input editable-only"
            defaultValue={p.name}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== p.name) onUpdate({ name: v });
            }}
          />
        ) : (
          <strong>{p.name}</strong>
        )}

        {isEdit ? (
          <select
            className="input editable-only"
            value={p.company ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onUpdate({ company: (v === "" ? null : (v as Company)) });
            }}
            style={{ fontSize: ".75rem" }}
            title="会社タグ"
          >
            <option value="">（未設定）</option>
            {COMPANIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <CompanyChip company={p.company} />
        )}

        {isEdit ? (
          <input
            type="date"
            className="input editable-only"
            defaultValue={p.dueDate ?? ""}
            onBlur={(e) => {
              const v = e.currentTarget.value || null;
              if (v !== p.dueDate) onUpdate({ dueDate: v });
            }}
            style={{ fontSize: ".75rem" }}
          />
        ) : (
          <span className="t-small muted">期日 {p.dueDate ?? "—"}</span>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setExpanded((v) => !v)}
          title="詳細を開く"
          style={{ fontSize: ".75rem" }}
        >
          {expanded ? "閉じる" : "詳細"} {expanded ? "▴" : "▾"}
        </button>

        {isEdit && (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm edit-only"
              onClick={onArchive}
              title="ダッシュボードから外しアーカイブに移動（あとで復元可）"
              style={{ fontSize: ".75rem" }}
            >
              アーカイブ
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm edit-only"
              onClick={onDelete}
              title="関連タスク・工数ごと完全削除（取り消し不可）"
              style={{ fontSize: ".75rem", color: "var(--color-error)" }}
            >
              削除
            </button>
          </>
        )}
      </div>

      {/* 担当チップ（常に表示、編集時はクリックで toggle） */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginTop: 8,
          paddingLeft: isEdit ? 64 : 38,
        }}
      >
        {(isEdit ? members : p.plannedMemberIds.map((id) => memberById[id]).filter(Boolean)).map(
          (m) => {
            if (!m) return null;
            const active = p.plannedMemberIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className="badge"
                onClick={() => isEdit && onToggleMember(m.id)}
                disabled={!isEdit}
                style={{
                  cursor: isEdit ? "pointer" : "default",
                  opacity: isEdit && !active ? 0.4 : 1,
                  background: active ? "rgba(255,255,255,.78)" : "rgba(255,255,255,.32)",
                  border: active
                    ? "1px solid rgba(255,255,255,.78)"
                    : "1px solid rgba(53,54,45,.18)",
                  paddingLeft: 8,
                }}
                aria-pressed={active}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: m.color,
                    display: "inline-block",
                    marginRight: 4,
                  }}
                />
                {m.name}
              </button>
            );
          },
        )}
        {!isEdit && p.plannedMemberIds.length === 0 && (
          <span className="t-small subtle">担当未設定</span>
        )}
      </div>

      {/* 概要（詳細展開時、編集モード時は textarea） */}
      {expanded && (
        <div style={{ marginTop: 10, paddingLeft: isEdit ? 64 : 38 }}>
          <label className="form-label" style={{ fontSize: ".6875rem" }}>
            概要
          </label>
          {isEdit ? (
            <textarea
              className="input editable-only"
              defaultValue={p.summary}
              rows={4}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                if (v !== p.summary) onUpdate({ summary: v });
              }}
              placeholder="プロジェクトの目的・主要なフェーズなど"
            />
          ) : (
            <div
              className="t-small muted"
              style={{
                padding: "8px 10px",
                background: "rgba(255,255,255,.32)",
                borderRadius: "var(--r-sm)",
              }}
            >
              {p.summary ? <LinkifiedText text={p.summary} /> : "（概要なし）"}
            </div>
          )}

          <label
            className="form-label"
            style={{ fontSize: ".6875rem", marginTop: 10 }}
          >
            メモ
          </label>
          {isEdit ? (
            <textarea
              className="input editable-only"
              defaultValue={p.notes ?? ""}
              rows={3}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                if (v !== (p.notes ?? "")) onUpdate({ notes: v });
              }}
              placeholder="参考リンク・進捗メモなど（URL は自動でリンクになります）"
            />
          ) : (
            <div
              className="t-small muted"
              style={{
                padding: "8px 10px",
                background: "rgba(255,255,255,.32)",
                borderRadius: "var(--r-sm)",
              }}
            >
              {p.notes ? <LinkifiedText text={p.notes} /> : "（メモなし）"}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
