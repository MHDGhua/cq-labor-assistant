import { describe, expect, it } from "vitest";
import { parseCaseImportText, parseKnowledgeDocImportText } from "../lib/material-import";

describe("material import parsing", () => {
  it("parses case CSV rows with quoted cells and localized required-field aliases", () => {
    const csv = [
      "标题,scenario,地区,年份,摘要,结论,来源链接,来源名称,tags",
      '"拖欠工资争议","wage_arrears","渝中区","2024","员工主张工资欠付，且引用了""补发""承诺","仲裁支持补发工资","https://example.com/case-1","重庆案例网","拖欠工资|仲裁，证据"',
      '"未签合同争议","no_written_contract","江北区","2023","入职后超过一个月未签书面合同","支持二倍工资差额","https://example.com/case-2","重庆案例网","未签合同;二倍工资"',
    ].join("\r\n");

    const cases = parseCaseImportText(csv);

    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({
      title: "拖欠工资争议",
      scenario: "wage_arrears",
      scenarioLabel: "拖欠工资",
      district: "渝中区",
      year: 2024,
      summary: '员工主张工资欠付，且引用了"补发"承诺',
      holding: "仲裁支持补发工资",
      sourceUrl: "https://example.com/case-1",
      sourceLabel: "重庆案例网",
      tags: ["拖欠工资", "仲裁", "证据"],
      isCustom: true,
    });
    expect(cases[1]).toMatchObject({
      scenario: "no_written_contract",
      tags: ["未签合同", "二倍工资"],
      year: 2023,
    });
  });

  it("parses case JSON arrays with aliases and normalizes booleans, tags, and years", () => {
    const json = JSON.stringify([
      {
        id: "case-json-1",
        标题: "违法解除争议",
        场景: "unlawful_termination",
        场景标签: "解除争议",
        地区: "南岸区",
        年份: "2025年",
        摘要: "公司未说明理由解除劳动合同",
        结论: "解除行为违法",
        来源链接: "https://example.com/case-json-1",
        来源名称: "仲裁案例库",
        标签: ["违法解除", "赔偿金"],
        isCustom: "否",
      },
    ]);

    const cases = parseCaseImportText(json);

    expect(cases).toEqual([
      {
        id: "case-json-1",
        title: "违法解除争议",
        scenario: "unlawful_termination",
        scenarioLabel: "解除争议",
        district: "南岸区",
        year: 2025,
        summary: "公司未说明理由解除劳动合同",
        holding: "解除行为违法",
        sourceUrl: "https://example.com/case-json-1",
        sourceLabel: "仲裁案例库",
        tags: ["违法解除", "赔偿金"],
        isCustom: false,
      },
    ]);
  });

  it("parses wrapped knowledge JSON and applies localized aliases and active-state normalization", () => {
    const json = JSON.stringify({
      docs: [
        {
          id: "doc-json-1",
          标题: "劳动合同法节选",
          分类: "law",
          地区: "重庆",
          年份: "2024",
          摘要: "劳动合同订立规则",
          正文: "建立劳动关系，应当订立书面劳动合同。",
          来源链接: "https://example.com/law",
          来源名称: "法律法规库",
          标签: "劳动合同、书面合同;重庆",
          启用: "0",
        },
      ],
    });

    const docs = parseKnowledgeDocImportText(json);

    expect(docs).toEqual([
      {
        id: "doc-json-1",
        title: "劳动合同法节选",
        category: "law",
        categoryLabel: "法律规范",
        region: "重庆",
        year: 2024,
        summary: "劳动合同订立规则",
        content: "建立劳动关系，应当订立书面劳动合同。",
        sourceUrl: "https://example.com/law",
        sourceLabel: "法律法规库",
        tags: ["劳动合同", "书面合同", "重庆"],
        isActive: false,
      },
    ]);
  });

  it("generates stable ids when import rows omit explicit ids", () => {
    const caseCsv = [
      "title,scenario,district,year,summary,holding,sourceUrl,sourceLabel,tags",
      "稳定案例,wage_arrears,重庆市,2024,同一 CSV 重复导入,按同一条案例更新,https://example.com/stable-case,示例来源,欠薪|更新",
    ].join("\n");
    const docJson = JSON.stringify({
      docs: [
        {
          title: "稳定知识文档",
          category: "procedure",
          region: "重庆市",
          year: 2026,
          summary: "同一 JSON 重复导入",
          content: "应当按同一条知识文档更新。",
          sourceUrl: "https://example.com/stable-doc",
          sourceLabel: "示例来源",
          tags: "仲裁|流程",
        },
      ],
    });

    const caseIdFirst = parseCaseImportText(caseCsv)[0].id;
    const caseIdSecond = parseCaseImportText(caseCsv)[0].id;
    const docIdFirst = parseKnowledgeDocImportText(docJson)[0].id;
    const docIdSecond = parseKnowledgeDocImportText(docJson)[0].id;

    expect(caseIdFirst).toBe(caseIdSecond);
    expect(caseIdFirst).toMatch(/^case-/);
    expect(docIdFirst).toBe(docIdSecond);
    expect(docIdFirst).toMatch(/^doc-/);
  });

  it("rejects malformed CSV with unclosed quotes", () => {
    const csv = [
      "title,scenario,district,year,summary,holding,sourceUrl,sourceLabel,tags",
      '坏案例,wage_arrears,重庆市,2024,"摘要没有闭合,结论,https://example.com,bad,欠薪',
    ].join("\n");

    expect(() => parseCaseImportText(csv)).toThrow("CSV 引号未闭合。");
  });

  it("rejects imports that omit required fields", () => {
    expect(() =>
      parseCaseImportText(
        [
          "scenario,地区,年份,摘要,结论,来源链接,来源名称",
          "mixed,渝北区,2024,多个劳动争议事项,需要综合判断,https://example.com/case,来源",
        ].join("\n"),
      ),
    ).toThrow("缺少必填字段：title");

    expect(() =>
      parseKnowledgeDocImportText(
        JSON.stringify({
          docs: [
            {
              title: "缺少正文的规范",
              category: "law",
              region: "重庆",
              year: "2024",
              summary: "缺少正文",
              sourceUrl: "https://example.com/doc",
              sourceLabel: "来源",
            },
          ],
        }),
      ),
    ).toThrow("缺少必填字段：content");
  });
});
