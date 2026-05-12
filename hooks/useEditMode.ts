"use client";

import { useEffect, useState } from "react";

const KEY = "ig-schedule:edit-mode";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function useEditMode() {
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored === "edit" || stored === "preview") setMode(stored);
    } catch {}
  }, []);

  function persist(next: "preview" | "edit") {
    setMode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {}
  }

  async function enterEdit() {
    if (mode === "edit") return;
    setPending(true);
    try {
      const res = await fetch(`${BASE}/api/auth/edit-check`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        // 401/403 等。ブラウザの Basic Auth プロンプトは出ているはず。
        // キャンセルされた場合はここに来るので、編集モードに入らない。
        return;
      }
      persist("edit");
    } catch {
      // ネットワークエラー等。編集モードに入れない。
    } finally {
      setPending(false);
    }
  }

  function exitEdit() {
    persist("preview");
  }

  async function update(next: "preview" | "edit") {
    if (next === "edit") {
      await enterEdit();
    } else {
      exitEdit();
    }
  }

  return {
    mode,
    isEdit: mode === "edit",
    isReadonly: mode === "preview",
    pending,
    setMode: update,
    toggle: () => update(mode === "edit" ? "preview" : "edit"),
  };
}
