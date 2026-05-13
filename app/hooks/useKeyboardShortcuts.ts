"use client";

import { useEffect } from "react";

interface KeyboardShortcutsOptions {
  onSubmit: () => void;
  onClear: () => void;
  canSubmit: boolean;
}

export function useKeyboardShortcuts({ onSubmit, onClear, canSubmit }: KeyboardShortcutsOptions) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === "Enter" && canSubmit) {
        e.preventDefault();
        onSubmit();
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onClear();
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSubmit, onClear, canSubmit]);
}
