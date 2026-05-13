import os
import unittest

from backend.agent_workflow import (
    AGENT_TRANSCRIPT_LABELS,
    DEFAULT_DEEPSEEK_MODEL,
    DEFAULT_DEEPSEEK_TIMEOUT_SECONDS,
    build_agent_workflow_summary,
    get_agent_runtime_config,
    _parse_env_line,
)


class AgentWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.original_env = {
            key: os.environ.get(key)
            for key in [
                "AI_PROVIDER",
                "AI_TRACE",
                "DEEPSEEK_API_KEY",
                "DEEPSEEK_MODEL",
                "DEEPSEEK_TIMEOUT_SECONDS",
                "DEEPSEEK_TRACE",
                "OPENAI_API_KEY",
                "OPENAI_MODEL",
                "OPENAI_TIMEOUT_SECONDS",
                "OPENAI_TRACE",
            ]
        }

    def tearDown(self):
        for key, value in self.original_env.items():
            self._restore(key, value)

    def _restore(self, key: str, value: str | None):
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value

    def test_defaults_to_local_runtime_without_deepseek_key(self):
        os.environ.pop("AI_PROVIDER", None)
        os.environ.pop("DEEPSEEK_API_KEY", None)
        os.environ.pop("DEEPSEEK_MODEL", None)
        os.environ.pop("DEEPSEEK_TIMEOUT_SECONDS", None)
        os.environ.pop("OPENAI_API_KEY", None)
        os.environ.pop("OPENAI_MODEL", None)
        os.environ.pop("OPENAI_TIMEOUT_SECONDS", None)

        config = get_agent_runtime_config()

        self.assertEqual(config.provider_mode, "local")
        self.assertEqual(config.model, DEFAULT_DEEPSEEK_MODEL)
        self.assertEqual(config.timeout_seconds, DEFAULT_DEEPSEEK_TIMEOUT_SECONDS)
        self.assertFalse(config.tracing_enabled)

    def test_switches_to_deepseek_runtime_when_key_is_configured(self):
        os.environ["AI_PROVIDER"] = "deepseek"
        os.environ["DEEPSEEK_API_KEY"] = "test-key"
        os.environ["DEEPSEEK_MODEL"] = "deepseek-v4-flash"
        os.environ["DEEPSEEK_TIMEOUT_SECONDS"] = "12"
        os.environ["AI_TRACE"] = "true"

        config = get_agent_runtime_config()

        self.assertEqual(config.provider_mode, "deepseek")
        self.assertEqual(config.model, "deepseek-v4-flash")
        self.assertEqual(config.timeout_seconds, 12)
        self.assertTrue(config.tracing_enabled)

    def test_ignores_invalid_timeout_values(self):
        os.environ["DEEPSEEK_TIMEOUT_SECONDS"] = "0"

        config = get_agent_runtime_config()

        self.assertEqual(config.timeout_seconds, DEFAULT_DEEPSEEK_TIMEOUT_SECONDS)

    def test_env_line_parser_handles_quotes_and_comments(self):
        self.assertEqual(_parse_env_line("DEEPSEEK_API_KEY='test-key'"), ("DEEPSEEK_API_KEY", "test-key"))
        self.assertEqual(_parse_env_line('DEEPSEEK_MODEL="deepseek-v4-pro"'), ("DEEPSEEK_MODEL", "deepseek-v4-pro"))
        self.assertEqual(_parse_env_line("# comment"), (None, ""))

    def test_workflow_summary_keeps_three_agent_contract(self):
        summary = build_agent_workflow_summary()

        self.assertEqual(AGENT_TRANSCRIPT_LABELS, (
            "Agent 1 · 案情抽取",
            "Agent 2 · 重庆案例与法源检索",
            "Agent 3 · 结论审校",
        ))
        self.assertEqual(len(summary["agents"]), 3)
        self.assertIn("model", summary)
        self.assertIn("timeoutSeconds", summary)
        self.assertIn("不输出裁判偏向", summary["agents"][0]["guardrails"])
        self.assertIn("不公开全量案例库", summary["agents"][1]["guardrails"])
        self.assertIn("不做胜率承诺", summary["agents"][2]["guardrails"])


if __name__ == "__main__":
    unittest.main()
