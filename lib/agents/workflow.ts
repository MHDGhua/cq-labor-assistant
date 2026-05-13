export interface AgentWorkflowStep {
  label: string;
  objective: string;
  inputFocus: string[];
  outputFocus: string[];
  guardrails: string[];
}

export const agentWorkflowSteps: AgentWorkflowStep[] = [
  {
    label: "Agent 1 · 案情抽取",
    objective: "识别争议类型、关键事实、时间线、证据和信息缺口。",
    inputFocus: ["案情叙述", "地点", "入职时间", "工资", "解除方式", "证据"],
    outputFocus: ["争议类型", "事实", "时间线", "证据", "缺口"],
    guardrails: ["不输出胜诉保证", "不输出裁判偏向", "不扩展到非劳动法领域"]
  },
  {
    label: "Agent 2 · 重庆案例与法源检索",
    objective: "检索重庆公开案例、法源和程序材料，只提供少量引用。",
    inputFocus: ["争议类型", "关键词", "证据缺口", "重庆本地程序"],
    outputFocus: ["检索到的案例", "检索到的法源", "检索理由"],
    guardrails: ["只返回少量引用", "不公开全量案例库", "不编造来源"]
  },
  {
    label: "Agent 3 · 结论审校",
    objective: "合并检索结果，输出可读建议、风险边界、置信度和人工交接信号。",
    inputFocus: ["抽取结果", "检索结果", "证据缺口", "本地程序路径"],
    outputFocus: ["最终结论", "风险等级", "置信度", "人工交接", "下一步", "注意边界"],
    guardrails: ["不输出法律意见", "不输出裁判偏向", "不做胜率承诺"]
  }
] as const;

export const agentTranscriptLabels = agentWorkflowSteps.map((step) => step.label);
