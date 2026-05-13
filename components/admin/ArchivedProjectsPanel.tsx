"use client";

import useSWR, { mutate } from "swr";
import { del, fetcher, postJson } from "@/lib/api";
import { useEditMode } from "@/hooks/useEditMode";

type Project = {
  id: number;
  name: string;
  summary: string;
  dueDate: string | null;
  color: string;
  status: string;
  archivedAt: string | null;
};

const ARCHIVED_KEY = "/api/projects?archived=1";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso.slice(0, 10);
  }
}

export function ArchivedProjectsPanel() {
  const { isEdit } = useEditMode();
  const { data: projects } = useSWR<Project[]>(ARCHIVED_KEY, fetcher);

  async function restoreProject(p: Project) {
    if (!confirm(`「${p.name}」をアクティブに戻します。`)) return;
    await postJson(`/api/projects/${p.id}/unarchive`, {});
    mutate(ARCHIVED_KEY);
    mutate("/api/projects");
    mutate((key) => typeof key === "string" && key.startsWith("/api/workload"));
  }

  async function deleteProject(p: Project) {
    if (
      !confirm(
        `「${p.name}」を完全に削除します。\n関連するタスクもすべて削除され、復元できません。本当に削除しますか？`,
      )
    )
      return;
    await del(`/api/projects/${p.id}`);
    mutate(ARCHIVED_KEY);
    mutate("/api/projects");
    mutate((key) => typeof key === "string" && key.startsWith("/api/tasks"));
  }

  return (
    <section className="glass-panel" style={{ padding: 24, marginBottom: 16 }}>
      <header style={{ marginBottom: 12 }}>
        <span className="eyebrow">ARCHIVED PROJECTS</span>
        <h2 className="t-h3" style={{ marginTop: 4 }}>
          アーカイブ済みプロジェクト
        </h2>
        {!isEdit && (
          <p className="t-small muted" style={{ marginTop: 6 }}>
            復元・完全削除はヘッダの「編集」モードに切替えると操作できます。
          </p>
        )}
      </header>

      {!projects ? (
        <p className="muted">読み込み中…</p>
      ) : projects.length === 0 ? (
        <p className="muted">アーカイブ済みのプロジェクトはありません。</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {projects.map((p) => (
            <li
              key={p.id}
              className="glass-card"
              style={{
                padding: "10px 14px",
                display: "grid",
                gridTemplateColumns: isEdit
                  ? "auto 1fr auto auto auto"
                  : "auto 1fr auto",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: p.color,
                  flexShrink: 0,
                }}
              />
              <div>
                <strong>{p.name}</strong>
                {p.summary && (
                  <div className="t-small muted" style={{ marginTop: 2 }}>
                    {p.summary}
                  </div>
                )}
              </div>
              <span className="t-small muted">
                アーカイブ {fmtDate(p.archivedAt)}
              </span>
              {isEdit && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => restoreProject(p)}
                    title="アクティブに戻す"
                  >
                    復元
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => deleteProject(p)}
                    title="完全削除（取り消し不可）"
                    style={{ color: "var(--color-error)" }}
                  >
                    削除
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
