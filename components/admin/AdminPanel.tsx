"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { fetcher, postJson, del } from "@/lib/api";
import { useEditMode } from "@/hooks/useEditMode";
import { ProjectCreateModal } from "./ProjectCreateModal";

type Member = { id: number; name: string; color: string };
type Project = {
  id: number;
  name: string;
  summary: string;
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

  async function updateProject(p: Project, patch: Partial<Project>) {
    await postJson(`/api/projects/${p.id}`, patch, "PATCH");
    mutate("/api/projects");
  }
  async function archiveProject(p: Project) {
    if (!confirm(`「${p.name}」をアーカイブしますか？タスクは残ります。`)) return;
    await del(`/api/projects/${p.id}`);
    mutate("/api/projects");
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
        {isEdit && (
          <button
            type="button"
            className="btn btn-primary edit-only"
            onClick={() => setShowCreate(true)}
          >
            ＋ 新規プロジェクト
          </button>
        )}
      </header>

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
            <li key={p.id} className="glass-card" style={{ padding: 14 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr 140px 140px auto",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                {isEdit ? (
                  <input
                    type="color"
                    value={p.color}
                    onChange={(e) => updateProject(p, { color: e.target.value })}
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
                      if (v && v !== p.name) updateProject(p, { name: v });
                    }}
                  />
                ) : (
                  <strong>{p.name}</strong>
                )}
                {isEdit ? (
                  <input
                    type="date"
                    className="input editable-only"
                    defaultValue={p.dueDate ?? ""}
                    onBlur={(e) => {
                      const v = e.currentTarget.value || null;
                      if (v !== p.dueDate) updateProject(p, { dueDate: v });
                    }}
                    style={{ fontSize: ".75rem" }}
                  />
                ) : (
                  <span className="t-small muted">
                    期日 {p.dueDate ?? "—"}
                  </span>
                )}
                <span className="t-small muted">
                  担当 {p.plannedMemberIds.length} 名
                </span>
                {isEdit && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm edit-only"
                    onClick={() => archiveProject(p)}
                    title="アーカイブ"
                  >
                    アーカイブ
                  </button>
                )}
              </div>
              {p.summary && (
                <p
                  className="t-small muted"
                  style={{
                    marginTop: 8,
                    whiteSpace: "pre-wrap",
                    paddingLeft: 38,
                  }}
                >
                  {p.summary}
                </p>
              )}
            </li>
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
          }}
        />
      )}
    </section>
  );
}
