#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.analysis import LocalCase, load_seed_knowledge_docs, run_analysis_pipeline  # noqa: E402

EVAL_FILE = ROOT / "evals" / "chongqing_labor_eval_cases.json"
SEED_CASE_FILE = ROOT / "backend" / "seed_cases.json"
REPORT_FILE = ROOT / "evals" / "reports" / "quality-gate-latest.json"
MARKDOWN_FILE = ROOT / "evals" / "reports" / "quality-gate-latest.md"
REVIEW_QUEUE_FILE = ROOT / "evals" / "reports" / "review-queue-latest.json"


@contextmanager
def temporary_env(changes: dict[str, str | None]) -> Iterator[None]:
    previous = {key: os.environ.get(key) for key in changes}
    try:
        for key, value in changes.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def load_eval_document(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return (
            {
                "name": path.stem,
                "datasetType": "legacy_array",
                "purpose": "Legacy fixed eval array.",
                "releaseGate": {"requiredPassRate": 1.0},
            },
            raw,
        )
    if isinstance(raw, dict) and isinstance(raw.get("cases"), list):
        return raw, raw["cases"]
    raise ValueError(f"unsupported eval dataset shape: {path}")


def load_seed_cases() -> list[LocalCase]:
    raw = json.loads(SEED_CASE_FILE.read_text(encoding="utf-8"))
    return [
        LocalCase(
            id=item["id"],
            title=item["title"],
            scenario=item["scenario"],
            scenario_label=item["scenario_label"],
            district=item["district"],
            year=item["year"],
            summary=item["summary"],
            holding=item["holding"],
            source_url=item["source_url"],
            source_label=item["source_label"],
            tags=item["tags"],
            is_custom=item.get("is_custom", False),
        )
        for item in raw
    ]


def public_citation_count(retrieval: dict[str, Any]) -> int:
    return min(len(retrieval.get("knowledgeDocs", [])), 2) + min(len(retrieval.get("cases", [])), 1)


def build_public_text(result: dict[str, Any]) -> str:
    review = result["review"]
    retrieval = result["retrieval"]
    lines = [
        review["recommendation"],
        review["analysis"],
        review.get("compensationRange") or "",
        *review["nextSteps"],
        *review["cautions"],
        *[f'{doc["title"]} {doc["sourceLabel"]}' for doc in retrieval.get("knowledgeDocs", [])[:2]],
        *[f'{case["title"]} {case["sourceLabel"]}' for case in retrieval.get("cases", [])[:1]],
    ]
    return "\n".join(line for line in lines if line)


def infer_category(case_id: str) -> str:
    if "adversarial" in case_id:
        return "safety_boundary"
    if "out-of-scope" in case_id:
        return "scope_boundary"
    if "unknown" in case_id:
        return "missing_information"
    if "mixed" in case_id:
        return "mixed_claims"
    if "contract" in case_id:
        return "no_written_contract"
    if "termination" in case_id:
        return "unlawful_termination"
    if "wage" in case_id:
        return "wage_arrears"
    return "general"


def dimension(name: str, passed: bool, detail: str) -> dict[str, Any]:
    return {"name": name, "passed": passed, "detail": detail}


def build_dimension_checks(item: dict[str, Any], result: dict[str, Any]) -> list[dict[str, Any]]:
    extraction = result["extraction"]
    retrieval = result["retrieval"]
    review = result["review"]
    trace = result["trace"]
    public_text = build_public_text(result)
    citation_count = public_citation_count(retrieval)
    required_missing = [phrase for phrase in item["mustContain"] if phrase not in public_text]
    forbidden_present = [phrase for phrase in item.get("mustAvoid", []) if phrase in public_text]
    expected_headline = item.get("expectedHeadlineIncludes")
    expect_compensation = item.get("expectCompensationRange")
    expected_min_confidence = item.get("expectedMinConfidence")
    expected_handoff_required = item.get("expectedHandoffRequired")
    require_follow_up = bool(item.get("requireFollowUp", False))
    has_compensation = bool(review.get("compensationRange"))
    follow_up_count = len(review.get("followUpQuestions", []))

    return [
        dimension(
            "scenario",
            extraction["scenarioLabel"] == item["expectedScenarioLabel"],
            f'{extraction["scenarioLabel"]} vs {item["expectedScenarioLabel"]}',
        ),
        dimension(
            "risk",
            review["riskLevel"] == item["expectedRiskLevel"],
            f'{review["riskLevel"]} vs {item["expectedRiskLevel"]}',
        ),
        dimension(
            "citations",
            citation_count == item["expectedCitationCount"],
            f'{citation_count} vs {item["expectedCitationCount"]}',
        ),
        dimension(
            "headline",
            (expected_headline in review["recommendation"]) if expected_headline else True,
            expected_headline or "not configured",
        ),
        dimension(
            "required_content",
            not required_missing,
            "missing: " + "；".join(required_missing) if required_missing else "ok",
        ),
        dimension(
            "forbidden_content",
            not forbidden_present,
            "present: " + "；".join(forbidden_present) if forbidden_present else "ok",
        ),
        dimension(
            "compensation",
            (has_compensation == bool(expect_compensation)) if expect_compensation is not None else True,
            f"has={has_compensation}, expected={expect_compensation if expect_compensation is not None else 'not configured'}",
        ),
        dimension(
            "confidence_floor",
            (float(review.get("confidence", 0)) >= float(expected_min_confidence))
            if expected_min_confidence is not None
            else True,
            f"confidence={review.get('confidence')}, min={expected_min_confidence if expected_min_confidence is not None else 'not configured'}",
        ),
        dimension(
            "handoff",
            (bool(review.get("handoffRequired")) == bool(expected_handoff_required))
            if expected_handoff_required is not None
            else True,
            f"handoff={review.get('handoffRequired')}, expected={expected_handoff_required if expected_handoff_required is not None else 'not configured'}",
        ),
        dimension(
            "follow_up",
            (follow_up_count > 0) if require_follow_up else True,
            f"followUpQuestions={follow_up_count}, required={require_follow_up}",
        ),
        dimension(
            "local_procedure",
            ("重庆本地程序路径" in public_text) if citation_count else True,
            "requires 重庆本地程序路径 when citations exist",
        ),
        dimension(
            "agent_contract",
            trace.get("agentCount") == 3 and len(trace.get("agentLabels", [])) == 3,
            f'agentCount={trace.get("agentCount")}',
        ),
    ]


def evaluate_case(item: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    checks = build_dimension_checks(item, result)
    failed = [check for check in checks if not check["passed"]]
    trace = result["trace"]
    return {
        "caseId": item["id"],
        "category": item.get("category") or infer_category(item["id"]),
        "segment": item.get("segment", "legacy"),
        "priority": item.get("priority", "p1"),
        "passed": not failed,
        "failedDimensions": [check["name"] for check in failed],
        "checks": checks,
        "trace": {
            "providerMode": trace.get("providerMode"),
            "model": trace.get("model"),
            "scenarioLabel": trace.get("scenarioLabel"),
            "riskLevel": trace.get("riskLevel"),
            "caseCount": trace.get("caseCount"),
            "knowledgeDocCount": trace.get("knowledgeDocCount"),
            "citationCount": trace.get("citationCount"),
            "missingInfoCount": trace.get("missingInfoCount"),
            "qualityFlags": trace.get("qualityFlags", []),
        },
    }


def build_review_queue(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []
    for row in rows:
        quality_flags = row["trace"].get("qualityFlags", [])
        needs_review = (
            not row["passed"]
            or "争议类型未识别" in quality_flags
            or "未命中重庆案例" in quality_flags
            or "未命中法源材料" in quality_flags
        )
        if not needs_review:
            continue

        priority = "high" if not row["passed"] or row.get("priority") == "p0" else "medium"
        if not row["passed"]:
            recommendation = "补评测标签或修规则"
        elif row["category"] in {"safety_boundary", "scope_boundary"}:
            recommendation = "确认拒答边界和安全提示是否稳定"
        elif row["category"] == "missing_information":
            recommendation = "优化追问模板或补充可识别场景"
        else:
            recommendation = "补素材或复盘检索"
        queue.append(
            {
                "caseId": row["caseId"],
                "priority": priority,
                "segment": row.get("segment", "legacy"),
                "category": row["category"],
                "failedDimensions": row["failedDimensions"],
                "qualityFlags": quality_flags,
                "recommendation": recommendation,
            }
        )
    return queue


def summarize(rows: list[dict[str, Any]], review_queue: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    passed = sum(1 for row in rows if row["passed"])
    dimension_failures = Counter(
        dimension_name for row in rows for dimension_name in row["failedDimensions"]
    )
    category_counts = Counter(row["category"] for row in rows)
    category_failures = Counter(row["category"] for row in rows if not row["passed"])
    segment_counts = Counter(row.get("segment", "legacy") for row in rows)
    priority_counts = Counter(row.get("priority", "p1") for row in rows)
    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "passRate": round(passed / total, 4) if total else 0.0,
        "dimensionFailures": dict(sorted(dimension_failures.items())),
        "categoryCounts": dict(sorted(category_counts.items())),
        "categoryFailures": dict(sorted(category_failures.items())),
        "segmentCounts": dict(sorted(segment_counts.items())),
        "priorityCounts": dict(sorted(priority_counts.items())),
        "reviewQueueCount": len(review_queue),
    }


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# 重庆劳动法助手质量门禁报告",
        "",
        f"生成时间：{report['generatedAt']}",
        f"Provider：{report['provider']}",
        f"数据集：{report['dataset']['name']} ({report['dataset']['datasetType']})",
        f"状态：{report['status']}",
        f"通过率：{summary['passed']}/{summary['total']} ({summary['passRate']:.0%})",
        f"复盘队列：{summary['reviewQueueCount']} 条",
        "",
        "## 失败维度",
    ]
    if summary["dimensionFailures"]:
        lines.extend([f"- {name}: {count}" for name, count in summary["dimensionFailures"].items()])
    else:
        lines.append("- 无")

    lines.extend(["", "## 复盘队列"])
    if report["reviewQueue"]:
        lines.extend(
            [
                f"- {item['caseId']} [{item['priority']}] {item['recommendation']}：{','.join(item['failedDimensions']) or 'quality_flags'}"
                for item in report["reviewQueue"]
            ]
        )
    else:
        lines.append("- 无")

    lines.extend(
        [
            "",
            "## 使用边界",
            "本报告只包含评测样本 ID、维度结果和 trace 摘要，不导出用户原始长文本、密钥或内部完整推理链。",
        ]
    )
    return "\n".join(lines) + "\n"


def write_json(path: Path, payload: dict[str, Any] | list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a quality gate report and review queue for labor-law evals.")
    parser.add_argument("--provider", choices=["local", "deepseek"], default="local")
    parser.add_argument("--dataset", type=Path, default=EVAL_FILE)
    parser.add_argument("--output", type=Path, default=REPORT_FILE)
    parser.add_argument("--markdown-output", type=Path, default=MARKDOWN_FILE)
    parser.add_argument("--queue-output", type=Path, default=REVIEW_QUEUE_FILE)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    started = time.perf_counter()
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    dataset_path = args.dataset if args.dataset.is_absolute() else ROOT / args.dataset
    eval_document, eval_cases = load_eval_document(dataset_path)
    cases = load_seed_cases()
    knowledge_docs = load_seed_knowledge_docs()

    rows: list[dict[str, Any]] = []
    with temporary_env({"AI_PROVIDER": args.provider}):
        for item in eval_cases:
            result = run_analysis_pipeline(item["narrative"], cases, knowledge_docs)
            rows.append(evaluate_case(item, result))

    review_queue = build_review_queue(rows)
    summary = summarize(rows, review_queue)
    required_pass_rate = float(eval_document.get("releaseGate", {}).get("requiredPassRate", 1.0))
    status = "passed" if summary["passRate"] >= required_pass_rate and summary["failed"] == 0 else "failed"
    report = {
        "generatedAt": generated_at,
        "provider": args.provider,
        "dataset": {
            "name": eval_document.get("name", dataset_path.stem),
            "datasetType": eval_document.get("datasetType", "unknown"),
            "path": dataset_path.relative_to(ROOT).as_posix(),
            "purpose": eval_document.get("purpose", ""),
            "requiredPassRate": required_pass_rate,
            "caseCount": len(eval_cases),
        },
        "status": status,
        "executionSeconds": round(time.perf_counter() - started, 3),
        "summary": summary,
        "reviewQueue": review_queue,
        "rows": rows,
        "safety": {
            "doesNotReadSecrets": True,
            "doesNotExportRawNarratives": True,
            "doesNotExportInternalTranscript": True,
        },
    }

    output = args.output.resolve()
    markdown_output = args.markdown_output.resolve()
    queue_output = args.queue_output.resolve()
    write_json(output, report)
    write_json(queue_output, review_queue)
    markdown_output.parent.mkdir(parents=True, exist_ok=True)
    markdown_output.write_text(render_markdown(report), encoding="utf-8")

    print(f"quality gate report written to {output.relative_to(ROOT)}")
    print(f"review queue written to {queue_output.relative_to(ROOT)}")
    print(f"status={report['status']} passRate={summary['passRate']:.0%}")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
