"use client";

import { useCallback, useRef, useState } from "react";
import type { AnalysisResult, PublicAnalysisResponse } from "@/lib/agents/types";
import { toPublicAnalysisResponse } from "@/lib/agents";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  type: "text" | "typing" | "steps" | "citations";
  timestamp: number;
  metadata?: {
    citations?: PublicAnalysisResponse["citations"];
    steps?: string[];
    riskLevel?: string;
    scenarioLabel?: string;
    analysisId?: string;
  };
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  suggestedReplies: string[];
  submit: (narrative: string) => void;
  retry: () => void;
  clear: () => void;
  stop: () => void;
}

const MAX_RETRIES = 2;
const BASE_DELAY = 1500;

let msgId = 0;
function nextId() { return `msg-${++msgId}-${Date.now()}`; }

export function useChatStream(): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastNarrativeRef = useRef("");
  const retriesRef = useRef(0);
  const typingIdRef = useRef("");

  const streamContentRef = useRef("");
  const streamMsgIdRef = useRef("");

  const pushMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    const full: ChatMessage = { ...msg, id: nextId(), timestamp: Date.now() };
    setMessages(prev => [...prev, full]);
    return full.id;
  }, []);

  const updateTyping = useCallback((content: string) => {
    setMessages(prev => prev.map(m =>
      m.id === typingIdRef.current ? { ...m, content } : m
    ));
  }, []);

  const removeTyping = useCallback(() => {
    setMessages(prev => prev.filter(m => m.id !== typingIdRef.current));
  }, []);

  const appendStreamContent = useCallback((token: string) => {
    streamContentRef.current += token;
    const id = streamMsgIdRef.current;
    if (id) {
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, content: streamContentRef.current } : m
      ));
    }
  }, []);

  const doSubmit = useCallback((narrative: string, isRetry: boolean) => {
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    lastNarrativeRef.current = narrative;
    if (!isRetry) retriesRef.current = 0;

    setLoading(true);
    setError(null);
    setSuggestedReplies([]);

    if (!isRetry) {
      pushMessage({ role: "user", content: narrative, type: "text" });
    }

    const typingId = nextId();
    typingIdRef.current = typingId;
    setMessages(prev => [...prev, {
      id: typingId, role: "assistant", content: "", type: "typing", timestamp: Date.now()
    }]);

    fetch("/api/analyze-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrative }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("analysis_failed");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("no_stream");

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
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6);
            else if (line === "" && eventType && eventData) {
              handleEvent(eventType, eventData);
              eventType = "";
              eventData = "";
            }
          }
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (retriesRef.current < MAX_RETRIES) {
          retriesRef.current++;
          const delay = BASE_DELAY * Math.pow(2, retriesRef.current - 1);
          updateTyping(`连接失败，${Math.round(delay / 1000)}秒后重试...`);
          setTimeout(() => doSubmit(narrative, true), delay);
          return;
        }
        removeTyping();
        const message = !navigator.onLine
          ? "网络已断开，请检查网络连接后重试。"
          : "分析暂时不可用，请稍后重试。";
        setError(message);
        setLoading(false);
      })
      .finally(() => {
        if (retriesRef.current <= MAX_RETRIES) {
          setLoading(false);
        }
      });

    function handleEvent(type: string, data: string) {
      try {
        const parsed = JSON.parse(data);
        switch (type) {
          case "stage":
            if (parsed.current === 1) updateTyping("我正在仔细看你的情况...");
            else if (parsed.current === 3) updateTyping("正在整理建议...");
            break;
          case "extraction_done":
            updateTyping(`我看了你的情况，这属于${parsed.scenario}类争议，正在查找相关案例...`);
            break;
          case "retrieval_done":
            updateTyping(`找到了${parsed.caseCount}个相关案例和${parsed.docCount}条法规，正在整理建议...`);
            break;
          case "review_token": {
            if (!streamMsgIdRef.current) {
              removeTyping();
              streamContentRef.current = "";
              const id = nextId();
              streamMsgIdRef.current = id;
              setMessages(prev => [...prev, {
                id, role: "assistant", content: "", type: "text", timestamp: Date.now()
              }]);
            }
            if (parsed.t) {
              appendStreamContent(parsed.t);
            }
            break;
          }
          case "complete": {
            const hadStream = !!streamMsgIdRef.current;
            if (hadStream) {
              // Keep the streamed message but add metadata
              const streamId = streamMsgIdRef.current;
              const raw = parsed as AnalysisResult;
              const pub = toPublicAnalysisResponse(raw);
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, metadata: { analysisId: raw.analysisId, riskLevel: pub.riskLevel, scenarioLabel: pub.scenarioLabel } } : m
              ));
              streamMsgIdRef.current = "";
              streamContentRef.current = "";

              if (pub.nextSteps.length > 0) {
                pushMessage({ role: "assistant", content: "接下来你可以这样做：", type: "steps",
                  metadata: { steps: pub.nextSteps }
                });
              }

              if (pub.compensationRange) {
                pushMessage({ role: "assistant", content: pub.compensationRange, type: "text" });
              }

              if (pub.citations.length > 0) {
                pushMessage({ role: "assistant", content: `以上建议参考了${pub.citations.length}条法律依据`, type: "citations",
                  metadata: { citations: pub.citations }
                });
              }

              setSuggestedReplies(pub.followUpQuestions);
            } else {
              removeTyping();
              const raw = parsed as AnalysisResult;
              const pub = toPublicAnalysisResponse(raw);
              const scenario = pub.scenarioLabel;
              const risk = pub.riskLevel;

              pushMessage({ role: "assistant", content: pub.answer, type: "text",
                metadata: { riskLevel: risk, scenarioLabel: scenario, analysisId: raw.analysisId }
              });

              if (pub.nextSteps.length > 0) {
                pushMessage({ role: "assistant", content: "接下来你可以这样做：", type: "steps",
                  metadata: { steps: pub.nextSteps }
                });
              }

              if (pub.compensationRange) {
                pushMessage({ role: "assistant", content: pub.compensationRange, type: "text" });
              }

              if (pub.citations.length > 0) {
                pushMessage({ role: "assistant", content: `以上建议参考了${pub.citations.length}条法律依据`, type: "citations",
                  metadata: { citations: pub.citations }
                });
              }

              setSuggestedReplies(pub.followUpQuestions);
            }
            break;
          }
        }
      } catch { /* ignore parse errors */ }
    }
  }, [pushMessage, updateTyping, removeTyping, appendStreamContent]);

  const submit = useCallback((narrative: string) => {
    doSubmit(narrative, false);
  }, [doSubmit]);

  const retry = useCallback(() => {
    if (lastNarrativeRef.current) doSubmit(lastNarrativeRef.current, true);
  }, [doSubmit]);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (typingIdRef.current) {
      removeTyping();
    }
    if (streamMsgIdRef.current) {
      streamMsgIdRef.current = "";
      streamContentRef.current = "";
    }
    setLoading(false);
  }, [removeTyping]);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    setSuggestedReplies([]);
  }, []);

  return { messages, loading, error, suggestedReplies, submit, retry, clear, stop };
}
