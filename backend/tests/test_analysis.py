import re
import unittest

from backend.agent_workflow import get_agent_runtime_config
from backend.analysis import (
    LocalCase,
    build_extraction,
    build_retrieval,
    build_review,
    build_trace_summary,
    build_transcript,
    load_seed_knowledge_docs,
    merge_extraction_payload,
    merge_review_payload,
    retrieve_cases,
    retrieve_knowledge_docs,
)

FIXED_RAG_EVAL_CASES = [
    LocalCase(
        id="eval-wage",
        title="固定评测：工资支付争议",
        scenario="wage_arrears",
        scenario_label="拖欠工资",
        district="重庆市",
        year=2024,
        summary="用于固定评测的拖欠工资检索样本。",
        holding="工资支付类争议需要核对工资流水、考勤和支付周期。",
        source_url="https://example.com/wage",
        source_label="固定评测样本",
        tags=["欠薪", "劳动报酬"],
    ),
    LocalCase(
        id="eval-termination",
        title="固定评测：解除争议",
        scenario="unlawful_termination",
        scenario_label="违法解除",
        district="重庆市",
        year=2024,
        summary="用于固定评测的违法解除检索样本。",
        holding="解除争议需要检查解除依据、通知程序和证据链。",
        source_url="https://example.com/termination",
        source_label="固定评测样本",
        tags=["解除", "程序合法性"],
    ),
    LocalCase(
        id="eval-contract",
        title="固定评测：未签书面劳动合同争议",
        scenario="no_written_contract",
        scenario_label="未签合同",
        district="重庆市",
        year=2024,
        summary="用于固定评测的未签书面劳动合同检索样本。",
        holding="未签合同争议需要确认入职时间、签订时间和劳动关系证据。",
        source_url="https://example.com/contract",
        source_label="固定评测样本",
        tags=["书面合同", "起算时间"],
    ),
]

FIXED_RAG_ANSWER_EVAL_SAMPLES = [
    (
        "wage arrears",
        "我在重庆九龙坡上班，公司拖欠两个月工资，有工资条、银行转账和考勤记录。",
        "拖欠工资",
        "low",
        3,
    ),
    (
        "unlawful termination",
        "我在重庆江北入职两年，公司口头辞退并说不要我来了，没有说明理由，也没有书面通知，想申请仲裁。",
        "违法解除/辞退",
        "low",
        3,
    ),
    (
        "no written contract",
        "我在重庆渝北上班八个月，公司一直没有签书面劳动合同，有入职登记、社保和排班记录。",
        "未签书面劳动合同",
        "low",
        3,
    ),
    (
        "mixed dispute",
        "我在重庆上班，公司拖欠三个月工资，还口头辞退我，也一直没签书面劳动合同，微信和考勤都还在。",
        "混合争议",
        "low",
        3,
    ),
]

UNSAFE_BIAS_JUDGMENT_PATTERN = re.compile(
    r"胜诉|败诉|稳赢|必胜|包赢|包赔|必然支持|一定支持|法院会支持|仲裁委会支持|偏向劳动者|偏向公司|偏向用人单位"
)


def public_citation_count(retrieval: dict) -> int:
    return min(len(retrieval.get("knowledgeDocs", [])), 2) + min(
        len(retrieval.get("cases", [])), 1
    )


class AnalysisPipelineTest(unittest.TestCase):
    def test_detects_mixed_labor_dispute(self):
        result = build_extraction("我在重庆上班，公司拖欠工资两个月，还没签劳动合同。")

        self.assertEqual(result["scenario"], "mixed")
        self.assertIn("拖欠工资", result["keywords"])

    def test_retrieval_returns_frontend_compatible_case_keys(self):
        extraction = build_extraction("公司拖欠工资两个月。")
        retrieval = retrieve_cases(
            extraction,
            [
                LocalCase(
                    id="case-1",
                    title="工资争议",
                    scenario="wage_arrears",
                    scenario_label="拖欠工资",
                    district="重庆市",
                    year=2024,
                    summary="工资支付争议。",
                    holding="核对工资流水。",
                    source_url="https://example.com",
                    source_label="示例来源",
                    tags=["欠薪"],
                )
            ],
        )

        self.assertEqual(retrieval["cases"][0]["scenarioLabel"], "拖欠工资")
        self.assertEqual(retrieval["cases"][0]["sourceUrl"], "https://example.com")

    def test_seed_knowledge_docs_are_loaded_for_rag(self):
        docs = load_seed_knowledge_docs()

        self.assertGreaterEqual(len(docs), 1)
        self.assertTrue(any(doc.region == "重庆市" for doc in docs))
        self.assertTrue(all(doc.id and doc.source_url and doc.source_label for doc in docs))

    def test_knowledge_retrieval_returns_source_payload_without_content(self):
        extraction = build_extraction("我在重庆上班，公司没有签劳动合同。")
        retrieval = retrieve_knowledge_docs(extraction, load_seed_knowledge_docs())

        self.assertGreaterEqual(len(retrieval["knowledgeDocs"]), 1)
        self.assertIn("sourceUrl", retrieval["knowledgeDocs"][0])
        self.assertIn("sourceLabel", retrieval["knowledgeDocs"][0])
        self.assertIn("categoryLabel", retrieval["knowledgeDocs"][0])
        self.assertNotIn("content", retrieval["knowledgeDocs"][0])

    def test_combined_retrieval_includes_knowledge_sources(self):
        extraction = build_extraction("我在重庆上班，公司拖欠工资两个月。")
        retrieval = build_retrieval(
            extraction,
            [
                LocalCase(
                    id="case-1",
                    title="工资争议",
                    scenario="wage_arrears",
                    scenario_label="拖欠工资",
                    district="重庆市",
                    year=2024,
                    summary="工资支付争议。",
                    holding="核对工资流水。",
                    source_url="https://example.com",
                    source_label="示例来源",
                    tags=["欠薪"],
                )
            ],
            load_seed_knowledge_docs(),
        )

        self.assertGreaterEqual(len(retrieval["knowledgeDocs"]), 1)
        self.assertGreaterEqual(len(retrieval["knowledgeRationale"]), 1)
        self.assertIn("sourceUrl", retrieval["knowledgeDocs"][0])

    def test_review_keeps_legal_boundary_language(self):
        extraction = build_extraction("公司口头辞退我，没有说明理由。")
        retrieval = {"cases": [], "rationale": []}
        review = build_review(extraction, retrieval)

        self.assertIn("不构成法律意见", " ".join(review["cautions"]))
        self.assertNotIn("胜诉", review["recommendation"])
        self.assertGreater(len(review["followUpQuestions"]), 0)

    def test_trace_summary_exposes_runtime_and_quality_flags(self):
        extraction = build_extraction("我在重庆上班，公司拖欠工资两个月。")
        retrieval = build_retrieval(extraction, FIXED_RAG_EVAL_CASES, load_seed_knowledge_docs())
        review = build_review(extraction, retrieval)
        transcript = build_transcript(extraction, retrieval, review)
        trace = build_trace_summary(extraction, retrieval, review, transcript)
        runtime = get_agent_runtime_config()

        self.assertEqual(trace["agentCount"], 3)
        self.assertEqual(
            trace["agentLabels"],
            ["Agent 1 · 案情抽取", "Agent 2 · 重庆案例与法源检索", "Agent 3 · 结论审校"],
        )
        self.assertEqual(trace["providerMode"], runtime.provider_mode)
        self.assertEqual(trace["model"], runtime.model)
        self.assertEqual(trace["reasoningEffort"], runtime.reasoning_effort)
        self.assertEqual(trace["tracingEnabled"], runtime.tracing_enabled)
        self.assertIsInstance(trace["confidence"], float)
        self.assertIn(trace["confidenceLabel"], {"low", "medium", "high"})
        self.assertIsInstance(trace["handoffRequired"], bool)
        self.assertIsInstance(trace["handoffReasons"], list)
        if runtime.provider_mode == "local":
            self.assertIn("本地规则引擎回退", trace["qualityFlags"])

    def test_review_exposes_handoff_signal_for_uncertain_cases(self):
        extraction = build_extraction("我在重庆遇到一些劳动问题，只想先问问。")
        retrieval = build_retrieval(extraction, FIXED_RAG_EVAL_CASES, load_seed_knowledge_docs())
        review = build_review(extraction, retrieval)

        self.assertLess(review["confidence"], 0.55)
        self.assertEqual(review["confidenceLabel"], "low")
        self.assertTrue(review["handoffRequired"])
        self.assertTrue(any("争议类型未识别" in item for item in review["handoffReasons"]))

    def test_deepseek_extraction_merge_preserves_local_scenario_contract(self):
        local = build_extraction("我在重庆九龙坡上班，公司拖欠两个月工资，有工资条。")
        remote = {
            "scenario": "mixed",
            "scenarioLabel": "工资拖欠",
            "confidence": 0.95,
            "facts": ["员工在重庆九龙坡上班", "公司拖欠工资"],
            "timeline": ["已拖欠两个月"],
            "evidence": ["工资条"],
            "missingInfo": ["入职时间", "工资金额", "解除情况", "社保情况", "沟通记录"],
            "keywords": ["拖欠工资", "工资条"],
        }

        merged = merge_extraction_payload(local, remote)

        self.assertEqual(merged["scenario"], "wage_arrears")
        self.assertEqual(merged["scenarioLabel"], "拖欠工资")
        self.assertEqual(merged["confidence"], local["confidence"])
        self.assertEqual(merged["missingInfo"], local["missingInfo"])

    def test_deepseek_extraction_merge_keeps_unknown_cases_local(self):
        local = build_extraction("我在重庆租房，房东不退押金。")
        remote = {
            "scenario": "wage_arrears",
            "scenarioLabel": "拖欠工资",
            "facts": ["用户可能存在劳动争议"],
            "keywords": ["劳动争议"],
        }

        merged = merge_extraction_payload(local, remote)

        self.assertEqual(merged, local)

    def test_deepseek_review_merge_preserves_local_risk_and_boundary_anchors(self):
        extraction = build_extraction("我在重庆上班，公司拖欠工资两个月，有工资流水和考勤。")
        retrieval = build_retrieval(extraction, FIXED_RAG_EVAL_CASES, load_seed_knowledge_docs())
        local_review = build_review(extraction, retrieval)
        remote = {
            "riskLevel": "high",
            "recommendation": "建议立即起诉。",
            "analysis": "远程模型给出的简短分析，没有本地程序路径。",
            "cautions": ["远程补充注意事项"],
            "nextSteps": ["远程补充下一步"],
        }

        merged = merge_review_payload(local_review, remote)

        self.assertEqual(merged["riskLevel"], local_review["riskLevel"])
        self.assertEqual(merged["recommendation"], local_review["recommendation"])
        self.assertEqual(merged["analysis"], local_review["analysis"])
        self.assertEqual(merged["compensationRange"], local_review["compensationRange"])
        self.assertEqual(merged["cautions"], local_review["cautions"])
        self.assertEqual(merged["nextSteps"], local_review["nextSteps"])

    def test_fixed_rag_answer_quality_samples(self):
        for (
            name,
            narrative,
            expected_scenario_label,
            expected_risk_level,
            expected_citation_count,
        ) in FIXED_RAG_ANSWER_EVAL_SAMPLES:
            with self.subTest(name=name):
                extraction = build_extraction(narrative)
                retrieval = build_retrieval(
                    extraction, FIXED_RAG_EVAL_CASES, load_seed_knowledge_docs()
                )
                review = build_review(extraction, retrieval)
                transcript = build_transcript(extraction, retrieval, review)
                public_answer_text = "\n".join(
                    [
                        review["recommendation"],
                        review["analysis"],
                        review.get("compensationRange") or "",
                        *review["followUpQuestions"],
                        *review["nextSteps"],
                        *review["cautions"],
                    ]
                )

                self.assertEqual(
                    [item["agent"] for item in transcript],
                    ["Agent 1 · 案情抽取", "Agent 2 · 重庆案例与法源检索", "Agent 3 · 结论审校"],
                )
                self.assertEqual(extraction["scenarioLabel"], expected_scenario_label)
                self.assertEqual(review["riskLevel"], expected_risk_level)
                self.assertEqual(public_citation_count(retrieval), expected_citation_count)
                self.assertRegex(review["analysis"], r"重庆本地程序路径.*先调解后仲裁")
                self.assertIsNone(UNSAFE_BIAS_JUDGMENT_PATTERN.search(public_answer_text))


if __name__ == "__main__":
    unittest.main()
