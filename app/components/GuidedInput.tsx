"use client";

import { useState } from "react";
import type { Scenario } from "@/lib/agents/types";

interface GuidedInputProps {
  onSubmit: (narrative: string) => void;
  onSwitchToFreeform: () => void;
  loading: boolean;
}

interface ScenarioOption {
  id: Exclude<Scenario, "unknown" | "mixed">;
  label: string;
  icon: string;
  description: string;
}

interface FollowUpQuestion {
  id: string;
  label: string;
  placeholder: string;
  type: "text" | "select" | "multiselect";
  options?: string[];
}

const scenarios: ScenarioOption[] = [
  { id: "wage_arrears", label: "被欠工资", icon: "💰", description: "老板拖着不发工资、少发、扣钱" },
  { id: "unlawful_termination", label: "被辞退/开除", icon: "🚪", description: "被口头或书面通知不用来了" },
  { id: "no_written_contract", label: "没签合同", icon: "📄", description: "干了很久但一直没签书面劳动合同" },
  { id: "overtime", label: "加班没给钱", icon: "⏰", description: "经常加班但没有加班费" },
  { id: "work_injury", label: "工伤", icon: "🏥", description: "上班时受伤，公司不管" },
  { id: "social_insurance", label: "社保问题", icon: "🛡️", description: "公司没买社保或者少买了" },
  { id: "labor_relation", label: "不承认劳动关系", icon: "🤝", description: "公司说你不是员工、是临时工或合作关系" },
  { id: "female_protection", label: "怀孕被辞退", icon: "🤰", description: "怀孕、产假、哺乳期被为难" },
  { id: "non_compete", label: "竞业限制", icon: "🔒", description: "离职后被要求不能去同行" },
  { id: "pay_benefits", label: "其他工资福利", icon: "📋", description: "年假、最低工资、停工工资等" },
];

const scenarioQuestions: Record<string, FollowUpQuestion[]> = {
  wage_arrears: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "duration", label: "欠了多久的工资？", placeholder: "比如：2个月、半年", type: "text" },
    { id: "amount", label: "大概欠了多少钱？", placeholder: "比如：8000元、不确定", type: "text" },
    { id: "evidence", label: "手上有什么证据？", placeholder: "", type: "multiselect", options: ["微信聊天记录", "工资条/银行流水", "劳动合同", "考勤/打卡记录", "工牌/工服照片", "都没有"] },
  ],
  unlawful_termination: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "how", label: "怎么被辞退的？", placeholder: "比如：口头通知、微信通知、书面通知", type: "text" },
    { id: "reason", label: "公司给了什么理由？", placeholder: "比如：没说理由、说效益不好、说我违规", type: "text" },
    { id: "tenure", label: "在这家公司干了多久？", placeholder: "比如：2年、8个月", type: "text" },
    { id: "evidence", label: "手上有什么证据？", placeholder: "", type: "multiselect", options: ["解除通知", "微信聊天记录", "劳动合同", "工资流水", "考勤记录", "都没有"] },
  ],
  no_written_contract: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "tenure", label: "入职多久了？", placeholder: "比如：6个月、1年半", type: "text" },
    { id: "asked", label: "有没有跟公司提过签合同？", placeholder: "比如：提过但公司一直拖、没提过", type: "text" },
    { id: "evidence", label: "能证明你在这上班吗？", placeholder: "", type: "multiselect", options: ["工牌/工服", "打卡记录", "工资流水", "微信工作群", "社保记录", "都没有"] },
  ],
  overtime: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "frequency", label: "加班情况怎么样？", placeholder: "比如：每天加班2小时、周末经常加班", type: "text" },
    { id: "pay", label: "有没有给加班费？", placeholder: "比如：完全没给、给了一部分、用调休代替", type: "text" },
    { id: "evidence", label: "有加班的证据吗？", placeholder: "", type: "multiselect", options: ["打卡记录", "加班审批单", "微信工作安排", "排班表", "工作成果记录", "都没有"] },
  ],
  work_injury: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "injury", label: "怎么受伤的？", placeholder: "比如：操作机器时手被夹了、送货路上摔了", type: "text" },
    { id: "treatment", label: "公司怎么处理的？", placeholder: "比如：送医院了但不认工伤、让我自己出医药费", type: "text" },
    { id: "evidence", label: "有什么材料？", placeholder: "", type: "multiselect", options: ["诊断证明", "住院记录", "事故经过记录", "工伤认定书", "劳动合同", "都没有"] },
  ],
  social_insurance: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "issue", label: "社保什么问题？", placeholder: "比如：一直没买、中间断了、按最低标准买的", type: "text" },
    { id: "tenure", label: "在这家公司干了多久？", placeholder: "比如：3年、1年半", type: "text" },
    { id: "evidence", label: "有什么证据？", placeholder: "", type: "multiselect", options: ["社保缴费记录", "劳动合同", "工资流水", "入职证明", "都没有"] },
  ],
  labor_relation: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "work_type", label: "做什么工作？", placeholder: "比如：外卖骑手、家政、工地、主播", type: "text" },
    { id: "control", label: "公司怎么管你的？", placeholder: "比如：规定上下班时间、有排班、要打卡", type: "text" },
    { id: "evidence", label: "有什么能证明关系的？", placeholder: "", type: "multiselect", options: ["平台接单记录", "排班表", "收入结算记录", "工作群聊天", "合作协议", "都没有"] },
  ],
  female_protection: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "period", label: "现在是什么阶段？", placeholder: "", type: "select", options: ["怀孕中", "产假期间", "哺乳期（孩子不满1岁）"] },
    { id: "issue", label: "公司怎么对你的？", placeholder: "比如：要辞退我、调岗降薪、不批产假", type: "text" },
    { id: "evidence", label: "有什么证据？", placeholder: "", type: "multiselect", options: ["孕检证明", "调岗/降薪通知", "辞退通知", "劳动合同", "工资变化记录", "都没有"] },
  ],
  non_compete: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "agreement", label: "签了竞业限制协议吗？", placeholder: "比如：签了、不确定、入职时签了一堆文件", type: "text" },
    { id: "compensation", label: "离职后公司给补偿了吗？", placeholder: "比如：每月给了XX元、没给过", type: "text" },
    { id: "situation", label: "现在什么情况？", placeholder: "比如：想去同行、已经去了被公司发现", type: "text" },
  ],
  pay_benefits: [
    { id: "district", label: "在重庆哪个区上班？", placeholder: "比如：渝北区、江北区", type: "text" },
    { id: "issue", label: "具体是什么问题？", placeholder: "", type: "select", options: ["年假不让休", "工资低于最低标准", "停工期间不发生活费", "培训后要求赔违约金", "其他"] },
    { id: "detail", label: "具体情况说一下？", placeholder: "比如：3年了一天年假没休过", type: "text" },
    { id: "evidence", label: "有什么证据？", placeholder: "", type: "multiselect", options: ["劳动合同", "工资条", "请假记录", "培训协议", "公司规章制度", "都没有"] },
  ],
};

function buildNarrative(scenarioId: string, answers: Record<string, string | string[]>): string {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return "";

  const parts: string[] = [];

  if (answers.district) {
    parts.push(`我在重庆${answers.district}上班`);
  } else {
    parts.push("我在重庆上班");
  }

  switch (scenarioId) {
    case "wage_arrears":
      if (answers.duration) parts.push(`公司拖欠了${answers.duration}的工资`);
      if (answers.amount) parts.push(`大概欠了${answers.amount}`);
      break;
    case "unlawful_termination":
      if (answers.tenure) parts.push(`在这家公司干了${answers.tenure}`);
      if (answers.how) parts.push(`被${answers.how}辞退了`);
      if (answers.reason) parts.push(`公司说的理由是${answers.reason}`);
      break;
    case "no_written_contract":
      if (answers.tenure) parts.push(`已经入职${answers.tenure}了`);
      parts.push("一直没有签书面劳动合同");
      if (answers.asked) parts.push(String(answers.asked));
      break;
    case "overtime":
      if (answers.frequency) parts.push(String(answers.frequency));
      if (answers.pay) parts.push(`加班费情况：${answers.pay}`);
      break;
    case "work_injury":
      if (answers.injury) parts.push(String(answers.injury));
      if (answers.treatment) parts.push(`公司的处理：${answers.treatment}`);
      break;
    case "social_insurance":
      if (answers.tenure) parts.push(`在这家公司干了${answers.tenure}`);
      if (answers.issue) parts.push(`社保问题：${answers.issue}`);
      break;
    case "labor_relation":
      if (answers.work_type) parts.push(`做${answers.work_type}`);
      if (answers.control) parts.push(String(answers.control));
      parts.push("但公司不承认劳动关系");
      break;
    case "female_protection":
      if (answers.period) parts.push(`现在${answers.period}`);
      if (answers.issue) parts.push(String(answers.issue));
      break;
    case "non_compete":
      if (answers.agreement) parts.push(`竞业限制协议：${answers.agreement}`);
      if (answers.compensation) parts.push(`补偿情况：${answers.compensation}`);
      if (answers.situation) parts.push(String(answers.situation));
      break;
    case "pay_benefits":
      if (answers.issue) parts.push(String(answers.issue));
      if (answers.detail) parts.push(String(answers.detail));
      break;
  }

  if (Array.isArray(answers.evidence) && answers.evidence.length > 0 && !answers.evidence.includes("都没有")) {
    parts.push(`手上有${(answers.evidence as string[]).join("、")}`);
  } else if (Array.isArray(answers.evidence) && answers.evidence.includes("都没有")) {
    parts.push("目前没有什么证据");
  }

  parts.push("想知道怎么维权");

  return parts.join("，") + "。";
}

export default function GuidedInput({ onSubmit, onSwitchToFreeform, loading }: GuidedInputProps) {
  const [step, setStep] = useState<"scenario" | "questions" | "confirm">("scenario");
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  function handleScenarioSelect(id: string) {
    setSelectedScenario(id);
    setAnswers({});
    setStep("questions");
  }

  function handleAnswerChange(questionId: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function handleMultiselectToggle(questionId: string, option: string) {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) || [];
      if (option === "都没有") {
        return { ...prev, [questionId]: current.includes("都没有") ? [] : ["都没有"] };
      }
      const without = current.filter((v) => v !== "都没有");
      const updated = without.includes(option) ? without.filter((v) => v !== option) : [...without, option];
      return { ...prev, [questionId]: updated };
    });
  }

  function handleQuestionsSubmit() {
    setStep("confirm");
  }

  function handleConfirmSubmit() {
    if (!selectedScenario) return;
    const narrative = buildNarrative(selectedScenario, answers);
    onSubmit(narrative);
  }

  function handleBack() {
    if (step === "questions") {
      setStep("scenario");
      setSelectedScenario(null);
    } else if (step === "confirm") {
      setStep("questions");
    }
  }

  const questions = selectedScenario ? scenarioQuestions[selectedScenario] || [] : [];
  const narrative = selectedScenario ? buildNarrative(selectedScenario, answers) : "";

  return (
    <div className="guided-input">
      {step === "scenario" && (
        <div className="guided-step">
          <h2 className="guided-title">你遇到了什么问题？</h2>
          <p className="guided-subtitle">选一个最接近你情况的</p>
          <div className="scenario-grid">
            {scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                className="scenario-card"
                onClick={() => handleScenarioSelect(s.id)}
              >
                <span className="scenario-card__icon">{s.icon}</span>
                <strong className="scenario-card__label">{s.label}</strong>
                <small className="scenario-card__desc">{s.description}</small>
              </button>
            ))}
          </div>
          <button type="button" className="link-button guided-freeform" onClick={onSwitchToFreeform}>
            我想直接描述案情
          </button>
        </div>
      )}

      {step === "questions" && selectedScenario && (
        <div className="guided-step">
          <button type="button" className="guided-back" onClick={handleBack}>
            ← 重新选择
          </button>
          <h2 className="guided-title">
            {scenarios.find((s) => s.id === selectedScenario)?.icon}{" "}
            {scenarios.find((s) => s.id === selectedScenario)?.label}
          </h2>
          <p className="guided-subtitle">回答几个简单问题，系统就能帮你分析</p>

          <div className="guided-questions">
            {questions.map((q) => (
              <div key={q.id} className="guided-field">
                <label className="guided-label" htmlFor={`guided-${q.id}`}>
                  {q.label}
                </label>
                {q.type === "text" && (
                  <input
                    id={`guided-${q.id}`}
                    type="text"
                    className="guided-text-input"
                    placeholder={q.placeholder}
                    value={(answers[q.id] as string) || ""}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                  />
                )}
                {q.type === "select" && q.options && (
                  <div className="guided-options">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`guided-option ${answers[q.id] === opt ? "guided-option--active" : ""}`}
                        onClick={() => handleAnswerChange(q.id, opt)}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === "multiselect" && q.options && (
                  <div className="guided-options">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`guided-option ${((answers[q.id] as string[]) || []).includes(opt) ? "guided-option--active" : ""}`}
                        onClick={() => handleMultiselectToggle(q.id, opt)}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="guided-actions">
            <button type="button" className="primary" onClick={handleQuestionsSubmit}>
              下一步
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="guided-step">
          <button type="button" className="guided-back" onClick={handleBack}>
            ← 修改信息
          </button>
          <h2 className="guided-title">确认你的情况</h2>
          <p className="guided-subtitle">系统会根据以下内容帮你分析</p>

          <div className="guided-preview">
            <p>{narrative}</p>
          </div>

          <div className="guided-actions">
            <button type="button" className="primary" onClick={handleConfirmSubmit} disabled={loading}>
              {loading ? "正在分析..." : "开始分析"}
            </button>
          </div>
          <p className="guided-hint">分析完全免费，不收集你的个人信息</p>
        </div>
      )}
    </div>
  );
}
