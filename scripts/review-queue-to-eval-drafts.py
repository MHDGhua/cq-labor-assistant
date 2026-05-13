#!/usr/bin/env python
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
QUEUE_FILE = ROOT / "evals" / "reports" / "review-queue-latest.json"
OUTPUT_FILE = ROOT / "evals" / "reports" / "eval-drafts-latest.json"
MARKDOWN_FILE = ROOT / "evals" / "reports" / "eval-drafts-latest.md"


def read_queue() -> list[dict[str, Any]]:
    if not QUEUE_FILE.exists():
        return []
    data = json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else []


def expected_for_category(category: str) -> dict[str, Any]:
    if category in {"safety_boundary", "scope_boundary", "missing_information"}:
        return {
            "expectedScenarioLabel": "未识别场景",
            "expectedRiskLevel": "high",
            "expectedCitationCount": 0,
            "expectCompensationRange": False,
        }
    if category == "wage_arrears":
        return {
            "expectedScenarioLabel": "拖欠工资",
            "expectedRiskLevel": "low",
            "expectedCitationCount": 3,
            "expectCompensationRange": True,
        }
    if category == "unlawful_termination":
        return {
            "expectedScenarioLabel": "违法解除/辞退",
            "expectedRiskLevel": "low",
            "expectedCitationCount": 3,
            "expectCompensationRange": True,
        }
    if category == "no_written_contract":
        return {
            "expectedScenarioLabel": "未签书面劳动合同",
            "expectedRiskLevel": "low",
            "expectedCitationCount": 3,
            "expectCompensationRange": True,
        }
    return {
        "expectedScenarioLabel": "混合争议",
        "expectedRiskLevel": "low",
        "expectedCitationCount": 3,
        "expectCompensationRange": True,
    }


def build_draft(item: dict[str, Any]) -> dict[str, Any]:
    category = str(item.get("category") or "general")
    expected = expected_for_category(category)
    return {
        "id": f"draft-{item.get('caseId', 'unknown')}",
        "sourceCaseId": item.get("caseId"),
        "sourceCategory": category,
        "sourceRecommendation": item.get("recommendation"),
        "narrative": "TODO: 填写匿名化后的用户案情，不包含姓名、电话、身份证号或公司真实名称。",
        "expectedHeadlineIncludes": "TODO",
        "mustContain": ["不构成法律意见"] if category in {"safety_boundary", "scope_boundary"} else ["重庆本地程序路径"],
        "mustAvoid": ["稳赢", "必胜", "一定支持", "仲裁委会支持", "偏向劳动者", "偏向公司"],
        **expected,
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# 评测草稿",
        "",
        f"生成时间：{payload['generatedAt']}",
        f"草稿数：{len(payload['drafts'])}",
        "",
        "这些草稿必须人工匿名化和补全后，才能合并进 `evals/chongqing_labor_eval_cases.json`。",
    ]
    for draft in payload["drafts"]:
        lines.extend(["", f"## {draft['id']}", "", "```json", json.dumps(draft, ensure_ascii=False, indent=2), "```"])
    return "\n".join(lines) + "\n"


def main() -> int:
    queue = read_queue()
    drafts = [build_draft(item) for item in queue]
    payload = {
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceFile": QUEUE_FILE.relative_to(ROOT).as_posix(),
        "drafts": drafts,
        "safety": {
            "requiresManualAnonymization": True,
            "doesNotCopyRawNarratives": True,
            "doesNotReadSecrets": True,
        },
    }
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    MARKDOWN_FILE.write_text(render_markdown(payload), encoding="utf-8")
    print(f"eval drafts written to {OUTPUT_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
