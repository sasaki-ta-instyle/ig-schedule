"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEditMode } from "@/hooks/useEditMode";

const NAV = [
  { href: "/", label: "ダッシュボード" },
  { href: "/tasks", label: "タスクボード" },
  { href: "/admin", label: "プロジェクト管理" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { mode, setMode, isReadonly } = useEditMode();

  return (
    <div className={`page-wrap ${isReadonly ? "is-readonly" : ""}`}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "20px 32px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 6,
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
            プロジェクト週次スケジュール
          </strong>
        </div>

        <nav className="tabs" style={{ marginLeft: 32 }}>
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

        <div style={{ flex: 1 }} />

        <div className="mode-toggle" role="group" aria-label="モード切替">
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
    </div>
  );
}
