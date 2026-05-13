from __future__ import annotations

import io
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from backend.deepseek_client import call_json_completion, parse_json_object


class FakeResponse:
    def __init__(self, body: str):
        self._body = body.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self._body


class DeepSeekClientTest(unittest.TestCase):
    def test_retries_without_optional_fields_when_thinking_is_rejected(self):
        requests: list[dict] = []

        def fake_urlopen(request, timeout):
            payload = json.loads(request.data.decode("utf-8"))
            requests.append(payload)
            if len(requests) == 1:
                raise HTTPError(
                    request.full_url,
                    422,
                    "unprocessable entity",
                    hdrs=None,
                    fp=io.BytesIO(b'{"error":{"message":"Unknown parameter: thinking"}}'),
                )
            return FakeResponse(json.dumps({"choices": [{"message": {"content": '{"ok": true}'}}]}))

        with patch("backend.deepseek_client.urllib.request.urlopen", side_effect=fake_urlopen):
            result = call_json_completion(
                api_key="test-key",
                base_url="https://api.deepseek.com",
                model="deepseek-v4-pro",
                messages=[{"role": "user", "content": "test"}],
                reasoning_effort="medium",
                timeout=7,
            )

        self.assertEqual(len(requests), 2)
        self.assertIn("thinking", requests[0])
        self.assertIn("reasoning_effort", requests[0])
        self.assertNotIn("thinking", requests[1])
        self.assertNotIn("reasoning_effort", requests[1])
        self.assertEqual(result.content, '{"ok": true}')
        self.assertEqual(result.raw["choices"][0]["message"]["content"], '{"ok": true}')

    def test_parse_json_object_extracts_wrapped_json(self):
        parsed = parse_json_object('前缀文字 {"riskLevel":"low","nextSteps":["整理时间线"]} 尾注')

        self.assertEqual(parsed["riskLevel"], "low")
        self.assertEqual(parsed["nextSteps"], ["整理时间线"])


if __name__ == "__main__":
    unittest.main()
