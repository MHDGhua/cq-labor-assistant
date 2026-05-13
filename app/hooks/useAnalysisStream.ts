"use client";

import { useCallback, useRef, useState } from "react";
import type { PublicAnalysisResponse } from "@/lib/agents/types";

interface StreamStage {
  current: number;
  total: number;
  label: string;
}

interface UseAnalysisStreamReturn {
  stage: StreamStage | null;
  result: PublicAnalysisResponse | null;
  error: string | null;
  loading: boolean;
  submit: (narrative: string) => void;
  retry: () => void;
}

const MAX_RETRIES = 2;
const BASE_DELAY = 1500;

export function useAnalysisStream(): UseAnalysisStreamReturn {
  const [stage, setStage] = useState<StreamStage | null>(null);
  const [result, setResult] = useState<PublicAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastNarrativeRef = useRef<string>("");
  const retriesRef = useRef(0);

  const doSubmit = useCallback((narrative: string, isRetry: boolean) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    lastNarrativeRef.current = narrative;

    if (!isRetry) {
      retriesRef.current = 0;
    }

    setLoading(true);
    setError(null);
    if (!isRetry) setResult(null);
    setStage({ current: 0, total: 3, label: isRetry ? "重新连接中..." : "正在连接..." });

    fetch("/api/analyze-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrative }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("分析失败，请稍后重试。");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("浏览器不支持流式响应。");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);
            } else if (line === "" && eventType && eventData) {
              handleEvent(eventType, eventData);
              eventType = "";
              eventData = "";
            }
          }
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;

        if (retriesRef.current < MAX_RETRIES && !navigator.onLine === false) {
          retriesRef.current++;
          const delay = BASE_DELAY * Math.pow(2, retriesRef.current - 1);
          setStage({ current: 0, total: 3, label: `连接失败，${Math.round(delay / 1000)}秒后重试...` });
          setTimeout(() => doSubmit(narrative, true), delay);
          return;
        }

        const message = !navigator.onLine
          ? "网络已断开，请检查网络连接后重试"
          : err instanceof Error ? err.message : "未知错误，请重试";
        setError(message);
        setLoading(false);
        setStage(null);
      })
      .finally(() => {
        if (!error && retriesRef.current <= MAX_RETRIES) {
          setLoading(false);
          setStage(null);
        }
      });

    function handleEvent(type: string, data: string) {
      try {
        const parsed = JSON.parse(data);
        switch (type) {
          case "stage":
            setStage(parsed);
            break;
          case "extraction_done":
            setStage((prev) => prev ? { ...prev, label: `已识别：${parsed.scenario}` } : prev);
            break;
          case "retrieval_done":
            setStage((prev) => prev ? { ...prev, label: `找到 ${parsed.caseCount} 个案例` } : prev);
            break;
          case "complete":
            setResult(parsed as PublicAnalysisResponse);
            break;
        }
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  const submit = useCallback((narrative: string) => {
    doSubmit(narrative, false);
  }, [doSubmit]);

  const retry = useCallback(() => {
    if (lastNarrativeRef.current) {
      doSubmit(lastNarrativeRef.current, true);
    }
  }, [doSubmit]);

  return { stage, result, error, loading, submit, retry };
}
