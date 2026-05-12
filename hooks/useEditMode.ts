"use client";

import { useEffect, useState } from "react";

const KEY = "ig-schedule:edit-mode";

export function useEditMode() {
  const [mode, setMode] = useState<"preview" | "edit">("preview");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored === "edit" || stored === "preview") setMode(stored);
    } catch {}
  }, []);

  function update(next: "preview" | "edit") {
    setMode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {}
  }

  return {
    mode,
    isEdit: mode === "edit",
    isReadonly: mode === "preview",
    setMode: update,
    toggle: () => update(mode === "edit" ? "preview" : "edit"),
  };
}
