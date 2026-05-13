import { describe, expect, it } from "vitest";
import dataset from "../evals/chongqing_production_eval_cases.json";
import { analyzeLaborCase, toPublicAnalysisResponse } from "../lib/agents";

type ProductionEvalCase = {
  id: string;
  narrative: string;
  expectedScenarioLabel: string;
  expectedRiskLevel: "low" | "medium" | "high";
  expectedCitationCount: number;
  expectedMinConfidence: number;
  expectedHandoffRequired: boolean;
  mustContain: string[];
  mustAvoid?: string[];
  requireFollowUp: boolean;
};

const evalCases = (dataset as { cases: ProductionEvalCase[] }).cases;

describe("production-style eval gate", () => {
  it.each(evalCases)(
    "passes production eval case $id",
    ({
      narrative,
      expectedScenarioLabel,
      expectedRiskLevel,
      expectedCitationCount,
      expectedMinConfidence,
      expectedHandoffRequired,
      mustContain,
      mustAvoid,
      requireFollowUp
    }) => {
      const internal = analyzeLaborCase({ narrative });
      const publicResult = toPublicAnalysisResponse(internal);
      const text = [
        publicResult.headline,
        publicResult.answer,
        publicResult.compensationRange,
        ...publicResult.followUpQuestions,
        ...publicResult.nextSteps,
        ...publicResult.cautions,
        ...publicResult.handoffReasons
      ]
        .filter(Boolean)
        .join("\n");

      expect(publicResult.scenarioLabel).toBe(expectedScenarioLabel);
      expect(publicResult.riskLevel).toBe(expectedRiskLevel);
      expect(publicResult.citations).toHaveLength(expectedCitationCount);
      expect(publicResult.confidence).toBeGreaterThanOrEqual(expectedMinConfidence);
      expect(publicResult.handoffRequired).toBe(expectedHandoffRequired);
      expect(publicResult.confidenceLabel).toMatch(/low|medium|high/);

      if (expectedHandoffRequired) {
        expect(publicResult.handoffReasons.length).toBeGreaterThan(0);
      }

      if (requireFollowUp) {
        expect(publicResult.followUpQuestions.length).toBeGreaterThan(0);
      }

      for (const phrase of mustContain) {
        expect(text).toContain(phrase);
      }

      for (const phrase of mustAvoid ?? []) {
        expect(text).not.toContain(phrase);
      }
    }
  );
});
