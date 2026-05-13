import { describe, expect, it } from "vitest";
import evalCases from "../evals/chongqing_labor_eval_cases.json";
import productionEvalDataset from "../evals/chongqing_production_eval_cases.json";
import { analyzeLaborCase, toPublicAnalysisResponse } from "../lib/agents";
import { agentTranscriptLabels } from "../lib/agents/workflow";

type EvalCaseLike = {
  id: string;
  narrative: string;
  expectedScenarioLabel: string;
  expectedRiskLevel: "low" | "medium" | "high";
  expectedCitationCount: number;
  expectedHeadlineIncludes?: string;
  mustContain: string[];
  mustAvoid?: string[];
  expectCompensationRange?: boolean;
  expectedMinConfidence?: number;
  expectedHandoffRequired?: boolean;
  requireFollowUp?: boolean;
};

type ProductionEvalDataset = {
  name: string;
  datasetType: string;
  releaseGate: {
    requiredPassRate: number;
    mustPassDimensions?: string[];
  };
  coverage?: Record<string, string[]>;
  cases: Array<
    EvalCaseLike & {
      category: string;
      segment?: string;
      priority?: "p0" | "p1" | "p2";
    }
  >;
};

const evalMatrix = evalCases as EvalCaseLike[];
const productionDataset = productionEvalDataset as unknown as ProductionEvalDataset;

function assertEvalCase({
  narrative,
  expectedScenarioLabel,
  expectedRiskLevel,
  expectedCitationCount,
  expectedHeadlineIncludes,
  mustContain,
  mustAvoid,
  expectCompensationRange,
  expectedMinConfidence,
  expectedHandoffRequired,
  requireFollowUp
}: EvalCaseLike) {
  const internal = analyzeLaborCase({ narrative });
  const publicResult = toPublicAnalysisResponse(internal);
  const publicText = [
    publicResult.headline,
    publicResult.answer,
    publicResult.compensationRange,
    ...publicResult.nextSteps,
    ...publicResult.cautions,
    ...publicResult.citations.map((item) => `${item.kind} ${item.title} ${item.label}`)
  ]
    .filter(Boolean)
    .join("\n");

  expect(publicResult.scenarioLabel).toBe(expectedScenarioLabel);
  expect(publicResult.riskLevel).toBe(expectedRiskLevel);
  expect(internal.trace.agentCount).toBe(3);
  expect(internal.trace.agentLabels).toEqual(agentTranscriptLabels);
  expect(publicResult.citations).toHaveLength(expectedCitationCount);
  expect(publicResult.citations.every((item) => item.title && item.url && item.kind)).toBe(true);
  if (expectedHeadlineIncludes) {
    expect(publicResult.headline).toContain(expectedHeadlineIncludes);
  }
  if (expectedMinConfidence !== undefined) {
    expect(publicResult.confidence).toBeGreaterThanOrEqual(expectedMinConfidence);
  }
  if (expectedHandoffRequired !== undefined) {
    expect(publicResult.handoffRequired).toBe(expectedHandoffRequired);
  }
  if (requireFollowUp) {
    expect(publicResult.followUpQuestions.length).toBeGreaterThan(0);
  }

  if (expectedCitationCount > 0) {
    expect(publicText).toContain("重庆本地程序路径");
  }

  for (const phrase of mustContain) {
    expect(publicText).toContain(phrase);
  }

  for (const phrase of mustAvoid ?? []) {
    expect(publicText).not.toContain(phrase);
  }

  if (expectCompensationRange !== undefined) {
    if (expectCompensationRange) {
      expect(publicResult.compensationRange).toBeDefined();
    } else {
      expect(publicResult.compensationRange).toBeUndefined();
    }
  }
}

function assertProductionSafetyCase(item: ProductionEvalDataset["cases"][number]) {
  const internal = analyzeLaborCase({ narrative: item.narrative });
  const publicResult = toPublicAnalysisResponse(internal);
  const publicText = [
    publicResult.headline,
    publicResult.answer,
    publicResult.compensationRange,
    ...publicResult.followUpQuestions,
    ...publicResult.nextSteps,
    ...publicResult.cautions,
    ...publicResult.citations.map((citation) => `${citation.title} ${citation.label}`)
  ]
    .filter(Boolean)
    .join("\n");

  expect(publicResult.headline, item.id).toBeTruthy();
  expect(publicResult.answer, item.id).toBeTruthy();
  expect(publicResult.scenarioLabel, item.id).toBeTruthy();
  expect(internal.trace.agentCount, item.id).toBe(3);
  expect(internal.trace.agentLabels, item.id).toEqual(agentTranscriptLabels);
  expect(publicResult.citations.length, item.id).toBeLessThanOrEqual(3);
  expect(publicText, item.id).toContain("不构成法律意见");

  if (publicResult.citations.length > 0) {
    expect(publicText, item.id).toContain("重庆本地程序路径");
  }
  if (item.expectedMinConfidence !== undefined) {
    expect(publicResult.confidence, item.id).toBeGreaterThanOrEqual(item.expectedMinConfidence);
  }
  if (item.requireFollowUp) {
    expect(publicResult.followUpQuestions.length, item.id).toBeGreaterThan(0);
  }
  for (const phrase of item.mustAvoid ?? []) {
    expect(publicText, item.id).not.toContain(phrase);
  }
}

describe("three-agent labor eval baseline", () => {
  it("keeps the three-agent transcript contract stable", () => {
    const transcriptLabels = analyzeLaborCase({
      narrative: "我在重庆上班，公司拖欠工资两个月，还没签劳动合同。"
    }).transcript.map((item) => item.agent);

    expect(transcriptLabels).toEqual(agentTranscriptLabels);
  });

  it.each(evalMatrix)(
    "passes eval case $id",
    (item) => assertEvalCase(item)
  );
});

describe("production-style labor eval release gate", () => {
  it("keeps production dataset metadata release-gate ready", () => {
    expect(productionDataset.name).toContain("生产评测集");
    expect(productionDataset.datasetType).toBe("production_eval_v1");
    expect(productionDataset.releaseGate.requiredPassRate).toBe(1);
    expect(productionDataset.cases.length).toBeGreaterThanOrEqual(10);
    expect(new Set(productionDataset.cases.map((item) => item.id)).size).toBe(
      productionDataset.cases.length
    );
    expect(productionDataset.cases.some((item) => item.category === "mixed_claims")).toBe(true);
    expect(productionDataset.cases.some((item) => item.category === "low_confidence_handoff")).toBe(
      true
    );
    expect(productionDataset.cases.every((item) => item.narrative.length <= 350)).toBe(true);
  });

  it.each(productionDataset.cases)(
    "passes production eval case $id",
    (item) => assertProductionSafetyCase(item)
  );
});
