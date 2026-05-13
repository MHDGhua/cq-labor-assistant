#!/usr/bin/env python
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.agent_workflow import load_project_env  # noqa: E402

QUALITY_REPORT = ROOT / "evals" / "reports" / "quality-gate-latest.json"
DEEPSEEK_REPORT = ROOT / "evals" / "reports" / "deepseek-shadow-latest.json"
OUTPUT_REPORT = ROOT / "evals" / "reports" / "model-shadow-gate-latest.json"
OUTPUT_MARKDOWN = ROOT / "evals" / "reports" / "model-shadow-gate-latest.md"


def run_command(args: list[str], env: dict[str, str] | None = None) -> tuple[int, str]:
    completed = subprocess.run(
        args,
        cwd=ROOT,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return completed.returncode, completed.stdout


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def summarize_quality(report: dict[str, Any] | None) -> dict[str, Any]:
    summary = report.get("summary", {}) if report else {}
    return {
        "status": report.get("status") if report else "missing",
        "passRate": summary.get("passRate"),
        "passed": summary.get("passed"),
        "total": summary.get("total"),
        "reviewQueueCount": summary.get("reviewQueueCount"),
    }


def summarize_deepseek(report: dict[str, Any] | None, configured: bool) -> dict[str, Any]:
    if not configured:
        return {
            "status": "skipped",
            "reason": "DEEPSEEK_API_KEY not configured",
            "remoteExecuted": False,
        }
    if not report:
        return {
            "status": "missing",
            "reason": "DeepSeek shadow report missing",
            "remoteExecuted": False,
        }
    remote = report.get("remote", {})
    comparisons = report.get("comparisons", {})
    return {
        "status": report.get("status"),
        "remoteExecuted": report.get("remoteExecuted"),
        "passedCount": remote.get("passedCount"),
        "totalCount": remote.get("totalCount"),
        "warningCount": len(remote.get("warnings") or []),
        "failureCount": len(remote.get("failures") or []),
        "differenceCount": comparisons.get("differenceCount"),
    }


def render_markdown(report: dict[str, Any]) -> str:
    quality = report["qualityGate"]
    deepseek = report["deepseekShadow"]
    lines = [
        "# 模型 Shadow Gate 报告",
        "",
        f"生成时间：{report['generatedAt']}",
        f"状态：{report['status']}",
        "",
        "## 本地质量门禁",
        f"- 状态：{quality['status']}",
        f"- 通过：{quality.get('passed')}/{quality.get('total')}",
        f"- 复盘队列：{quality.get('reviewQueueCount')}",
        "",
        "## DeepSeek Shadow",
        f"- 状态：{deepseek['status']}",
        f"- 执行：{deepseek.get('remoteExecuted')}",
        f"- 通过：{deepseek.get('passedCount', 0)}/{deepseek.get('totalCount', 0)}",
        f"- 差异：{deepseek.get('differenceCount', 0)}",
        f"- Warning：{deepseek.get('warningCount', 0)}",
        "",
        "## 边界",
        "本报告只汇总质量门禁与模型 shadow 指标，不导出密钥、原始案情或内部完整推理链。",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    load_project_env()
    started = time.perf_counter()
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    commands: list[dict[str, Any]] = []

    quality_code, quality_output = run_command([sys.executable, "scripts/eval-quality-gate.py"])
    commands.append({"name": "quality_gate", "exitCode": quality_code, "outputPreview": quality_output[-1200:]})

    deepseek_configured = bool(os.getenv("DEEPSEEK_API_KEY", "").strip())
    deepseek_code = 0
    if deepseek_configured:
        env = os.environ.copy()
        env.setdefault("DEEPSEEK_SHADOW_LIMIT", "2")
        deepseek_code, deepseek_output = run_command([sys.executable, "scripts/deepseek-shadow-eval.py"], env=env)
        commands.append({"name": "deepseek_shadow", "exitCode": deepseek_code, "outputPreview": deepseek_output[-1200:]})
    else:
        commands.append({"name": "deepseek_shadow", "exitCode": 0, "outputPreview": "skipped: DEEPSEEK_API_KEY not configured"})

    quality_report = read_json(QUALITY_REPORT)
    deepseek_report = read_json(DEEPSEEK_REPORT) if deepseek_configured else None
    quality_summary = summarize_quality(quality_report)
    deepseek_summary = summarize_deepseek(deepseek_report, deepseek_configured)
    status = "passed"
    if quality_code != 0 or quality_summary["status"] != "passed":
        status = "failed"
    if deepseek_configured and (deepseek_code != 0 or deepseek_summary["status"] != "passed"):
        status = "failed"

    report = {
        "generatedAt": generated_at,
        "executionSeconds": round(time.perf_counter() - started, 3),
        "status": status,
        "deepseekConfigured": deepseek_configured,
        "qualityGate": quality_summary,
        "deepseekShadow": deepseek_summary,
        "commands": commands,
        "safety": {
            "doesNotExportSecrets": True,
            "doesNotExportRawNarratives": True,
            "deepseekSkippedWithoutKey": True,
        },
    }
    write_json(OUTPUT_REPORT, report)
    OUTPUT_MARKDOWN.write_text(render_markdown(report), encoding="utf-8")
    print(f"model shadow gate report written to {OUTPUT_REPORT.relative_to(ROOT)}")
    print(f"status={status}")
    return 0 if status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
