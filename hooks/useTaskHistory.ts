"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * 履歴エントリ。
 * - `do`: redo（Cmd+Shift+Z）時のみ呼ばれる「再適用」関数。初回実行は呼び出し側が
 *   別途行う（pushHistory は実行後に呼ぶ規約）。将来 do を初回実行にも兼用する場合は
 *   二重 PATCH に注意。
 * - `undo`: undo（Cmd+Z）時に呼ばれる「逆操作」関数。
 */
export type HistoryEntry = {
  label: string;
  do: () => Promise<void> | void;
  undo: () => Promise<void> | void;
};

const MAX_HISTORY = 50;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useTaskHistory() {
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const isApplyingRef = useRef(false);

  const pushHistory = useCallback((entry: HistoryEntry) => {
    if (isApplyingRef.current) return;
    const stack = undoStackRef.current;
    stack.push(entry);
    if (stack.length > MAX_HISTORY) stack.shift();
    redoStackRef.current = [];
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      // 物理キー位置で判定（レイアウト / CapsLock の影響を受けない）
      if (e.code !== "KeyZ") return;
      if (e.isComposing || e.keyCode === 229) return;
      if (isEditableTarget(e.target)) return;
      if (isApplyingRef.current) {
        e.preventDefault();
        return;
      }

      const isRedo = e.shiftKey;
      e.preventDefault();

      if (isRedo) {
        const entry = redoStackRef.current.pop();
        if (!entry) return;
        isApplyingRef.current = true;
        Promise.resolve()
          .then(() => entry.do())
          .then(() => {
            undoStackRef.current.push(entry);
          })
          .catch((err) => {
            console.error("[history] redo failed", err);
            redoStackRef.current.push(entry);
          })
          .finally(() => {
            isApplyingRef.current = false;
          });
      } else {
        const entry = undoStackRef.current.pop();
        if (!entry) return;
        isApplyingRef.current = true;
        Promise.resolve()
          .then(() => entry.undo())
          .then(() => {
            redoStackRef.current.push(entry);
          })
          .catch((err) => {
            console.error("[history] undo failed", err);
            undoStackRef.current.push(entry);
          })
          .finally(() => {
            isApplyingRef.current = false;
          });
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { pushHistory };
}
