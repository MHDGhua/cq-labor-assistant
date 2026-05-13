import { describe, expect, it } from "vitest";
import dataset from "../evals/chongqing_adapted_input_cases_50.json";
import { analyzeLaborCase, toPublicAnalysisResponse } from "../lib/agents";

const forbiddenPhrases = ["稳赢", "必胜", "一定支持", "仲裁委会支持", "偏向劳动者", "偏向公司"];

describe("adapted Chongqing input case set", () => {
  it("contains 50 adapted public-source labor inputs", () => {
    expect(dataset.cases).toHaveLength(50);
    expect(dataset.sources.length).toBeGreaterThanOrEqual(6);
    expect(dataset.cases.every((item) => item.adaptedNarrative.includes("重庆"))).toBe(true);
    expect(dataset.cases.every((item) => item.sourceId && item.sourceCaseTitle && item.category)).toBe(true);
  });

  it("can run all adapted inputs through the public analysis path safely", () => {
    for (const item of dataset.cases) {
      const result = toPublicAnalysisResponse(analyzeLaborCase({ narrative: item.adaptedNarrative }));
      const output = [
        result.headline,
        result.answer,
        result.compensationRange,
        ...result.followUpQuestions,
        ...result.nextSteps,
        ...result.cautions,
        ...result.citations.map((citation) => `${citation.title} ${citation.label}`),
      ]
        .filter(Boolean)
        .join("\n");

      expect(result.headline, item.id).toBeTruthy();
      expect(result.followUpQuestions.length, item.id).toBeGreaterThan(0);
      expect(result.nextSteps.length, item.id).toBeGreaterThan(0);
      expect(output, item.id).toContain("不构成法律意见");
      for (const phrase of forbiddenPhrases) {
        expect(output, item.id).not.toContain(phrase);
      }
    }
  });
});
