from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Scenario = Literal[
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
    "unknown",
]
RiskLevel = Literal["low", "medium", "high"]
ProviderMode = Literal["local", "deepseek"]


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class CaseBase(ApiModel):
    id: str
    title: str
    scenario: Scenario
    scenario_label: str = Field(alias="scenarioLabel")
    district: str
    year: int
    summary: str
    holding: str
    source_url: str = Field(alias="sourceUrl")
    source_label: str = Field(alias="sourceLabel")
    tags: list[str]
    is_custom: bool = Field(default=False, alias="isCustom")


class CaseImportRequest(BaseModel):
    cases: list[CaseBase]


class CaseDeleteResponse(BaseModel):
    deleted: bool


class CaseListResponse(BaseModel):
    cases: list[CaseBase]


class CaseInput(BaseModel):
    narrative: str


class KnowledgeDocBase(ApiModel):
    id: str
    title: str
    category: str
    category_label: str = Field(alias="categoryLabel")
    region: str
    year: int
    summary: str
    source_url: str = Field(alias="sourceUrl")
    source_label: str = Field(alias="sourceLabel")
    tags: list[str]
    is_active: bool = Field(default=True, alias="isActive")


class KnowledgeDocInput(ApiModel):
    id: str
    title: str
    category: str
    region: str
    year: int
    summary: str
    content: str
    source_url: str = Field(alias="sourceUrl")
    source_label: str = Field(alias="sourceLabel")
    tags: list[str]
    is_active: bool = Field(default=True, alias="isActive")


class KnowledgeDocImportRequest(BaseModel):
    docs: list[KnowledgeDocInput]


class KnowledgeDocListResponse(BaseModel):
    docs: list[KnowledgeDocBase]


class ExtractionResult(ApiModel):
    scenario: Scenario
    scenario_label: str = Field(alias="scenarioLabel")
    confidence: float
    facts: list[str]
    timeline: list[str]
    evidence: list[str]
    missing_info: list[str] = Field(alias="missingInfo")
    keywords: list[str]


class RetrievalResult(ApiModel):
    cases: list[CaseBase] = Field(default_factory=list)
    knowledge_docs: list[KnowledgeDocBase] = Field(default_factory=list, alias="knowledgeDocs")
    rationale: list[str] = Field(default_factory=list)
    knowledge_rationale: list[str] = Field(default_factory=list, alias="knowledgeRationale")


class SourceSummary(ApiModel):
    cases: str
    knowledge_docs: str = Field(alias="knowledgeDocs")


class ReviewResult(ApiModel):
    risk_level: RiskLevel = Field(alias="riskLevel")
    confidence: float
    confidence_label: Literal["low", "medium", "high"] = Field(alias="confidenceLabel")
    handoff_required: bool = Field(alias="handoffRequired")
    handoff_reasons: list[str] = Field(default_factory=list, alias="handoffReasons")
    recommendation: str
    analysis: str
    compensation_range: str | None = Field(default=None, alias="compensationRange")
    follow_up_questions: list[str] = Field(default_factory=list, alias="followUpQuestions")
    cautions: list[str]
    next_steps: list[str] = Field(alias="nextSteps")
    source_summary: SourceSummary | None = Field(default=None, alias="sourceSummary")


class TranscriptItem(BaseModel):
    agent: str
    output: str


class TraceSummary(ApiModel):
    provider_mode: ProviderMode = Field(alias="providerMode")
    model: str
    reasoning_effort: str = Field(alias="reasoningEffort")
    tracing_enabled: bool = Field(alias="tracingEnabled")
    agent_count: int = Field(alias="agentCount")
    agent_labels: list[str] = Field(alias="agentLabels")
    scenario: Scenario
    scenario_label: str = Field(alias="scenarioLabel")
    risk_level: RiskLevel = Field(alias="riskLevel")
    confidence: float
    confidence_label: Literal["low", "medium", "high"] = Field(alias="confidenceLabel")
    handoff_required: bool = Field(alias="handoffRequired")
    handoff_reasons: list[str] = Field(default_factory=list, alias="handoffReasons")
    case_count: int = Field(alias="caseCount")
    knowledge_doc_count: int = Field(alias="knowledgeDocCount")
    citation_count: int = Field(alias="citationCount")
    missing_info_count: int = Field(alias="missingInfoCount")
    quality_flags: list[str] = Field(alias="qualityFlags")


class AnalysisResult(BaseModel):
    analysis_id: str | None = Field(default=None, alias="analysisId")
    extraction: ExtractionResult
    retrieval: RetrievalResult
    review: ReviewResult
    transcript: list[TranscriptItem]
    trace: TraceSummary


class AnalysisHistoryItem(ApiModel):
    id: str
    created_at: datetime = Field(alias="createdAt")
    input: str
    extraction: dict
    review: dict
    trace: TraceSummary


class AnalysisHistoryResponse(BaseModel):
    items: list[AnalysisHistoryItem]


class HealthResponse(ApiModel):
    status: Literal["ok", "degraded"]
    ok: bool
    database_reachable: bool = Field(alias="databaseReachable")
    case_count: int = Field(alias="caseCount")
    active_knowledge_doc_count: int = Field(alias="activeKnowledgeDocCount")
    feedback_count: int = Field(alias="feedbackCount")
    audit_log_count: int = Field(alias="auditLogCount")
    provider_mode: ProviderMode = Field(alias="providerMode")
    model: str
    api_key_configured: bool = Field(alias="apiKeyConfigured")
    database_label: str = Field(alias="databaseLabel")


class FeedbackInput(BaseModel):
    analysis_id: str | None = Field(default=None, alias="analysisId")
    helpful: bool
    comment: str | None = None


class FeedbackResponse(BaseModel):
    created: bool


class FeedbackSummaryItem(ApiModel):
    id: str
    created_at: datetime = Field(alias="createdAt")
    analysis_id: str | None = Field(default=None, alias="analysisId")
    helpful: bool
    comment: str | None = None


class FeedbackSummary(ApiModel):
    total: int
    helpful_count: int = Field(alias="helpfulCount")
    unhelpful_count: int = Field(alias="unhelpfulCount")
    helpful_rate: float = Field(alias="helpfulRate")
    recent_items: list[FeedbackSummaryItem] = Field(alias="recentItems")


class RuntimeResponse(ApiModel):
    provider_mode: ProviderMode = Field(alias="providerMode")
    model: str
    reasoning_effort: str = Field(alias="reasoningEffort")
    tracing_enabled: bool = Field(alias="tracingEnabled")
    access_role: str = Field(alias="accessRole")
    access_level: str = Field(alias="accessLevel")
    role: Literal["viewer", "editor", "admin"]
    capabilities: list[str]
    timeout_seconds: int = Field(alias="timeoutSeconds")
    api_key_configured: bool = Field(alias="apiKeyConfigured")
    local_fallback_enabled: bool = Field(alias="localFallbackEnabled")
    agent_count: int = Field(alias="agentCount")
    agent_labels: list[str] = Field(alias="agentLabels")
    database: str


class AuditLogItem(ApiModel):
    id: str
    created_at: datetime = Field(alias="createdAt")
    action: str
    resource: str
    actor_role: str = Field(alias="actorRole")
    outcome: str
    detail: str | None = None


class AuditLogListResponse(ApiModel):
    items: list[AuditLogItem]
