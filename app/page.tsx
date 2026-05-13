"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { demoPrompts } from "@/lib/data/cases";
import type { PublicAnalysisResponse, PublicReportExport } from "@/lib/agents/types";
import PipelineProgress from "./components/PipelineProgress";
import FontSizeToggle from "./components/FontSizeToggle";
import ThemeToggle from "./components/ThemeToggle";
import HistoryPanel from "./components/HistoryPanel";
import InputHints from "./components/InputHints";
import { useAnalysisStream } from "./hooks/useAnalysisStream";
import { useLocalHistory } from "./hooks/useLocalHistory";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useDraft } from "./hooks/useDraft";
import Onboarding from "./components/Onboarding";

const GuidedInput = dynamic(() => import("./components/GuidedInput"), {
  loading: () => <div className="skeleton skeleton--guided" />,
});
const AnalysisResult = dynamic(() => import("./components/AnalysisResult"), {
  loading: () => <div className="skeleton skeleton--result" />,
});
const VoiceInput = dynamic(() => import("./components/VoiceInput"), {
  ssr: false,
});

const defaultPrompt =
  "我在重庆一家公司上班，被口头通知第二天不用来了，公司还拖欠了两个月工资，没有签劳动合同，想知道能不能仲裁。";

const riskLabels = {
  low: "材料基础较完整",
  medium: "需要补证后判断",
  high: "事实缺口较大"
} satisfies Record<PublicAnalysisResponse["riskLevel"], string>;

export default function HomePage() {
  const [inputMode, setInputMode] = useState<"guided" | "freeform">("guided");
  const [input, setInput] = useState(defaultPrompt);
  const stream = useAnalysisStream();
  const result = stream.result;
  const loading = stream.loading;
  const error = stream.error;
  const [copiedFormat, setCopiedFormat] = useState<"markdown" | "json" | null>(null);
  const [feedbackVote, setFeedbackVote] = useState<boolean | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const { history, addEntry, clearHistory } = useLocalHistory();
  const { draft, hasDraft, saveDraft, clearDraft } = useDraft();

  useEffect(() => {
    if (hasDraft && draft) {
      setInput(draft);
      setInputMode("freeform");
    }
  }, [hasDraft, draft]);

  useEffect(() => {
    setFeedbackVote(null);
    setFeedbackComment("");
    setFeedbackMessage(null);
  }, [result?.analysisId]);

  useEffect(() => {
    if (result) {
      addEntry(input, result);
    }
  }, [result?.analysisId]);

  const reportExport = useMemo<PublicReportExport | null>(() => {
    if (!result) {
      return null;
    }

    return {
      generatedAt: new Date().toISOString(),
      analysisId: result.analysisId,
      headline: result.headline,
      scenarioLabel: result.scenarioLabel,
      riskLabel: riskLabels[result.riskLevel],
      answer: result.answer,
      compensationRange: result.compensationRange,
      followUpQuestions: result.followUpQuestions,
      nextSteps: result.nextSteps,
      cautions: result.cautions,
      citations: result.citations,
      disclosure:
        "本报告仅供参考，不构成法律意见。如需专业帮助，请拨打12348法律援助热线或咨询当地律师。"
    };
  }, [result]);

  const reportMarkdown = useMemo(() => {
    return reportExport ? renderReportMarkdown(reportExport) : "";
  }, [reportExport]);

  const reportJson = useMemo(() => {
    return reportExport ? JSON.stringify(reportExport, null, 2) : "";
  }, [reportExport]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const narrative = input.trim();
    if (!narrative) return;
    clearDraft();
    stream.submit(narrative);
  }

  function handleGuidedSubmit(narrative: string) {
    setInput(narrative);
    clearDraft();
    stream.submit(narrative);
  }

  useKeyboardShortcuts({
    onSubmit: () => { if (input.trim()) stream.submit(input.trim()); },
    onClear: () => setInput(""),
    canSubmit: !loading && inputMode === "freeform",
  });

  async function copyReport(format: "markdown" | "json") {
    const content = format === "markdown" ? reportMarkdown : reportJson;
    if (!content) {
      return;
    }

    await navigator.clipboard.writeText(content);
    setCopiedFormat(format);
    window.setTimeout(() => setCopiedFormat(null), 1500);
  }

  function downloadReport(format: "markdown" | "json") {
    const content = format === "markdown" ? reportMarkdown : reportJson;
    if (!content) {
      return;
    }

    const blob = new Blob([content], {
      type: format === "markdown" ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cq-labor-report-${new Date().toISOString().slice(0, 10)}.${format === "markdown" ? "md" : "json"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function submitFeedback(helpful: boolean) {
    if (!result) {
      return;
    }

    setFeedbackLoading(true);
    setFeedbackMessage(null);
    setFeedbackVote(helpful);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          analysisId: result.analysisId,
          helpful,
          comment: feedbackComment.trim() || undefined
        })
      });

      if (!response.ok) {
        throw new Error("feedback unavailable");
      }

      setFeedbackMessage("已收到反馈。");
      setFeedbackComment("");
    } catch {
      setFeedbackMessage("反馈暂不可用。");
    } finally {
      setFeedbackLoading(false);
    }
  }

  return (
    <main id="main-content" className="chat-shell">
      <Onboarding />
      <header className="topbar">
        <Link className="topbar__brand" href="/">
          渝劳问答
        </Link>
        <nav className="topbar__nav">
          <ThemeToggle />
          <FontSizeToggle />
        </nav>
      </header>

      <section className="conversation-hero">
        <p className="eyebrow">重庆劳动法 · 智能分析</p>
        <h1>描述你的劳动争议，获取免费分析和行动建议</h1>
        <p className="lede">
          系统会根据你的情况，匹配重庆本地法规和公开案例，给出具体的维权建议和下一步行动指南。
        </p>
      </section>

      {!result && <HistoryPanel history={history} onClear={clearHistory} />}

      <section className="chat-layout">
        {inputMode === "guided" ? (
          <GuidedInput
            onSubmit={handleGuidedSubmit}
            onSwitchToFreeform={() => setInputMode("freeform")}
            loading={loading}
          />
        ) : (
          <form className="ask-panel" onSubmit={onSubmit}>
            <div className="message message--assistant">
              <span>助手</span>
              <p>请直接描述劳动争议经过，包括地点、入职时间、工资、解除方式、合同和证据。</p>
            </div>

            <label className="sr-only" htmlFor="case-input">
              案情描述
            </label>
            <div className="input-with-voice">
              <textarea
                id="case-input"
                value={input}
                onChange={(event) => { setInput(event.target.value); saveDraft(event.target.value); }}
                className="chat-input"
                rows={8}
                placeholder="例如：我在重庆上班，公司拖欠工资两个月，被口头辞退，没有签劳动合同..."
              />
              <VoiceInput
                onResult={(text) => setInput((prev) => prev ? prev + text : text)}
                disabled={loading}
              />
            </div>
            <InputHints text={input} />
            {hasDraft ? (
              <p className="draft-notice">
                已恢复上次输入
                <button type="button" className="link-button" onClick={() => { clearDraft(); setInput(defaultPrompt); }}>
                  清除
                </button>
              </p>
            ) : null}

            <div className="prompt-row">
              {demoPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="chip"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="composer-actions">
              <button className="primary" type="submit" disabled={loading}>
                {loading ? "正在分析中..." : "开始分析"}
              </button>
              <button type="button" className="link-button" onClick={() => setInputMode("guided")}>
                用引导模式
              </button>
              <span className="kbd-hint">Ctrl+Enter 提交 · Esc 清空</span>
            </div>

            {error ? <p className="error">{error}</p> : null}
          </form>
        )}

      </section>

      {stream.stage && loading ? (
        <PipelineProgress
          current={stream.stage.current}
          total={stream.stage.total}
          label={stream.stage.label}
        />
      ) : null}

      {error ? (
        <div className="error-block" style={{ marginTop: 18 }}>
          <p className="error">{error}</p>
          <button type="button" className="primary primary--ghost" onClick={stream.retry}>
            重新分析
          </button>
        </div>
      ) : null}

      {result ? (
        <AnalysisResult
          result={result}
          onCopyReport={(format) => void copyReport(format)}
          onDownloadReport={downloadReport}
          copiedFormat={copiedFormat}
          feedbackVote={feedbackVote}
          feedbackComment={feedbackComment}
          feedbackMessage={feedbackMessage}
          feedbackLoading={feedbackLoading}
          onFeedbackVote={(helpful) => void submitFeedback(helpful)}
          onFeedbackCommentChange={setFeedbackComment}
          onFollowUp={(question) => {
            setInput(question);
            setInputMode("freeform");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onInlineSubmit={(text) => {
            setInput(text);
            stream.submit(text);
          }}
          loading={loading}
        />
      ) : null}
    </main>
  );
}

function renderReportMarkdown(report: PublicReportExport) {
  const lines: Array<string | null> = [
    "# 重庆劳动争议分析报告",
    "",
    `生成时间：${report.generatedAt}`,
    report.analysisId ? `分析编号：${report.analysisId}` : "",
    "",
    "## 结论",
    report.headline,
    "",
    "## 场景与风险",
    `- 场景：${report.scenarioLabel}`,
    `- 风险：${report.riskLabel}`,
    "",
    "## 分析",
    report.answer,
    "",
    report.compensationRange ? "## 测算提示" : null,
    report.compensationRange ?? null,
    report.compensationRange ? "" : null,
    report.followUpQuestions.length ? "## 需要补充的信息" : null,
    ...report.followUpQuestions.map((question) => `- ${question}`),
    report.followUpQuestions.length ? "" : null,
    "## 下一步",
    ...report.nextSteps.map((step) => `- ${step}`),
    "",
    "## 注意边界",
    ...report.cautions.map((caution) => `- ${caution}`),
    "",
    "## 引用来源",
    ...report.citations.map((item) => `- [${item.title}](${item.url})：${item.label}`),
    "",
    "## 披露范围",
    report.disclosure
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}
