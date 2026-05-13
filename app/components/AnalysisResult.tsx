"use client";

import { useState } from "react";
import type { PublicAnalysisResponse } from "@/lib/agents/types";
import ActionCard from "./ActionCard";
import ArbitrationDocButton from "./ArbitrationDocButton";
import EvidenceGuideCard from "./EvidenceGuideCard";
import InlineFollowUp from "./InlineFollowUp";
import ShareImage from "./ShareImage";
import { findStoryByScenario } from "@/lib/data/case-stories";
import { downloadICS } from "@/lib/utils/ics-generator";

interface AnalysisResultProps {
  result: PublicAnalysisResponse;
  onCopyReport: (format: "markdown" | "json") => void;
  onDownloadReport: (format: "markdown" | "json") => void;
  copiedFormat: "markdown" | "json" | null;
  feedbackVote: boolean | null;
  feedbackComment: string;
  feedbackMessage: string | null;
  feedbackLoading: boolean;
  onFeedbackVote: (helpful: boolean) => void;
  onFeedbackCommentChange: (comment: string) => void;
  onFollowUp?: (question: string) => void;
  onInlineSubmit?: (text: string) => void;
  loading?: boolean;
}

const riskMessages: Record<string, { label: string; empathy: string; color: string }> = {
  low: {
    label: "你的证据比较充分",
    empathy: "你的情况比较清楚，走正常流程就行，不用太担心。",
    color: "risk--low",
  },
  medium: {
    label: "需要补一些材料",
    empathy: "虽然还需要补一些材料，但这种情况很常见，很多人都成功维权了。",
    color: "risk--medium",
  },
  high: {
    label: "信息还不够，别着急",
    empathy: "目前信息还不够，但别着急，我们一步步来。先把能找到的证据整理好。",
    color: "risk--high",
  },
};

const plainLanguageMap: Record<string, string> = {
  "违法解除": "公司违法把你辞退了",
  "双倍工资差额": "因为没签合同，公司要多付你一倍工资",
  "停工留薪期": "受伤后不用上班但公司照常发工资的时间",
  "经济补偿金": "公司辞退你时应该给的补偿（按工龄算）",
  "仲裁时效": "申请仲裁的截止期限（一般是1年内）",
  "劳动报酬": "工资",
  "用人单位": "公司/老板",
  "劳动者": "你（打工的人）",
  "管辖": "该去哪里申请",
  "举证责任": "谁来提供证据",
  "违法解除/辞退": "公司违法把你辞退了",
  "未签书面劳动合同": "没签合同",
  "加班费/工时争议": "加班没给钱",
  "社会保险争议": "社保问题",
  "工伤待遇争议": "工伤赔偿",
  "女职工特殊保护": "怀孕/产假期间的保护",
  "竞业限制争议": "离职后不能去同行的限制",
  "工资福利/休假争议": "工资福利问题",
  "劳动关系认定": "确认你和公司是劳动关系",
};

function toPlainLanguage(text: string): string {
  let result = text;
  for (const [term, plain] of Object.entries(plainLanguageMap)) {
    if (result.includes(term)) {
      result = result.replace(term, `${term}（${plain}）`);
    }
  }
  return result;
}

function getScenarioPlain(scenarioLabel: string): string {
  return plainLanguageMap[scenarioLabel] || scenarioLabel;
}

export default function AnalysisResult({
  result,
  onCopyReport,
  onDownloadReport,
  copiedFormat,
  feedbackVote,
  feedbackComment,
  feedbackMessage,
  feedbackLoading,
  onFeedbackVote,
  onFeedbackCommentChange,
  onFollowUp,
  onInlineSubmit,
  loading = false,
}: AnalysisResultProps) {
  const [showDetail, setShowDetail] = useState(false);
  const [showProfessional, setShowProfessional] = useState(false);

  const risk = riskMessages[result.riskLevel] || riskMessages.medium;
  const story = findStoryByScenario(mapScenarioLabelToId(result.scenarioLabel));

  return (
    <section className="answer-wrap" aria-live="polite">
      <article className="answer-card">
        {/* 情绪安抚 */}
        <div className="empathy-banner">
          <p className="empathy-text">{risk.empathy}</p>
        </div>

        {/* 时效预警 */}
        {result.statuteWarning ? (
          <div className={`statute-warning statute-warning--${result.statuteWarning.urgency}`}>
            <strong>时效提醒</strong>
            <p>{result.statuteWarning.message}</p>
            <button
              type="button"
              className="chip statute-warning__cal"
              onClick={() => downloadICS(
                "劳动仲裁时效截止",
                365 - result.statuteWarning!.daysElapsed
              )}
            >
              添加到日历提醒
            </button>
          </div>
        ) : null}

        {/* 第一层：核心结论 */}
        <div className="answer-card__head">
          <div>
            <p className="eyebrow">分析结果</p>
            <h2>{result.headline}</h2>
          </div>
          <span className={`risk ${risk.color}`}>
            {risk.label}
          </span>
        </div>

        <div className="plain-scenario">
          <span>你的情况属于：</span>
          <strong>{getScenarioPlain(result.scenarioLabel)}</strong>
        </div>

        <p className="answer-text-plain">
          {toPlainLanguage(result.answer)}
        </p>

        {/* 核心行动提示 */}
        <div className="action-highlight">
          <strong>现在最该做的一件事</strong>
          <p>{result.nextSteps[0] || "整理好手上的证据"}</p>
        </div>

        {/* 费用和时间说明 */}
        <div className="cost-info">
          <div className="cost-info__item">
            <strong>费用</strong>
            <p>劳动仲裁免费，不需要花钱，也不一定要请律师</p>
          </div>
          <div className="cost-info__item">
            <strong>时间</strong>
            <p>从申请到出结果，一般 1.5-3 个月</p>
          </div>
          <div className="cost-info__item">
            <strong>免费帮助</strong>
            <p>拨打 12348 可以申请法律援助（政府提供，不收费）</p>
          </div>
        </div>

        {/* 追问按钮 */}
        {onFollowUp && result.followUpQuestions.length > 0 ? (
          <div className="followup-section">
            <strong>补充信息可以让分析更准确：</strong>
            <div className="followup-chips">
              {result.followUpQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="chip followup-chip"
                  onClick={() => onFollowUp(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* 行动卡片 */}
        <ActionCard result={result} />

        {/* 证据保全指南 */}
        <EvidenceGuideCard citations={result.citations} />

        {/* 仲裁申请书 */}
        <ArbitrationDocButton result={result} />

        {/* 相似案例故事 */}
        {story ? (
          <div className="story-card">
            <strong>和你情况类似的案例</strong>
            <p className="story-text">{story.story}</p>
            <div className="story-result">
              <span>最后结果：</span>
              <p>{story.result}</p>
            </div>
            <div className="story-takeaway">
              <span>关键点：</span>
              <p>{story.keyTakeaway}</p>
            </div>
          </div>
        ) : null}

        {/* 展开详细分析 */}
        <button
          type="button"
          className="expand-button"
          onClick={() => setShowDetail(!showDetail)}
        >
          {showDetail ? "收起详细分析 ↑" : "查看详细分析 ↓"}
        </button>

        {showDetail && (
          <div className="detail-section">
            {result.compensationRange ? (
              <div className="note-block">
                <strong>关于赔偿</strong>
                <p>{toPlainLanguage(result.compensationRange)}</p>
              </div>
            ) : null}

            {result.followUpQuestions.length ? (
              <div className="note-block">
                <strong>还需要你补充的信息</strong>
                <ul className="bullets">
                  {result.followUpQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="answer-grid">
              <section>
                <h3>接下来要做的事</h3>
                <ul className="step-list">
                  {result.nextSteps.map((step, i) => (
                    <li key={step} className="step-item">
                      <span className="step-number">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3>注意事项</h3>
                <ul className="bullets">
                  {result.cautions.map((caution) => (
                    <li key={caution}>{toPlainLanguage(caution)}</li>
                  ))}
                </ul>
              </section>
            </div>

            {/* 匿名保障提示 */}
            <div className="privacy-note">
              <p>本系统完全匿名，不收集你的姓名、手机号或公司名称。你输入的内容不会被任何人看到。</p>
            </div>
          </div>
        )}

        {/* 第三层：专业引用 */}
        <button
          type="button"
          className="expand-button expand-button--secondary"
          onClick={() => setShowProfessional(!showProfessional)}
        >
          {showProfessional ? "收起法律依据 ↑" : "查看法律依据和引用来源 ↓"}
        </button>

        {showProfessional && (
          <section className="citation-strip">
            <div className="section-title section-title--compact">
              <div>
                <p className="eyebrow">引用来源</p>
                <h3>参考的法律和案例</h3>
              </div>
              <div className="button-row">
                <button className="link-button" type="button" onClick={() => onCopyReport("markdown")}>
                  {copiedFormat === "markdown" ? "已复制" : "复制报告"}
                </button>
                <button className="link-button" type="button" onClick={() => onDownloadReport("markdown")}>
                  下载报告
                </button>
              </div>
            </div>
            <div className="citation-list">
              {result.citations.map((item) => (
                <a
                  className="citation-card"
                  key={`${item.kind}-${item.url}-${item.title}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{item.kind === "case" ? "案例" : "法律依据"}</span>
                  <strong>{item.title}</strong>
                  <small>{item.label}</small>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* 反馈 */}
        <section className="feedback-section">
          <strong>这个分析对你有帮助吗？</strong>
          <div className="button-row">
            <button
              className="primary"
              type="button"
              onClick={() => onFeedbackVote(true)}
              disabled={feedbackLoading}
            >
              有帮助
            </button>
            <button
              className="primary primary--ghost"
              type="button"
              onClick={() => onFeedbackVote(false)}
              disabled={feedbackLoading}
            >
              不太对
            </button>
          </div>
          <label className="manage-label" htmlFor="feedback-comment">
            补充说明（选填）
          </label>
          <textarea
            id="feedback-comment"
            className="textarea"
            rows={3}
            value={feedbackComment}
            onChange={(event) => onFeedbackCommentChange(event.target.value)}
            placeholder="哪里不对？缺了什么信息？"
          />
          {feedbackMessage ? <p className="muted">{feedbackMessage}</p> : null}
          {feedbackVote !== null ? (
            <p className="muted">已选择：{feedbackVote ? "有帮助" : "不太对"}</p>
          ) : null}
        </section>

        {/* 内联追问 */}
        {onInlineSubmit ? (
          <InlineFollowUp
            scenarioLabel={result.scenarioLabel}
            onSubmit={onInlineSubmit}
            loading={loading}
          />
        ) : null}

        {/* 长图分享 */}
        <ShareImage result={result} />
      </article>
    </section>
  );
}

function mapScenarioLabelToId(label: string): string {
  const map: Record<string, string> = {
    "拖欠工资": "wage_arrears",
    "违法解除/辞退": "unlawful_termination",
    "未签书面劳动合同": "no_written_contract",
    "加班费/工时争议": "overtime",
    "劳动关系认定": "labor_relation",
    "社会保险争议": "social_insurance",
    "工伤待遇争议": "work_injury",
    "女职工特殊保护": "female_protection",
    "竞业限制争议": "non_compete",
    "工资福利/休假争议": "pay_benefits",
    "混合争议": "mixed",
  };
  return map[label] || "unknown";
}
