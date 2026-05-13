import { localCases } from "../data/cases";
import { knowledgeDocs } from "../data/knowledge_docs";
import { agentTranscriptLabels } from "./workflow";
import type {
  AnalysisResult,
  CaseInput,
  ExtractionResult,
  LocalCase,
  KnowledgeDoc,
  PublicAnalysisResponse,
  PublicCitation,
  RetrievalResult,
  ReviewResult,
  Scenario,
  TraceSummary
} from "./types";

const defaultDeepSeekModel = "deepseek-v4-pro";
const defaultReasoningEffort = "medium";

const scenarioLabels: Record<Exclude<Scenario, "unknown">, string> = {
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
  mixed: "混合争议"
};

export function analyzeLaborCase(input: CaseInput): AnalysisResult {
  const extraction = extractCase(input.narrative);
  const retrieval = retrieveCases(extraction);
  const review = reviewCase(extraction, retrieval);
  const transcript = [
    {
      agent: agentTranscriptLabels[0],
      output: renderExtraction(extraction)
    },
    {
      agent: agentTranscriptLabels[1],
      output: renderRetrieval(retrieval)
    },
    {
      agent: agentTranscriptLabels[2],
      output: renderReview(review)
    }
  ];

  return {
    extraction,
    retrieval,
    review,
    transcript,
    trace: buildTraceSummary(extraction, retrieval, review, transcript)
  };
}

export function extractCase(narrative: string): ExtractionResult {
  const expanded = expandColloquial(narrative);
  const text = normalizeText(expanded);
  const keywords = dedupe([
    matchKeyword(text, ["拖欠", "欠薪", "工资"], "拖欠工资"),
    matchKeyword(text, ["辞退", "解除", "开除", "裁员"], "解除争议"),
    matchKeyword(text, ["合同", "劳动合同"], "劳动合同"),
    matchKeyword(text, ["绩效", "津贴", "工资差额", "足额支付"], "工资争议"),
    matchKeyword(text, ["加班", "工时", "值班"], "加班工时"),
    matchKeyword(text, ["劳动关系", "平台", "骑手", "主播", "家政", "劳务", "承揽"], "劳动关系认定"),
    matchKeyword(text, ["社保", "社会保险", "养老保险", "停保"], "社会保险"),
    matchKeyword(text, ["工伤", "受伤", "停工留薪"], "工伤待遇"),
    matchKeyword(text, ["怀孕", "孕期", "女职工", "产假"], "女职工保护"),
    matchKeyword(text, ["竞业", "商业秘密"], "竞业限制"),
    matchKeyword(text, ["仲裁"], "仲裁"),
    matchKeyword(text, ["证据", "聊天记录", "工资条"], "证据")
  ]);

  const scenario = detectScenario(text);
  const facts = buildFacts(text, scenario);
  const evidence = buildEvidence(text);
  const missingInfo = buildMissingInfo(text, scenario);
  const timeline = buildTimeline(text);

  return {
    scenario,
    scenarioLabel: scenario === "unknown" ? "未识别场景" : scenarioLabels[scenario],
    confidence: scenario === "unknown" ? 0.38 : 0.78,
    facts,
    timeline,
    evidence,
    missingInfo,
    keywords
  };
}

export function retrieveCases(extraction: ExtractionResult): RetrievalResult {
  const ranked = localCases
    .map((item) => ({
      item,
      score: scoreCase(item, extraction)
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ item }) => item);

  const knowledgeRanked = knowledgeDocs
    .map((item) => ({
      item,
      score: scoreKnowledgeDoc(item, extraction)
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ item }) => item);

  return {
    cases: ranked,
    knowledgeDocs: knowledgeRanked,
    rationale: ranked.map((item) => `${item.scenarioLabel} · ${item.holding}`),
    knowledgeRationale: knowledgeRanked.map((item) => `${item.title} · ${item.summary}`)
  };
}

export function reviewCase(
  extraction: ExtractionResult,
  retrieval: RetrievalResult
): ReviewResult {
  const caseCount = retrieval.cases.length;
  const knowledgeDocCount = retrieval.knowledgeDocs.length;
  const missingCount = extraction.missingInfo.length;
  const riskLevel: ReviewResult["riskLevel"] =
    extraction.scenario === "unknown" || missingCount >= 3
      ? "high"
      : caseCount === 0
        ? "medium"
        : "low";

  const compensationRange = buildCompensationRange(extraction.scenario);
  const caseNames = retrieval.cases.map((item) => item.title).join("、");
  const docNames = retrieval.knowledgeDocs.map((item) => item.title).join("、");
  const decisionSignals = buildDecisionSignals(extraction, {
    riskLevel,
    caseCount,
    knowledgeDocCount
  });

  return {
    riskLevel,
    ...decisionSignals,
    recommendation: buildRecommendation(extraction.scenario),
    analysis: buildAnalysis(extraction, caseNames, docNames),
    compensationRange,
    followUpQuestions: buildFollowUpQuestions(extraction),
    cautions: [
      "本结果仅用于信息参考，不构成法律意见。",
      "重庆本地化展示应聚焦流程、公开案例和材料要求，不输出“偏向判断”。",
      "如果存在时效、管辖或证据不足问题，应尽快补充材料。"
    ],
    nextSteps: buildNextSteps(extraction.scenario),
    sourceSummary: {
      cases: caseNames || "暂无",
      knowledgeDocs: docNames || "暂无"
    }
  };
}

export function buildTraceSummary(
  extraction: ExtractionResult,
  retrieval: RetrievalResult,
  review: ReviewResult,
  transcript: Array<{ agent: string; output: string }>
): TraceSummary {
  const agentLabels = transcript.map((item) => item.agent);
  const caseCount = retrieval.cases.length;
  const knowledgeDocCount = retrieval.knowledgeDocs.length;
  const missingInfoCount = extraction.missingInfo.length;
  const qualityFlags = [];

  if (
    agentLabels.length !== agentTranscriptLabels.length ||
    agentLabels.some((label, index) => label !== agentTranscriptLabels[index])
  ) {
    qualityFlags.push("agent链路异常");
  }
  if (extraction.scenario === "unknown") {
    qualityFlags.push("争议类型未识别");
  }
  if (missingInfoCount) {
    qualityFlags.push(`缺少${missingInfoCount}项关键信息`);
  }
  if (caseCount === 0) {
    qualityFlags.push("未命中重庆案例");
  }
  if (knowledgeDocCount === 0) {
    qualityFlags.push("未命中法源材料");
  }
  qualityFlags.push("本地规则引擎回退");

  return {
    providerMode: "local",
    model: defaultDeepSeekModel,
    reasoningEffort: defaultReasoningEffort,
    tracingEnabled: false,
    agentCount: agentLabels.length,
    agentLabels,
    scenario: extraction.scenario,
    scenarioLabel: extraction.scenarioLabel,
    riskLevel: review.riskLevel,
    confidence: review.confidence,
    confidenceLabel: review.confidenceLabel,
    handoffRequired: review.handoffRequired,
    handoffReasons: review.handoffReasons,
    caseCount,
    knowledgeDocCount,
    citationCount: Math.min(2, knowledgeDocCount) + Math.min(1, caseCount),
    missingInfoCount,
    qualityFlags: dedupe(qualityFlags)
  };
}

function detectScenario(text: string): Scenario {
  const wage = containsAny(text, [
    "拖欠",
    "欠薪",
    "工资没发",
    "未发工资",
    "没发工资",
    "克扣工资",
    "未足额支付",
    "足额支付工资",
    "工资差额",
    "扣绩效",
    "绩效",
    "津贴"
  ]);
  const termination = containsAny(text, ["辞退", "解除", "开除", "裁员", "被赶走", "不要我来了", "不用来了", "移出工作群"]);
  const contract = containsAny(text, [
    "未签",
    "没签",
    "没有签",
    "未签合同",
    "未订立书面劳动合同",
    "劳动合同"
  ]);

  const matches = [wage, termination, contract].filter(Boolean).length;
  const laborRelation = containsAny(text, ["劳动关系", "合作协议", "个体工商户", "平台", "骑手", "主播", "家政", "劳务协议", "承揽", "外包", "派遣"]);
  const payBenefits = containsAny(text, ["年休假", "最低工资", "停工停产", "生活费", "培训", "服务期", "违约金"]);
  const overtime = containsAny(text, ["加班", "加班费", "工时", "值班", "包薪", "排班", "综合工时"]);
  if (matches > 1) return "mixed";
  if (containsAny(text, ["怀孕", "孕期", "产假", "女职工", "三期", "孕检"])) return "female_protection";
  if (containsAny(text, ["工伤", "受伤", "停工留薪", "劳动能力鉴定", "诊断证明"])) return "work_injury";
  if (containsAny(text, ["竞业", "竞业限制", "商业秘密", "同行"])) return "non_compete";
  if (payBenefits) return "pay_benefits";
  if (termination) return "unlawful_termination";
  if (laborRelation) return "labor_relation";
  if (contract) return "no_written_contract";
  if (containsAny(text, ["社保", "社会保险", "养老保险", "生育保险", "停保", "缴纳", "抚恤金"])) return "social_insurance";
  if (overtime && !contract) return "overtime";
  if (wage) return "wage_arrears";
  if (overtime) return "overtime";
  return "unknown";
}

function buildFacts(text: string, scenario: Scenario): string[] {
  const facts = [];

  if (containsAny(text, ["重庆"])) {
    facts.push("案情涉及重庆地区，可直接匹配重庆本地公开程序和案例。");
  }
  if (containsAny(text, ["公司", "单位", "老板"])) {
    facts.push("存在典型用人单位与劳动者争议关系。");
  }
  if (scenario === "mixed") {
    facts.push("案情同时出现多项争议，适合先拆分为工资、解除和合同三个子问题。");
  } else if (scenario !== "unknown") {
    facts.push(`当前核心争议更偏向于“${scenarioLabels[scenario]}”。`);
  } else {
    facts.push("当前描述不足以稳定识别争议类型。");
  }

  return dedupe(facts);
}

function buildEvidence(text: string): string[] {
  const evidence = [];
  if (containsAny(text, ["聊天", "微信", "短信"])) evidence.push("聊天记录");
  if (containsAny(text, ["工资条", "转账", "银行"])) evidence.push("工资发放记录");
  if (containsAny(text, ["考勤", "打卡"])) evidence.push("考勤或打卡记录");
  if (containsAny(text, ["离职", "通知", "解除"])) evidence.push("解除通知或离职说明");
  if (containsAny(text, ["工牌", "工服", "入职", "社保"])) evidence.push("劳动关系辅助证据");
  return evidence.length ? evidence : ["待补充证据：聊天记录、工资记录、考勤记录、劳动关系证明"];
}

function buildMissingInfo(text: string, scenario: Scenario): string[] {
  const missing = [];
  if (!containsAny(text, ["入职", "开始工作", "上班"]) ) missing.push("入职时间");
  if (!containsAny(text, ["金额", "工资", "补偿", "赔偿"])) missing.push("涉及金额");
  if (scenario === "unlawful_termination" && !containsAny(text, ["原因", "理由", "通知"])) {
    missing.push("公司解除理由和书面通知");
  }
  if (scenario === "no_written_contract" && !containsAny(text, ["合同", "签订"])) {
    missing.push("书面劳动合同签订情况");
  }
  return missing;
}

function buildTimeline(text: string): string[] {
  const timeline = [];
  if (containsAny(text, ["入职"])) timeline.push("入职时间已出现");
  if (containsAny(text, ["拖欠", "欠薪"])) timeline.push("存在工资未发或拖欠描述");
  if (containsAny(text, ["辞退", "解除", "开除"])) timeline.push("存在解除或辞退描述");
  if (containsAny(text, ["仲裁"])) timeline.push("用户已开始考虑仲裁");
  return timeline.length ? timeline : ["待补充时间线：入职、争议发生、沟通、解除、申请仲裁节点"];
}

function scoreCase(item: LocalCase, extraction: ExtractionResult): number {
  if (extraction.scenario === "unknown") {
    return 0;
  }

  let score = 0;
  if (item.scenario === extraction.scenario) score += 4;
  if (extraction.scenario === "mixed") score += 1;
  for (const keyword of extraction.keywords) {
    if (item.tags.some((tag) => tag.includes(keyword) || keyword.includes(tag))) {
      score += 1;
    }
  }
  return score;
}

function buildCompensationRange(scenario: Scenario): string | undefined {
  if (scenario === "wage_arrears") return "通常优先核对欠薪金额与是否存在加付赔偿金或拖欠利息类主张。";
  if (scenario === "unlawful_termination") return "通常需要按解除合法性和工龄测算赔偿金或补偿金区间。";
  if (scenario === "no_written_contract") return "通常重点核算未签合同期间的双倍工资差额。";
  if (scenario === "overtime") return "通常需要按工时制度、加班证据和休息日/法定节假日类别分别核算。";
  if (scenario === "social_insurance") return "通常要区分补缴路径、待遇损失和单位过错造成的赔偿责任。";
  if (scenario === "work_injury") return "通常围绕工伤认定、停工留薪期、劳动能力鉴定和待遇差额核算。";
  if (scenario === "female_protection") return "通常重点核对孕期/产期/哺乳期保护、调岗降薪依据和工资差额。";
  if (scenario === "pay_benefits") return "通常需要按最低工资、年休假、停工停产工资或服务期违约金分别核算。";
  if (scenario === "mixed") return "需要拆分不同争议项分别测算。";
  return undefined;
}

function buildRecommendation(scenario: Scenario): string {
  switch (scenario) {
    case "wage_arrears":
      return "先核对工资流水和考勤，再看是否需要直接申请仲裁。";
    case "unlawful_termination":
      return "重点检查解除通知、规章制度和证据链是否完整。";
    case "no_written_contract":
      return "优先确认入职与书面合同签订时间差。";
    case "overtime":
      return "先确认工时制度和加班证据，再分类核算加班费。";
    case "labor_relation":
      return "先判断管理从属性和用工控制，再决定是否主张劳动关系。";
    case "social_insurance":
      return "先区分补缴、待遇损失和赔偿责任，再选择社保投诉或仲裁路径。";
    case "work_injury":
      return "先确认工伤认定和停工留薪期材料，再核算待遇差额。";
    case "female_protection":
      return "重点核对三期保护、调岗降薪依据和工资差额。";
    case "non_compete":
      return "先核对岗位是否适格、补偿是否支付和限制范围是否过宽。";
    case "pay_benefits":
      return "先拆分最低工资、年休假、停工工资或服务期违约金项目。";
    case "mixed":
      return "先拆分争议点，再分别提交证据和诉求。";
    default:
      return "当前信息不足，先补齐关键事实再判断。";
  }
}

function buildDecisionSignals(
  extraction: ExtractionResult,
  context: {
    riskLevel: ReviewResult["riskLevel"];
    caseCount: number;
    knowledgeDocCount: number;
  }
): Pick<ReviewResult, "confidence" | "confidenceLabel" | "handoffRequired" | "handoffReasons"> {
  const missingCount = extraction.missingInfo.length;
  const citationCount = Math.min(2, context.knowledgeDocCount) + Math.min(1, context.caseCount);
  let confidence = extraction.confidence;

  if (context.riskLevel === "high") confidence -= 0.12;
  if (context.riskLevel === "medium") confidence -= 0.06;
  if (missingCount >= 3) confidence -= 0.12;
  else confidence -= missingCount * 0.03;
  if (citationCount === 0) confidence -= 0.16;
  if (context.caseCount === 0 && extraction.scenario !== "unknown") confidence -= 0.05;

  const normalizedConfidence = clampConfidence(confidence);
  const handoffReasons = dedupe([
    extraction.scenario === "unknown" ? "争议类型未识别，需要人工确认劳动法适用范围。" : null,
    context.riskLevel === "high" ? "风险等级为 high，当前信息不足以直接给出稳定路径。" : null,
    missingCount >= 3 ? `缺少${missingCount}项关键信息，需补齐后再评估。` : null,
    citationCount === 0 ? "未命中可引用的重庆案例或法源材料。" : null,
    normalizedConfidence < 0.55 ? "系统置信度低于 0.55，建议人工复核。" : null
  ]);

  return {
    confidence: normalizedConfidence,
    confidenceLabel:
      normalizedConfidence >= 0.72 ? "high" : normalizedConfidence >= 0.55 ? "medium" : "low",
    handoffRequired: handoffReasons.length > 0,
    handoffReasons
  };
}

function clampConfidence(value: number): number {
  return Math.max(0.2, Math.min(0.92, Number(value.toFixed(2))));
}

function buildAnalysis(extraction: ExtractionResult, caseNames: string, docNames: string): string {
  return `系统将争议识别为“${extraction.scenarioLabel}”。检索命中的重庆本地/公开参考案例包括${caseNames || "暂无"}；法源与程序参考包括${docNames || "暂无"}。结论审校的重点是：事实是否闭环、证据是否能支撑诉求、以及重庆本地程序路径是否适合先调解后仲裁。`;
}

function buildNextSteps(scenario: Scenario): string[] {
  const common = ["整理时间线", "保存聊天、工资和考勤记录", "核对仲裁时效"];
  if (scenario === "wage_arrears") return [...common, "先申请工资支付相关救济"];
  if (scenario === "unlawful_termination") return [...common, "保留解除通知与规章制度"];
  if (scenario === "no_written_contract") return [...common, "确认书面劳动合同签订时间"];
  if (scenario === "overtime") return [...common, "补齐排班、打卡、审批或主管安排记录"];
  if (scenario === "labor_relation") return [...common, "补齐平台规则、考勤排班、奖惩和收入结算记录"];
  if (scenario === "social_insurance") return [...common, "调取社保缴费记录并区分补缴与损失赔偿"];
  if (scenario === "work_injury") return [...common, "确认工伤认定、诊断证明和停工留薪期材料"];
  if (scenario === "female_protection") return [...common, "保存孕检材料、调岗通知和工资变化记录"];
  if (scenario === "non_compete") return [...common, "核对岗位涉密性、补偿支付和限制范围"];
  if (scenario === "pay_benefits") return [...common, "按最低工资、年休假或停工停产规则拆分金额"];
  if (scenario === "mixed") return [...common, "把工资、解除和合同拆成三个独立主张"];
  return [...common, "补充入职时间、争议发生时间和诉求金额"];
}

function buildFollowUpQuestions(extraction: ExtractionResult): string[] {
  const questions: string[] = [];

  for (const item of extraction.missingInfo) {
    if (item === "入职时间") {
      questions.push("你是什么时间入职，是否有入职登记、工牌、社保、排班或工作群记录？");
    } else if (item === "涉及金额") {
      questions.push("争议金额大概是多少，工资标准、欠付月份或差额是如何计算的？");
    } else if (item === "公司解除理由和书面通知") {
      questions.push("公司是否给过书面解除通知，通知里写明了什么解除理由？");
    } else if (item === "书面劳动合同签订情况") {
      questions.push("是否签过书面劳动合同，签订日期和合同起止时间分别是什么？");
    } else {
      questions.push(`请补充：${item}。`);
    }
  }

  if (extraction.scenario === "unlawful_termination") {
    questions.push("公司是否有规章制度、考核记录或违纪处理流程作为解除依据？");
  } else if (extraction.scenario === "overtime") {
    questions.push("是否有打卡、排班、加班审批、微信群安排或工作成果提交记录？");
  } else if (extraction.scenario === "social_insurance") {
    questions.push("是否能下载社保缴费明细，争议是补缴问题还是待遇损失差额？");
  } else if (extraction.scenario === "labor_relation") {
    questions.push("平台或站点是否规定排班、奖惩、接单率、价格或请假规则？");
  } else if (extraction.scenario === "work_injury") {
    questions.push("是否已申请工伤认定，手里是否有诊断证明、事故经过和停工留薪期材料？");
  } else if (extraction.scenario === "female_protection") {
    questions.push("调岗、降薪或解除发生在孕期、产期还是哺乳期，是否有书面通知？");
  } else if (extraction.scenario === "non_compete") {
    questions.push("竞业限制协议约定的范围、期限、补偿标准和实际补偿支付情况是什么？");
  } else if (extraction.scenario === "pay_benefits") {
    questions.push("争议具体是最低工资、年休假、停工停产工资、服务期还是其他福利项目？");
  } else if (extraction.scenario === "mixed") {
    questions.push("你希望优先主张工资、违法解除、未签合同双倍工资中的哪一项？");
  } else if (extraction.scenario === "unknown") {
    questions.push("这件事是否发生在用人单位管理下的工作过程中，核心诉求是工资、解除、合同、社保还是工伤？");
  }

  return dedupe(questions).slice(0, 4);
}

function renderExtraction(result: ExtractionResult): string {
  return [
    `场景：${result.scenarioLabel}`,
    `事实：${result.facts.join("；")}`,
    `证据：${result.evidence.join("、")}`,
    `缺口：${result.missingInfo.join("、") || "无"}`
  ].join("\n");
}

function renderRetrieval(result: RetrievalResult): string {
  const cases = result.cases.length
    ? result.cases.map((item) => `${item.title}｜${item.summary}`).join("\n")
    : "未命中本地案例。";
  const docs = result.knowledgeDocs.length
    ? result.knowledgeDocs.map((item) => `${item.title}｜${item.summary}`).join("\n")
    : "未命中法源文档。";
  return [`重庆案例：${cases}`, `法源文档：${docs}`].join("\n");
}

function renderReview(result: ReviewResult): string {
  return [
    `建议：${result.recommendation}`,
    `置信度：${result.confidence}`,
    `人工交接：${result.handoffRequired ? result.handoffReasons.join("；") : "暂不需要"}`,
    `分析：${result.analysis}`,
    `注意：${result.cautions.join("；")}`
  ].join("\n");
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

const colloquialExpansion: Record<string, string[]> = {
  "老板跑路": ["用人单位失联", "拖欠工资"],
  "跑路": ["失联", "拖欠"],
  "赶我走": ["辞退"],
  "赶走": ["辞退"],
  "不要我了": ["辞退"],
  "不让干了": ["辞退", "解除劳动合同"],
  "不用来了": ["辞退", "口头解除"],
  "炒了我": ["辞退"],
  "炒鱿鱼": ["辞退"],
  "没给钱": ["拖欠工资"],
  "不发工资": ["拖欠工资", "欠薪"],
  "扣我钱": ["克扣工资"],
  "黑厂": ["未签劳动合同"],
  "黑心老板": ["用人单位"],
  "没买社保": ["未缴纳社会保险"],
  "不给交社保": ["未缴纳社会保险"],
  "受伤了没人管": ["工伤", "用人单位未申请工伤认定"],
  "干活受伤": ["工伤"],
  "怀起被开了": ["孕期被辞退"],
  "怀孕被开": ["孕期被辞退"],
  "不让休息": ["加班", "未支付加班费"],
  "天天加班": ["加班", "未支付加班费"],
  "义务加班": ["加班", "未支付加班费"],
  "白干": ["拖欠工资", "未支付劳动报酬"],
  "压工资": ["拖欠工资"],
  "拖着不给": ["拖欠工资"],
};

function expandColloquial(text: string): string {
  let expanded = text;
  for (const [colloquial, formalTerms] of Object.entries(colloquialExpansion)) {
    if (expanded.includes(colloquial)) {
      expanded += "。" + formalTerms.join("、");
    }
  }
  return expanded;
}

function containsAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value.toLowerCase()));
}

function matchKeyword(text: string, tokens: string[], label: string): string | null {
  return tokens.some((token) => text.includes(token)) ? label : null;
}

function dedupe(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

function scoreKnowledgeDoc(item: KnowledgeDoc, extraction: ExtractionResult): number {
  if (extraction.scenario === "unknown" && !hasLaborContext(extraction)) {
    return 0;
  }

  const text = normalizeText(
    [item.title, item.summary, item.tags.join(" "), item.region, item.category].join(" ")
  );
  let score = 0;

  if (item.region.includes("重庆")) {
    score += extraction.facts.some((fact) => fact.includes("重庆")) ? 2 : 1;
  }

  if (item.category === "law" || item.category === "judicial_interpretation") {
    score += 1;
  }

  for (const keyword of extraction.keywords) {
    if (text.includes(normalizeText(keyword))) {
      score += 2;
    }
  }

  for (const tag of item.tags) {
    if (extraction.keywords.some((keyword) => keyword.includes(tag) || tag.includes(keyword))) {
      score += 1;
    }
  }

  if (
    extraction.scenario === "wage_arrears" &&
    ["工资", "劳动报酬", "欠薪"].some((value) => text.includes(normalizeText(value)))
  ) {
    score += 2;
  }

  if (
    extraction.scenario === "unlawful_termination" &&
    ["解除", "辞退", "程序"].some((value) => text.includes(normalizeText(value)))
  ) {
    score += 2;
  }

  if (
    extraction.scenario === "no_written_contract" &&
    ["合同", "双倍工资"].some((value) => text.includes(normalizeText(value)))
  ) {
    score += 2;
  }

  return score;
}

function hasLaborContext(extraction: ExtractionResult): boolean {
  return (
    extraction.keywords.length > 0 ||
    extraction.facts.some((fact) =>
      [
        "用人单位",
        "劳动关系",
        "工资",
        "解除",
        "劳动合同",
        "仲裁",
        "社保"
      ].some((token) => fact.includes(token))
    )
  );
}

export function toPublicAnalysisResponse(result: AnalysisResult): PublicAnalysisResponse {
  const citations: PublicCitation[] = [
    ...result.retrieval.knowledgeDocs.slice(0, 2).map((item) => ({
      title: item.title,
      label: `${item.categoryLabel ?? "法源"} · ${item.region}`,
      url: item.sourceUrl,
      kind: citationKindForDoc(item.category)
    })),
    ...result.retrieval.cases.slice(0, 1).map((item) => ({
      title: item.title,
      label: `${item.scenarioLabel} · ${item.district}`,
      url: item.sourceUrl,
      kind: "case" as const
    }))
  ].slice(0, 3);

  return {
    analysisId: result.analysisId,
    headline: result.review.recommendation,
    answer: result.review.analysis,
    riskLevel: result.review.riskLevel,
    confidence: result.review.confidence,
    confidenceLabel: result.review.confidenceLabel,
    handoffRequired: result.review.handoffRequired,
    handoffReasons: result.review.handoffReasons,
    scenarioLabel: result.extraction.scenarioLabel,
    compensationRange: result.review.compensationRange,
    followUpQuestions: result.review.followUpQuestions,
    nextSteps: result.review.nextSteps,
    cautions: result.review.cautions,
    citations
  };
}

function citationKindForDoc(category: string): PublicCitation["kind"] {
  if (category === "local_case") return "case";
  if (category === "procedure") return "procedure";
  if (category === "policy") return "policy";
  return "law";
}
