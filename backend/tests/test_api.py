import os
import unittest
from pathlib import Path
from unittest.mock import patch

TEST_DB = Path("test_law.db")
os.environ["DATABASE_URL"] = f"sqlite:///./{TEST_DB}"
os.environ["ADMIN_TOKEN"] = "test-admin-token"
os.environ["ADMIN_EDITOR_TOKEN"] = "test-editor-token"
os.environ["ADMIN_VIEW_TOKEN"] = "test-view-token"
os.environ["AI_PROVIDER"] = "local"
os.environ["DEEPSEEK_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.exc import SQLAlchemyError  # noqa: E402

from backend.database import engine  # noqa: E402
from backend.main import app  # noqa: E402


class ApiTest(unittest.TestCase):
    admin_headers = {"x-admin-token": "test-admin-token"}
    editor_headers = {"x-admin-token": "test-editor-token"}
    view_headers = {"x-admin-token": "test-view-token"}

    @classmethod
    def setUpClass(cls):
        if TEST_DB.exists():
            TEST_DB.unlink()
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        engine.dispose()
        TEST_DB.unlink(missing_ok=True)

    def test_healthz_endpoint_returns_non_sensitive_status(self):
        original_database_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = "postgresql+psycopg2://law:super-secret@db.example.com:5432/law_assistant?sslmode=require"
        try:
            response = self.client.get("/healthz")
        finally:
            if original_database_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = original_database_url

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertTrue(body["ok"])
        self.assertTrue(body["databaseReachable"])
        self.assertGreaterEqual(body["caseCount"], 6)
        self.assertGreaterEqual(body["activeKnowledgeDocCount"], 4)
        self.assertGreaterEqual(body["feedbackCount"], 0)
        self.assertGreaterEqual(body["auditLogCount"], 0)
        self.assertEqual(body["providerMode"], "local")
        self.assertIn("model", body)
        self.assertFalse(body["apiKeyConfigured"])
        self.assertEqual(body["databaseLabel"], "postgresql+psycopg2://db.example.com:5432/law_assistant")
        self.assertNotIn("database", body)
        self.assertNotIn("super-secret", body["databaseLabel"])
        self.assertNotIn("@", body["databaseLabel"])
        self.assertNotIn("sslmode", body["databaseLabel"])

    def test_healthz_degrades_when_database_counts_fail(self):
        with patch("backend.main.collect_health_database_counts", side_effect=SQLAlchemyError("boom")):
            response = self.client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertFalse(body["ok"])
        self.assertFalse(body["databaseReachable"])
        self.assertEqual(body["caseCount"], 0)
        self.assertEqual(body["activeKnowledgeDocCount"], 0)
        self.assertEqual(body["feedbackCount"], 0)
        self.assertEqual(body["auditLogCount"], 0)
        self.assertIn("databaseLabel", body)
        self.assertNotIn("database", body)

    def test_internal_routes_require_admin_token(self):
        protected_requests = [
            self.client.get("/runtime"),
            self.client.get("/cases"),
            self.client.get("/knowledge-docs"),
            self.client.get("/history"),
            self.client.get("/feedback/summary"),
            self.client.get("/audit-logs"),
            self.client.post("/cases/import", json={"cases": []}),
            self.client.post("/knowledge-docs/import", json={"docs": []}),
        ]

        for response in protected_requests:
            self.assertEqual(response.status_code, 401)

        wrong_token = self.client.get("/cases", headers={"x-admin-token": "wrong"})
        self.assertEqual(wrong_token.status_code, 401)

    def test_runtime_endpoint_returns_non_sensitive_config(self):
        original_database_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = "postgresql+psycopg2://law:super-secret@db.example.com:5432/law_assistant?sslmode=require"
        try:
            response = self.client.get("/runtime", headers=self.admin_headers)
        finally:
            if original_database_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = original_database_url

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            set(body),
            {
                "providerMode",
                "model",
                "reasoningEffort",
                "tracingEnabled",
                "accessRole",
                "accessLevel",
                "role",
                "capabilities",
                "timeoutSeconds",
                "apiKeyConfigured",
                "localFallbackEnabled",
                "agentCount",
                "agentLabels",
                "database",
            },
        )
        self.assertEqual(body["accessRole"], "admin")
        self.assertEqual(body["accessLevel"], "write")
        self.assertEqual(body["role"], "admin")
        self.assertIsInstance(body["capabilities"], list)
        self.assertIn("audit", body["capabilities"])
        self.assertTrue(isinstance(body["apiKeyConfigured"], bool))
        self.assertTrue(body["localFallbackEnabled"])
        self.assertEqual(body["agentCount"], 3)
        self.assertEqual(len(body["agentLabels"]), 3)
        self.assertNotIn("super-secret", body["database"])
        self.assertNotIn("@", body["database"])
        self.assertNotIn("sslmode", body["database"])

    def test_view_token_can_read_but_not_write(self):
        runtime = self.client.get("/runtime", headers=self.view_headers)
        self.assertEqual(runtime.status_code, 200)
        self.assertEqual(runtime.json()["accessRole"], "viewer")
        self.assertEqual(runtime.json()["accessLevel"], "read")
        self.assertEqual(runtime.json()["role"], "viewer")

        cases = self.client.get("/cases", headers=self.view_headers)
        self.assertEqual(cases.status_code, 200)

        write_attempt = self.client.post("/cases/import", json={"cases": []}, headers=self.view_headers)
        self.assertEqual(write_attempt.status_code, 401)

    def test_editor_token_can_write_but_is_not_admin(self):
        runtime = self.client.get("/runtime", headers=self.editor_headers)
        self.assertEqual(runtime.status_code, 200)
        self.assertEqual(runtime.json()["accessRole"], "editor")
        self.assertEqual(runtime.json()["accessLevel"], "write")
        self.assertEqual(runtime.json()["role"], "editor")
        self.assertIn("write", runtime.json()["capabilities"])
        self.assertNotIn("audit", runtime.json()["capabilities"])

        imported = self.client.post("/cases/import", json={"cases": []}, headers=self.editor_headers)
        self.assertEqual(imported.status_code, 200)

        delete_attempt = self.client.delete("/cases/custom", headers=self.editor_headers)
        self.assertEqual(delete_attempt.status_code, 401)

        audit_attempt = self.client.get("/audit-logs", headers=self.editor_headers)
        self.assertEqual(audit_attempt.status_code, 401)

    def test_cases_seeded_from_database(self):
        response = self.client.get("/cases", headers=self.admin_headers)

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.json()["cases"]), 6)

    def test_analyze_persists_history(self):
        response = self.client.post(
            "/analyze",
            json={"narrative": "我在重庆上班，公司拖欠工资两个月，还没签劳动合同。"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["extraction"]["scenarioLabel"], "混合争议")
        self.assertGreaterEqual(len(body["retrieval"]["knowledgeDocs"]), 1)
        self.assertIn("sourceUrl", body["retrieval"]["knowledgeDocs"][0])
        self.assertIn("sourceLabel", body["retrieval"]["knowledgeDocs"][0])
        self.assertIn("transcript", body)
        self.assertIn("trace", body)
        self.assertIn("analysisId", body)
        self.assertGreaterEqual(len(body["review"]["followUpQuestions"]), 1)
        self.assertIsInstance(body["review"]["confidence"], float)
        self.assertIn(body["review"]["confidenceLabel"], {"low", "medium", "high"})
        self.assertIsInstance(body["review"]["handoffRequired"], bool)
        self.assertIsInstance(body["review"]["handoffReasons"], list)
        self.assertEqual(body["trace"]["agentCount"], 3)
        self.assertIn("model", body["trace"])
        self.assertIn("confidenceLabel", body["trace"])
        self.assertIn("handoffRequired", body["trace"])

        history = self.client.get("/history", headers=self.admin_headers).json()["items"]
        self.assertGreaterEqual(len(history), 1)
        self.assertIn("拖欠工资", history[0]["input"])
        self.assertNotIn("trace", history[0]["review"])
        self.assertEqual(history[0]["trace"]["agentLabels"][0], "Agent 1 · 案情抽取")
        self.assertIn("model", history[0]["trace"])

    def test_feedback_can_be_recorded_and_summarized(self):
        analysis = self.client.post(
            "/analyze",
            json={"narrative": "我在重庆上班，公司拖欠工资两个月。"},
        ).json()
        created = self.client.post(
            "/feedback",
            json={
                "analysisId": analysis["analysisId"],
                "helpful": False,
                "comment": "  需要补充证据清单  ",
            },
        )
        self.assertEqual(created.status_code, 200)
        self.assertTrue(created.json()["created"])

        summary = self.client.get("/feedback/summary", headers=self.admin_headers)
        self.assertEqual(summary.status_code, 200)
        body = summary.json()
        self.assertGreaterEqual(body["total"], 1)
        self.assertGreaterEqual(body["unhelpfulCount"], 1)
        self.assertTrue(any(item["comment"] == "需要补充证据清单" for item in body["recentItems"]))

    def test_knowledge_docs_seeded_from_database(self):
        response = self.client.get("/knowledge-docs", headers=self.admin_headers)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreaterEqual(len(body["docs"]), 4)
        self.assertIn("categoryLabel", body["docs"][0])
        self.assertIn("sourceUrl", body["docs"][0])

    def test_import_update_and_delete_knowledge_doc(self):
        payload = {
            "docs": [
                {
                    "id": "custom-doc-api-test",
                    "title": "测试知识文档",
                    "category": "procedure",
                    "region": "重庆市",
                    "year": 2026,
                    "summary": "用于测试知识文档导入。",
                    "content": "测试内容会作为内部 RAG 素材。",
                    "sourceUrl": "https://example.com/doc",
                    "sourceLabel": "测试来源",
                    "tags": ["测试", "仲裁"],
                    "isActive": True,
                }
            ]
        }

        imported = self.client.post("/knowledge-docs/import", json=payload, headers=self.admin_headers)
        self.assertEqual(imported.status_code, 200)
        self.assertTrue(any(item["id"] == "custom-doc-api-test" for item in imported.json()["docs"]))

        update_payload = {
            "docs": [
                {
                    **payload["docs"][0],
                    "summary": "已更新的测试知识文档。",
                    "tags": ["测试", "仲裁", "更新"],
                }
            ]
        }
        updated = self.client.post("/knowledge-docs/import", json=update_payload, headers=self.admin_headers)
        self.assertEqual(updated.status_code, 200)
        updated_doc = next(item for item in updated.json()["docs"] if item["id"] == "custom-doc-api-test")
        self.assertEqual(updated_doc["summary"], "已更新的测试知识文档。")

        deleted = self.client.delete("/knowledge-docs/custom-doc-api-test", headers=self.admin_headers)
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.json()["deleted"])

        docs = self.client.get("/knowledge-docs", params={"query": "测试知识文档"}, headers=self.admin_headers).json()["docs"]
        self.assertEqual(docs, [])

    def test_import_and_delete_custom_case(self):
        payload = {
            "cases": [
                {
                    "id": "custom-api-test",
                    "title": "测试导入案例",
                    "scenario": "wage_arrears",
                    "scenarioLabel": "拖欠工资",
                    "district": "重庆市",
                    "year": 2026,
                    "summary": "用于测试案例导入。",
                    "holding": "导入后可删除。",
                    "sourceUrl": "https://example.com",
                    "sourceLabel": "测试来源",
                    "tags": ["测试"],
                    "isCustom": True,
                }
            ]
        }

        imported = self.client.post("/cases/import", json=payload, headers=self.admin_headers)
        self.assertEqual(imported.status_code, 200)
        self.assertTrue(any(item["id"] == "custom-api-test" for item in imported.json()["cases"]))

        deleted = self.client.delete("/cases/custom-api-test", headers=self.admin_headers)
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.json()["deleted"])

        audit = self.client.get("/audit-logs", headers=self.admin_headers)
        self.assertEqual(audit.status_code, 200)
        actions = [item["action"] for item in audit.json()["items"]]
        self.assertIn("cases.import", actions)
        self.assertIn("cases.delete", actions)

    def test_bulk_delete_custom_cases(self):
        payload = {
            "cases": [
                {
                    "id": "custom-api-bulk-1",
                    "title": "批量删除案例",
                    "scenario": "wage_arrears",
                    "scenarioLabel": "拖欠工资",
                    "district": "重庆市",
                    "year": 2026,
                    "summary": "用于测试批量删除。",
                    "holding": "删除后不再保留。",
                    "sourceUrl": "https://example.com",
                    "sourceLabel": "测试来源",
                    "tags": ["测试"],
                    "isCustom": True,
                }
            ]
        }

        self.client.post("/cases/import", json=payload, headers=self.admin_headers)
        deleted = self.client.delete("/cases/custom", headers=self.admin_headers)
        self.assertEqual(deleted.status_code, 200)

        cases = self.client.get("/cases", params={"query": "批量删除案例"}, headers=self.admin_headers).json()["cases"]
        self.assertEqual(cases, [])


if __name__ == "__main__":
    unittest.main()
