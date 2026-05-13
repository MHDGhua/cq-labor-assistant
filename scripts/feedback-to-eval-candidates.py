#!/usr/bin/env python
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "evals" / "reports" / "feedback-eval-candidates.json"
DEFAULT_SOURCES = [
    ROOT / "evals" / "reports" / "feedback-summary-latest.json",
    ROOT / "evals" / "reports" / "deepseek-shadow-latest.json",
]
MAX_INPUT_BYTES = 2_000_000
MAX_PREVIEW_CHARS = 80
MAX_SIGNAL_CHARS = 120
SENSITIVE_NAME_PATTERN = re.compile(
    r"(^|[-_.])(secret|secrets|token|credential|credentials|api[-_]?key|key)([-_.]|$)",
    re.IGNORECASE,
)
SECRET_MESSAGE_PATTERN = re.compile(r"(api[-_ ]?key|token|secret|credential|密钥)", re.IGNORECASE)
URL_PATTERN = re.compile(r"https?://\S+", re.IGNORECASE)


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("\x00", " ")
    text = URL_PATTERN.sub("[url]", text)
    return " ".join(text.split())


def truncate_text(text: str, limit: int) -> str:
    normalized = normalize_text(text)
    if len(normalized) <= limit:
        return normalized
    return normalized[: max(0, limit - 3)].rstrip() + "..."


def digest_text(text: str) -> str | None:
    normalized = normalize_text(text)
    if not normalized:
        return None
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]
    return f"sha256:{digest}"


def stable_id(prefix: str, parts: list[Any]) -> str:
    raw = json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def display_path(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def reject_sensitive_path(path: Path) -> None:
    name = path.name.lower()
    if name.startswith(".env") or SENSITIVE_NAME_PATTERN.search(name):
        raise ValueError(f"refuse to read sensitive-looking source path: {path}")


def load_json_source(path: Path) -> tuple[dict[str, Any] | list[Any] | None, str | None]:
    reject_sensitive_path(path)
    if not path.exists():
        return None, "source file not found"
    if not path.is_file():
        return None, "source is not a file"
    if path.stat().st_size > MAX_INPUT_BYTES:
        return None, f"source is larger than {MAX_INPUT_BYTES} bytes"

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return None, f"invalid JSON: {exc}"
    return data, None


def is_feedback_summary(data: Any) -> bool:
    return isinstance(data, dict) and "recentItems" in data and (
        "helpfulCount" in data or "unhelpfulCount" in data or "helpfulRate" in data
    )


def is_shadow_report(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    return any(key in data for key in ("local", "remote", "comparisons", "samples")) and (
        "sampleCount" in data or "status" in data or "generatedAt" in data
    )


def infer_workstream(comment: str) -> str:
    lowered = normalize_text(comment).lower()
    if any(word in lowered for word in ("引用", "案例", "法条", "来源", "素材", "citation", "case")):
        return "add_or_adjust_sources"
    if any(word in lowered for word in ("检索", "命中", "不相关", "召回", "retrieval")):
        return "tune_retrieval"
    if any(word in lowered for word in ("稳赢", "保证", "偏向", "法律意见", "guarantee")):
        return "tighten_safety_eval"
    if any(word in lowered for word in ("不准", "错误", "遗漏", "答非所问", "场景", "风险")):
        return "add_regression_eval"
    return "manual_triage"


def blank_eval_template(candidate_id: str, source_label: str) -> dict[str, Any]:
    return {
        "id": f"eval-from-{candidate_id}",
        "narrative": "TODO: fill an anonymized scenario, keep it short, no names/phone/id.",
        "expectedScenarioLabel": "TODO",
        "expectedRiskLevel": "low|high",
        "expectedCitationCount": None,
        "expectedHeadlineIncludes": "TODO",
        "mustContain": [],
        "mustAvoid": [],
        "expectCompensationRange": None,
        "sourceNote": source_label,
    }


def feedback_summary_stats(data: dict[str, Any]) -> dict[str, Any]:
    total = int(data.get("total") or 0)
    helpful = int(data.get("helpfulCount") or 0)
    unhelpful = int(data.get("unhelpfulCount") or 0)
    return {
        "total": total,
        "helpfulCount": helpful,
        "unhelpfulCount": unhelpful,
        "helpfulRate": data.get("helpfulRate", round(helpful / total, 4) if total else 0.0),
        "recentItemCount": len(data.get("recentItems") or []),
    }


def extract_feedback_candidates(data: dict[str, Any], source_file: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    recent_items = data.get("recentItems") or []
    for item in recent_items:
        if not isinstance(item, dict) or item.get("helpful") is not False:
            continue

        comment = normalize_text(item.get("comment"))
        candidate_id = stable_id(
            "feedback",
            [item.get("id"), item.get("analysisId"), item.get("createdAt"), digest_text(comment)],
        )
        preview = truncate_text(comment, MAX_PREVIEW_CHARS)
        workstream = infer_workstream(comment)
        candidates.append(
            {
                "id": candidate_id,
                "sourceType": "feedback_summary",
                "sourceFile": display_path(source_file),
                "priority": "high" if comment else "medium",
                "recommendedWorkstream": workstream,
                "feedback": {
                    "feedbackId": item.get("id"),
                    "analysisId": item.get("analysisId"),
                    "createdAt": item.get("createdAt"),
                    "helpful": False,
                    "commentDigest": digest_text(comment),
                    "commentPreview": preview,
                    "commentPreviewMaxChars": MAX_PREVIEW_CHARS,
                },
                "reason": "recent unhelpful feedback should become a labeled eval or source update",
                "evalCandidateTemplate": blank_eval_template(candidate_id, "negative feedback summary"),
            }
        )

    return candidates, feedback_summary_stats(data)


def safe_signal_message(message: Any) -> str | None:
    text = truncate_text(normalize_text(message), MAX_SIGNAL_CHARS)
    if not text or SECRET_MESSAGE_PATTERN.search(text):
        return None
    return text


def add_issue_signal(grouped: dict[str, list[dict[str, Any]]], kind: str, issue: dict[str, Any]) -> None:
    case_id = str(issue.get("caseId") or "__unknown__")
    message = safe_signal_message(issue.get("message"))
    if not message:
        return
    grouped[case_id].append({"kind": kind, "message": message})


def extract_report_candidates(data: dict[str, Any], source_file: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for section in ("local", "remote"):
        section_data = data.get(section) if isinstance(data.get(section), dict) else {}
        for issue in section_data.get("failures") or []:
            if isinstance(issue, dict):
                add_issue_signal(grouped, f"{section}_failure", issue)
        for issue in section_data.get("warnings") or []:
            if isinstance(issue, dict):
                add_issue_signal(grouped, f"{section}_warning", issue)

    comparisons = data.get("comparisons") if isinstance(data.get("comparisons"), dict) else {}
    for diff in comparisons.get("differences") or []:
        if not isinstance(diff, dict):
            continue
        case_id = str(diff.get("caseId") or "__unknown__")
        field = truncate_text(diff.get("field"), 40)
        local_value = truncate_text(diff.get("local"), 40)
        remote_value = truncate_text(diff.get("remote"), 40)
        if field:
            grouped[case_id].append(
                {
                    "kind": "comparison_difference",
                    "message": f"{field}: local={local_value!r}, remote={remote_value!r}",
                }
            )

    candidates: list[dict[str, Any]] = []
    for case_id, signals in sorted(grouped.items()):
        if not signals:
            continue
        signal_kinds = Counter(signal["kind"] for signal in signals)
        candidate_id = stable_id("report", [source_file.name, case_id, signals])
        candidates.append(
            {
                "id": candidate_id,
                "sourceType": "local_report",
                "sourceFile": display_path(source_file),
                "priority": "high" if any("failure" in key for key in signal_kinds) else "medium",
                "recommendedWorkstream": "add_regression_eval",
                "reportSignal": {
                    "caseId": case_id,
                    "signalKinds": dict(signal_kinds),
                    "signals": signals[:5],
                    "signalLimitApplied": len(signals) > 5,
                },
                "reason": "local report exposed an eval failure, warning, or provider comparison drift",
                "evalCandidateTemplate": blank_eval_template(candidate_id, f"local report signal for {case_id}"),
            }
        )

    stats = {
        "status": data.get("status"),
        "sampleCount": data.get("sampleCount"),
        "differenceCount": comparisons.get("differenceCount", len(comparisons.get("differences") or [])),
        "candidateSignalCaseCount": len(candidates),
    }
    return candidates, stats


def manual_template() -> dict[str, Any]:
    return {
        "id": "eval-from-feedback-TODO",
        "narrative": "TODO: anonymized user scenario, no names/phone/id/full original text.",
        "expectedScenarioLabel": "TODO",
        "expectedRiskLevel": "low|high",
        "expectedCitationCount": None,
        "expectedHeadlineIncludes": "TODO",
        "mustContain": [],
        "mustAvoid": [],
        "expectCompensationRange": None,
    }


def build_report(source_paths: list[Path], limit: int) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    candidates: list[dict[str, Any]] = []
    feedback_stats: list[dict[str, Any]] = []
    report_stats: list[dict[str, Any]] = []
    processed_sources: list[dict[str, Any]] = []

    for path in source_paths:
        try:
            data, warning = load_json_source(path)
        except ValueError as exc:
            warnings.append(str(exc))
            continue
        if warning:
            warnings.append(f"{path}: {warning}")
            continue
        if data is None:
            continue

        if is_feedback_summary(data):
            extracted, stats = extract_feedback_candidates(data, path)
            candidates.extend(extracted)
            feedback_stats.append({"sourceFile": display_path(path), **stats})
            processed_sources.append({"path": display_path(path), "type": "feedback_summary"})
        elif is_shadow_report(data):
            extracted, stats = extract_report_candidates(data, path)
            candidates.extend(extracted)
            report_stats.append({"sourceFile": display_path(path), **stats})
            processed_sources.append({"path": display_path(path), "type": "local_report"})
        else:
            warnings.append(f"{path}: unsupported JSON shape; expected feedback summary or local eval report")

    candidates = sorted(candidates, key=lambda item: (item.get("priority") != "high", item["id"]))[:limit]
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    output = {
        "generatedAt": generated_at,
        "generator": "scripts/feedback-to-eval-candidates.py",
        "safety": {
            "doesNotReadEnvFiles": True,
            "doesNotReadSecrets": True,
            "rawLongTextPolicy": f"comment previews capped at {MAX_PREVIEW_CHARS} chars; full comments are hashed only",
        },
        "sourceFiles": processed_sources,
        "summary": {
            "candidateCount": len(candidates),
            "feedbackSources": feedback_stats,
            "localReportSources": report_stats,
            "warnings": warnings,
        },
        "manualEvalTemplate": manual_template(),
        "candidates": candidates,
        "nextSteps": [
            "Review each candidate and fill evalCandidateTemplate.narrative with an anonymized scenario.",
            "Add the completed cases to evals/chongqing_labor_eval_cases.json or a follow-up eval file.",
            "Run the eval suite again and compare the next local report.",
        ],
    }
    return output, warnings


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Feedback Eval Candidates",
        "",
        f"Generated: {report['generatedAt']}",
        f"Candidates: {report['summary']['candidateCount']}",
        "",
        "## Manual Eval Template",
        "",
        "```json",
        json.dumps(report["manualEvalTemplate"], ensure_ascii=False, indent=2),
        "```",
        "",
        "## Candidates",
    ]
    if not report["candidates"]:
        lines.extend(["", "No candidates were extracted from the provided summary/report files."])
    for item in report["candidates"]:
        lines.extend(
            [
                "",
                f"### {item['id']}",
                "",
                f"- Source: {item['sourceType']} ({item['sourceFile']})",
                f"- Priority: {item['priority']}",
                f"- Workstream: {item['recommendedWorkstream']}",
                f"- Reason: {item['reason']}",
                "",
                "```json",
                json.dumps(item["evalCandidateTemplate"], ensure_ascii=False, indent=2),
                "```",
            ]
        )
    return "\n".join(lines) + "\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert backend feedback summaries or local eval reports into eval candidate templates.",
    )
    parser.add_argument(
        "--source",
        action="append",
        type=Path,
        help="JSON source path. Repeat for multiple feedback summary or local report files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"JSON output path. Default: {DEFAULT_OUTPUT.relative_to(ROOT)}",
    )
    parser.add_argument(
        "--markdown-output",
        type=Path,
        help="Optional Markdown output path with the same candidate templates.",
    )
    parser.add_argument("--limit", type=int, default=20, help="Maximum candidates to write.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    source_paths = args.source or [path for path in DEFAULT_SOURCES if path.exists()]
    if not source_paths:
        source_paths = DEFAULT_SOURCES

    report, warnings = build_report([path.resolve() for path in source_paths], max(1, args.limit))
    output_path = args.output.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.markdown_output:
        markdown_path = args.markdown_output.resolve()
        markdown_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_path.write_text(render_markdown(report), encoding="utf-8")

    print(f"feedback eval candidates written to {display_path(output_path)}")
    if warnings:
        print("warnings:")
        for warning in warnings:
            print(f"- {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
