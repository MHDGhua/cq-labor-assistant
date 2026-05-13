import { describe, expect, it } from "vitest";
import { agentTranscriptLabels, agentWorkflowSteps } from "../lib/agents/workflow";

describe("agent workflow contract", () => {
  it("keeps a stable three-agent operating model", () => {
    expect(agentWorkflowSteps).toHaveLength(3);
    expect(agentTranscriptLabels).toEqual([
      "Agent 1 · 案情抽取",
      "Agent 2 · 重庆案例与法源检索",
      "Agent 3 · 结论审校"
    ]);
  });

  it("keeps the DeepSeek-ready workflow focused on extraction, retrieval, and review", () => {
    expect(agentWorkflowSteps[0].guardrails).toContain("不输出胜诉保证");
    expect(agentWorkflowSteps[1].guardrails).toContain("不公开全量案例库");
    expect(agentWorkflowSteps[2].guardrails).toContain("不做胜率承诺");
  });
});
