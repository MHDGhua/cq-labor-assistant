"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicAnalysisResponse } from "@/lib/agents/types";

const STORAGE_KEY = "cq-labor-history";
const MAX_ITEMS = 5;

export interface HistoryEntry {
  id: string;
  timestamp: number;
  input: string;
  headline: string;
  scenarioLabel: string;
  riskLevel: string;
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useLocalHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const addEntry = useCallback((input: string, result: PublicAnalysisResponse) => {
    const entry: HistoryEntry = {
      id: result.analysisId || crypto.randomUUID(),
      timestamp: Date.now(),
      input: input.slice(0, 80),
      headline: result.headline,
      scenarioLabel: result.scenarioLabel,
      riskLevel: result.riskLevel,
    };
    const updated = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setHistory(updated);
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  return { history, addEntry, clearHistory };
}
