from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DeepSeekCompletionResult:
    content: str
    raw: dict[str, Any]


class DeepSeekHTTPError(Exception):
    def __init__(self, code: int, detail: str):
        super().__init__(f"HTTP {code}: {detail}")
        self.code = code
        self.detail = detail


def call_json_completion(
    *,
    api_key: str,
    base_url: str,
    model: str,
    messages: list[dict[str, str]],
    reasoning_effort: str,
    timeout: int = 45,
) -> DeepSeekCompletionResult:
    try:
        raw = _perform_json_completion(
            api_key=api_key,
            base_url=base_url,
            model=model,
            messages=messages,
            reasoning_effort=reasoning_effort,
            timeout=timeout,
            include_optional_fields=True,
        )
    except DeepSeekHTTPError as error:
        if _should_retry_without_optional_fields(error) and reasoning_effort:
            try:
                raw = _perform_json_completion(
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                    messages=messages,
                    reasoning_effort=reasoning_effort,
                    timeout=timeout,
                    include_optional_fields=False,
                )
            except DeepSeekHTTPError as retry_error:
                raise RuntimeError(
                    f"DeepSeek API HTTP {retry_error.code}: {retry_error.detail}"
                ) from retry_error
        else:
            raise RuntimeError(f"DeepSeek API HTTP {error.code}: {error.detail}") from error

    choices = raw.get("choices") or []
    message = choices[0].get("message") if choices else {}
    content = str(message.get("content") or "")
    return DeepSeekCompletionResult(content=content, raw=raw)


def _perform_json_completion(
    *,
    api_key: str,
    base_url: str,
    model: str,
    messages: list[dict[str, str]],
    reasoning_effort: str,
    timeout: int,
    include_optional_fields: bool,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "stream": False,
    }
    if include_optional_fields:
        payload["reasoning_effort"] = reasoning_effort
        payload["thinking"] = {"type": "enabled"}

    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise DeepSeekHTTPError(error.code, detail or error.reason) from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"DeepSeek API request failed: {error.reason}") from error


def _should_retry_without_optional_fields(error: DeepSeekHTTPError) -> bool:
    if error.code not in {400, 422}:
        return False
    detail = error.detail.lower()
    return any(
        token in detail
        for token in ("thinking", "reasoning_effort", "reasoning effort", "reasoning-effort")
    )


def call_streaming_completion(
    *,
    api_key: str,
    base_url: str,
    model: str,
    messages: list[dict[str, str]],
    reasoning_effort: str,
    timeout: int = 120,
    json_mode: bool = False,
) -> "Iterator[str]":
    from typing import Iterator

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "stream": True,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        response = urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"DeepSeek streaming API HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"DeepSeek streaming request failed: {error.reason}") from error

    def _iter_tokens():
        try:
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str == "[DONE]":
                    return
                try:
                    obj = json.loads(data_str)
                    choices = obj.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                except json.JSONDecodeError:
                    continue
        finally:
            response.close()

    return _iter_tokens()


def parse_json_object(content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as error:
        match = re.search(r"\{.*\}", content, re.S)
        if not match:
            raise ValueError("DeepSeek response did not contain a JSON object") from error
        parsed = json.loads(match.group(0))

    if not isinstance(parsed, dict):
        raise ValueError("DeepSeek response JSON must be an object")
    return parsed
