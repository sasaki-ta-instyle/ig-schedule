"use client";

import { useState } from "react";
import { postJson } from "@/lib/api";
import { weekIsoLabel } from "@/lib/week";

type Member = { id: number; name: string; color: string };

type DraftTask = {
  title: string;
  weekIso: string;
  assigneeMemberId: number | null;
  notes: string | null;
};

type GenerateResponse = {
  tasks: DraftTask[];
  rationale: string;
  meta: { startWeek: string; endWeek: string; model: string };
};

const COLORS = [
  "#38537B",
  "#7BB785",
  "#D4772C",
  "#A86B91",
  "#5C8FA8",
  "#8A7B5C",
];

export function ProjectCreateModal({
  members,
  onClose,
  onCreated,
}: {
  members: Member[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [plannedMemberIds, setPlannedMemberIds] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [rationale, setRationale] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  function togglePlannedMember(id: number) {
    setPlannedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function generate() {
    if (!name.trim() || !summary.trim() || plannedMemberIds.length === 0) {
      setAiError("プロジェクト名・概要・担当メンバー(1名以上)を入力してください。");
      return;
    }
    setAiError(null);
    setGenerating(true);
    try {
      const res = await postJson<GenerateResponse>(
        "/api/ai/generate-tasks",
        {
          name: name.trim(),
          summary: summary.trim(),
          dueDate: dueDate || null,
          plannedMemberIds,
        },
      );
      setDrafts(res.tasks);
      setRationale(res.rationale);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      setAiError("プロジェクト名を入力してください。");
      return;
    }
    setSaving(true);
    try {
      await postJson("/api/projects", {
        name: name.trim(),
        summary: summary.trim(),
        dueDate: dueDate || null,
        color,
        plannedMemberIds,
        tasks: drafts,
        aiSeed: drafts.length
          ? { summary: summary.trim(), dueDate: dueDate || undefined, plannedMemberIds }
          : null,
      });
      onCreated();
    } catch (e) {
      setAiError((e as Error).message);
      setSaving(false);
    }
  }

  function updateDraft(idx: number, patch: Partial<DraftTask>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }
  function deleteDraft(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }
  function addEmptyDraft() {
    const lastWeek = drafts[drafts.length - 1]?.weekIso;
    setDrafts((prev) => [
      ...prev,
      {
        title: "",
        weekIso: lastWeek ?? "",
        assigneeMemberId: plannedMemberIds[0] ?? null,
        notes: null,
      },
    ]);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(53,54,45,.38)",
        backdropFilter: "blur(4px)",
        zIndex: 10,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 32,
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-panel"
        style={{ width: "min(960px, 100%)", padding: 28 }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <div>
            <span className="eyebrow">NEW PROJECT</span>
            <h2 className="t-h3" style={{ marginTop: 4 }}>
              プロジェクト新規作成
            </h2>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            ×
          </button>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 240px",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label className="form-label">プロジェクト名 *</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: LP リニューアル Q2"
              />
            </div>
            <div>
              <label className="form-label">概要 *</label>
              <textarea
                className="input"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="目的・ゴール・主要なフェーズ・前提などを箇条書きで。AI がここからタスクを洗い出します。"
                rows={6}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">期日</label>
                <input
                  className="input"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">カラー</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        background: c,
                        border:
                          c === color
                            ? "2px solid var(--color-text)"
                            : "2px solid transparent",
                        cursor: "pointer",
                      }}
                      aria-label={`color ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="form-label">想定担当メンバー *</label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 10,
                background: "rgba(255,255,255,.32)",
                borderRadius: "var(--r-sm)",
                border: "1px solid rgba(255,255,255,.55)",
              }}
            >
              {members.map((m) => (
                <label
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: ".8125rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={plannedMemberIds.includes(m.id)}
                    onChange={() => togglePlannedMember(m.id)}
                  />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: m.color,
                    }}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginTop: 18,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={generate}
            disabled={generating || !name.trim() || !summary.trim() || plannedMemberIds.length === 0}
          >
            {generating ? "AI が考え中…" : "タスクを AI で洗い出す"}
          </button>
          {drafts.length > 0 && (
            <span className="t-small muted">
              {drafts.length} 件のタスク提案
            </span>
          )}
          {aiError && (
            <span className="badge badge-error">{aiError}</span>
          )}
        </div>

        {rationale && (
          <p
            className="t-small muted"
            style={{
              marginTop: 8,
              padding: 10,
              background: "rgba(255,255,255,.32)",
              borderRadius: "var(--r-sm)",
            }}
          >
            {rationale}
          </p>
        )}

        {drafts.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {drafts.map((d, i) => (
                <li
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 140px 140px auto",
                    gap: 8,
                    alignItems: "center",
                    padding: 8,
                    background: "rgba(255,255,255,.32)",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  <input
                    className="input"
                    value={d.title}
                    onChange={(e) => updateDraft(i, { title: e.target.value })}
                    style={{ fontSize: ".8125rem" }}
                  />
                  <input
                    className="input"
                    value={d.weekIso}
                    onChange={(e) => updateDraft(i, { weekIso: e.target.value })}
                    placeholder="2026-W20"
                    title={d.weekIso ? weekIsoLabel(d.weekIso) : ""}
                    style={{ fontSize: ".75rem" }}
                  />
                  <select
                    className="input"
                    value={d.assigneeMemberId ?? ""}
                    onChange={(e) =>
                      updateDraft(i, {
                        assigneeMemberId: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    style={{ fontSize: ".75rem" }}
                  >
                    <option value="">未割当</option>
                    {members
                      .filter((m) => plannedMemberIds.includes(m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => deleteDraft(i)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={addEmptyDraft}
              style={{ marginTop: 6 }}
            >
              ＋ 行を追加
            </button>
          </div>
        )}

        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
            paddingTop: 14,
            borderTop: "1px solid rgba(255,255,255,.45)",
          }}
        >
          <button className="btn btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={saving || !name.trim()}
          >
            {saving ? "保存中…" : "プロジェクトを作成"}
          </button>
        </footer>
      </div>
    </div>
  );
}
