#!/usr/bin/env python
from __future__ import annotations

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
REPORT_FILE = ROOT / "evals" / "reports" / "deepseek-shadow-latest.json"


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


def load_eval_cases() -> list[dict]:
    return json.loads(EVAL_FILE.read_text(encoding="utf-8"))


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


def public_citation_count(retrieval: dict) -> int:
    return min(len(retrieval.get("knowledgeDocs", [])), 2) + min(len(retrieval.get("cases", [])), 1)


def format_issue(issue: dict[str, str]) -> str:
    return f"{issue['caseId']}: {issue['message']}"


def failed_case_count(failures: list[dict[str, str]]) -> int:
    return len({issue["caseId"] for issue in failures})


def result_summary(result: dict) -> dict[str, Any]:
    trace = result["trace"]
    return {
        "providerMode": trace.get("providerMode"),
        "model": trace.get("model"),
        "riskLevel": trace.get("riskLevel"),
        "citationCount": trace.get("citationCount"),
        "qualityFlags": trace.get("qualityFlags", []),
    }


def trace_warnings(case_id: str, result: dict, *, expected_local: bool = False) -> list[dict[str, str]]:
    ignored_flags = {"本地规则引擎回退"} if expected_local else set()
    return [
        {"caseId": case_id, "message": flag}
        for flag in result["trace"].get("qualityFlags", [])
        if flag not in ignored_flags
    ]


def add_comparison_diff(
    comparisons: list[dict[str, Any]],
    *,
    case_id: str,
    field: str,
    local_value: Any,
    remote_value: Any,
) -> None:
    if local_value != remote_value:
        comparisons.append(
            {
                "caseId": case_id,
                "field": field,
                "local": local_value,
                "remote": remote_value,
            }
        )


def summarize_trace_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    citation_values = [
        int(row["citationCount"])
        for row in rows
        if isinstance(row.get("citationCount"), int)
    ]
    citation_distribution = Counter(str(value) for value in citation_values)
    return {
        "runCount": len(rows),
        "providerModes": dict(Counter(str(row.get("providerMode")) for row in rows if row.get("providerMode"))),
        "models": dict(Counter(str(row.get("model")) for row in rows if row.get("model"))),
        "riskLevels": dict(Counter(str(row.get("riskLevel")) for row in rows if row.get("riskLevel"))),
        "citations": {
            "min": min(citation_values) if citation_values else None,
            "max": max(citation_values) if citation_values else None,
            "average": round(sum(citation_values) / len(citation_values), 2) if citation_values else None,
            "distribution": dict(sorted(citation_distribution.items())),
        },
    }


def build_statistics(samples: list[dict[str, Any]]) -> dict[str, Any]:
    local_rows = [sample["local"] for sample in samples if sample.get("local")]
    remote_rows = [sample["remote"] for sample in samples if sample.get("remote")]
    return {
        "allRuns": summarize_trace_rows([*local_rows, *remote_rows]),
        "local": summarize_trace_rows(local_rows),
        "remote": summarize_trace_rows(remote_rows),
    }


def write_report(report: dict[str, Any]) -> None:
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_public_text(review: dict, retrieval: dict) -> str:
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


def evaluate_case(item: dict, result: dict) -> list[str]:
    issues: list[str] = []
    extraction = result["extraction"]
    retrieval = result["retrieval"]
    review = result["review"]
    trace = result["trace"]
    public_text = build_public_text(review, retrieval)

    if extraction["scenarioLabel"] != item["expectedScenarioLabel"]:
        issues.append(f"场景标签不一致: {extraction['scenarioLabel']} != {item['expectedScenarioLabel']}")
    if review["riskLevel"] != item["expectedRiskLevel"]:
        issues.append(f"风险等级不一致: {review['riskLevel']} != {item['expectedRiskLevel']}")
    if public_citation_count(retrieval) != item["expectedCitationCount"]:
        issues.append(
            f"引用数量不一致: {public_citation_count(retrieval)} != {item['expectedCitationCount']}"
        )
    if item["expectedHeadlineIncludes"] not in review["recommendation"]:
        issues.append(f"标题缺少关键短语: {item['expectedHeadlineIncludes']}")
    if "重庆本地程序路径" not in public_text:
        issues.append("缺少重庆本地程序路径")

    for phrase in item["mustContain"]:
        if phrase not in public_text:
            issues.append(f"缺少必须包含项: {phrase}")

    for phrase in item.get("mustAvoid", []):
        if phrase in public_text:
            issues.append(f"出现禁止短语: {phrase}")

    if item["expectCompensationRange"]:
        if not review.get("compensationRange"):
            issues.append("应返回赔付区间但为空")
    elif review.get("compensationRange") is not None:
        issues.append("不应返回赔付区间")

    if trace["agentCount"] != 3:
        issues.append(f"agentCount 异常: {trace['agentCount']}")
    if len(trace["agentLabels"]) != 3:
        issues.append(f"agentLabels 异常: {trace['agentLabels']}")

    return issues


def run_pipeline(narrative: str, *, provider: str, cases: list[LocalCase], knowledge_docs: list) -> dict:
    with temporary_env({"AI_PROVIDER": provider}):
        return run_analysis_pipeline(narrative, cases, knowledge_docs)


def main() -> int:
    started_at = datetime.now().astimezone()
    started = time.perf_counter()
    eval_cases = load_eval_cases()
    limit_raw = os.getenv("DEEPSEEK_SHADOW_LIMIT", "").strip()
    limit: int | None = None
    script_warnings: list[str] = []
    if limit_raw:
        try:
            limit = max(1, int(limit_raw))
            eval_cases = eval_cases[:limit]
        except ValueError:
            warning = f"ignore invalid DEEPSEEK_SHADOW_LIMIT={limit_raw!r}"
            script_warnings.append(warning)
            print(warning)

    seed_cases = load_seed_cases()
    knowledge_docs = load_seed_knowledge_docs()

    local_failures: list[dict[str, str]] = []
    local_warnings: list[dict[str, str]] = []
    remote_failures: list[dict[str, str]] = []
    remote_warnings: list[dict[str, str]] = []
    comparisons: list[dict[str, Any]] = []
    local_results: dict[str, dict] = {}
    sample_reports: dict[str, dict[str, Any]] = {}

    for item in eval_cases:
        local_result = run_pipeline(item["narrative"], provider="local", cases=seed_cases, knowledge_docs=knowledge_docs)
        local_results[item["id"]] = local_result
        local_issues = evaluate_case(item, local_result)
        local_failures.extend({"caseId": item["id"], "message": issue} for issue in local_issues)
        local_warnings.extend(trace_warnings(item["id"], local_result, expected_local=True))
        sample_reports[item["id"]] = {
            "caseId": item["id"],
            "local": result_summary(local_result),
            "remote": None,
            "comparisonDiffs": [],
        }

    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    deepseek_configured = bool(api_key)
    remote_executed = False
    if not deepseek_configured:
        print("DeepSeek shadow skipped: DEEPSEEK_API_KEY not set")
        remote_warnings.append({"caseId": "__shadow__", "message": "DeepSeek key not configured; remote shadow run skipped"})
    else:
        remote_executed = True
        for item in eval_cases:
            local_result = local_results[item["id"]]
            remote_result = run_pipeline(
                item["narrative"],
                provider="deepseek",
                cases=seed_cases,
                knowledge_docs=knowledge_docs,
            )

            remote_issues = evaluate_case(item, remote_result)
            if remote_result["trace"]["providerMode"] != "deepseek":
                remote_issues.append(f"providerMode 异常: {remote_result['trace']['providerMode']}")
            if any("未配置密钥" in flag for flag in remote_result["trace"]["qualityFlags"]):
                remote_issues.append(f"DeepSeek密钥未生效: {remote_result['trace']['qualityFlags']}")

            remote_failures.extend({"caseId": item["id"], "message": issue} for issue in remote_issues)
            remote_warnings.extend(trace_warnings(item["id"], remote_result))

            add_comparison_diff(
                comparisons,
                case_id=item["id"],
                field="scenarioLabel",
                local_value=local_result["extraction"]["scenarioLabel"],
                remote_value=remote_result["extraction"]["scenarioLabel"],
            )
            add_comparison_diff(
                comparisons,
                case_id=item["id"],
                field="riskLevel",
                local_value=local_result["review"]["riskLevel"],
                remote_value=remote_result["review"]["riskLevel"],
            )
            add_comparison_diff(
                comparisons,
                case_id=item["id"],
                field="citationCount",
                local_value=public_citation_count(local_result["retrieval"]),
                remote_value=public_citation_count(remote_result["retrieval"]),
            )
            sample_reports[item["id"]]["remote"] = result_summary(remote_result)
            sample_reports[item["id"]]["comparisonDiffs"] = [
                diff for diff in comparisons if diff["caseId"] == item["id"]
            ]

    local_failed_count = failed_case_count(local_failures)
    remote_failed_count = failed_case_count(remote_failures)

    print(f"local baseline passed for {len(eval_cases) - local_failed_count}/{len(eval_cases)} cases")
    if remote_executed:
        print(f"DeepSeek shadow executed for {len(eval_cases)} cases")

    if comparisons:
        print("comparisons:")
        for item in comparisons:
            print(f"- {item['caseId']}: {item['field']} local={item['local']} remote={item['remote']}")

    if local_warnings or remote_warnings:
        print("warnings:")
        for item in [*local_warnings, *remote_warnings]:
            print(f"- {format_issue(item)}")

    if local_failures:
        print("local failures:")
        for item in local_failures:
            print(f"- {format_issue(item)}")

    if remote_failures:
        print("remote failures:")
        for item in remote_failures:
            print(f"- {format_issue(item)}")

    exit_code = 1 if local_failures or remote_failures else 0
    finished_at = datetime.now().astimezone()
    samples = list(sample_reports.values())
    report = {
        "generatedAt": finished_at.isoformat(timespec="seconds"),
        "startedAt": started_at.isoformat(timespec="seconds"),
        "finishedAt": finished_at.isoformat(timespec="seconds"),
        "executionSeconds": round(time.perf_counter() - started, 3),
        "sampleCount": len(eval_cases),
        "limitApplied": limit,
        "deepseekConfigured": deepseek_configured,
        "remoteExecuted": remote_executed,
        "status": "passed" if exit_code == 0 else "failed",
        "scriptWarnings": script_warnings,
        "local": {
            "passedCount": len(eval_cases) - local_failed_count,
            "totalCount": len(eval_cases),
            "failures": local_failures,
            "warnings": local_warnings,
        },
        "remote": {
            "passedCount": (len(eval_cases) - remote_failed_count) if remote_executed else 0,
            "totalCount": len(eval_cases) if remote_executed else 0,
            "failures": remote_failures,
            "warnings": remote_warnings,
        },
        "comparisons": {
            "differenceCount": len(comparisons),
            "differences": comparisons,
        },
        "statistics": build_statistics(samples),
        "samples": samples,
    }
    write_report(report)
    print(f"machine-readable report written to {REPORT_FILE.relative_to(ROOT)}")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
