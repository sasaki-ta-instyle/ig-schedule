"use client";

import { useEffect, useState } from "react";

const KEY = "ig-schedule:edit-mode";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Mode = "preview" | "edit";

const bus: EventTarget | null =
  typeof window !== "undefined" ? new EventTarget() : null;

function broadcast(next: Mode) {
  bus?.dispatchEvent(new CustomEvent<Mode>("change", { detail: next }));
}

export function useEditMode() {
  const [mode, setMode] = useState<Mode>("preview");
  const [promptOpen, setPromptOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored === "edit" || stored === "preview") setMode(stored);
    } catch {}

    const onBusChange = (e: Event) => {
      const detail = (e as CustomEvent<Mode>).detail;
      if (detail === "edit" || detail === "preview") setMode(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      if (e.newValue === "edit" || e.newValue === "preview") setMode(e.newValue);
    };
    bus?.addEventListener("change", onBusChange);
    window.addEventListener("storage", onStorage);
    return () => {
      bus?.removeEventListener("change", onBusChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function persist(next: Mode) {
    setMode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {}
    broadcast(next);
  }

  async function tryEnterEdit() {
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/auth/edit-check`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (res.ok) {
        persist("edit");
        return;
      }
    } catch {}
    setPromptOpen(true);
  }

  async function submitPassword(password: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/auth/edit-check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
        cache: "no-store",
        credentials: "same-origin",
      });
      if (res.ok) {
        persist("edit");
        setPromptOpen(false);
      } else if (res.status === 401) {
        setError("パスワードが違います");
      } else {
        setError(`エラー (${res.status})`);
      }
    } catch {
      setError("通信エラー");
    } finally {
      setPending(false);
    }
  }

  function exitEdit() {
    // UI モードだけ preview に戻す。サーバ側のセッション/cookie は破棄しない
    // （cookie は 30 日有効。再度「編集」を押したときにパスワードを聞かれないため）
    persist("preview");
  }

  async function update(next: "preview" | "edit") {
    if (next === "edit") {
      await tryEnterEdit();
    } else {
      await exitEdit();
    }
  }

  return {
    mode,
    isEdit: mode === "edit",
    isReadonly: mode === "preview",
    promptOpen,
    pending,
    error,
    closePrompt: () => {
      setPromptOpen(false);
      setError(null);
    },
    submitPassword,
    setMode: update,
    toggle: () => update(mode === "edit" ? "preview" : "edit"),
  };
}
