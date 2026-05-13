from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .admin_auth import AdminAccessLevel, require_admin_access, role_access_level, role_capabilities
from .agent_workflow import AGENT_TRANSCRIPT_LABELS, get_agent_runtime_config
from .analysis import (
    LocalCase,
    KnowledgeDoc,
    build_extraction,
    build_retrieval,
    build_review,
    build_trace_summary,
    build_transcript,
    load_seed_knowledge_docs,
    run_analysis_pipeline,
)
from .database import Base, SessionLocal, engine, get_session
from .models import AnalysisModel, AuditLogModel, CaseModel, FeedbackModel, KnowledgeDocModel
from .schemas import (
    AuditLogItem,
    AuditLogListResponse,
    AnalysisHistoryItem,
    AnalysisHistoryResponse,
    AnalysisResult,
    CaseBase,
    CaseDeleteResponse,
    CaseImportRequest,
    CaseInput,
    CaseListResponse,
    FeedbackInput,
    FeedbackResponse,
    FeedbackSummary,
    FeedbackSummaryItem,
    HealthResponse,
    KnowledgeDocBase,
    KnowledgeDocImportRequest,
    KnowledgeDocInput,
    KnowledgeDocListResponse,
    RuntimeResponse,
)

ROOT = Path(__file__).resolve().parent
SEED_FILE = ROOT / "seed_cases.json"

app = FastAPI(title="Chongqing Labor Law Assistant API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_seed_cases() -> list[CaseBase]:
    raw = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    return [CaseBase.model_validate(item) for item in raw]


def ensure_case_seed(session: Session) -> None:
    seeded = False
    for item in load_seed_cases():
        if session.get(CaseModel, item.id) is None:
            session.add(
                CaseModel(
                    id=item.id,
                    title=item.title,
                    scenario=item.scenario,
                    scenario_label=item.scenario_label,
                    district=item.district,
                    year=item.year,
                    summary=item.summary,
                    holding=item.holding,
                    source_url=item.source_url,
                    source_label=item.source_label,
                    tags=item.tags,
                    is_custom=item.is_custom,
                )
            )
            seeded = True
    if seeded:
        session.commit()


def ensure_knowledge_seed(session: Session) -> None:
    seeded = False
    for item in load_seed_knowledge_docs():
        if session.get(KnowledgeDocModel, item.id) is None:
            session.add(
                KnowledgeDocModel(
                    id=item.id,
                    title=item.title,
                    category=item.category,
                    region=item.region,
                    year=item.year,
                    summary=item.summary,
                    content=item.content,
                    source_url=item.source_url,
                    source_label=item.source_label,
                    tags=item.tags,
                    is_active=item.is_active,
                )
            )
            seeded = True
    if seeded:
        session.commit()


def knowledge_doc_to_base(row: KnowledgeDocModel) -> KnowledgeDocBase:
    category_label = {
        "law": "法律规范",
        "judicial_interpretation": "司法解释",
        "local_case": "重庆典型案例",
        "procedure": "重庆程序",
        "policy": "重庆政策",
    }.get(row.category, row.category)
    return KnowledgeDocBase(
        id=row.id,
        title=row.title,
        category=row.category,
        categoryLabel=category_label,
        region=row.region,
        year=row.year,
        summary=row.summary,
        sourceUrl=row.source_url,
        sourceLabel=row.source_label,
        tags=row.tags,
        isActive=row.is_active,
    )


def ensure_database_seed(session: Session) -> None:
    ensure_case_seed(session)
    ensure_knowledge_seed(session)


def public_review_payload(review: dict | None) -> dict:
    if not isinstance(review, dict):
        return {}
    payload = {key: value for key, value in review.items() if key != "trace"}
    confidence = payload.get("confidence", 0.5)
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = 0.5
    payload["confidence"] = confidence_value
    payload["confidenceLabel"] = payload.get("confidenceLabel") or (
        "high" if confidence_value >= 0.72 else "medium" if confidence_value >= 0.55 else "low"
    )
    payload["handoffRequired"] = bool(payload.get("handoffRequired", False))
    payload["handoffReasons"] = [str(item) for item in payload.get("handoffReasons", []) if item]
    return payload


def normalize_history_trace(trace: dict | None) -> dict | None:
    if not isinstance(trace, dict):
        return None

    normalized = dict(trace)
    if "model" not in normalized and "openaiModel" in normalized:
        normalized["model"] = normalized.get("openaiModel")
    normalized.pop("openaiModel", None)

    quality_flags = list(normalized.get("qualityFlags") or [])
    if normalized.get("providerMode") not in {"local", "deepseek"}:
        normalized["providerMode"] = "local"
        quality_flags.append("历史trace供应商已归一化")
    normalized["qualityFlags"] = list(dict.fromkeys(str(item) for item in quality_flags))
    confidence = normalized.get("confidence", 0.5)
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = 0.5
    normalized["confidence"] = confidence_value
    normalized["confidenceLabel"] = normalized.get("confidenceLabel") or (
        "high" if confidence_value >= 0.72 else "medium" if confidence_value >= 0.55 else "low"
    )
    normalized["handoffRequired"] = bool(normalized.get("handoffRequired", False))
    normalized["handoffReasons"] = [
        str(item) for item in normalized.get("handoffReasons", []) if item
    ]

    required_keys = {
        "providerMode",
        "model",
        "reasoningEffort",
        "tracingEnabled",
        "agentCount",
        "agentLabels",
        "scenario",
        "scenarioLabel",
        "riskLevel",
        "confidence",
        "confidenceLabel",
        "handoffRequired",
        "handoffReasons",
        "caseCount",
        "knowledgeDocCount",
        "citationCount",
        "missingInfoCount",
        "qualityFlags",
    }
    if any(key not in normalized for key in required_keys):
        return None
    return normalized


def clean_feedback_comment(comment: str | None) -> str | None:
    if comment is None:
        return None
    cleaned = " ".join(comment.replace("\x00", "").split())
    return cleaned[:500] or None


def record_audit_event(
    session: Session,
    *,
    action: str,
    resource: str,
    actor_role: AdminAccessLevel,
    outcome: str = "success",
    detail: str | None = None,
) -> None:
    session.add(
        AuditLogModel(
            id=str(uuid4()),
            created_at=datetime.now(timezone.utc),
            action=action,
            resource=resource,
            actor_role=actor_role,
            outcome=outcome,
            detail=clean_feedback_comment(detail),
        )
    )


def safe_database_label(database_url: str) -> str:
    parsed = urlsplit(database_url)
    if not parsed.scheme:
        return database_url.rsplit("@", 1)[-1]

    safe_netloc = parsed.netloc.rsplit("@", 1)[-1] if parsed.netloc else ""
    if safe_netloc:
        return urlunsplit((parsed.scheme, safe_netloc, parsed.path, "", ""))
    return f"{parsed.scheme}://{parsed.path}"


def collect_health_database_counts(session: Session) -> dict[str, int]:
    return {
        "case_count": session.scalar(select(func.count()).select_from(CaseModel)) or 0,
        "active_knowledge_doc_count": session.scalar(
            select(func.count()).select_from(KnowledgeDocModel).where(KnowledgeDocModel.is_active.is_(True))
        )
        or 0,
        "feedback_count": session.scalar(select(func.count()).select_from(FeedbackModel)) or 0,
        "audit_log_count": session.scalar(select(func.count()).select_from(AuditLogModel)) or 0,
    }


def build_health_response(session: Session) -> HealthResponse:
    config = get_agent_runtime_config()
    database_reachable = True
    try:
        counts = collect_health_database_counts(session)
    except SQLAlchemyError:
        session.rollback()
        database_reachable = False
        counts = {
            "case_count": 0,
            "active_knowledge_doc_count": 0,
            "feedback_count": 0,
            "audit_log_count": 0,
        }

    status = "ok" if database_reachable else "degraded"
    return HealthResponse(
        status=status,
        ok=database_reachable,
        database_reachable=database_reachable,
        case_count=counts["case_count"],
        active_knowledge_doc_count=counts["active_knowledge_doc_count"],
        feedback_count=counts["feedback_count"],
        audit_log_count=counts["audit_log_count"],
        provider_mode=config.provider_mode,
        model=config.model,
        api_key_configured=config.api_key_configured,
        database_label=safe_database_label(os.getenv("DATABASE_URL", "sqlite:///./law.db")),
    )


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        ensure_database_seed(session)


@app.get("/healthz", response_model=HealthResponse)
def healthz(session: Session = Depends(get_session)) -> HealthResponse:
    return build_health_response(session)


@app.get("/health", response_model=HealthResponse)
def health(session: Session = Depends(get_session)) -> HealthResponse:
    return build_health_response(session)


@app.get("/runtime", response_model=RuntimeResponse)
def runtime(
    session: Session = Depends(get_session),
    admin_role: AdminAccessLevel = Depends(require_admin_access("read")),
) -> RuntimeResponse:
    config = get_agent_runtime_config()
    record_audit_event(
        session,
        action="runtime.read",
        resource="runtime",
        actor_role=admin_role,
    )
    session.commit()
    return RuntimeResponse(
        providerMode=config.provider_mode,
        model=config.model,
        reasoningEffort=config.reasoning_effort,
        tracingEnabled=config.tracing_enabled,
        accessRole=admin_role,
        accessLevel=role_access_level(admin_role),
        role=admin_role,
        capabilities=role_capabilities(admin_role),
        timeoutSeconds=config.timeout_seconds,
        apiKeyConfigured=config.api_key_configured,
        localFallbackEnabled=True,
        agentCount=len(AGENT_TRANSCRIPT_LABELS),
        agentLabels=list(AGENT_TRANSCRIPT_LABELS),
        database=safe_database_label(os.getenv("DATABASE_URL", "sqlite:///./law.db")),
    )


@app.get("/cases", response_model=CaseListResponse)
def list_cases(
    query: Annotated[str | None, Query()] = None,
    scenario: Annotated[str | None, Query()] = None,
    session: Session = Depends(get_session),
    _admin: AdminAccessLevel = Depends(require_admin_access("read")),
) -> CaseListResponse:
    ensure_database_seed(session)
    stmt = select(CaseModel).order_by(CaseModel.year.desc(), CaseModel.title.asc())
    rows = session.scalars(stmt).all()
    cases = [
        CaseBase(
            id=row.id,
            title=row.title,
            scenario=row.scenario,
            scenarioLabel=row.scenario_label,
            district=row.district,
            year=row.year,
            summary=row.summary,
            holding=row.holding,
            sourceUrl=row.source_url,
            sourceLabel=row.source_label,
            tags=row.tags,
            isCustom=row.is_custom,
        )
        for row in rows
    ]
    if query:
        q = query.lower()
        cases = [
            item
            for item in cases
            if q in f"{item.title} {item.summary} {item.district} {' '.join(item.tags)}".lower()
        ]
    if scenario and scenario != "all":
        cases = [item for item in cases if item.scenario == scenario]
    record_audit_event(
        session,
        action="cases.read",
        resource="cases",
        actor_role=_admin,
        detail=f"query={query or ''};scenario={scenario or 'all'}",
    )
    session.commit()
    return CaseListResponse(cases=cases)


@app.post("/cases/import", response_model=CaseListResponse)
def import_cases(
    payload: CaseImportRequest,
    session: Session = Depends(get_session),
    admin_role: AdminAccessLevel = Depends(require_admin_access("editor")),
) -> CaseListResponse:
    ensure_database_seed(session)
    for item in payload.cases:
        existing = session.get(CaseModel, item.id)
        if existing is None:
            existing = CaseModel(id=item.id)
        existing.title = item.title
        existing.scenario = item.scenario
        existing.scenario_label = item.scenario_label
        existing.district = item.district
        existing.year = item.year
        existing.summary = item.summary
        existing.holding = item.holding
        existing.source_url = item.source_url
        existing.source_label = item.source_label
        existing.tags = item.tags
        existing.is_custom = True
        session.add(existing)
    record_audit_event(
        session,
        action="cases.import",
        resource="cases",
        actor_role=admin_role,
        detail=f"count={len(payload.cases)}",
    )
    session.commit()
    return list_cases(session=session, _admin=admin_role)


@app.delete("/cases/custom", response_model=CaseDeleteResponse)
def delete_custom_cases(
    session: Session = Depends(get_session),
    admin_role: AdminAccessLevel = Depends(require_admin_access("admin")),
) -> CaseDeleteResponse:
    ensure_database_seed(session)
    session.execute(sql_delete(CaseModel).where(CaseModel.is_custom.is_(True)))
    record_audit_event(
        session,
        action="cases.delete_custom_all",
        resource="cases",
        actor_role=admin_role,
    )
    session.commit()
    return CaseDeleteResponse(deleted=True)


@app.delete("/cases/{case_id}", response_model=CaseDeleteResponse)
def delete_case(
    case_id: str,
    session: Session = Depends(get_session),
    admin_role: AdminAccessLevel = Depends(require_admin_access("admin")),
) -> CaseDeleteResponse:
    row = session.get(CaseModel, case_id)
    if row is None or not row.is_custom:
        raise HTTPException(status_code=404, detail="custom case not found")
    session.delete(row)
    record_audit_event(
        session,
        action="cases.delete",
        resource="cases",
        actor_role=admin_role,
        detail=f"caseId={case_id}",
    )
    session.commit()
    return CaseDeleteResponse(deleted=True)


@app.get("/knowledge-docs", response_model=KnowledgeDocListResponse)
def list_knowledge_docs(
    query: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
    region: Annotated[str | None, Query()] = None,
    active: Annotated[str, Query()] = "all",
    session: Session = Depends(get_session),
    _admin: AdminAccessLevel = Depends(require_admin_access("read")),
) -> KnowledgeDocListResponse:
    ensure_database_seed(session)
    rows = session.scalars(select(KnowledgeDocModel).order_by(KnowledgeDocModel.year.desc(), KnowledgeDocModel.title.asc())).all()
    docs = [knowledge_doc_to_base(row) for row in rows]
    if query:
        q = query.lower()
        docs = [
            item
            for item in docs
            if q in f"{item.title} {item.summary} {item.region} {' '.join(item.tags)} {item.category_label}".lower()
        ]
    if category and category != "all":
        docs = [item for item in docs if item.category == category]
    if region and region != "all":
        docs = [item for item in docs if region.lower() in item.region.lower()]
    if active == "true":
        docs = [item for item in docs if item.is_active]
    elif active == "false":
        docs = [item for item in docs if not item.is_active]
    record_audit_event(
        session,
        action="knowledge.read",
        resource="knowledge_docs",
        actor_role=_admin,
        detail=f"query={query or ''};category={category or 'all'};region={region or 'all'};active={active}",
    )
    session.commit()
    return KnowledgeDocListResponse(docs=docs)


@app.post("/knowledge-docs/import", response_model=KnowledgeDocListResponse)
def import_knowledge_docs(
    payload: KnowledgeDocImportRequest,
    session: Session = Depends(get_session),
    admin_role: AdminAccessLevel = Depends(require_admin_access("editor")),
) -> KnowledgeDocListResponse:
    ensure_database_seed(session)
    for item in payload.docs:
        existing = session.get(KnowledgeDocModel, item.id)
        if existing is None:
            existing = KnowledgeDocModel(id=item.id)
        existing.title = item.title
        existing.category = item.category
        existing.region = item.region
        existing.year = item.year
        existing.summary = item.summary
        existing.content = item.content
        existing.source_url = item.source_url
        existing.source_label = item.source_label
        existing.tags = item.tags
        existing.is_active = item.is_active
        session.add(existing)
    record_audit_event(
        session,
        action="knowledge.import",
        resource="knowledge_docs",
        actor_role=admin_role,
        detail=f"count={len(payload.docs)}",
    )
    session.commit()
    return list_knowledge_docs(session=session, _admin=admin_role)


@app.delete("/knowledge-docs/{doc_id}", response_model=CaseDeleteResponse)
def delete_knowledge_doc(
    doc_id: str,
    session: Session = Depends(get_session),
    admin_role: AdminAccessLevel = Depends(require_admin_access("admin")),
) -> CaseDeleteResponse:
    ensure_database_seed(session)
    row = session.get(KnowledgeDocModel, doc_id)
    if row is None:
        raise HTTPException(status_code=404, detail="knowledge doc not found")
    if row.id in {item.id for item in load_seed_knowledge_docs()}:
        row.is_active = False
        session.add(row)
    else:
        session.delete(row)
    record_audit_event(
        session,
        action="knowledge.delete_or_disable",
        resource="knowledge_docs",
        actor_role=admin_role,
        detail=f"docId={doc_id}",
    )
    session.commit()
    return CaseDeleteResponse(deleted=True)


@app.post("/analyze", response_model=AnalysisResult)
def analyze_case(payload: CaseInput, session: Session = Depends(get_session)) -> AnalysisResult:
    ensure_database_seed(session)
    rows = session.scalars(select(CaseModel)).all()
    cases = [
        LocalCase(
            id=row.id,
            title=row.title,
            scenario=row.scenario,
            scenario_label=row.scenario_label,
            district=row.district,
            year=row.year,
            summary=row.summary,
            holding=row.holding,
            source_url=row.source_url,
            source_label=row.source_label,
            tags=row.tags,
            is_custom=row.is_custom,
        )
        for row in rows
    ]
    knowledge_rows = session.scalars(select(KnowledgeDocModel)).all()
    knowledge_docs = [
        KnowledgeDoc(
            id=row.id,
            title=row.title,
            category=row.category,
            region=row.region,
            year=row.year,
            summary=row.summary,
            content=row.content,
            source_url=row.source_url,
            source_label=row.source_label,
            tags=row.tags,
            is_active=row.is_active,
        )
        for row in knowledge_rows
        if row.is_active
    ]
    result = run_analysis_pipeline(payload.narrative, cases, knowledge_docs)
    extraction = result["extraction"]
    retrieval = result["retrieval"]
    review = result["review"]
    transcript = result["transcript"]
    trace = result["trace"]
    analysis_id = str(uuid4())
    record = AnalysisModel(
        id=analysis_id,
        created_at=datetime.now(timezone.utc),
        input_text=payload.narrative,
        extraction=extraction,
        retrieval=retrieval,
        review={**review, "trace": trace},
        transcript=transcript,
    )
    session.add(record)
    session.commit()
    return AnalysisResult(
        analysisId=analysis_id,
        extraction=extraction,
        retrieval=retrieval,
        review=review,
        transcript=transcript,
        trace=trace,
    )


@app.post("/analyze-stream")
def analyze_case_stream(payload: CaseInput, session: Session = Depends(get_session)):
    ensure_database_seed(session)
    rows = session.scalars(select(CaseModel)).all()
    cases = [
        LocalCase(
            id=row.id,
            title=row.title,
            scenario=row.scenario,
            scenario_label=row.scenario_label,
            district=row.district,
            year=row.year,
            summary=row.summary,
            holding=row.holding,
            source_url=row.source_url,
            source_label=row.source_label,
            tags=row.tags,
            is_custom=row.is_custom,
        )
        for row in rows
    ]
    knowledge_rows = session.scalars(select(KnowledgeDocModel)).all()
    knowledge_docs = [
        KnowledgeDoc(
            id=row.id,
            title=row.title,
            category=row.category,
            region=row.region,
            year=row.year,
            summary=row.summary,
            content=row.content,
            source_url=row.source_url,
            source_label=row.source_label,
            tags=row.tags,
            is_active=row.is_active,
        )
        for row in knowledge_rows
        if row.is_active
    ]

    def event_stream():
        yield _sse_event("stage", {"current": 1, "total": 3, "label": "正在理解你的情况..."})

        extraction = build_extraction(payload.narrative)
        yield _sse_event("extraction_done", {"scenario": extraction["scenarioLabel"]})

        yield _sse_event("stage", {"current": 2, "total": 3, "label": "正在查找相似案例..."})

        retrieval = build_retrieval(extraction, cases, knowledge_docs)
        yield _sse_event("retrieval_done", {
            "caseCount": len(retrieval.get("cases", [])),
            "docCount": len(retrieval.get("knowledgeDocs", [])),
        })

        yield _sse_event("stage", {"current": 3, "total": 3, "label": "正在整理建议..."})

        review = build_review(extraction, retrieval)
        transcript = build_transcript(extraction, retrieval, review)
        trace = build_trace_summary(extraction, retrieval, review, transcript)

        analysis_id = str(uuid4())
        record = AnalysisModel(
            id=analysis_id,
            created_at=datetime.now(timezone.utc),
            input_text=payload.narrative,
            extraction=extraction,
            retrieval=retrieval,
            review={**review, "trace": trace},
            transcript=transcript,
        )
        session.add(record)
        session.commit()

        yield _sse_event("complete", {
            "analysisId": analysis_id,
            "extraction": extraction,
            "retrieval": retrieval,
            "review": review,
            "transcript": transcript,
            "trace": trace,
        })

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _sse_event(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/feedback", response_model=FeedbackResponse)
def create_feedback(payload: FeedbackInput, session: Session = Depends(get_session)) -> FeedbackResponse:
    comment = clean_feedback_comment(payload.comment)
    record = FeedbackModel(
        id=str(uuid4()),
        analysis_id=payload.analysis_id,
        helpful=payload.helpful,
        comment=comment,
        source="home",
    )
    session.add(record)
    session.commit()
    return FeedbackResponse(created=True)


@app.get("/feedback/summary", response_model=FeedbackSummary)
def feedback_summary(
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
    session: Session = Depends(get_session),
    admin_role: AdminAccessLevel = Depends(require_admin_access("read")),
) -> FeedbackSummary:
    rows = session.scalars(select(FeedbackModel).order_by(FeedbackModel.created_at.desc())).all()
    helpful_count = sum(1 for row in rows if row.helpful)
    unhelpful_count = len(rows) - helpful_count
    helpful_rate = round(helpful_count / len(rows), 4) if rows else 0.0
    recent = [
        FeedbackSummaryItem(
            id=row.id,
            createdAt=row.created_at,
            analysisId=row.analysis_id,
            helpful=row.helpful,
            comment=row.comment,
        )
        for row in rows
        if row.comment
    ][:limit]
    record_audit_event(
        session,
        action="feedback.summary",
        resource="feedback",
        actor_role=admin_role,
        detail=f"limit={limit}",
    )
    session.commit()
    return FeedbackSummary(
        total=len(rows),
        helpfulCount=helpful_count,
        unhelpfulCount=unhelpful_count,
        helpfulRate=helpful_rate,
        recentItems=recent,
    )


@app.get("/audit-logs", response_model=AuditLogListResponse)
def audit_logs(
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    session: Session = Depends(get_session),
    admin_role: AdminAccessLevel = Depends(require_admin_access("admin")),
) -> AuditLogListResponse:
    rows = session.scalars(select(AuditLogModel).order_by(AuditLogModel.created_at.desc()).limit(limit)).all()
    record_audit_event(
        session,
        action="audit.read",
        resource="audit_logs",
        actor_role=admin_role,
        detail=f"limit={limit}",
    )
    session.commit()
    return AuditLogListResponse(
        items=[
            AuditLogItem(
                id=row.id,
                createdAt=row.created_at,
                action=row.action,
                resource=row.resource,
                actorRole=row.actor_role,
                outcome=row.outcome,
                detail=row.detail,
            )
            for row in rows
        ]
    )


@app.get("/history", response_model=AnalysisHistoryResponse)
def history(
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    session: Session = Depends(get_session),
    admin_role: AdminAccessLevel = Depends(require_admin_access("read")),
) -> AnalysisHistoryResponse:
    rows = session.scalars(select(AnalysisModel).order_by(AnalysisModel.created_at.desc()).limit(limit)).all()
    items = []
    for row in rows:
        review = public_review_payload(row.review)
        stored_trace = row.review.get("trace") if isinstance(row.review, dict) else None
        trace = normalize_history_trace(stored_trace) or build_trace_summary(
            row.extraction,
            row.retrieval,
            review,
            row.transcript,
        )
        items.append(
            AnalysisHistoryItem(
                id=row.id,
                createdAt=row.created_at,
                input=row.input_text,
                extraction=row.extraction,
                review=review,
                trace=trace,
            )
        )
    record_audit_event(
        session,
        action="history.read",
        resource="analysis_history",
        actor_role=admin_role,
        detail=f"limit={limit}",
    )
    session.commit()
    return AnalysisHistoryResponse(items=items)
