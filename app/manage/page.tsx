"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { localCases } from "@/lib/data/cases";
import { knowledgeDocs as seedKnowledgeDocs } from "@/lib/data/knowledge_docs";
import { parseCaseImportText, parseKnowledgeDocImportText } from "@/lib/material-import";
import type {
  AuditLogListResponse,
  AnalysisHistoryItem,
  AnalysisHistoryResponse,
  CaseImportDraft,
  EvalQualityResponse,
  FeedbackSummaryResponse,
  HealthStatusResponse,
  KnowledgeDoc,
  KnowledgeDocDraft,
  LocalCase,
  ManageOperationalSummary,
  ManageQualitySignalSummary,
  RuntimeStatus,
  RuntimeStatusResponse
} from "@/lib/agents/types";

const caseStorageKey = "cq_law_custom_cases";
const knowledgeStorageKey = "cq_law_custom_knowledge_docs";
const adminStorageKey = "cq_law_admin_token";
const adminTokenHeader = "x-admin-token";

const defaultCaseDraft = `title,scenario,district,year,summary,holding,sourceUrl,sourceLabel,tags
重庆本地示例案例,wage_arrears,重庆市,2024,示例摘要，用于验证案例导入流程。,示例结论。,https://example.com,示例来源,欠薪|证据`;

const defaultKnowledgeDraft = `title,category,region,year,summary,content,sourceUrl,sourceLabel,tags,isActive
重庆劳动仲裁示例办事材料,procedure,重庆市,2026,示例素材，用于验证知识文档导入和 RAG 检索。,这里填写官方法源、办事指南或公开案例的正文摘要，供内部检索使用。,https://example.com,示例来源,程序|仲裁|重庆,true`;

const scenarios = [
  "all",
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
  "mixed"
] as const;
const categories = ["all", "law", "judicial_interpretation", "local_case", "procedure", "policy"] as const;
const activeFilters = ["all", "active", "inactive"] as const;

type Mode = "cases" | "knowledge";
type MaterialSource = "backend" | "local" | "unknown";
type HistorySource = "backend" | "unavailable" | "unknown";
type RuntimeSource = "backend" | "unavailable" | "unknown";
type HealthSource = "backend" | "unavailable" | "unknown";
type ManageRole = NonNullable<RuntimeStatus["accessRole"]>;

const roleProfiles: Record<
  ManageRole,
  {
    label: string;
    tone: "low" | "medium" | "high";
    accessSummary: string;
    readable: string[];
    editable: string[];
    blocked: string[];
  }
> = {
  viewer: {
    label: "Viewer",
    tone: "low",
    accessSummary: "只读演示身份，可查看看板、素材列表与运营信号。",
    readable: ["素材列表", "健康状态", "运行态", "历史/反馈", "质量门禁", "审计摘要"],
    editable: [],
    blocked: ["导入素材", "删除/停用素材", "清空缓存", "导出运营快照"],
  },
  editor: {
    label: "Editor",
    tone: "medium",
    accessSummary: "内容协作身份，可维护 RAG 素材，但不执行管理员级导出。",
    readable: ["素材列表", "健康状态", "运行态", "历史/反馈", "质量门禁", "审计摘要"],
    editable: ["导入案例/知识文档", "删除自定义案例", "停用知识文档", "清理本地素材缓存"],
    blocked: ["导出运营快照", "切换管理员策略"],
  },
  admin: {
    label: "Admin",
    tone: "high",
    accessSummary: "管理员身份，可编辑素材并执行演示运营导出。",
    readable: ["素材列表", "健康状态", "运行态", "历史/反馈", "质量门禁", "审计摘要"],
    editable: ["导入案例/知识文档", "删除/停用素材", "清理缓存", "导出运营快照"],
    blocked: [],
  },
};

type CaseListPayload = {
  cases: LocalCase[];
  source?: MaterialSource;
};

type KnowledgeDocListPayload = {
  docs: KnowledgeDoc[];
  source?: MaterialSource;
};

class AdminAccessError extends Error {}

function createAdminHeaders(token: string, headers: Record<string, string> = {}) {
  return { ...headers, [adminTokenHeader]: token.trim() };
}

function assertAdminResponse(response: Response, fallbackMessage: string) {
  if (isAdminAccessStatus(response.status)) {
    throw new AdminAccessError(adminAccessMessage(response.status));
  }

  if (!response.ok) {
    throw new Error(fallbackMessage);
  }
}

function isAdminAccessStatus(status: number) {
  return status === 401 || status === 403 || status === 503;
}

function adminAccessMessage(status: number) {
  if (status === 503) {
    return "服务端未配置协作访问令牌，请先设置环境变量。";
  }

  return "访问令牌无效、已过期或权限不足，请重新输入。";
}

export default function ManagePage() {
  const [mode, setMode] = useState<Mode>("knowledge");
  const [cases, setCases] = useState<LocalCase[]>(localCases);
  const [docs, setDocs] = useState<KnowledgeDoc[]>(seedKnowledgeDocs);
  const [query, setQuery] = useState("");
  const [scenario, setScenario] = useState<(typeof scenarios)[number]>("all");
  const [category, setCategory] = useState<(typeof categories)[number]>("all");
  const [activeFilter, setActiveFilter] = useState<(typeof activeFilters)[number]>("all");
  const [caseDraft, setCaseDraft] = useState(defaultCaseDraft);
  const [knowledgeDraft, setKnowledgeDraft] = useState(defaultKnowledgeDraft);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [materialSource, setMaterialSource] = useState<MaterialSource>("unknown");
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [historySource, setHistorySource] = useState<HistorySource>("unknown");
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [runtimeSource, setRuntimeSource] = useState<RuntimeSource>("unknown");
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [healthSource, setHealthSource] = useState<HealthSource>("unknown");
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummaryResponse | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogListResponse | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditMessage, setAuditMessage] = useState<string | null>(null);
  const [evalQuality, setEvalQuality] = useState<EvalQualityResponse | null>(null);
  const [evalQualityLoading, setEvalQualityLoading] = useState(false);
  const [evalQualityMessage, setEvalQualityMessage] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [adminTokenDraft, setAdminTokenDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const storedToken = window.sessionStorage.getItem(adminStorageKey)?.trim() ?? "";
    if (!storedToken) {
      setMessage("请输入访问令牌以访问内部素材管理。");
      setLoading(false);
      return;
    }

    setAdminTokenDraft(storedToken);
    void loadMaterials(storedToken);
  }, []);

  const filteredCases = useMemo(() => {
    return cases.filter((item) => {
      const haystack = `${item.title} ${item.summary} ${item.district} ${item.tags.join(" ")}`.toLowerCase();
      const queryOk = !query || haystack.includes(query.toLowerCase());
      const scenarioOk = scenario === "all" || item.scenario === scenario;
      return queryOk && scenarioOk;
    });
  }, [cases, query, scenario]);

  const filteredDocs = useMemo(() => {
    return docs.filter((item) => {
      const haystack = `${item.title} ${item.summary} ${item.region} ${item.tags.join(" ")} ${item.categoryLabel ?? ""}`.toLowerCase();
      const queryOk = !query || haystack.includes(query.toLowerCase());
      const categoryOk = category === "all" || item.category === category;
      const activeOk =
        activeFilter === "all" ||
        (activeFilter === "active" && item.isActive !== false) ||
        (activeFilter === "inactive" && item.isActive === false);
      return queryOk && categoryOk && activeOk;
    });
  }, [docs, query, category, activeFilter]);

  const historySummary = useMemo(() => {
    const providerModes = Array.from(new Set(history.map((item) => item.trace?.providerMode).filter(Boolean)));
    const models = Array.from(new Set(history.map((item) => item.trace?.model).filter(Boolean)));
    const qualityFlags = Array.from(new Set(history.flatMap((item) => item.trace?.qualityFlags ?? []))).slice(0, 6);
    const lowConfidence = history.filter(
      (item) =>
        item.extraction.confidence < 0.7 ||
        item.extraction.scenario === "unknown" ||
        item.extraction.missingInfo.length > 0 ||
        item.trace.missingInfoCount > 0
    );
    return {
      total: history.length,
      highRisk: history.filter((item) => item.review.riskLevel === "high").length,
      unknown: history.filter((item) => item.extraction.scenario === "unknown").length,
      lowConfidence: lowConfidence.length,
      latestAt: history[0]?.createdAt ? formatHistoryTime(history[0].createdAt) : "暂无",
      providerModes,
      models,
      qualityFlags,
    };
  }, [history]);

  const currentRole = resolveManageRole(runtime);
  const roleProfile = roleProfiles[currentRole];
  const canEditMaterials = currentRole === "editor" || currentRole === "admin";
  const canAdminOperate = currentRole === "admin";

  const qualitySignals = useMemo<ManageQualitySignalSummary>(() => {
    const historyLowConfidenceCount = historySummary.lowConfidence;
    if (evalQuality?.source !== "backend") {
      return {
        productionEvalState: "等待报告",
        productionEvalReason: evalQuality?.source === "unavailable" ? evalQuality.error : "等待生产评测报告加载。",
        passRate: 0,
        evaluatedTotal: 0,
        lowConfidenceCount: historyLowConfidenceCount,
        manualReviewCount: 0,
        failedCount: 0,
        shadowDifferenceCount: 0,
        shadowWarningCount: 0,
        releaseBlockerCount: 0,
        generatedAt: historySummary.latestAt,
        nextAction: historyLowConfidenceCount
          ? "先复盘历史中的低置信记录，再补跑生产评测。"
          : "先运行生产评测并刷新质量门禁。",
        signals: [`历史低置信 ${historyLowConfidenceCount}`],
      };
    }

    const lowConfidenceEvalCount = evalQuality.productionReviewQueue.filter((item) =>
      hasLowConfidenceSignal([item.category, ...item.failedDimensions, ...item.handoffReasons])
    ).length || evalQuality.reviewQueue.filter((item) =>
      hasLowConfidenceSignal([item.category, ...item.failedDimensions, ...item.qualityFlags])
    ).length;
    const adaptedWarnings = evalQuality.adaptedInputReview?.summary.warningCount ?? 0;
    const adaptedFailures = evalQuality.adaptedInputReview?.summary.failureCount ?? 0;
    const manualReviewCount =
      (evalQuality.productionEval?.handoffCount ?? evalQuality.qualityGate.reviewQueueCount) +
      (evalQuality.adaptedInputReview?.summary.reviewQueueCount ?? 0);
    const shadowDifferenceCount = evalQuality.shadowGate?.differenceCount ?? 0;
    const shadowWarningCount = evalQuality.shadowGate?.warningCount ?? 0;
    const shadowFailureCount = evalQuality.shadowGate?.failureCount ?? 0;
    const releaseBlockerCount =
      (evalQuality.releaseCheck?.failedChecks.length ?? 0) + (evalQuality.releaseCheck?.secretScanPassed === false ? 1 : 0);
    const lowConfidenceCount = historyLowConfidenceCount + lowConfidenceEvalCount + adaptedWarnings;
    const failedCount = (evalQuality.productionEval?.failed ?? evalQuality.qualityGate.failed) + adaptedFailures + shadowFailureCount + releaseBlockerCount;
    const generatedAt = latestSignalTime(
      evalQuality.productionEval?.generatedAt,
      evalQuality.qualityGate.generatedAt,
      evalQuality.shadowGate?.generatedAt,
      evalQuality.adaptedInputReview?.generatedAt,
      evalQuality.releaseCheck?.generatedAt
    );
    let productionEvalState: ManageQualitySignalSummary["productionEvalState"] = "通过";
    let productionEvalReason = "生产评测通过，未发现需要人工介入的质量信号。";
    let nextAction = "保持质量门禁常态化运行，继续积累低置信样本。";

    if ((evalQuality.productionEval?.status ?? evalQuality.qualityGate.status) !== "passed" || failedCount > 0) {
      productionEvalState = "阻断";
      productionEvalReason = "生产评测或发布门禁存在失败项，需要先阻断发布。";
      nextAction = "优先处理失败维度、发布检查和密钥扫描，再重新生成评测报告。";
    } else if (manualReviewCount > 0 || lowConfidenceCount > 0 || shadowDifferenceCount > 0 || shadowWarningCount > 0) {
      productionEvalState = "需复核";
      productionEvalReason = "评测主门禁通过，但仍存在低置信、shadow 差异或人工复核队列。";
      nextAction = "先清理人工复核队列，把低置信样本沉淀为追问、素材或回归评测补充。";
    }

    return {
      productionEvalState,
      productionEvalReason,
      passRate: evalQuality.productionEval?.passRate ?? evalQuality.qualityGate.passRate,
      evaluatedTotal: evalQuality.productionEval?.total ?? evalQuality.qualityGate.total,
      lowConfidenceCount,
      manualReviewCount,
      failedCount,
      shadowDifferenceCount,
      shadowWarningCount,
      releaseBlockerCount,
      generatedAt,
      nextAction,
      signals: [
        `生产评测 ${productionEvalState}`,
        `低置信 ${lowConfidenceCount}`,
        `人工复核 ${manualReviewCount}`,
        `Shadow 差异 ${shadowDifferenceCount}`,
      ],
    };
  }, [evalQuality, historySummary]);

  const operationalSummary = useMemo<ManageOperationalSummary>(() => {
    const feedbackTotal = feedbackSummary?.total ?? 0;
    const helpfulRate = feedbackSummary?.helpfulRate ?? 0;
    const runtimeReady = runtimeSource === "backend" && Boolean(runtime);
    const healthReady = healthSource === "backend" && health?.ok === true;
    const productionProviderReady = runtimeReady && Boolean(runtime?.apiKeyConfigured);
    const historyReady = historySource === "backend" && historySummary.total > 0;
    const feedbackReady = feedbackSummary?.source !== "unavailable" && feedbackTotal > 0;
    const hasRiskSignals = historySummary.highRisk > 0 || historySummary.unknown > 0;
    const feedbackHealthy = helpfulRate >= 0.7;
    const feedbackAcceptable = helpfulRate >= 0.5;
    const provider = runtime?.providerMode ?? historySummary.providerModes[0] ?? "暂无";
    const model = runtime?.model ?? historySummary.models[0] ?? "暂无";
    const latestAt = latestSignalTime(
      history[0]?.createdAt,
      feedbackSummary?.recentItems[0]?.createdAt,
      evalQuality?.source === "backend" ? evalQuality.productionEval?.generatedAt : undefined,
      evalQuality?.source === "backend" ? evalQuality.qualityGate.generatedAt : undefined,
      evalQuality?.source === "backend" ? evalQuality.adaptedInputReview?.generatedAt : undefined
    );
    const signals = [
      `健康 ${healthReady ? "正常" : "待确认"}`,
      `Provider ${provider}`,
      `生产评测 ${qualitySignals.productionEvalState}`,
      `低置信 ${qualitySignals.lowConfidenceCount}`,
      `人工复核 ${qualitySignals.manualReviewCount}`,
      `反馈有用率 ${formatPercent(helpfulRate)}`,
      `未识别 ${historySummary.unknown}`,
      `高风险 ${historySummary.highRisk}`,
    ];
    let launchState: ManageOperationalSummary["launchState"] = "等待数据";
    let launchReason = "等待运行态、历史或反馈形成稳定判断。";
    let nextStep = "先刷新运行态、历史和反馈，确保上线判断来自真实数据。";

    if (
      healthReady &&
      productionProviderReady &&
      historyReady &&
      feedbackReady &&
      qualitySignals.productionEvalState === "通过" &&
      !hasRiskSignals &&
      feedbackHealthy
    ) {
      launchState = "可上线";
      launchReason = "生产健康检查正常，provider 已就绪，生产评测通过，近期历史无高风险/未识别，反馈有用率达标。";
      nextStep = "保持灰度监控，把高频正反馈样本沉淀为回归评测集。";
    } else if (
      healthReady &&
      productionProviderReady &&
      historyReady &&
      feedbackReady &&
      qualitySignals.productionEvalState !== "阻断" &&
      qualitySignals.productionEvalState !== "等待报告" &&
      feedbackAcceptable &&
      historySummary.highRisk <= 1 &&
      historySummary.unknown <= 2
    ) {
      launchState = "可灰度";
      launchReason = "核心运行信号已接入，但仍需继续观察风险、未识别或反馈稳定性。";
      nextStep = hasRiskSignals
        ? "先复盘未识别/高风险记录，补素材和收紧审校规则后再扩大流量。"
        : "继续收集反馈，达到稳定有用率后再切换为正式上线。";
    } else if (healthReady || runtimeReady || historyReady || feedbackReady) {
      launchState = "需优化";
      if (!healthReady) {
        launchReason = "生产健康检查未通过或暂不可用，需要先确认后端和数据库连接。";
        nextStep = "先刷新生产健康状态，确认 API 与数据库可用后再评估上线。";
      } else if (!productionProviderReady) {
        launchReason = "运行态已接入但生产 provider 或密钥仍未就绪。";
        nextStep = "先确认 provider、model 和 API Key 配置，再观察端到端分析质量。";
      } else if (qualitySignals.productionEvalState === "阻断") {
        launchReason = qualitySignals.productionEvalReason;
        nextStep = qualitySignals.nextAction;
      } else if (historySummary.highRisk > 0) {
        launchReason = "近期历史存在高风险输出，需要优先处理。";
        nextStep = "逐条复盘高风险样本，补充案例依据并收紧审校提示。";
      } else if (historySummary.unknown > 0) {
        launchReason = "近期历史存在未识别场景，影响稳定分流。";
        nextStep = "补齐未识别输入的场景标签、示例和回归测试。";
      } else if (qualitySignals.productionEvalState === "需复核") {
        launchReason = qualitySignals.productionEvalReason;
        nextStep = qualitySignals.nextAction;
      } else if (!feedbackReady) {
        launchReason = "反馈数据尚未接入，无法完成上线效果闭环。";
        nextStep = "先补齐反馈采集与汇总，再判断是否具备上线条件。";
      } else if (feedbackReady && helpfulRate < 0.5) {
        launchReason = "反馈有用率偏低，说明用户侧结果仍不稳定。";
        nextStep = "优先处理“需要改进”的反馈，调整检索权重或输出结构。";
      } else {
        launchReason = "上线信号不完整，暂不建议扩大流量。";
        nextStep = "补齐历史与反馈样本后再判断是否进入灰度。";
      }
    }

    return {
      launchState,
      launchReason,
      provider,
      model,
      helpfulRate,
      feedbackTotal,
      highRiskCount: historySummary.highRisk,
      unknownCount: historySummary.unknown,
      latestAt,
      nextStep,
      signals,
    };
  }, [evalQuality, feedbackSummary, health, healthSource, history, historySource, historySummary, qualitySignals, runtime, runtimeSource]);

  async function unlockManage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadMaterials(adminTokenDraft);
  }

  function lockManage(notice = "已锁定内部素材管理。") {
    try {
      window.sessionStorage.removeItem(adminStorageKey);
    } catch {
      // Session storage can be unavailable in locked-down browser contexts.
    }
    setIsUnlocked(false);
    setMaterialSource("unknown");
    setHistory([]);
    setHistorySource("unknown");
    setHistoryMessage(null);
    setRuntime(null);
    setRuntimeSource("unknown");
    setRuntimeMessage(null);
    setHealth(null);
    setHealthSource("unknown");
    setHealthMessage(null);
    setHistoryLoading(false);
    setRuntimeLoading(false);
    setHealthLoading(false);
    setFeedbackSummary(null);
    setFeedbackLoading(false);
    setFeedbackMessage(null);
    setAuditLogs(null);
    setAuditLoading(false);
    setAuditMessage(null);
    setEvalQuality(null);
    setEvalQualityLoading(false);
    setEvalQualityMessage(null);
    setAdminToken("");
    setAdminTokenDraft("");
    setMessage(notice);
  }

  async function loadMaterials(token = adminToken) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      lockManage("请输入访问令牌以访问内部素材管理。");
      setLoading(false);
      return;
    }

    setLoading(true);
    const fallbackCases = readFallbackCases();
    const fallbackDocs = readFallbackKnowledgeDocs();

    try {
      const [caseResponse, docResponse] = await Promise.all([
        fetch("/api/cases", {
          cache: "no-store",
          headers: createAdminHeaders(normalizedToken),
        }),
        fetch("/api/knowledge-docs", {
          cache: "no-store",
          headers: createAdminHeaders(normalizedToken),
        }),
      ]);
      const protectedStatus = [caseResponse.status, docResponse.status].find(isAdminAccessStatus);
      if (protectedStatus) {
        throw new AdminAccessError(adminAccessMessage(protectedStatus));
      }
      if (!caseResponse.ok || !docResponse.ok) {
        throw new Error("material api unavailable");
      }
      const caseData = (await caseResponse.json()) as CaseListPayload;
      const docData = (await docResponse.json()) as KnowledgeDocListPayload;
      setAdminToken(normalizedToken);
      setIsUnlocked(true);
      try {
        window.sessionStorage.setItem(adminStorageKey, normalizedToken);
      } catch {
        // Keep the unlocked session usable even if sessionStorage is unavailable.
      }
      setCases(mergeCaseLists(caseData.cases, fallbackCases));
      setDocs(mergeKnowledgeDocs(docData.docs, fallbackDocs));
      const source = caseData.source === "local" || docData.source === "local" ? "local" : "backend";
      setMaterialSource(source);
      setMessage(
        source === "local"
          ? "后端暂不可用，已切换到本地素材缓存。"
          : "已通过访问令牌连接后端素材库。"
      );
      void loadRuntime(normalizedToken);
      void loadHealth();
      void loadHistory(normalizedToken);
      void loadFeedbackSummary(normalizedToken);
      void loadAuditLogs(normalizedToken);
      void loadEvalQuality(normalizedToken);
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      setAdminToken(normalizedToken);
      setIsUnlocked(true);
      try {
        window.sessionStorage.setItem(adminStorageKey, normalizedToken);
      } catch {
        // Keep the unlocked session usable even if sessionStorage is unavailable.
      }
      setCases(mergeCaseLists(fallbackCases, localCases));
      setDocs(mergeKnowledgeDocs(fallbackDocs, seedKnowledgeDocs));
      setMaterialSource("local");
      setMessage("后端暂不可用，已切换到本地素材缓存。");
      void loadRuntime(normalizedToken);
      void loadHealth();
      void loadHistory(normalizedToken);
      void loadFeedbackSummary(normalizedToken);
      void loadAuditLogs(normalizedToken);
      void loadEvalQuality(normalizedToken);
      return;
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(token = adminToken) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setHistory([]);
      setHistorySource("unknown");
      setHistoryMessage("请输入访问令牌后再加载历史监控。");
      return;
    }

    setHistoryLoading(true);
    try {
      const response = await fetch("/api/history?limit=8", {
        cache: "no-store",
        headers: createAdminHeaders(normalizedToken),
      });
      if (isAdminAccessStatus(response.status)) {
        throw new AdminAccessError(adminAccessMessage(response.status));
      }
      if (!response.ok) {
        throw new Error("history api unavailable");
      }

      const data = (await response.json()) as AnalysisHistoryResponse;
      const source: HistorySource = data.source ?? "backend";
      setHistory(data.items ?? []);
      setHistorySource(source);
      setHistoryMessage(
        source === "backend"
          ? data.items.length
            ? `已加载 ${data.items.length} 条后端分析历史。`
            : "后端历史已连接，暂无分析记录。"
          : data.error ?? "历史服务暂不可用"
      );
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      setHistory([]);
      setHistorySource("unavailable");
      setHistoryMessage("历史服务暂不可用");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadRuntime(token = adminToken) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setRuntime(null);
      setRuntimeSource("unknown");
      setRuntimeMessage("请输入访问令牌后再加载运行状态。");
      return;
    }

    setRuntimeLoading(true);
    try {
      const response = await fetch("/api/runtime", {
        cache: "no-store",
        headers: createAdminHeaders(normalizedToken)
      });
      if (isAdminAccessStatus(response.status)) {
        throw new AdminAccessError(adminAccessMessage(response.status));
      }
      if (!response.ok) {
        throw new Error("runtime api unavailable");
      }

      const data = (await response.json()) as RuntimeStatusResponse;
      if (data.source === "unavailable") {
        setRuntime(null);
        setRuntimeSource("unavailable");
        setRuntimeMessage(data.error || "运行状态暂不可用");
        return;
      }

      const source: RuntimeSource = data.source ?? "backend";
      setRuntime({
        providerMode: data.providerMode,
        model: data.model,
        reasoningEffort: data.reasoningEffort,
        tracingEnabled: data.tracingEnabled,
        accessRole: data.accessRole,
        accessLevel: data.accessLevel,
        timeoutSeconds: data.timeoutSeconds,
        apiKeyConfigured: data.apiKeyConfigured,
        localFallbackEnabled: data.localFallbackEnabled,
        agentCount: data.agentCount,
        agentLabels: data.agentLabels,
        database: data.database
      });
      setRuntimeSource(source);
      setRuntimeMessage(
        source === "backend"
          ? data.apiKeyConfigured
            ? `运行状态已连接，DeepSeek 密钥已配置。当前身份：${formatManageRole(data.accessRole ?? "admin")}。`
            : `运行状态已连接，当前仍为本地模式。当前身份：${formatManageRole(data.accessRole ?? "viewer")}。`
          : data.error ?? "运行状态暂不可用"
      );
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      setRuntime(null);
      setRuntimeSource("unavailable");
      setRuntimeMessage("运行状态服务暂不可用");
    } finally {
      setRuntimeLoading(false);
    }
  }

  async function loadHealth() {
    setHealthLoading(true);
    try {
      const response = await fetch("/api/healthz", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as HealthStatusResponse | null;

      if (!response.ok || !data) {
        throw new Error("health api unavailable");
      }

      setHealth(data);
      setHealthSource(data.source);
      setHealthMessage(
        data.source === "backend" && data.ok
          ? "生产健康检查正常，数据库连接已脱敏展示。"
          : data.error ?? "生产健康检查暂不可用"
      );
    } catch {
      setHealth({
        status: "degraded",
        ok: false,
        source: "unavailable",
        checkedAt: new Date().toISOString(),
        databaseReachable: false,
        caseCount: 0,
        activeKnowledgeDocCount: 0,
        feedbackCount: 0,
        auditLogCount: 0,
        providerMode: "local",
        model: "unavailable",
        apiKeyConfigured: false,
        databaseLabel: "unavailable",
        error: "生产健康检查暂不可用"
      });
      setHealthSource("unavailable");
      setHealthMessage("生产健康检查暂不可用");
    } finally {
      setHealthLoading(false);
    }
  }

  async function loadFeedbackSummary(token = adminToken) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setFeedbackSummary(null);
      setFeedbackMessage("请输入访问令牌后再加载反馈统计。");
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await fetch("/api/feedback/summary", {
        cache: "no-store",
        headers: createAdminHeaders(normalizedToken)
      });
      if (isAdminAccessStatus(response.status)) {
        throw new AdminAccessError(adminAccessMessage(response.status));
      }
      if (!response.ok) {
        throw new Error("feedback summary unavailable");
      }

      const data = (await response.json()) as FeedbackSummaryResponse;
      setFeedbackSummary(data);
      setFeedbackMessage(
        data.source === "unavailable"
          ? data.error ?? "反馈统计暂不可用"
          : data.total
            ? `已加载 ${data.total} 条用户反馈。`
            : "反馈统计已连接，暂无用户反馈。"
      );
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      setFeedbackSummary(null);
      setFeedbackMessage("反馈统计暂不可用");
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function loadAuditLogs(token = adminToken) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setAuditLogs(null);
      setAuditMessage("请输入访问令牌后再加载审计日志。");
      return;
    }

    setAuditLoading(true);
    try {
      const response = await fetch("/api/audit-logs?limit=12", {
        cache: "no-store",
        headers: createAdminHeaders(normalizedToken)
      });
      if (isAdminAccessStatus(response.status)) {
        throw new AdminAccessError(adminAccessMessage(response.status));
      }
      if (!response.ok) {
        throw new Error("audit logs unavailable");
      }

      const data = (await response.json()) as AuditLogListResponse;
      setAuditLogs(data);
      setAuditMessage(
        data.source === "unavailable"
          ? data.error ?? "审计日志暂不可用"
          : data.items.length
            ? `已加载 ${data.items.length} 条审计日志。`
            : "审计日志已连接，暂无记录。"
      );
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      setAuditLogs(null);
      setAuditMessage("审计日志暂不可用");
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadEvalQuality(token = adminToken) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setEvalQuality(null);
      setEvalQualityMessage("请输入访问令牌后再加载质量门禁。");
      return;
    }

    setEvalQualityLoading(true);
    try {
      const response = await fetch("/api/eval-quality", {
        cache: "no-store",
        headers: createAdminHeaders(normalizedToken)
      });
      if (isAdminAccessStatus(response.status)) {
        throw new AdminAccessError(adminAccessMessage(response.status));
      }
      if (!response.ok) {
        throw new Error("eval quality unavailable");
      }

      const data = (await response.json()) as EvalQualityResponse;
      setEvalQuality(data);
      setEvalQualityMessage(
        data.source === "unavailable"
          ? data.error
          : `质量门禁 ${data.qualityGate.status}，通过率 ${formatPercent(data.qualityGate.passRate)}。`
      );
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      setEvalQuality(null);
      setEvalQualityMessage("质量门禁报告暂不可用");
    } finally {
      setEvalQualityLoading(false);
    }
  }

  function ensureCanEditMaterials() {
    if (canEditMaterials) {
      return true;
    }

    setMessage(`${roleProfile.label} 当前不可编辑素材。请切换 editor/admin 令牌后再操作。`);
    return false;
  }

  function ensureCanExportOperations() {
    if (canAdminOperate) {
      return true;
    }

    setMessage(`${roleProfile.label} 当前不可导出运营快照。该操作仅 admin 开放。`);
    return false;
  }

  async function importCasesFromText() {
    if (!ensureCanEditMaterials()) {
      return;
    }

    try {
      await commitCases(parseCaseImportText(caseDraft), "文本");
    } catch (error) {
      setMessage(`案例导入失败：${error instanceof Error ? error.message : "请检查 CSV/JSON 格式"}`);
    }
  }

  async function importKnowledgeFromText() {
    if (!ensureCanEditMaterials()) {
      return;
    }

    try {
      await commitKnowledgeDocs(parseKnowledgeDocImportText(knowledgeDraft), "文本");
    } catch (error) {
      setMessage(`知识文档导入失败：${error instanceof Error ? error.message : "请检查 CSV/JSON 格式"}`);
    }
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const importMode = mode;
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    if (!ensureCanEditMaterials()) {
      return;
    }

    try {
      const content = await file.text();
      if (importMode === "cases") {
        await commitCases(parseCaseImportText(content), file.name);
      } else {
        await commitKnowledgeDocs(parseKnowledgeDocImportText(content), file.name);
      }
    } catch (error) {
      setMessage(`文件导入失败：${error instanceof Error ? error.message : "请检查文件内容"}`);
    }
  }

  async function commitCases(items: CaseImportDraft[], sourceName: string) {
    if (!ensureCanEditMaterials()) {
      return;
    }

    const normalized: LocalCase[] = items.map((item) => ({
      ...item,
      id: item.id || crypto.randomUUID(),
      isCustom: true,
    }));

    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: createAdminHeaders(adminToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ cases: normalized }),
      });
      assertAdminResponse(response, "backend import failed");
      const data = (await response.json()) as { cases: LocalCase[] };
      setCases(data.cases);
      writeFallbackCases([]);
      setMessage(`已从 ${sourceName} 导入 ${normalized.length} 条案例素材到后端数据库。`);
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      const fallbackCases = mergeCaseLists(normalized, readFallbackCases());
      writeFallbackCases(fallbackCases);
      setCases(mergeCaseLists(fallbackCases, localCases));
      setMessage(`后端暂不可用，已从 ${sourceName} 导入 ${normalized.length} 条案例到本地缓存。`);
    }
  }

  async function commitKnowledgeDocs(items: KnowledgeDocDraft[], sourceName: string) {
    if (!ensureCanEditMaterials()) {
      return;
    }

    const normalized: KnowledgeDocDraft[] = items.map((item) => ({
      ...item,
      id: item.id || crypto.randomUUID(),
      categoryLabel: item.categoryLabel ?? categoryLabel(item.category),
      isActive: item.isActive ?? true,
    }));

    try {
      const response = await fetch("/api/knowledge-docs", {
        method: "POST",
        headers: createAdminHeaders(adminToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ docs: normalized }),
      });
      assertAdminResponse(response, "backend import failed");
      const data = (await response.json()) as { docs: KnowledgeDoc[] };
      setDocs(data.docs);
      writeFallbackKnowledgeDocs([]);
      setMessage(`已从 ${sourceName} 导入 ${normalized.length} 条知识文档素材到后端数据库。`);
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      const fallbackDocs = mergeKnowledgeDocs(normalized, readFallbackKnowledgeDocs()) as KnowledgeDocDraft[];
      writeFallbackKnowledgeDocs(fallbackDocs);
      setDocs(mergeKnowledgeDocs(fallbackDocs, seedKnowledgeDocs));
      setMessage(`后端暂不可用，已从 ${sourceName} 导入 ${normalized.length} 条知识文档到本地缓存。`);
    }
  }

  async function deleteCase(caseId: string) {
    if (!ensureCanEditMaterials()) {
      return;
    }

    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
        method: "DELETE",
        headers: createAdminHeaders(adminToken),
      });
      assertAdminResponse(response, "backend delete failed");
      setCases((current) => current.filter((item) => item.id !== caseId));
      writeFallbackCases(readFallbackCases().filter((item) => item.id !== caseId));
      setMessage("已从后端数据库删除自定义案例。");
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      const fallbackCases = readFallbackCases().filter((item) => item.id !== caseId);
      writeFallbackCases(fallbackCases);
      setCases(mergeCaseLists(fallbackCases, localCases));
      setMessage("后端暂不可用，已从本地缓存删除案例。");
    }
  }

  async function deleteKnowledgeDoc(docId: string) {
    if (!ensureCanEditMaterials()) {
      return;
    }

    try {
      const response = await fetch(`/api/knowledge-docs/${encodeURIComponent(docId)}`, {
        method: "DELETE",
        headers: createAdminHeaders(adminToken),
      });
      assertAdminResponse(response, "backend delete failed");
      removeKnowledgeDocFromView(docId);
      setMessage("已从后端数据库停用或删除知识文档。");
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      removeKnowledgeDocFromView(docId);
      setMessage("后端暂不可用，已从本地缓存删除知识文档。");
    }
  }

  function removeKnowledgeDocFromView(docId: string) {
    const isSeedDoc = seedKnowledgeDocs.some((item) => item.id === docId);

    setDocs((current) =>
      isSeedDoc
        ? current.map((item) => (item.id === docId ? { ...item, isActive: false } : item))
        : current.filter((item) => item.id !== docId)
    );
    writeFallbackKnowledgeDocs(readFallbackKnowledgeDocs().filter((item) => item.id !== docId));
  }

  async function clearImportedCases() {
    if (!ensureCanEditMaterials()) {
      return;
    }

    try {
      const response = await fetch("/api/cases/custom", {
        method: "DELETE",
        headers: createAdminHeaders(adminToken),
      });
      assertAdminResponse(response, "backend bulk delete failed");
      writeFallbackCases([]);
      setCases(localCases);
      setMessage("已清空全部自定义案例。");
    } catch (error) {
      if (error instanceof AdminAccessError) {
        lockManage(error.message);
        return;
      }

      writeFallbackCases([]);
      setCases(localCases);
      setMessage("后端暂不可用，已清空本地自定义案例缓存。");
    }
  }

  function clearLocalKnowledgeCache() {
    if (!ensureCanEditMaterials()) {
      return;
    }

    writeFallbackKnowledgeDocs([]);
    setDocs(seedKnowledgeDocs);
    setMessage("已清空本地知识文档缓存；后端素材请逐条停用或删除。");
  }

  function exportOperationalSnapshot(format: "markdown" | "json") {
    if (!ensureCanExportOperations()) {
      return;
    }

    const snapshot = {
      generatedAt: new Date().toISOString(),
      launchState: operationalSummary.launchState,
      launchReason: operationalSummary.launchReason,
      nextStep: operationalSummary.nextStep,
      health: health
        ? {
            status: health.status,
            ok: health.ok,
            databaseReachable: health.databaseReachable,
            caseCount: health.caseCount,
            activeKnowledgeDocCount: health.activeKnowledgeDocCount,
            feedbackCount: health.feedbackCount,
            auditLogCount: health.auditLogCount,
            providerMode: health.providerMode,
            model: health.model,
            apiKeyConfigured: health.apiKeyConfigured,
            databaseLabel: health.databaseLabel,
          }
        : null,
      runtime: runtime
        ? {
            providerMode: runtime.providerMode,
            model: runtime.model,
            accessRole: runtime.accessRole ?? currentRole,
            accessLevel: runtime.accessLevel,
            timeoutSeconds: runtime.timeoutSeconds,
            apiKeyConfigured: runtime.apiKeyConfigured,
            localFallbackEnabled: runtime.localFallbackEnabled,
            agentCount: runtime.agentCount,
            agentLabels: runtime.agentLabels,
            database: runtime.database,
          }
        : null,
      feedback: feedbackSummary
        ? {
            total: feedbackSummary.total,
            helpfulCount: feedbackSummary.helpfulCount,
            unhelpfulCount: feedbackSummary.unhelpfulCount,
            helpfulRate: feedbackSummary.helpfulRate,
          }
        : null,
      historySummary: {
        total: historySummary.total,
        highRisk: historySummary.highRisk,
        unknown: historySummary.unknown,
        lowConfidence: historySummary.lowConfidence,
        latestAt: historySummary.latestAt,
        qualityFlags: historySummary.qualityFlags,
      },
      qualitySignals,
      recentAuditActions: (auditLogs?.items ?? []).slice(0, 8).map((item) => ({
        createdAt: item.createdAt,
        action: item.action,
        resource: item.resource,
        actorRole: item.actorRole,
        outcome: item.outcome,
      })),
      disclosure: "运营快照只包含健康、运行态、反馈、历史、评测质量和审计动作摘要，不导出素材全文、内部推理链或用户完整案情。",
    };
    const content = format === "json" ? JSON.stringify(snapshot, null, 2) : renderOperationalSnapshotMarkdown(snapshot);
    downloadTextFile(
      content,
      `cq-labor-ops-${new Date().toISOString().slice(0, 10)}.${format === "json" ? "json" : "md"}`,
      format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8"
    );
  }

  return (
    <main>
      <header className="topbar">
        <Link className="topbar__brand" href="/">
          重庆劳动法助手
        </Link>
        <nav className="topbar__nav">
          <Link href="/">分析页</Link>
        </nav>
      </header>
      {!isUnlocked ? (
        <section className="panel manage-shell">
          <div className="section-title">
            <div>
              <p className="eyebrow">内部素材管理</p>
              <h2>Locked Access</h2>
            </div>
            <span className="status">{loading ? "验证中" : "等待访问令牌"}</span>
          </div>

          <p className="muted">
            请输入与服务端一致的访问令牌后再进入内部素材管理。viewer 仅可读，editor 可编辑素材，admin 额外开放运营导出。
          </p>

          <form className="manage-card" onSubmit={unlockManage}>
            <label className="manage-label" htmlFor="admin-token">
              访问令牌
            </label>
            <input
              id="admin-token"
              className="input"
              type="password"
              autoComplete="current-password"
              value={adminTokenDraft}
              onChange={(event) => setAdminTokenDraft(event.target.value)}
              placeholder="输入 viewer / editor / admin 对应令牌"
            />
            <p className="muted">
              viewer 对应 `ADMIN_VIEW_TOKEN`，editor 对应 `ADMIN_EDITOR_TOKEN`，admin 对应 `ADMIN_TOKEN`。
            </p>
            <div className="button-row">
              <button className="primary" type="submit" disabled={loading}>
                {loading ? "验证中..." : "解锁管理页"}
              </button>
              <button className="primary primary--ghost" type="button" onClick={() => setAdminTokenDraft("")}>
                清空
              </button>
            </div>
            {message ? <p className="muted">{message}</p> : null}
            <div className="history-list">
              {(["viewer", "editor", "admin"] as ManageRole[]).map((role) => (
                <article key={role} className="history-card">
                  <div className="case-card__top">
                    <strong>{roleProfiles[role].label}</strong>
                    <span className={`risk risk--${roleProfiles[role].tone}`}>{roleProfiles[role].label}</span>
                  </div>
                  <p className="muted">{roleProfiles[role].accessSummary}</p>
                </article>
              ))}
            </div>
          </form>
        </section>
      ) : (
        <>
          <section className="panel manage-shell">
            <div className="section-title">
              <div>
                <p className="eyebrow">内部素材管理</p>
                <h2>Knowledge Operations</h2>
              </div>
              <span className="status">
                {loading
                  ? "连接中"
                  : `${roleProfile.label} · ${materialSource === "backend" ? "后端素材" : materialSource === "local" ? "本地回退" : "已解锁"}`}
              </span>
            </div>

            <p className="muted">
              这里管理内部 RAG 素材：案例、法源、司法解释和重庆本地程序材料。支持粘贴或上传 CSV/JSON，首页不会全量展示这些内容。
            </p>

            <div className="manage-card">
              <div className="section-title">
                <div>
                  <p className="eyebrow">当前身份</p>
                  <h2>{roleProfile.label}</h2>
                </div>
                <span className={`risk risk--${roleProfile.tone}`}>{roleProfile.label}</span>
              </div>
              <p className="muted">{roleProfile.accessSummary}</p>
              <div className="manage-stats">
                <span className="status">可读：{roleProfile.readable.join("、")}</span>
              </div>
              <div className="manage-stats">
                <span className="status">可编辑：{roleProfile.editable.length ? roleProfile.editable.join("、") : "无"}</span>
              </div>
              <div className="manage-stats">
                <span className="status">不可操作：{roleProfile.blocked.length ? roleProfile.blocked.join("、") : "无"}</span>
              </div>
            </div>

            <div className="prompt-row material-tabs">
              <button className={`chip ${mode === "knowledge" ? "chip--active" : ""}`} type="button" onClick={() => setMode("knowledge")}>
                知识文档
              </button>
              <button className={`chip ${mode === "cases" ? "chip--active" : ""}`} type="button" onClick={() => setMode("cases")}>
                案例素材
              </button>
            </div>

            <div className="manage-grid">
              <div className="manage-card">
                <label className="manage-label" htmlFor="draft">
                  {mode === "knowledge" ? "粘贴知识文档 CSV/JSON" : "粘贴案例 CSV/JSON"}
                </label>
                <textarea
                  id="draft"
                  className="textarea"
                  rows={16}
                  value={mode === "knowledge" ? knowledgeDraft : caseDraft}
                  onChange={(event) =>
                    mode === "knowledge" ? setKnowledgeDraft(event.target.value) : setCaseDraft(event.target.value)
                  }
                />
                <p className="muted">
                  {mode === "knowledge"
                    ? "知识文档 CSV 表头：title,category,region,year,summary,content,sourceUrl,sourceLabel,tags,isActive。tags 可用竖线、分号、顿号或中文逗号分隔；未填 id 时会自动生成稳定 ID。"
                    : "案例 CSV 表头：title,scenario,district,year,summary,holding,sourceUrl,sourceLabel,tags。tags 可用竖线、分号、顿号或中文逗号分隔；未填 id 时会自动生成稳定 ID。"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="sr-only"
                  onChange={handleFileImport}
                />
                <div className="button-row">
                  <button className="primary" type="button" onClick={mode === "knowledge" ? importKnowledgeFromText : importCasesFromText} disabled={!canEditMaterials}>
                    {mode === "knowledge" ? "导入知识文档" : "导入案例"}
                  </button>
                  <button className="primary primary--ghost" type="button" onClick={() => fileInputRef.current?.click()} disabled={!canEditMaterials}>
                    上传 CSV/JSON 文件
                  </button>
                  <button className="primary primary--ghost" type="button" onClick={mode === "knowledge" ? clearLocalKnowledgeCache : clearImportedCases} disabled={!canEditMaterials}>
                    {mode === "knowledge" ? "清空本地知识缓存" : "清空自定义案例"}
                  </button>
                  <button className="primary primary--ghost" type="button" onClick={() => void loadMaterials()}>
                    重新连接
                  </button>
                  <button className="primary primary--ghost" type="button" onClick={() => lockManage("已退出管理页。")}>
                    退出
                  </button>
                </div>
                {!canEditMaterials ? <p className="muted">当前身份不可编辑素材，相关按钮已禁用。</p> : null}
                {message ? <p className="muted">{message}</p> : null}
              </div>

              <div className="manage-card">
                <label className="manage-label" htmlFor="query">
                  搜索
                </label>
                <input
                  id="query"
                  className="input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="标题、摘要、地区、标签"
                />

                {mode === "cases" ? (
                  <>
                    <label className="manage-label" htmlFor="scenario">
                      场景
                    </label>
                    <select
                      id="scenario"
                      className="input"
                      value={scenario}
                      onChange={(event) => setScenario(event.target.value as (typeof scenarios)[number])}
                    >
                      <option value="all">全部</option>
                      <option value="wage_arrears">拖欠工资</option>
                      <option value="unlawful_termination">违法解除</option>
                      <option value="no_written_contract">未签合同</option>
                      <option value="overtime">加班工时</option>
                      <option value="labor_relation">劳动关系认定</option>
                      <option value="social_insurance">社会保险</option>
                      <option value="work_injury">工伤待遇</option>
                      <option value="female_protection">女职工保护</option>
                      <option value="non_compete">竞业限制</option>
                      <option value="pay_benefits">工资福利/休假</option>
                      <option value="mixed">混合争议</option>
                    </select>
                    <div className="manage-stats">
                      <span className="status">案例总数 {cases.length}</span>
                      <span className="status">命中 {filteredCases.length}</span>
                      <span className="status">自定义 {cases.filter((item) => item.isCustom).length}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="manage-label" htmlFor="category">
                      素材类型
                    </label>
                    <select
                      id="category"
                      className="input"
                      value={category}
                      onChange={(event) => setCategory(event.target.value as (typeof categories)[number])}
                    >
                      <option value="all">全部</option>
                      <option value="law">法律规范</option>
                      <option value="judicial_interpretation">司法解释</option>
                      <option value="local_case">重庆典型案例</option>
                      <option value="procedure">重庆程序</option>
                      <option value="policy">重庆政策</option>
                    </select>
                    <label className="manage-label" htmlFor="active">
                      状态
                    </label>
                    <select
                      id="active"
                      className="input"
                      value={activeFilter}
                      onChange={(event) => setActiveFilter(event.target.value as (typeof activeFilters)[number])}
                    >
                      <option value="all">全部</option>
                      <option value="active">启用</option>
                      <option value="inactive">停用</option>
                    </select>
                    <div className="manage-stats">
                      <span className="status">文档总数 {docs.length}</span>
                      <span className="status">命中 {filteredDocs.length}</span>
                      <span className="status">启用 {docs.filter((item) => item.isActive !== false).length}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="panel manage-results">
            {mode === "cases" ? (
              <div className="case-list">
                {filteredCases.map((item) => (
                  <article key={item.id} className="case-card">
                    <div className="case-card__top">
                      <strong>{item.title}</strong>
                      <span>
                        {item.year} · {item.scenarioLabel}
                      </span>
                    </div>
                    <p>{item.summary}</p>
                    <p className="muted">{item.holding}</p>
                    <div className="case-actions">
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                        {item.sourceLabel}
                      </a>
                      {item.isCustom ? (
                      <button type="button" className="link-button" onClick={() => deleteCase(item.id)} disabled={!canEditMaterials}>
                          删除
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="case-list">
                {filteredDocs.map((item) => (
                  <article key={item.id} className="case-card">
                    <div className="case-card__top">
                      <strong>{item.title}</strong>
                      <span>
                        {item.year} · {item.categoryLabel ?? categoryLabel(item.category)}
                      </span>
                    </div>
                    <p>{item.summary}</p>
                    <div className="tag-row">
                      <span className={`risk ${item.isActive === false ? "risk--high" : "risk--low"}`}>
                        {item.isActive === false ? "停用" : "启用"}
                      </span>
                      <span className="risk">{item.region}</span>
                      {item.tags.map((tag) => (
                        <span className="tag" key={`${item.id}-${tag}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="case-actions">
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                        {item.sourceLabel}
                      </a>
                      <button type="button" className="link-button" onClick={() => deleteKnowledgeDoc(item.id)} disabled={!canEditMaterials}>
                        停用/删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel manage-results">
            <div className="section-title">
              <div>
                <p className="eyebrow">产品化看板</p>
                <h2>上线运营状态</h2>
              </div>
              <span
                className={`risk ${
                  operationalSummary.launchState === "可上线"
                    ? "risk--low"
                    : operationalSummary.launchState === "可灰度"
                      ? "risk--medium"
                      : "risk--high"
                }`}
              >
                {operationalSummary.launchState}
              </span>
            </div>

            <div className="manage-card">
              <div className="manage-stats">
                <span className="status">Provider {operationalSummary.provider}</span>
                <span className="status">Model {operationalSummary.model}</span>
                <span className="status">生产健康 {health?.ok ? "正常" : "待确认"}</span>
                <span className="status">生产评测 {qualitySignals.productionEvalState}</span>
                <span className="status">低置信 {qualitySignals.lowConfidenceCount}</span>
                <span className="status">人工复核 {qualitySignals.manualReviewCount}</span>
                <span className="status">反馈 {operationalSummary.feedbackTotal}</span>
                <span className="status">反馈有用率 {formatPercent(operationalSummary.helpfulRate)}</span>
                <span className="status">高风险 {operationalSummary.highRiskCount}</span>
                <span className="status">未识别 {operationalSummary.unknownCount}</span>
              </div>
              <p className="muted">{operationalSummary.launchReason}</p>
              <p className="muted">最新运营信号：{operationalSummary.latestAt}</p>
              <div className="tag-row">
                {operationalSummary.signals.map((signal) => (
                  <span className="tag" key={signal}>
                    {signal}
                  </span>
                ))}
              </div>
              <p className="muted">建议下一步：{operationalSummary.nextStep}</p>
              <div className="button-row">
                <button
                  className="primary primary--ghost"
                  type="button"
                  onClick={() => {
                    void Promise.all([loadHealth(), loadRuntime(), loadHistory(), loadFeedbackSummary(), loadEvalQuality()]);
                  }}
                >
                  刷新运营信号
                </button>
                <button className="primary primary--ghost" type="button" onClick={() => exportOperationalSnapshot("markdown")} disabled={!canAdminOperate}>
                  导出运营 Markdown
                </button>
                <button className="primary primary--ghost" type="button" onClick={() => exportOperationalSnapshot("json")} disabled={!canAdminOperate}>
                  导出运营 JSON
                </button>
              </div>
              <p className="muted">
                健康：{healthSource === "backend" && health?.ok ? "正常" : healthSource === "unavailable" ? "不可用" : "等待"} ·
                运行态：{runtimeSource === "backend" ? "后端" : runtimeSource === "unavailable" ? "不可用" : "等待"} ·
                历史：{historySource === "backend" ? "后端" : historySource === "unavailable" ? "不可用" : "等待"} ·
                反馈：{feedbackSummary && feedbackSummary.source !== "unavailable" ? "后端" : feedbackSummary?.source === "unavailable" ? "不可用" : "等待"} ·
                评测：{evalQuality?.source === "backend" ? "后端报告" : evalQuality?.source === "unavailable" ? "不可用" : "等待"}
              </p>
            </div>

            <div className="manage-card">
              <div className="section-title">
                <div>
                  <p className="eyebrow">评测门禁</p>
                  <h2>Quality Gate</h2>
                </div>
                <span
                  className={`risk ${
                    qualitySignals.productionEvalState === "通过"
                      ? "risk--low"
                      : qualitySignals.productionEvalState === "需复核"
                        ? "risk--medium"
                        : "risk--high"
                  }`}
                >
                  {evalQualityLoading
                    ? "加载中"
                    : qualitySignals.productionEvalState}
                </span>
              </div>
              <div className="manage-stats">
                <span className="status">生产评测 {qualitySignals.productionEvalState}</span>
                <span className="status">评测样本 {qualitySignals.evaluatedTotal}</span>
                <span className="status">低置信 {qualitySignals.lowConfidenceCount}</span>
                <span className="status">人工复核 {qualitySignals.manualReviewCount}</span>
                <span className="status">阻断 {qualitySignals.failedCount}</span>
                <span className="status">
                  通过 {evalQuality?.source === "backend" ? `${evalQuality.productionEval?.passed ?? evalQuality.qualityGate.passed}/${evalQuality.productionEval?.total ?? evalQuality.qualityGate.total}` : "暂无"}
                </span>
                <span className="status">
                  通过率 {evalQuality?.source === "backend" ? formatPercent(evalQuality.productionEval?.passRate ?? evalQuality.qualityGate.passRate) : "暂无"}
                </span>
                <span className="status">
                  复盘 {evalQuality?.source === "backend" ? evalQuality.productionEval?.reviewQueueCount ?? evalQuality.qualityGate.reviewQueueCount : 0}
                </span>
                <span className="status">
                  Shadow {evalQuality?.source === "backend" ? evalQuality.shadowGate?.deepseekStatus ?? "未生成" : "暂无"}
                </span>
                <span className="status">
                  差异 {evalQuality?.source === "backend" ? evalQuality.shadowGate?.differenceCount ?? 0 : 0}
                </span>
                <span className="status">
                  Release {evalQuality?.source === "backend" ? evalQuality.releaseCheck?.status ?? "未生成" : "暂无"}
                </span>
                <span className="status">
                  改写样本 {evalQuality?.source === "backend" ? evalQuality.adaptedInputReview?.summary.total ?? "未生成" : "暂无"}
                </span>
                <span className="status">
                  追问缺口 {evalQuality?.source === "backend" ? evalQuality.adaptedInputReview?.summary.warningCounts.missing_follow_up_questions ?? 0 : 0}
                </span>
              </div>
              <p className="muted">生产评测：{qualitySignals.productionEvalReason}</p>
              <p className="muted">人工复核建议：{qualitySignals.nextAction}</p>
              <div className="tag-row">
                {qualitySignals.signals.map((signal) => (
                  <span className="tag" key={signal}>
                    {signal}
                  </span>
                ))}
              </div>
              <p className="muted">
                基础质量门禁来自 `npm run evals:quality`，生产级评测来自 `npm run evals:production-report`，改写样本复盘来自 `npm run evals:adapted-review`。后台只展示评分和复盘摘要，不展示原始案情或内部推理链。
              </p>
              {evalQuality?.source === "backend" && evalQuality.releaseCheck ? (
                <p className="muted">
                  发布门禁：{evalQuality.releaseCheck.passedCount}/{evalQuality.releaseCheck.totalCount} 项通过 ·
                  密钥扫描：{evalQuality.releaseCheck.secretScanPassed ? "通过" : "失败"} ·
                  耗时 {evalQuality.releaseCheck.durationSeconds}s
                </p>
              ) : null}
              {evalQuality?.source === "backend" && evalQuality.adaptedInputReview ? (
                <p className="muted">
                  50 条改写输入：安全通过 {evalQuality.adaptedInputReview.summary.safeCount}/{evalQuality.adaptedInputReview.summary.total} ·
                  警告 {evalQuality.adaptedInputReview.summary.warningCount} ·
                  追问缺口 {evalQuality.adaptedInputReview.summary.warningCounts.missing_follow_up_questions ?? 0} ·
                  复盘 {evalQuality.adaptedInputReview.summary.reviewQueueCount} ·
                  状态 {evalQuality.adaptedInputReview.status}
                </p>
              ) : null}
              <div className="history-list">
                {evalQuality?.source === "backend" && evalQuality.productionReviewQueue.length ? (
                  evalQuality.productionReviewQueue.slice(0, 4).map((item) => (
                    <article key={`production-${item.caseId}`} className="history-card">
                      <div className="case-card__top">
                        <strong>{item.caseId}</strong>
                        <span>{item.handoffRequired ? "人工复核" : item.priority}</span>
                      </div>
                      <p className="muted">{item.recommendation}</p>
                      <div className="tag-row">
                        <span className="tag">{item.category}</span>
                        {hasLowConfidenceSignal([item.category, ...item.failedDimensions, ...item.handoffReasons]) ? (
                          <span className="risk risk--medium">低置信</span>
                        ) : null}
                        {item.failedDimensions.slice(0, 2).map((dimension) => (
                          <span className="tag" key={`${item.caseId}-${dimension}`}>
                            {dimension}
                          </span>
                        ))}
                        {item.handoffReasons.slice(0, 3).map((reason) => (
                          <span className="tag" key={`${item.caseId}-${reason}`}>
                            {reason}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))
                ) : (
                  <article className="history-card">
                    <strong>暂无复盘队列</strong>
                    <p className="muted">运行 `npm run evals:production-report` 后会自动生成生产样本的低置信与人工复核复盘队列。</p>
                  </article>
                )}
              </div>
              {evalQuality?.source === "backend" && evalQuality.adaptedInputReview?.reviewQueue.length ? (
                <div className="history-list">
                  {evalQuality.adaptedInputReview.reviewQueue.slice(0, 4).map((item) => (
                    <article key={`adapted-${item.caseId}`} className="history-card">
                      <div className="case-card__top">
                        <strong>{item.caseId}</strong>
                        <span>{item.priority}</span>
                      </div>
                      <p className="muted">{item.recommendation}</p>
                      <div className="tag-row">
                        <span className="tag">{item.scenarioLabel}</span>
                        <span className="tag">{item.category}</span>
                        {hasLowConfidenceSignal([...item.warnings, ...item.qualityFlags]) ? (
                          <span className="risk risk--medium">低置信</span>
                        ) : null}
                        {item.failures.slice(0, 2).map((failure) => (
                          <span className="risk risk--high" key={`${item.caseId}-${failure}`}>
                            {failure}
                          </span>
                        ))}
                        {item.warnings.slice(0, 2).map((warning) => (
                          <span className="tag" key={`${item.caseId}-${warning}`}>
                            {warning}
                          </span>
                        ))}
                        {item.qualityFlags.slice(0, 2).map((flag) => (
                          <span className="tag" key={`${item.caseId}-${flag}`}>
                            {flag}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              <div className="button-row">
                <button className="primary primary--ghost" type="button" onClick={() => void loadEvalQuality()} disabled={!canAdminOperate}>
                  刷新质量门禁
                </button>
              </div>
              {!canAdminOperate ? <p className="muted">当前身份可查看质量摘要，但刷新质量门禁仅 admin 可操作。</p> : null}
              {evalQualityMessage ? <p className="muted">{evalQualityMessage}</p> : null}
            </div>

            <div className="section-title">
              <div>
                <p className="eyebrow">运行监控</p>
                <h2>History &amp; Trace</h2>
              </div>
              <span className="status">
                {historyLoading
                  ? "加载中"
                  : historySource === "backend"
                    ? "后端历史"
                    : historySource === "unavailable"
                      ? "历史不可用"
                      : "等待历史"}
              </span>
            </div>

            <p className="muted">
              这里记录最近的内部分析轨迹，只给管理员查看，用于复盘三 agent 的检索质量、风险等级和质量标记。
            </p>

            <div className="manage-card">
              <div className="section-title">
                <div>
                  <p className="eyebrow">生产健康</p>
                  <h2>Healthz</h2>
                </div>
                <span className={`risk ${health?.ok ? "risk--low" : "risk--high"}`}>
                  {healthLoading
                    ? "加载中"
                    : healthSource === "backend" && health?.ok
                      ? "生产正常"
                      : healthSource === "unavailable"
                        ? "健康不可用"
                        : "等待健康"}
                </span>
              </div>
              <div className="manage-stats">
                <span className="status">API {health?.ok ? "OK" : "暂无"}</span>
                <span className="status">DB {health?.databaseReachable ? "可达" : "未确认"}</span>
                <span className="status">案例 {health?.caseCount ?? 0}</span>
                <span className="status">启用法源 {health?.activeKnowledgeDocCount ?? 0}</span>
                <span className="status">反馈 {health?.feedbackCount ?? 0}</span>
                <span className="status">审计 {health?.auditLogCount ?? 0}</span>
                <span className="status">Provider {health?.providerMode ?? "暂无"}</span>
                <span className="status">Key {health?.apiKeyConfigured ? "已配置" : "未配置"}</span>
                <span className="status">检查 {health?.checkedAt ? formatHistoryTime(health.checkedAt) : "暂无"}</span>
              </div>
              <p className="muted">
                健康检查只展示 API、数据库可达性、素材计数和脱敏数据库标签：{health?.databaseLabel ?? "暂无"}。
              </p>
              <div className="button-row">
                <button className="primary primary--ghost" type="button" onClick={() => void loadHealth()}>
                  刷新生产健康
                </button>
              </div>
              {healthMessage ? <p className="muted">{healthMessage}</p> : null}
            </div>

            <div className="manage-card">
              <div className="section-title">
                <div>
                  <p className="eyebrow">运行态摘要</p>
                  <h2>Runtime</h2>
                </div>
                <span className="status">
                  {runtimeLoading
                    ? "加载中"
                    : runtimeSource === "backend"
                      ? "后端运行态"
                      : runtimeSource === "unavailable"
                        ? "运行态不可用"
                        : "等待运行态"}
                </span>
              </div>
              <div className="manage-stats">
                <span className="status">
                  Provider {runtime?.providerMode ?? "暂无"}
                </span>
                <span className="status">
                  Model {runtime?.model ?? "暂无"}
                </span>
                <span className="status">
                  超时 {runtime?.timeoutSeconds ?? "暂无"}s
                </span>
              </div>
              <p className="muted">
                Key：{runtime ? (runtime.apiKeyConfigured ? "已配置" : "未配置") : "暂无"} ·
                本地回退：{runtime ? (runtime.localFallbackEnabled ? "是" : "否") : "暂无"} ·
                权限：{formatManageRole(currentRole)}
              </p>
              <div className="tag-row">
                {runtime?.agentLabels.length ? (
                  runtime.agentLabels.slice(0, 3).map((label) => (
                    <span className="tag" key={label}>
                      {label}
                    </span>
                  ))
                ) : (
                  <span className="status">暂无 agent 标签</span>
                )}
              </div>
              <div className="button-row">
                <button className="primary primary--ghost" type="button" onClick={() => void loadRuntime()}>
                  刷新运行状态
                </button>
              </div>
              {runtimeMessage ? <p className="muted">{runtimeMessage}</p> : null}
            </div>

            <div className="manage-card">
              <div className="section-title">
                <div>
                  <p className="eyebrow">用户反馈</p>
                  <h2>Feedback Loop</h2>
                </div>
                <span className="status">{feedbackLoading ? "加载中" : feedbackSummary?.source === "unavailable" ? "反馈不可用" : "反馈统计"}</span>
              </div>
              <div className="manage-stats">
                <span className="status">总量 {feedbackSummary?.total ?? 0}</span>
                <span className="status">有用 {feedbackSummary?.helpfulCount ?? 0}</span>
                <span className="status">需改进 {feedbackSummary?.unhelpfulCount ?? 0}</span>
                <span className="status">有用率 {formatPercent(feedbackSummary?.helpfulRate ?? 0)}</span>
              </div>
              <p className="muted">
                这里用于上线后持续复盘：优先处理“需要改进”的反馈，再决定补案例、调检索权重或收紧审校规则。
              </p>
              <div className="history-list">
                {feedbackSummary?.recentItems.length ? (
                  feedbackSummary.recentItems.slice(0, 3).map((item) => (
                    <article key={item.id} className="history-card">
                      <div className="case-card__top">
                        <strong>{item.helpful ? "有用" : "需要改进"}</strong>
                        <span>{formatHistoryTime(item.createdAt)}</span>
                      </div>
                      <p className="muted">{item.comment}</p>
                    </article>
                  ))
                ) : (
                  <article className="history-card">
                    <strong>暂无备注反馈</strong>
                    <p className="muted">有备注的反馈会出现在这里，方便直接转化为评测样本或素材补充任务。</p>
                  </article>
                )}
              </div>
              <div className="button-row">
                <button className="primary primary--ghost" type="button" onClick={() => void loadFeedbackSummary()}>
                  刷新反馈
                </button>
              </div>
              {feedbackMessage ? <p className="muted">{feedbackMessage}</p> : null}
            </div>

            <div className="manage-card">
              <div className="section-title">
                <div>
                  <p className="eyebrow">审计日志</p>
                  <h2>Audit Trail</h2>
                </div>
                <span className="status">{auditLoading ? "加载中" : auditLogs?.source === "unavailable" ? "审计不可用" : "最近动作"}</span>
              </div>
              <p className="muted">
                管理页读写、素材导入删除、历史和反馈查看都会留下动作记录，便于上线后排查误操作和权限使用。
              </p>
              <div className="history-list">
                {auditLogs?.items.length ? (
                  auditLogs.items.slice(0, 4).map((item) => (
                    <article key={item.id} className="history-card">
                      <div className="case-card__top">
                        <strong>{item.action}</strong>
                        <span>{formatHistoryTime(item.createdAt)}</span>
                      </div>
                      <div className="tag-row">
                        <span className="tag">{item.resource}</span>
                        <span className="tag">{item.actorRole === "read" ? "只读" : "可写"}</span>
                        <span className="tag">{item.outcome}</span>
                      </div>
                      {item.detail ? <p className="muted">{item.detail}</p> : null}
                    </article>
                  ))
                ) : (
                  <article className="history-card">
                    <strong>暂无审计记录</strong>
                    <p className="muted">刷新运行态、历史或素材后会自动产生审计记录。</p>
                  </article>
                )}
              </div>
              <div className="button-row">
                <button className="primary primary--ghost" type="button" onClick={() => void loadAuditLogs()}>
                  刷新审计
                </button>
              </div>
              {auditMessage ? <p className="muted">{auditMessage}</p> : null}
            </div>

            <div className="manage-grid">
              <div className="manage-card">
                <div className="manage-stats">
                  <span className="status">记录 {historySummary.total}</span>
                  <span className="status">高风险 {historySummary.highRisk}</span>
                  <span className="status">未识别 {historySummary.unknown}</span>
                  <span className="status">低置信 {historySummary.lowConfidence}</span>
                </div>
                <p className="muted">最近更新时间：{historySummary.latestAt}</p>
                <p className="muted">
                  Provider：{historySummary.providerModes.length ? historySummary.providerModes.join("、") : "暂无"} ·
                  Model：{historySummary.models.length ? historySummary.models.join("、") : "暂无"} ·
                  质量标记优先展示可操作的缺失、回退和命中情况。
                </p>
                <div className="tag-row">
                  {historySummary.qualityFlags.length ? (
                    historySummary.qualityFlags.map((flag) => (
                      <span className="tag" key={flag}>
                        {flag}
                      </span>
                    ))
                  ) : (
                    <span className="status">暂无质量标记</span>
                  )}
                </div>
                <div className="button-row">
                  <button className="primary primary--ghost" type="button" onClick={() => void loadHistory()}>
                    刷新历史
                  </button>
                </div>
                {historyMessage ? <p className="muted">{historyMessage}</p> : null}
              </div>

              <div className="history-list">
                {history.length ? (
                  history.slice(0, 5).map((item) => (
                    <article key={item.id} className="history-card">
                      <div className="case-card__top">
                        <strong>{item.extraction.scenarioLabel}</strong>
                        <span>{formatHistoryTime(item.createdAt)}</span>
                      </div>
                      <p className="muted">{truncateText(item.input, 96)}</p>
                      <div className="tag-row">
                        <span className={`risk risk--${item.review.riskLevel}`}>{riskLabel(item.review.riskLevel)}</span>
                        <span className={item.extraction.confidence < 0.7 ? "risk risk--medium" : "tag"}>
                          置信度 {formatPercent(item.extraction.confidence)}
                        </span>
                        <span className="tag">{item.trace.agentCount} agents</span>
                        <span className="tag">{item.trace.providerMode}</span>
                        <span className="tag">{item.trace.model}</span>
                        <span className="tag">{item.trace.citationCount} 引用</span>
                      </div>
                      <p className="muted">
                        质量标记：{item.trace.qualityFlags.length ? item.trace.qualityFlags.join("；") : "无"}
                      </p>
                    </article>
                  ))
                ) : (
                  <article className="history-card">
                    <strong>暂无分析历史</strong>
                    <p className="muted">
                      历史面板会在每次分析后更新，用于复盘风险等级、命中素材和三 agent 的执行质量。
                    </p>
                  </article>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function resolveManageRole(runtime: RuntimeStatus | null): ManageRole {
  if (runtime?.accessRole) {
    return runtime.accessRole;
  }

  return runtime?.accessLevel === "write" ? "admin" : "viewer";
}

function formatManageRole(role: ManageRole) {
  if (role === "admin") {
    return "管理员";
  }
  if (role === "editor") {
    return "协作者";
  }
  return "只读";
}

function readFallbackCases(): LocalCase[] {
  try {
    const stored = window.localStorage.getItem(caseStorageKey);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as unknown;
    if (
      !Array.isArray(parsed) ||
      !parsed.every((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string")
    ) {
      window.localStorage.removeItem(caseStorageKey);
      return [];
    }
    return parsed as LocalCase[];
  } catch {
    try {
      window.localStorage.removeItem(caseStorageKey);
    } catch {
      // Storage can be unavailable in locked-down browser contexts.
    }
    return [];
  }
}

function writeFallbackCases(cases: LocalCase[]) {
  try {
    window.localStorage.setItem(caseStorageKey, JSON.stringify(cases));
  } catch {
    // Keep the UI usable even when localStorage quota or permissions fail.
  }
}

function readFallbackKnowledgeDocs(): KnowledgeDocDraft[] {
  try {
    const stored = window.localStorage.getItem(knowledgeStorageKey);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as unknown;
    if (
      !Array.isArray(parsed) ||
      !parsed.every((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string")
    ) {
      window.localStorage.removeItem(knowledgeStorageKey);
      return [];
    }
    return parsed as KnowledgeDocDraft[];
  } catch {
    try {
      window.localStorage.removeItem(knowledgeStorageKey);
    } catch {
      // Storage can be unavailable in locked-down browser contexts.
    }
    return [];
  }
}

function writeFallbackKnowledgeDocs(docs: KnowledgeDocDraft[]) {
  try {
    window.localStorage.setItem(knowledgeStorageKey, JSON.stringify(docs));
  } catch {
    // Keep the UI usable even when localStorage quota or permissions fail.
  }
}

function mergeCaseLists(primary: LocalCase[], secondary: LocalCase[]): LocalCase[] {
  const map = new Map<string, LocalCase>();
  for (const item of primary) {
    map.set(item.id, item);
  }
  for (const item of secondary) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function mergeKnowledgeDocs(primary: KnowledgeDoc[], secondary: KnowledgeDoc[]): KnowledgeDoc[] {
  const map = new Map<string, KnowledgeDoc>();
  for (const item of primary) {
    map.set(item.id, { ...item, categoryLabel: item.categoryLabel ?? categoryLabel(item.category) });
  }
  for (const item of secondary) {
    if (!map.has(item.id)) {
      map.set(item.id, { ...item, categoryLabel: item.categoryLabel ?? categoryLabel(item.category) });
    }
  }
  return Array.from(map.values());
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function formatHistoryTime(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function latestSignalTime(...values: Array<string | undefined>) {
  const latestTimestamp = Math.max(
    ...values
      .map((value) => (value ? Date.parse(value) : Number.NaN))
      .filter((timestamp) => Number.isFinite(timestamp))
  );

  if (!Number.isFinite(latestTimestamp)) {
    return "暂无";
  }

  return formatHistoryTime(new Date(latestTimestamp).toISOString());
}

function hasLowConfidenceSignal(values: string[]) {
  return values.some((value) => /低置信|未识别|缺少|missing|unknown|follow_up/i.test(value));
}

function renderOperationalSnapshotMarkdown(snapshot: {
  generatedAt: string;
  launchState: string;
  launchReason: string;
  nextStep: string;
  health: {
    status: string;
    ok: boolean;
    databaseReachable: boolean;
    caseCount: number;
    activeKnowledgeDocCount: number;
    feedbackCount: number;
    auditLogCount: number;
    providerMode: string;
    model: string;
    apiKeyConfigured: boolean;
    databaseLabel: string;
  } | null;
  runtime: {
    providerMode: string;
    model: string;
    accessRole?: string;
    accessLevel?: string;
    timeoutSeconds: number;
    apiKeyConfigured: boolean;
    localFallbackEnabled: boolean;
    agentCount: number;
    agentLabels: string[];
    database?: string;
  } | null;
  feedback: {
    total: number;
    helpfulCount: number;
    unhelpfulCount: number;
    helpfulRate: number;
  } | null;
  historySummary: {
    total: number;
    highRisk: number;
    unknown: number;
    lowConfidence: number;
    latestAt: string;
    qualityFlags: string[];
  };
  qualitySignals: {
    productionEvalState: string;
    productionEvalReason: string;
    passRate: number;
    evaluatedTotal: number;
    lowConfidenceCount: number;
    manualReviewCount: number;
    failedCount: number;
    shadowDifferenceCount: number;
    shadowWarningCount: number;
    releaseBlockerCount: number;
    generatedAt: string;
    nextAction: string;
    signals: string[];
  };
  recentAuditActions: Array<{
    createdAt: string;
    action: string;
    resource: string;
    actorRole: string;
    outcome: string;
  }>;
  disclosure: string;
}) {
  const lines = [
    "# 重庆劳动法助手运营快照",
    "",
    `生成时间：${snapshot.generatedAt}`,
    `上线状态：${snapshot.launchState}`,
    `判断原因：${snapshot.launchReason}`,
    `下一步：${snapshot.nextStep}`,
    "",
    "## 生产健康",
    snapshot.health
      ? `- 状态：${snapshot.health.status}，DB：${snapshot.health.databaseReachable ? "可达" : "不可达"}，案例：${snapshot.health.caseCount}，启用法源：${snapshot.health.activeKnowledgeDocCount}`
      : "- 暂无健康检查数据",
    snapshot.health
      ? `- Provider：${snapshot.health.providerMode}，Model：${snapshot.health.model}，Key：${snapshot.health.apiKeyConfigured ? "已配置" : "未配置"}`
      : null,
    snapshot.health ? `- 数据库：${snapshot.health.databaseLabel}` : null,
    "",
    "## 运行态",
    snapshot.runtime
      ? `- Provider：${snapshot.runtime.providerMode}，Model：${snapshot.runtime.model}，Agent：${snapshot.runtime.agentCount}，超时：${snapshot.runtime.timeoutSeconds}s`
      : "- 暂无运行态数据",
    snapshot.runtime ? `- 角色：${snapshot.runtime.accessRole ?? "未知"}，权限：${snapshot.runtime.accessLevel ?? "未知"}，本地回退：${snapshot.runtime.localFallbackEnabled ? "是" : "否"}` : null,
    "",
    "## 反馈与历史",
    snapshot.feedback
      ? `- 反馈总量：${snapshot.feedback.total}，有用率：${formatPercent(snapshot.feedback.helpfulRate)}，需改进：${snapshot.feedback.unhelpfulCount}`
      : "- 暂无反馈统计",
    `- 历史记录：${snapshot.historySummary.total}，高风险：${snapshot.historySummary.highRisk}，未识别：${snapshot.historySummary.unknown}，低置信：${snapshot.historySummary.lowConfidence}，最近：${snapshot.historySummary.latestAt}`,
    `- 质量标记：${snapshot.historySummary.qualityFlags.length ? snapshot.historySummary.qualityFlags.join("；") : "暂无"}`,
    "",
    "## 生产评测",
    `- 状态：${snapshot.qualitySignals.productionEvalState}，通过率：${formatPercent(snapshot.qualitySignals.passRate)}，总量：${snapshot.qualitySignals.evaluatedTotal}`,
    `- 低置信：${snapshot.qualitySignals.lowConfidenceCount}，人工复核：${snapshot.qualitySignals.manualReviewCount}，失败：${snapshot.qualitySignals.failedCount}`,
    `- Shadow 差异：${snapshot.qualitySignals.shadowDifferenceCount}，警告：${snapshot.qualitySignals.shadowWarningCount}，发布阻断：${snapshot.qualitySignals.releaseBlockerCount}`,
    `- 评测时间：${snapshot.qualitySignals.generatedAt}`,
    `- 下一步：${snapshot.qualitySignals.nextAction}`,
    "",
    "## 最近审计动作",
    ...(snapshot.recentAuditActions.length
      ? snapshot.recentAuditActions.map((item) => `- ${formatHistoryTime(item.createdAt)} ${item.action} ${item.resource} ${item.actorRole} ${item.outcome}`)
      : ["- 暂无审计动作"]),
    "",
    "## 导出边界",
    snapshot.disclosure,
  ];

  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function downloadTextFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function riskLabel(level: AnalysisHistoryItem["review"]["riskLevel"]) {
  if (level === "high") return "高风险";
  if (level === "medium") return "中风险";
  return "低风险";
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function categoryLabel(category: string) {
  if (category === "law") return "法律规范";
  if (category === "judicial_interpretation") return "司法解释";
  if (category === "local_case") return "重庆典型案例";
  if (category === "procedure") return "重庆程序";
  if (category === "policy") return "重庆政策";
  return category;
}
