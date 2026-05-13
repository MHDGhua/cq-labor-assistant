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
REPORT_FILE = ROOT / "evals" / "reports" / "release-check-latest.json"
MARKDOWN_FILE = ROOT / "evals" / "reports" / "release-check-latest.md"

COMMANDS: list[dict[str, Any]] = [
    {"name": "typescript", "command": "npx tsc --noEmit", "required": True},
    {"name": "fixed_evals", "command": "npm run evals", "required": True},
    {"name": "production_evals", "command": "npm run evals:production", "required": True},
    {"name": "adapted_input_evals", "command": "npm run evals:adapted", "required": True},
    {"name": "adapted_input_review", "command": "npm run evals:adapted-review", "required": True},
    {"name": "quality_gate", "command": "npm run evals:quality", "required": True},
    {"name": "production_eval_report", "command": "npm run evals:production-report", "required": True},
    {"name": "tests", "command": "npm run test:all", "required": True},
    {"name": "build", "command": "npm run build", "required": True},
    {"name": "python_compile", "command": "python -m compileall backend scripts", "required": True},
    {"name": "compose_config", "command": "docker compose config", "required": True},
    {"name": "prod_compose_config", "command": "docker compose -f docker-compose.prod.yml config", "required": True},
]


def run_command(command: str) -> dict[str, Any]:
    started = time.perf_counter()
    completed = subprocess.run(
        command,
        cwd=ROOT,
        shell=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    output = completed.stdout or ""
    return {
        "command": command,
        "exitCode": completed.returncode,
        "durationSeconds": round(time.perf_counter() - started, 3),
        "outputPreview": output[-1600:],
    }


def scan_for_secret_patterns() -> dict[str, Any]:
    candidates = [
        ROOT / ".env.example",
        ROOT / "README.md",
        *sorted((ROOT / "docs").glob("*.md")),
        ROOT / "docker-compose.yml",
        ROOT / "docker-compose.prod.yml",
        ROOT / "deploy" / "Caddyfile",
        *sorted((ROOT / "evals").glob("*.json")),
    ]
    patterns = ("sk-", "DEEPSEEK_API_KEY=sk-", "OPENAI_API_KEY=sk-")
    hits: list[str] = []
    for path in candidates:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for pattern in patterns:
            if pattern in text:
                hits.append(path.relative_to(ROOT).as_posix())
                break
    return {
        "passed": not hits,
        "checkedFiles": [path.relative_to(ROOT).as_posix() for path in candidates if path.exists()],
        "hits": hits,
    }


def _read(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def validate_public_demo_config() -> dict[str, Any]:
    required_files = [
        ".env.example",
        "docker-compose.prod.yml",
        "deploy/Caddyfile",
        "README.md",
        "docs/deployment.md",
        "docs/public-demo.md",
    ]
    missing_files = [item for item in required_files if not (ROOT / item).exists()]

    env_text = _read(ROOT / ".env.example")
    compose_text = _read(ROOT / "docker-compose.prod.yml")
    caddy_text = _read(ROOT / "deploy" / "Caddyfile")
    readme_text = _read(ROOT / "README.md")
    deployment_text = _read(ROOT / "docs" / "deployment.md")
    public_demo_text = _read(ROOT / "docs" / "public-demo.md")
    docs_text = "\n".join([readme_text, deployment_text, public_demo_text])

    checks = [
        {
            "name": "env_public_demo_vars",
            "passed": all(
                token in env_text
                for token in (
                    "SERVER_NAME=",
                    "ADMIN_TOKEN=",
                    "ADMIN_VIEW_TOKEN=",
                    "DEEPSEEK_API_KEY=",
                    "SMOKE_BASE_URL=",
                    "SMOKE_ADMIN_TOKEN=",
                )
            ),
        },
        {
            "name": "prod_compose_public_entrypoint",
            "passed": all(
                token in compose_text
                for token in (
                    "caddy:",
                    "network_mode: host",
                    "SERVER_NAME:",
                    "restart: unless-stopped",
                )
            ),
        },
        {
            "name": "prod_compose_backend_not_public",
            "passed": '"127.0.0.1:8000:8000"' in compose_text or "127.0.0.1:8000:8000" in compose_text,
        },
        {
            "name": "prod_compose_healthz",
            "passed": "/healthz" in compose_text,
        },
        {
            "name": "caddy_uses_domain_and_frontend",
            "passed": "{$SERVER_NAME}" in caddy_text and "reverse_proxy 172.30.0.10:3000" in caddy_text,
        },
        {
            "name": "docs_public_demo_runbook",
            "passed": all(
                token in docs_text
                for token in (
                    "公网",
                    "SERVER_NAME",
                    "ADMIN_TOKEN",
                    "ADMIN_VIEW_TOKEN",
                    "/healthz",
                    "docker compose -f docker-compose.prod.yml",
                    "npm run release:check",
                )
            ),
        },
        {
            "name": "docs_demo_roles",
            "passed": all(token in docs_text for token in ("普通访客", "只读管理员", "可写管理员")),
        },
    ]
    failed = [item["name"] for item in checks if not item["passed"]]
    return {
        "passed": not missing_files and not failed,
        "missingFiles": missing_files,
        "checks": checks,
        "failedChecks": failed,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# 发布门禁报告",
        "",
        f"生成时间：{report['generatedAt']}",
        f"状态：{report['status']}",
        f"耗时：{report['durationSeconds']}s",
        "",
        "## 命令",
    ]
    lines.extend(
        [
            f"- {item['name']}: {item['status']} ({item['durationSeconds']}s)"
            for item in report["checks"]
        ]
    )
    lines.extend(
        [
            "",
            "## 安全检查",
            f"- 示例/文档密钥扫描：{'通过' if report['secretScan']['passed'] else '失败'}",
            "",
            "## 公网演示配置",
            f"- 状态：{'通过' if report['publicDemoConfig']['passed'] else '失败'}",
            f"- 缺失文件：{', '.join(report['publicDemoConfig']['missingFiles']) or '无'}",
            f"- 失败检查：{', '.join(report['publicDemoConfig']['failedChecks']) or '无'}",
            "",
            "## 边界",
            "发布门禁报告只保留命令状态和短输出预览，不导出 `.env.local`、密钥或用户原始输入。",
        ]
    )
    return "\n".join(lines) + "\n"


def write_report(report: dict[str, Any]) -> None:
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    MARKDOWN_FILE.write_text(render_markdown(report), encoding="utf-8")


def main() -> int:
    started = time.perf_counter()
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    checks: list[dict[str, Any]] = []
    for item in COMMANDS:
        result = run_command(item["command"])
        status = "passed" if result["exitCode"] == 0 else "failed"
        checks.append({**item, **result, "status": status})
        print(f"{item['name']}: {status}")
        if item["required"] and result["exitCode"] != 0:
            break

    secret_scan = scan_for_secret_patterns()
    public_demo_config = validate_public_demo_config()
    failed_required = [item for item in checks if item["required"] and item["exitCode"] != 0]
    status = (
        "passed"
        if not failed_required
        and secret_scan["passed"]
        and public_demo_config["passed"]
        and len(checks) == len(COMMANDS)
        else "failed"
    )
    report = {
        "generatedAt": generated_at,
        "durationSeconds": round(time.perf_counter() - started, 3),
        "status": status,
        "checks": checks,
        "secretScan": secret_scan,
        "publicDemoConfig": public_demo_config,
        "safety": {
            "doesNotReadEnvLocal": True,
            "doesNotExportSecrets": True,
            "outputPreviewOnly": True,
            "checksPublicDemoConfig": True,
        },
    }
    write_report(report)
    print(f"release check report written to {REPORT_FILE.relative_to(ROOT)}")
    print(f"status={status}")
    return 0 if status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
