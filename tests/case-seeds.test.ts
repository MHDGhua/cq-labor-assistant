import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localCases } from "../lib/data/cases";

interface BackendSeedCase {
  id: string;
  scenario: string;
  source_url: string;
  tags: string[];
}

const backendSeedCases = JSON.parse(
  readFileSync(new URL("../backend/seed_cases.json", import.meta.url), "utf-8"),
) as BackendSeedCase[];

describe("case seed corpus", () => {
  it("keeps frontend fallback cases synchronized with backend seed cases", () => {
    const frontendIds = localCases.map((item) => item.id).sort();
    const backendIds = backendSeedCases.map((item) => item.id).sort();

    expect(frontendIds).toEqual(backendIds);
    expect(localCases.length).toBeGreaterThanOrEqual(17);
  });

  it("covers expanded labor dispute scenarios with local or public reference material", () => {
    const scenarios = new Set(localCases.map((item) => item.scenario));
    const chongqingCaseCount = localCases.filter((item) => item.district.includes("重庆")).length;
    const sourceCount = new Set(localCases.map((item) => item.sourceUrl)).size;

    expect(scenarios).toEqual(
      new Set([
        "wage_arrears",
        "unlawful_termination",
        "no_written_contract",
        "overtime",
        "labor_relation",
        "social_insurance",
        "work_injury",
        "female_protection",
        "non_compete",
        "pay_benefits",
        "mixed",
      ]),
    );
    expect(chongqingCaseCount).toBeGreaterThanOrEqual(17);
    expect(localCases.every((item) => item.district.includes("重庆") || item.district.includes("全国"))).toBe(true);
    expect(sourceCount).toBeGreaterThanOrEqual(6);
    expect(localCases.every((item) => item.tags.length > 0 && item.sourceUrl.startsWith("https://"))).toBe(true);
  });
});
