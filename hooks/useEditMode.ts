"use client";

import { useEffect, useState } from "react";

const KEY = "ig-schedule:edit-mode";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function useEditMode() {
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [promptOpen, setPromptOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function exitEdit() {
    persist("preview");
    try {
      await fetch(`${BASE}/api/auth/edit-check`, {
        method: "DELETE",
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch {}
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
