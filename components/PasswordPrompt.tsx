"use client";

import { useEffect, useRef, useState } from "react";

export function PasswordPrompt({
  open,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPw("");
    } else {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(53,54,45,.38)",
        backdropFilter: "blur(4px)",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        className="glass-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (pw && !pending) onSubmit(pw);
        }}
        style={{ width: "min(380px, 100%)", padding: 24 }}
      >
        <span className="eyebrow">EDIT MODE</span>
        <h3 className="t-h4" style={{ marginTop: 4, marginBottom: 10 }}>
          編集モードに切替
        </h3>
        <p className="t-small muted" style={{ marginBottom: 14 }}>
          編集にはパスワードが必要です。
        </p>
        <input
          ref={inputRef}
          type="password"
          className="input"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          aria-label="パスワード"
          placeholder="パスワード"
          style={{ marginBottom: 10 }}
        />
        {error && (
          <p
            className="badge badge-error"
            style={{
              display: "block",
              width: "fit-content",
              marginBottom: 10,
            }}
          >
            {error}
          </p>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 8,
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={pending}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending || !pw}
          >
            {pending ? "確認中…" : "確定"}
          </button>
        </div>
      </form>
    </div>
  );
}
