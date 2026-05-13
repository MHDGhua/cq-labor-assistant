import type { CaseImportDraft, KnowledgeDocDraft, Scenario } from "@/lib/agents/types";

const caseScenarioLabels: Record<Exclude<Scenario, "unknown">, string> = {
  wage_arrears: "拖欠工资",
  unlawful_termination: "违法解除/辞退",
  no_written_contract: "未签书面劳动合同",
  overtime: "加班费/工时争议",
  labor_relation: "劳动关系认定",
  social_insurance: "社会保险争议",
  work_injury: "工伤待遇争议",
  female_protection: "女职工特殊保护",
  non_compete: "竞业限制争议",
  pay_benefits: "工资福利/休假争议",
  mixed: "混合争议",
};

const caseFieldAliases: Record<string, string> = {
  id: "id",
  title: "title",
  标题: "title",
  scenario: "scenario",
  场景: "scenario",
  scenariolabel: "scenarioLabel",
  场景标签: "scenarioLabel",
  district: "district",
  地区: "district",
  year: "year",
  年份: "year",
  summary: "summary",
  摘要: "summary",
  holding: "holding",
  结论: "holding",
  sourceurl: "sourceUrl",
  来源链接: "sourceUrl",
  sourcelabel: "sourceLabel",
  来源名称: "sourceLabel",
  tags: "tags",
  标签: "tags",
  iscustom: "isCustom",
};

const knowledgeFieldAliases: Record<string, string> = {
  id: "id",
  title: "title",
  标题: "title",
  category: "category",
  分类: "category",
  categorylabel: "categoryLabel",
  分类标签: "categoryLabel",
  region: "region",
  地区: "region",
  year: "year",
  年份: "year",
  summary: "summary",
  摘要: "summary",
  content: "content",
  正文: "content",
  sourceurl: "sourceUrl",
  来源链接: "sourceUrl",
  sourcelabel: "sourceLabel",
  来源名称: "sourceLabel",
  tags: "tags",
  标签: "tags",
  isactive: "isActive",
  启用: "isActive",
};

export function parseCaseImportText(content: string): CaseImportDraft[] {
  const rows = parseImportRows(content, "cases");
  return rows.map(normalizeCaseRow);
}

export function parseKnowledgeDocImportText(content: string): KnowledgeDocDraft[] {
  const rows = parseImportRows(content, "knowledge");
  return rows.map(normalizeKnowledgeRow);
}

function parseImportRows(content: string, kind: "cases" | "knowledge"): Record<string, string>[] {
  const text = stripBom(content);
  if (!text) {
    throw new Error("导入内容不能为空。");
  }

  if (text.startsWith("[") || text.startsWith("{")) {
    return parseJsonRows(text, kind);
  }

  return parseCsvRows(text, kind);
}

function parseJsonRows(text: string, kind: "cases" | "knowledge"): Record<string, string>[] {
  const parsed = JSON.parse(text) as unknown;
  const rows = extractRows(parsed, kind);
  if (!rows.length) {
    throw new Error("JSON 导入未包含任何记录。");
  }

  return rows.map((row) => normalizeObject(row));
}

function extractRows(parsed: unknown, kind: "cases" | "knowledge"): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const keys = kind === "cases" ? ["cases", "items", "rows"] : ["docs", "items", "rows"];
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  throw new Error(kind === "cases" ? "JSON 必须是案例数组或包含 cases 字段。" : "JSON 必须是知识文档数组或包含 docs 字段。");
}

function parseCsvRows(text: string, kind: "cases" | "knowledge"): Record<string, string>[] {
  const table = parseCsvTable(text);
  if (table.length < 2) {
    throw new Error(kind === "cases" ? "CSV 至少需要表头和一行案例。" : "CSV 至少需要表头和一行知识文档。");
  }

  const [headerRow, ...dataRows] = table;
  const headers = headerRow.map((header) => mapField(header));
  const records = dataRows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index]?.trim() ?? "";
      });
      return record;
    });

  if (!records.length) {
    throw new Error("CSV 未包含有效数据行。");
  }

  return records;
}

function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentCell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentCell += char;
  }

  if (inQuotes) {
    throw new Error("CSV 引号未闭合。");
  }

  currentRow.push(currentCell);
  if (currentRow.length > 1 || currentRow[0].trim() !== "") {
    rows.push(currentRow);
  }

  return rows;
}

function normalizeObject(row: unknown): Record<string, string> {
  if (!row || typeof row !== "object") {
    throw new Error("导入记录必须是对象。");
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    const mappedKey = mapField(key);
    normalized[mappedKey] = toCellValue(value);
  }
  return normalized;
}

function normalizeCaseRow(row: Record<string, string>): CaseImportDraft {
  const scenario = requireScenario(row);
  const title = requireText(row, "title", ["title", "标题"]);
  const district = requireText(row, "district", ["district", "地区"]);
  const summary = requireText(row, "summary", ["summary", "摘要"]);
  const holding = requireText(row, "holding", ["holding", "结论"]);
  const sourceUrl = requireText(row, "sourceUrl", ["sourceUrl", "来源链接"]);
  const sourceLabel = requireText(row, "sourceLabel", ["sourceLabel", "来源名称"]);
  const year = parseYear(requireText(row, "year", ["year", "年份"]));
  const tags = parseTags(row.tags ?? "");
  const id = row.id || createId("case", [title, scenario, district, String(year), sourceUrl]);

  return {
    id,
    title,
    scenario,
    scenarioLabel: row.scenarioLabel || caseScenarioLabels[scenario],
    district,
    year,
    summary,
    holding,
    sourceUrl,
    sourceLabel,
    tags,
    isCustom: parseBoolean(row.isCustom, true),
  };
}

function normalizeKnowledgeRow(row: Record<string, string>): KnowledgeDocDraft {
  const category = requireText(row, "category", ["category", "分类"]);
  const title = requireText(row, "title", ["title", "标题"]);
  const region = requireText(row, "region", ["region", "地区"]);
  const summary = requireText(row, "summary", ["summary", "摘要"]);
  const content = requireText(row, "content", ["content", "正文"]);
  const sourceUrl = requireText(row, "sourceUrl", ["sourceUrl", "来源链接"]);
  const sourceLabel = requireText(row, "sourceLabel", ["sourceLabel", "来源名称"]);
  const year = parseYear(requireText(row, "year", ["year", "年份"]));
  const tags = parseTags(row.tags ?? "");
  const id = row.id || createId("doc", [title, category, region, String(year), sourceUrl]);

  return {
    id,
    title,
    category,
    categoryLabel: row.categoryLabel || categoryLabelFor(category),
    region,
    year,
    summary,
    content,
    sourceUrl,
    sourceLabel,
    tags,
    isActive: parseBoolean(row.isActive, true),
  };
}

function requireScenario(row: Record<string, string>): Exclude<Scenario, "unknown"> {
  const scenario = row.scenario;
  const allowed = new Set<Exclude<Scenario, "unknown">>([
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
  ]);
  if (!scenario || !allowed.has(scenario as Exclude<Scenario, "unknown">)) {
    throw new Error("案例场景必须是 wage_arrears、unlawful_termination、no_written_contract、overtime、labor_relation、social_insurance、work_injury、female_protection、non_compete、pay_benefits 或 mixed。");
  }
  return scenario as Exclude<Scenario, "unknown">;
}

function requireText(row: Record<string, string>, canonicalKey: string, aliases: string[]): string {
  for (const alias of [canonicalKey, ...aliases]) {
    const value = row[normalizeHeader(alias)] ?? row[alias] ?? row[mapField(alias)];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`缺少必填字段：${canonicalKey}`);
}

function parseYear(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`年份无效：${value}`);
  }
  return parsed;
}

function parseTags(value: string): string[] {
  return value
    .split(/[|;；、，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "是", "启用"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "否", "停用"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function toCellValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join("|");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function mapField(key: string): string {
  const normalized = normalizeHeader(key);
  return caseFieldAliases[normalized] ?? knowledgeFieldAliases[normalized] ?? normalized;
}

function categoryLabelFor(category: string): string {
  if (category === "law") return "法律规范";
  if (category === "judicial_interpretation") return "司法解释";
  if (category === "local_case") return "重庆典型案例";
  if (category === "procedure") return "重庆程序";
  if (category === "policy") return "重庆政策";
  return category;
}

function createId(prefix: string, parts: string[]): string {
  return `${prefix}-${hashString(parts.map((part) => normalizeIdPart(part)).join("|"))}`;
}

function normalizeIdPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}
