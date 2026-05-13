export type Scenario =
  | "wage_arrears"
  | "unlawful_termination"
  | "no_written_contract"
  | "overtime"
  | "labor_relation"
  | "social_insurance"
  | "work_injury"
  | "female_protection"
  | "non_compete"
  | "pay_benefits"
  | "mixed"
  | "unknown";

export interface CaseInput {
  narrative: string;
}

export interface LocalCase {
  id: string;
  title: string;
  scenario: Exclude<Scenario, "unknown">;
  scenarioLabel: string;
  district: string;
  year: number;
  summary: string;
  holding: string;
  sourceUrl: string;
  sourceLabel: string;
  tags: string[];
  isCustom?: boolean;
}

export interface CaseImportDraft extends LocalCase {}

export interface KnowledgeDoc {
  id: string;
  title: string;
  category: "law" | "judicial_interpretation" | "local_case" | "procedure" | "policy" | string;
  categoryLabel?: string;
  region: string;
  year: number;
  summary: string;
  content?: string;
  sourceUrl: string;
  sourceLabel: string;
  tags: string[];
  isActive?: boolean;
  reason?: string;
}

export interface KnowledgeDocDraft extends KnowledgeDoc {
  content: string;
}

export interface ExtractionResult {
  scenario: Scenario;
  scenarioLabel: string;
  confidence: number;
  facts: string[];
  timeline: string[];
  evidence: string[];
  missingInfo: string[];
  keywords: string[];
}

export interface RetrievalResult {
  cases: LocalCase[];
  knowledgeDocs: KnowledgeDoc[];
  rationale: string[];
  knowledgeRationale?: string[];
}

export interface ReviewResult {
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  handoffRequired: boolean;
  handoffReasons: string[];
  recommendation: string;
  analysis: string;
  compensationRange?: string;
  followUpQuestions: string[];
  cautions: string[];
  nextSteps: string[];
  sourceSummary?: {
    cases: string;
    knowledgeDocs: string;
  };
}

export interface TraceSummary {
  providerMode: "local" | "deepseek";
  model: string;
  reasoningEffort: string;
  tracingEnabled: boolean;
  agentCount: number;
  agentLabels: string[];
  scenario: Scenario;
  scenarioLabel: string;
  riskLevel: ReviewResult["riskLevel"];
  confidence: number;
  confidenceLabel: ReviewResult["confidenceLabel"];
  handoffRequired: boolean;
  handoffReasons: string[];
  caseCount: number;
  knowledgeDocCount: number;
  citationCount: number;
  missingInfoCount: number;
  qualityFlags: string[];
}

export interface RuntimeStatus {
  providerMode: "local" | "deepseek";
  model: string;
  reasoningEffort: string;
  tracingEnabled: boolean;
  accessRole?: "viewer" | "editor" | "admin";
  accessLevel?: "viewer" | "editor" | "admin" | "read" | "write";
  role?: "viewer" | "editor" | "admin";
  capabilities?: Array<"read" | "write" | "delete" | "audit">;
  timeoutSeconds: number;
  apiKeyConfigured: boolean;
  localFallbackEnabled: boolean;
  agentCount: number;
  agentLabels: string[];
  database?: string;
}

export interface HealthStatus {
  status: "ok" | "degraded";
  ok: boolean;
  checkedAt: string;
  databaseReachable: boolean;
  caseCount: number;
  activeKnowledgeDocCount: number;
  feedbackCount: number;
  auditLogCount: number;
  providerMode: "local" | "deepseek";
  model: string;
  apiKeyConfigured: boolean;
  databaseLabel: string;
}

export type HealthStatusResponse =
  | (HealthStatus & {
      source: "backend";
      error?: string;
    })
  | {
      status: "degraded";
      ok: false;
      source: "unavailable";
      checkedAt: string;
      databaseReachable: false;
      caseCount: 0;
      activeKnowledgeDocCount: 0;
      feedbackCount: 0;
      auditLogCount: 0;
      providerMode: "local";
      model: "unavailable";
      apiKeyConfigured: false;
      databaseLabel: "unavailable";
      error: string;
    };

export type ManageLaunchState = "可上线" | "可灰度" | "需优化" | "等待数据";

export interface ManageOperationalSummary {
  launchState: ManageLaunchState;
  launchReason: string;
  provider: string;
  model: string;
  helpfulRate: number;
  feedbackTotal: number;
  highRiskCount: number;
  unknownCount: number;
  latestAt: string;
  nextStep: string;
  signals: string[];
}

export type ManageQualitySignalState = "通过" | "需复核" | "阻断" | "等待报告";

export interface ManageQualitySignalSummary {
  productionEvalState: ManageQualitySignalState;
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
}

export interface AnalysisResult {
  analysisId?: string;
  extraction: ExtractionResult;
  retrieval: RetrievalResult;
  review: ReviewResult;
  transcript: Array<{ agent: string; output: string }>;
  trace: TraceSummary;
  statuteWarning?: {
    warning: boolean;
    daysElapsed: number;
    monthsElapsed: number;
    urgency: "medium" | "high";
    message: string;
  };
}

export interface AnalysisHistoryItem {
  id: string;
  createdAt: string;
  input: string;
  extraction: ExtractionResult;
  review: ReviewResult;
  trace: TraceSummary;
}

export interface AnalysisHistoryResponse {
  items: AnalysisHistoryItem[];
  source?: "backend" | "unavailable";
  error?: string;
}

export type RuntimeStatusResponse =
  | (RuntimeStatus & {
      source?: "backend";
      error?: string;
    })
  | {
      source: "unavailable";
      error: string;
    };

export interface PublicCitation {
  title: string;
  label: string;
  url: string;
  kind: "case" | "law" | "procedure" | "policy";
}

export interface PublicAnalysisResponse {
  analysisId?: string;
  headline: string;
  answer: string;
  riskLevel: ReviewResult["riskLevel"];
  confidence: number;
  confidenceLabel: ReviewResult["confidenceLabel"];
  handoffRequired: boolean;
  handoffReasons: string[];
  scenarioLabel: string;
  compensationRange?: string;
  followUpQuestions: string[];
  nextSteps: string[];
  cautions: string[];
  citations: PublicCitation[];
  statuteWarning?: {
    warning: boolean;
    daysElapsed: number;
    monthsElapsed: number;
    urgency: "medium" | "high";
    message: string;
  };
}

export interface PublicReportExport {
  generatedAt: string;
  analysisId?: string;
  headline: string;
  scenarioLabel: string;
  riskLabel: string;
  answer: string;
  compensationRange?: string;
  followUpQuestions: string[];
  nextSteps: string[];
  cautions: string[];
  citations: PublicCitation[];
  disclosure: string;
}

export interface FeedbackSummaryItem {
  id: string;
  createdAt: string;
  analysisId?: string;
  helpful: boolean;
  comment?: string;
}

export interface FeedbackSummaryResponse {
  total: number;
  helpfulCount: number;
  unhelpfulCount: number;
  helpfulRate: number;
  recentItems: FeedbackSummaryItem[];
  source?: "backend" | "unavailable";
  error?: string;
}

export interface AuditLogItem {
  id: string;
  createdAt: string;
  action: string;
  resource: string;
  actorRole: "read" | "write" | string;
  outcome: string;
  detail?: string;
}

export interface AuditLogListResponse {
  items: AuditLogItem[];
  source?: "backend" | "unavailable";
  error?: string;
}

export interface EvalQualityGateSummary {
  generatedAt: string;
  status: string;
  provider: string;
  passRate: number;
  passed: number;
  total: number;
  failed: number;
  reviewQueueCount: number;
  dimensionFailures: Record<string, number>;
}

export interface EvalReviewQueueItem {
  caseId: string;
  priority: string;
  category: string;
  recommendation: string;
  failedDimensions: string[];
  qualityFlags: string[];
}

export interface ProductionEvalSummary {
  generatedAt: string;
  status: string;
  provider: string;
  passRate: number;
  passed: number;
  total: number;
  failed: number;
  lowConfidenceCount: number;
  handoffCount: number;
  reviewQueueCount: number;
  dimensionFailures: Record<string, number>;
}

export interface ProductionEvalQueueItem {
  caseId: string;
  priority: string;
  category: string;
  recommendation: string;
  failedDimensions: string[];
  handoffRequired: boolean;
  handoffReasons: string[];
}

export interface EvalShadowGateSummary {
  generatedAt: string;
  status: string;
  deepseekConfigured: boolean;
  qualityGateStatus: string;
  deepseekStatus: string;
  differenceCount: number;
  warningCount: number;
  failureCount: number;
}

export interface AdaptedInputReviewItem {
  caseId: string;
  sourceId: string;
  sourceCaseTitle: string;
  category: string;
  scenarioLabel: string;
  priority: string;
  recommendation: string;
  warnings: string[];
  failures: string[];
  qualityFlags: string[];
}

export interface AdaptedInputReviewSummary {
  generatedAt: string;
  status: string;
  total: number;
  safeCount: number;
  warningCount: number;
  failureCount: number;
  passRate: number;
  reviewQueueCount: number;
  scenarioCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  warningCounts: Record<string, number>;
  failureCounts: Record<string, number>;
}

export interface AdaptedInputReviewReport {
  generatedAt: string;
  status: string;
  summary: AdaptedInputReviewSummary;
  reviewQueue: AdaptedInputReviewItem[];
}

export interface ReleaseCheckSummary {
  generatedAt: string;
  status: string;
  durationSeconds: number;
  passedCount: number;
  totalCount: number;
  failedChecks: string[];
  secretScanPassed: boolean;
}

export type EvalQualityResponse =
  | {
      source: "backend";
      qualityGate: EvalQualityGateSummary;
      reviewQueue: EvalReviewQueueItem[];
      productionEval: ProductionEvalSummary | null;
      productionReviewQueue: ProductionEvalQueueItem[];
      shadowGate: EvalShadowGateSummary | null;
      adaptedInputReview: AdaptedInputReviewReport | null;
      releaseCheck: ReleaseCheckSummary | null;
      error?: string;
    }
  | {
      source: "unavailable";
      qualityGate: null;
      reviewQueue: [];
      productionEval: null;
      productionReviewQueue: [];
      shadowGate: null;
      adaptedInputReview: null;
      releaseCheck: null;
      error: string;
    };
