"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "cq-labor-draft";
const DEBOUNCE_MS = 500;

interface UseDraftReturn {
  draft: string;
  hasDraft: boolean;
  saveDraft: (text: string) => void;
  clearDraft: () => void;
}

export function useDraft(): UseDraftReturn {
  const [hasDraft, setHasDraft] = useState(false);
  const [draft, setDraft] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim().length > 5) {
      setDraft(saved);
      setHasDraft(true);
    }
  }, []);

  const saveDraft = useCallback((text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (text.trim().length > 5) {
        localStorage.setItem(STORAGE_KEY, text);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }, DEBOUNCE_MS);
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHasDraft(false);
    setDraft("");
  }, []);

  return { draft, hasDraft, saveDraft, clearDraft };
}
