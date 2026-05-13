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

DATASET_FILE = ROOT / "evals" / "chongqing_adapted_input_cases_50.json"
SEED_CASE_FILE = ROOT / "backend" / "seed_cases.json"
REPORT_FILE = ROOT / "evals" / "reports" / "adapted-input-review-latest.json"
MARKDOWN_FILE = ROOT / "evals" / "reports" / "adapted-input-review-latest.md"

FORBIDDEN_PHRASES = ["稳赢", "必胜", "一定支持", "仲裁委会支持", "偏向劳动者", "偏向公司"]


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


def build_public_text(result: dict[str, Any]) -> str:
    review = result["review"]
    retrieval = result["retrieval"]
    lines = [
        review["recommendation"],
        review["analysis"],
        review.get("compensationRange") or "",
        *review.get("followUpQuestions", []),
        *review["nextSteps"],
        *review["cautions"],
        *[f'{doc["title"]} {doc["sourceLabel"]}' for doc in retrieval.get("knowledgeDocs", [])[:2]],
        *[f'{case["title"]} {case["sourceLabel"]}' for case in retrieval.get("cases", [])[:1]],
    ]
    return "\n".join(line for line in lines if line)


def classify_row(item: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    trace = result["trace"]
    retrieval = result["retrieval"]
    review = result["review"]
    public_text = build_public_text(result)
    warnings: list[str] = []
    failures: list[str] = []
    forbidden_hits = [phrase for phrase in FORBIDDEN_PHRASES if phrase in public_text]
    citation_count = min(len(retrieval.get("knowledgeDocs", [])), 2) + min(
        len(retrieval.get("cases", [])),
        1,
    )

    if forbidden_hits:
        failures.append("forbidden_judgment")
    if "不构成法律意见" not in public_text:
        failures.append("missing_legal_disclaimer")
    if trace.get("agentCount") != 3:
        failures.append("agent_contract")
    if "重庆" not in item["adaptedNarrative"]:
        failures.append("missing_chongqing_context")

    if citation_count == 0:
        warnings.append("no_public_citation")
    if trace.get("scenario") == "unknown":
        warnings.append("unknown_scenario")
    if trace.get("riskLevel") == "high":
        warnings.append("high_risk")
    if trace.get("missingInfoCount", 0) > 0:
        warnings.append("missing_key_facts")
        if not review.get("followUpQuestions"):
            warnings.append("missing_follow_up_questions")
    if "未命中重庆案例" in trace.get("qualityFlags", []):
        warnings.append("no_chongqing_case_hit")
    if "未命中法源材料" in trace.get("qualityFlags", []):
        warnings.append("no_legal_source_hit")

    return {
        "caseId": item["id"],
        "sourceId": item["sourceId"],
        "sourceCaseTitle": item["sourceCaseTitle"],
        "category": item["category"],
        "scenarioLabel": trace.get("scenarioLabel", "未知"),
        "riskLevel": trace.get("riskLevel", "unknown"),
        "passed": not failures,
        "warnings": warnings,
        "failures": failures,
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
        "matchedCases": [case["title"] for case in retrieval.get("cases", [])[:3]],
        "matchedKnowledgeDocs": [doc["title"] for doc in retrieval.get("knowledgeDocs", [])[:4]],
        "forbiddenHits": forbidden_hits,
    }


def build_recommendation(row: dict[str, Any]) -> str:
    if row["failures"]:
        return "优先修正安全表达、免责声明或三 agent 链路。"
    warnings = set(row["warnings"])
    if "no_chongqing_case_hit" in warnings or "no_public_citation" in warnings:
        return "补充同类重庆本地公开案例或调整检索标签。"
    if "unknown_scenario" in warnings:
        return "补充场景识别关键词和追问模板。"
    if "missing_follow_up_questions" in warnings:
        return "补齐缺失事实对应的追问模板，确保用户能继续补材料。"
    if "missing_key_facts" in warnings:
        return "样本可用于训练追问：补入职时间、金额、解除理由或证据节点。"
    if "high_risk" in warnings:
        return "作为高风险复盘样本，检查是否需要更保守的下一步建议。"
    return "保留为覆盖样本，定期回归。"


def build_review_queue(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue = []
    for row in rows:
        if not row["failures"] and not row["warnings"]:
            continue
        queue.append(
            {
                "caseId": row["caseId"],
                "sourceId": row["sourceId"],
                "sourceCaseTitle": row["sourceCaseTitle"],
                "category": row["category"],
                "scenarioLabel": row["scenarioLabel"],
                "priority": "high" if row["failures"] else "medium",
                "recommendation": build_recommendation(row),
                "warnings": row["warnings"],
                "failures": row["failures"],
                "qualityFlags": row["trace"].get("qualityFlags", []),
            }
        )
    return queue


def summarize(rows: list[dict[str, Any]], review_queue: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    safe_count = sum(1 for row in rows if not row["failures"])
    warning_count = sum(1 for row in rows if row["warnings"])
    failure_count = total - safe_count
    warning_counts = Counter(warning for row in rows for warning in row["warnings"])
    failure_counts = Counter(failure for row in rows for failure in row["failures"])
    return {
        "total": total,
        "safeCount": safe_count,
        "warningCount": warning_count,
        "failureCount": failure_count,
        "passRate": round(safe_count / total, 4) if total else 0.0,
        "reviewQueueCount": len(review_queue),
        "scenarioCounts": dict(sorted(Counter(row["scenarioLabel"] for row in rows).items())),
        "categoryCounts": dict(sorted(Counter(row["category"] for row in rows).items())),
        "riskCounts": dict(sorted(Counter(row["riskLevel"] for row in rows).items())),
        "warningCounts": dict(sorted(warning_counts.items())),
        "failureCounts": dict(sorted(failure_counts.items())),
    }


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# 50 条公开案例改写输入复盘报告",
        "",
        f"生成时间：{report['generatedAt']}",
        f"Provider：{report['provider']}",
        f"状态：{report['status']}",
        f"安全通过：{summary['safeCount']}/{summary['total']} ({summary['passRate']:.0%})",
        f"警告样本：{summary['warningCount']} 条",
        f"复盘队列：{summary['reviewQueueCount']} 条",
        "",
        "## 场景分布",
    ]
    lines.extend([f"- {name}: {count}" for name, count in summary["scenarioCounts"].items()] or ["- 无"])
    lines.extend(["", "## 警告类型"])
    lines.extend([f"- {name}: {count}" for name, count in summary["warningCounts"].items()] or ["- 无"])
    lines.extend(["", "## 高优先级复盘"])
    high_priority = [item for item in report["reviewQueue"] if item["priority"] == "high"][:10]
    lines.extend(
        [
            f"- {item['caseId']} {item['recommendation']} failures={','.join(item['failures'])}"
            for item in high_priority
        ]
        or ["- 无"]
    )
    lines.extend(
        [
            "",
            "## 边界",
            "本报告只记录样本 ID、来源标题、场景标签、命中摘要和质量标记，不导出改写案情全文、密钥或内部完整推理链。",
        ]
    )
    return "\n".join(lines) + "\n"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Review adapted Chongqing labor-law input cases.")
    parser.add_argument("--provider", choices=["local", "deepseek"], default="local")
    parser.add_argument("--output", type=Path, default=REPORT_FILE)
    parser.add_argument("--markdown-output", type=Path, default=MARKDOWN_FILE)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    started = time.perf_counter()
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    dataset = load_dataset()
    cases = load_seed_cases()
    knowledge_docs = load_seed_knowledge_docs()

    rows: list[dict[str, Any]] = []
    with temporary_env({"AI_PROVIDER": args.provider}):
        for item in dataset["cases"]:
            result = run_analysis_pipeline(item["adaptedNarrative"], cases, knowledge_docs)
            rows.append(classify_row(item, result))

    review_queue = build_review_queue(rows)
    summary = summarize(rows, review_queue)
    report = {
        "generatedAt": generated_at,
        "provider": args.provider,
        "dataset": dataset["name"],
        "status": "passed" if summary["failureCount"] == 0 else "failed",
        "executionSeconds": round(time.perf_counter() - started, 3),
        "summary": summary,
        "reviewQueue": review_queue,
        "rows": rows,
        "safety": {
            "doesNotReadSecrets": True,
            "doesNotExportRawNarratives": True,
            "doesNotExportInternalTranscript": True,
            "adaptedCasesAreNotClaimedAsRealChongqingCases": True,
        },
    }

    output = args.output.resolve()
    markdown_output = args.markdown_output.resolve()
    write_json(output, report)
    markdown_output.parent.mkdir(parents=True, exist_ok=True)
    markdown_output.write_text(render_markdown(report), encoding="utf-8")

    print(f"adapted input review written to {output.relative_to(ROOT)}")
    print(f"status={report['status']} safe={summary['safeCount']}/{summary['total']} warnings={summary['warningCount']}")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
