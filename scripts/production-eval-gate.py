#!/usr/bin/env python
from __future__ import annotations

import json
import os
import sys
from collections import Counter
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.analysis import LocalCase, load_seed_knowledge_docs, run_analysis_pipeline  # noqa: E402

DATASET_FILE = ROOT / "evals" / "chongqing_production_eval_cases.json"
SEED_CASE_FILE = ROOT / "backend" / "seed_cases.json"
REPORT_FILE = ROOT / "evals" / "reports" / "production-eval-latest.json"
QUEUE_FILE = ROOT / "evals" / "reports" / "production-review-queue-latest.json"
MARKDOWN_FILE = ROOT / "evals" / "reports" / "production-eval-latest.md"


@contextmanager
def temporary_env(changes: dict[str, str | None]):
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


def load_dataset() -> dict[str, Any]:
    return json.loads(DATASET_FILE.read_text(encoding="utf-8"))


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
    lines = [
        review["recommendation"],
        review["analysis"],
        review.get("compensationRange") or "",
        *review.get("followUpQuestions", []),
        *review.get("nextSteps", []),
        *review.get("cautions", []),
        *review.get("handoffReasons", []),
    ]
    return "\n".join(line for line in lines if line)


def dimension(name: str, passed: bool, detail: str) -> dict[str, Any]:
    return {"name": name, "passed": passed, "detail": detail}


def evaluate_case(item: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    review = result["review"]
    retrieval = result["retrieval"]
    text = build_public_text(result)
    citation_count = public_citation_count(retrieval)
    missing_required = [phrase for phrase in item["mustContain"] if phrase not in text]
    forbidden_present = [phrase for phrase in item.get("mustAvoid", []) if phrase in text]
    checks = [
        dimension("scenario", result["extraction"]["scenarioLabel"] == item["expectedScenarioLabel"], result["extraction"]["scenarioLabel"]),
        dimension("risk", review["riskLevel"] == item["expectedRiskLevel"], review["riskLevel"]),
        dimension("citations", citation_count == item["expectedCitationCount"], str(citation_count)),
        dimension("confidence_floor", float(review["confidence"]) >= float(item["expectedMinConfidence"]), str(review["confidence"])),
        dimension("handoff_required", bool(review["handoffRequired"]) == bool(item["expectedHandoffRequired"]), str(review["handoffRequired"])),
        dimension("follow_up", (len(review.get("followUpQuestions", [])) > 0) == bool(item["requireFollowUp"]), str(len(review.get("followUpQuestions", [])))),
        dimension("required_content", not missing_required, "；".join(missing_required) if missing_required else "ok"),
        dimension("forbidden_content", not forbidden_present, "；".join(forbidden_present) if forbidden_present else "ok"),
    ]
    failed = [check["name"] for check in checks if not check["passed"]]
    return {
        "caseId": item["id"],
        "category": item.get("category", "general"),
        "passed": not failed,
        "failedDimensions": failed,
        "confidence": review["confidence"],
        "confidenceLabel": review.get("confidenceLabel", "medium"),
        "handoffRequired": bool(review["handoffRequired"]),
        "handoffReasons": list(review.get("handoffReasons", [])),
        "checks": checks,
    }


def build_review_queue(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue = []
    for row in rows:
      if row["passed"] and not row["handoffRequired"] and row["confidence"] >= 0.55:
          continue
      priority = "high" if not row["passed"] or row["confidence"] < 0.55 else "medium"
      recommendation = "补评测标签或收紧回答保护" if not row["passed"] else "进入人工复核队列"
      queue.append(
          {
              "caseId": row["caseId"],
              "priority": priority,
              "category": row["category"],
              "recommendation": recommendation,
              "failedDimensions": row["failedDimensions"],
              "handoffRequired": row["handoffRequired"],
              "handoffReasons": row["handoffReasons"],
          }
      )
    return queue


def summarize(rows: list[dict[str, Any]], review_queue: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    passed = sum(1 for row in rows if row["passed"])
    dimension_failures = Counter(
        dimension_name for row in rows for dimension_name in row["failedDimensions"]
    )
    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "passRate": round(passed / total, 4) if total else 0.0,
        "lowConfidenceCount": sum(1 for row in rows if row["confidence"] < 0.55),
        "handoffCount": sum(1 for row in rows if row["handoffRequired"]),
        "reviewQueueCount": len(review_queue),
        "dimensionFailures": dict(sorted(dimension_failures.items())),
    }


def write_json(path: Path, payload: dict[str, Any] | list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# 生产评测门禁报告",
        "",
        f"生成时间：{report['generatedAt']}",
        f"状态：{report['status']}",
        f"通过率：{summary['passed']}/{summary['total']} ({summary['passRate']:.0%})",
        f"低置信度：{summary['lowConfidenceCount']}",
        f"人工复核：{summary['handoffCount']}",
        f"复盘队列：{summary['reviewQueueCount']}",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    dataset = load_dataset()
    eval_cases = dataset["cases"]
    cases = load_seed_cases()
    knowledge_docs = load_seed_knowledge_docs()
    with temporary_env({"AI_PROVIDER": "local"}):
        rows = [
            evaluate_case(item, run_analysis_pipeline(item["narrative"], cases, knowledge_docs))
            for item in eval_cases
        ]
    review_queue = build_review_queue(rows)
    summary = summarize(rows, review_queue)
    report = {
        "generatedAt": generated_at,
        "provider": "local",
        "status": "passed" if summary["failed"] == 0 else "failed",
        "dataset": {
            "name": dataset["name"],
            "datasetType": dataset["datasetType"],
            "path": DATASET_FILE.relative_to(ROOT).as_posix(),
        },
        "summary": summary,
        "reviewQueue": review_queue,
        "rows": rows,
        "safety": {
            "doesNotReadSecrets": True,
            "doesNotExportRawNarratives": True,
            "doesNotExportInternalTranscript": True,
        },
    }
    write_json(REPORT_FILE, report)
    write_json(QUEUE_FILE, review_queue)
    MARKDOWN_FILE.write_text(render_markdown(report), encoding="utf-8")
    print(f"production eval report written to {REPORT_FILE.relative_to(ROOT)}")
    print(f"status={report['status']} passRate={summary['passRate']:.0%}")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
