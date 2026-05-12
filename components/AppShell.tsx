"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEditMode } from "@/hooks/useEditMode";
import { PasswordPrompt } from "./PasswordPrompt";

const NAV = [
  { href: "/", label: "ダッシュボード" },
  { href: "/tasks", label: "タスクボード" },
  { href: "/admin", label: "プロジェクト管理" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const {
    mode,
    setMode,
    isReadonly,
    promptOpen,
    pending,
    error,
    closePrompt,
    submitPassword,
  } = useEditMode();

  return (
    <div className={`page-wrap ${isReadonly ? "is-readonly" : ""}`}>
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 20,
          padding: "20px 32px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 6,
            justifySelf: "start",
          }}
        >
          <img
            src="https://app.instyle.group/_shared/static/logo.svg"
            alt="INSTYLE GROUP"
            style={{ height: 8, width: "auto", display: "block", opacity: 0.9 }}
          />
          <strong
            className="t-h4"
            style={{ fontWeight: 600, letterSpacing: "-0.01em" }}
          >
            プロジェクト週次ダッシュボード
          </strong>
        </div>

        <nav className="tabs" style={{ justifySelf: "center" }}>
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div
          className="mode-toggle"
          role="group"
          aria-label="モード切替"
          style={{ justifySelf: "end" }}
        >
          <button
            type="button"
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            プレビュー
          </button>
          <button
            type="button"
            aria-pressed={mode === "edit"}
            onClick={() => setMode("edit")}
          >
            編集
          </button>
        </div>
      </header>

      <main style={{ padding: "8px 32px 60px" }}>{children}</main>

      <PasswordPrompt
        open={promptOpen}
        pending={pending}
        error={error}
        onSubmit={submitPassword}
        onCancel={closePrompt}
      />
    </div>
  );
}
