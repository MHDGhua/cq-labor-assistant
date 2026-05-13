import { describe, expect, it } from "vitest";
import { analyzeLaborCase, extractCase, toPublicAnalysisResponse } from "../lib/agents";
import { knowledgeDocs } from "../lib/data/knowledge_docs";

const fixedRagAnswerEvalSamples = [
  {
    name: "wage arrears",
    narrative: "我在重庆九龙坡上班，公司拖欠两个月工资，有工资条、银行转账和考勤记录。",
    expectedScenarioLabel: "拖欠工资",
    expectedRiskLevel: "low",
    expectedCitationCount: 3
  },
  {
    name: "unlawful termination",
    narrative: "我在重庆江北入职两年，公司口头辞退并说不要我来了，没有说明理由，也没有书面通知，想申请仲裁。",
    expectedScenarioLabel: "违法解除/辞退",
    expectedRiskLevel: "low",
    expectedCitationCount: 3
  },
  {
    name: "no written contract",
    narrative: "我在重庆渝北上班八个月，公司一直没有签书面劳动合同，有入职登记、社保和排班记录。",
    expectedScenarioLabel: "未签书面劳动合同",
    expectedRiskLevel: "low",
    expectedCitationCount: 3
  },
  {
    name: "mixed dispute",
    narrative: "我在重庆上班，公司拖欠三个月工资，还口头辞退我，也一直没签书面劳动合同，微信和考勤都还在。",
    expectedScenarioLabel: "混合争议",
    expectedRiskLevel: "low",
    expectedCitationCount: 3
  }
] as const;

const unsafeBiasJudgmentPattern =
  /胜诉|败诉|稳赢|必胜|包赢|包赔|必然支持|一定支持|法院会支持|仲裁委会支持|偏向劳动者|偏向公司|偏向用人单位/;

describe("labor analysis pipeline", () => {
  it("detects wage arrears scenarios", () => {
    const result = extractCase(
      "我在重庆上班，公司拖欠两个月工资，还没签劳动合同。"
    );

    expect(result.scenario).toBe("mixed");
    expect(result.keywords).toContain("拖欠工资");
  });

  it("returns a three-agent analysis result", () => {
    const result = analyzeLaborCase({
      narrative: "公司口头辞退我，还拖欠工资，没有签合同。"
    });

    expect(result.transcript).toHaveLength(3);
    expect(result.retrieval.cases.length).toBeGreaterThan(0);
    expect(result.retrieval.knowledgeDocs.length).toBeGreaterThan(0);
    expect(result.review.recommendation.length).toBeGreaterThan(0);
  });

  it("keeps pure termination disputes out of wage-arrears classification", () => {
    const result = extractCase("公司口头辞退我，但没有说明理由，我想申请仲裁。");

    expect(result.scenario).toBe("unlawful_termination");
  });

  it("returns a public response without internal agent traces", () => {
    const internal = analyzeLaborCase({
      narrative: "我在重庆上班，公司拖欠工资两个月，还没签劳动合同。"
    });
    const publicResult = toPublicAnalysisResponse(internal);

    expect(publicResult.headline.length).toBeGreaterThan(0);
    expect(publicResult.citations.length).toBeGreaterThan(0);
    expect(publicResult.followUpQuestions.length).toBeGreaterThan(0);
    expect(typeof publicResult.confidence).toBe("number");
    expect(publicResult.confidenceLabel).toMatch(/low|medium|high/);
    expect(typeof publicResult.handoffRequired).toBe("boolean");
    expect(Array.isArray(publicResult.handoffReasons)).toBe(true);
    expect("transcript" in publicResult).toBe(false);
    expect("retrieval" in publicResult).toBe(false);
  });

  it("keeps a non-empty knowledge seed corpus for fallback RAG", () => {
    expect(knowledgeDocs.length).toBeGreaterThan(0);
    expect(knowledgeDocs.some((item) => item.sourceUrl.includes("court") || item.sourceUrl.includes("cq.gov.cn"))).toBe(true);
  });

  it.each(fixedRagAnswerEvalSamples)(
    "locks answer quality assertions for fixed RAG sample: $name",
    ({ narrative, expectedScenarioLabel, expectedRiskLevel, expectedCitationCount }) => {
      const internal = analyzeLaborCase({ narrative });
      const publicResult = toPublicAnalysisResponse(internal);
      const publicAnswerText = [
        publicResult.headline,
        publicResult.answer,
        publicResult.compensationRange,
        ...publicResult.nextSteps,
        ...publicResult.cautions
      ].join("\n");

      expect(internal.transcript.map((item) => item.agent)).toEqual([
        "Agent 1 · 案情抽取",
        "Agent 2 · 重庆案例与法源检索",
        "Agent 3 · 结论审校"
      ]);
      expect(publicResult.scenarioLabel).toBe(expectedScenarioLabel);
      expect(publicResult.riskLevel).toBe(expectedRiskLevel);
      expect(typeof publicResult.confidence).toBe("number");
      expect(publicResult.confidenceLabel).toMatch(/low|medium|high/);
      expect(typeof publicResult.handoffRequired).toBe("boolean");
      expect(Array.isArray(publicResult.handoffReasons)).toBe(true);
      expect(publicResult.citations).toHaveLength(expectedCitationCount);
      expect(publicResult.citations.every((item) => item.title && item.url && item.kind)).toBe(true);
      if (internal.trace.missingInfoCount > 0) {
        expect(publicResult.followUpQuestions.length).toBeGreaterThan(0);
      }
      expect(publicResult.answer).toMatch(/重庆本地程序路径.*先调解后仲裁/);
      expect(publicAnswerText).not.toMatch(unsafeBiasJudgmentPattern);
    }
  );
});
