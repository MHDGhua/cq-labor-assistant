from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

ProviderMode = Literal["local", "deepseek"]

DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro"
DEFAULT_REASONING_EFFORT = "medium"
DEFAULT_DEEPSEEK_TIMEOUT_SECONDS = 45
# Backward-compatible alias for old tests/docs. New code should use DEFAULT_DEEPSEEK_MODEL.
DEFAULT_OPENAI_MODEL = DEFAULT_DEEPSEEK_MODEL
PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class AgentStageSpec:
    label: str
    objective: str
    input_focus: tuple[str, ...]
    output_focus: tuple[str, ...]
    guardrails: tuple[str, ...]


AGENT_STAGE_SPECS: tuple[AgentStageSpec, ...] = (
    AgentStageSpec(
        label="Agent 1 · 案情抽取",
        objective="把用户叙述拆成时间线、争议点、证据点和事实缺口。",
        input_focus=("案情叙述", "地点", "入职时间", "工资", "解除方式", "证据"),
        output_focus=("争议类型", "事实", "时间线", "证据", "缺口"),
        guardrails=("不输出胜诉保证", "不输出裁判偏向", "不扩展到非劳动法领域"),
    ),
    AgentStageSpec(
        label="Agent 2 · 重庆案例与法源检索",
        objective="只检索重庆公开案例、法源和程序材料，不暴露完整素材。",
        input_focus=("争议类型", "关键词", "证据缺口", "重庆本地程序"),
        output_focus=("检索到的案例", "检索到的法源", "检索理由"),
        guardrails=("只返回少量引用", "不公开全量案例库", "不编造来源"),
    ),
    AgentStageSpec(
        label="Agent 3 · 结论审校",
        objective="合并检索结果，只输出可读建议、风险边界和下一步。",
        input_focus=("抽取结果", "检索结果", "证据缺口", "本地程序路径"),
        output_focus=("最终结论", "风险等级", "下一步", "注意边界"),
        guardrails=("不输出法律意见", "不输出裁判偏向", "不做胜率承诺"),
    ),
)


@dataclass(frozen=True)
class AgentRuntimeConfig:
    provider_mode: ProviderMode
    model: str
    reasoning_effort: str
    tracing_enabled: bool
    base_url: str
    api_key_configured: bool
    timeout_seconds: int


def load_project_env() -> None:
    for env_file in (PROJECT_ROOT / ".env.local", PROJECT_ROOT / ".env"):
        if not env_file.exists():
            continue
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            key, value = _parse_env_line(raw_line)
            if key and key not in os.environ:
                os.environ[key] = value


def _parse_env_line(raw_line: str) -> tuple[str | None, str]:
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        return None, ""
    key, value = line.split("=", 1)
    key = key.strip()
    if not key or any(char.isspace() for char in key):
        return None, ""
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    return key, value


load_project_env()


def get_agent_runtime_config() -> AgentRuntimeConfig:
    provider = os.getenv("AI_PROVIDER", "").strip().lower()
    api_key = get_provider_api_key()
    model = (
        os.getenv("DEEPSEEK_MODEL", "").strip()
        or os.getenv("OPENAI_MODEL", "").strip()
        or DEFAULT_DEEPSEEK_MODEL
    )
    reasoning_effort = (
        os.getenv("DEEPSEEK_REASONING_EFFORT", "").strip()
        or os.getenv("OPENAI_REASONING_EFFORT", "").strip()
        or DEFAULT_REASONING_EFFORT
    )
    tracing_enabled = (
        os.getenv("AI_TRACE", "").strip().lower()
        or os.getenv("DEEPSEEK_TRACE", "").strip().lower()
        or os.getenv("OPENAI_TRACE", "").strip().lower()
    ) in {"1", "true", "yes", "on"}
    timeout_seconds = _parse_positive_int(
        os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "").strip()
        or os.getenv("OPENAI_TIMEOUT_SECONDS", "").strip(),
        DEFAULT_DEEPSEEK_TIMEOUT_SECONDS,
    )
    base_url = os.getenv("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL).strip().rstrip("/") or DEFAULT_DEEPSEEK_BASE_URL
    provider_mode: ProviderMode = "local"
    if provider != "local" and api_key:
        provider_mode = "deepseek"

    return AgentRuntimeConfig(
        provider_mode=provider_mode,
        model=model,
        reasoning_effort=reasoning_effort,
        tracing_enabled=tracing_enabled,
        base_url=base_url,
        api_key_configured=bool(api_key),
        timeout_seconds=timeout_seconds,
    )


def get_provider_api_key() -> str:
    return os.getenv("DEEPSEEK_API_KEY", "").strip() or os.getenv("OPENAI_API_KEY", "").strip()


def build_agent_workflow_summary() -> dict:
    config = get_agent_runtime_config()
    return {
        "providerMode": config.provider_mode,
        "model": config.model,
        "reasoningEffort": config.reasoning_effort,
        "tracingEnabled": config.tracing_enabled,
        "timeoutSeconds": config.timeout_seconds,
        "apiKeyConfigured": config.api_key_configured,
        "agents": [asdict(stage) for stage in AGENT_STAGE_SPECS],
    }


AGENT_TRANSCRIPT_LABELS = tuple(stage.label for stage in AGENT_STAGE_SPECS)


def _parse_positive_int(raw_value: str, default_value: int) -> int:
    if not raw_value:
        return default_value
    try:
        parsed = int(raw_value)
    except ValueError:
        return default_value
    return parsed if parsed > 0 else default_value
