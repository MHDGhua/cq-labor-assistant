import json
import unittest
from pathlib import Path

from backend.agent_workflow import AGENT_TRANSCRIPT_LABELS
from backend.analysis import (
    LocalCase,
    build_extraction,
    build_retrieval,
    build_review,
    build_transcript,
    load_seed_knowledge_docs,
)

ROOT = Path(__file__).resolve().parents[2]
EVAL_FILE = ROOT / "evals" / "chongqing_labor_eval_cases.json"
SEED_CASE_FILE = ROOT / "backend" / "seed_cases.json"


def load_eval_cases() -> list[dict]:
    return json.loads(EVAL_FILE.read_text(encoding="utf-8"))


def load_seed_cases() -> list[LocalCase]:
    raw = json.loads(SEED_CASE_FILE.read_text(encoding="utf-8"))
    return [
        LocalCase(
            id=item["id"],
            title=item["title"],
            scenario=item["scenario"],
            scenario_label=item["scenario_label"],
            district=item["district"],
            year=item["year"],
            summary=item["summary"],
            holding=item["holding"],
            source_url=item["source_url"],
            source_label=item["source_label"],
            tags=item["tags"],
            is_custom=item.get("is_custom", False),
        )
        for item in raw
    ]


def public_citation_count(retrieval: dict) -> int:
    return min(len(retrieval.get("knowledgeDocs", [])), 2) + min(
        len(retrieval.get("cases", [])), 1
    )


class EvalsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.eval_cases = load_eval_cases()
        cls.seed_cases = load_seed_cases()
        cls.knowledge_docs = load_seed_knowledge_docs()

    def test_three_agent_transcript_contract_is_stable(self):
        extraction = build_extraction("我在重庆上班，公司拖欠工资两个月，还没签劳动合同。")
        retrieval = build_retrieval(extraction, self.seed_cases, self.knowledge_docs)
        review = build_review(extraction, retrieval)
        transcript = build_transcript(extraction, retrieval, review)

        self.assertEqual(tuple(item["agent"] for item in transcript), AGENT_TRANSCRIPT_LABELS)

    def test_three_agent_eval_cases(self):
        for item in self.eval_cases:
            with self.subTest(item["id"]):
                extraction = build_extraction(item["narrative"])
                retrieval = build_retrieval(extraction, self.seed_cases, self.knowledge_docs)
                review = build_review(extraction, retrieval)
                public_text = "\n".join(
                    [
                        review["recommendation"],
                        review["analysis"],
                        review.get("compensationRange") or "",
                        *review["nextSteps"],
                        *review["cautions"],
                        *[
                            f'{doc["title"]} {doc["sourceLabel"]}'
                            for doc in retrieval.get("knowledgeDocs", [])[:2]
                        ],
                        *[
                            f'{case["title"]} {case["sourceLabel"]}'
                            for case in retrieval.get("cases", [])[:1]
                        ],
                    ]
                )

                self.assertEqual(extraction["scenarioLabel"], item["expectedScenarioLabel"])
                self.assertEqual(review["riskLevel"], item["expectedRiskLevel"])
                self.assertEqual(public_citation_count(retrieval), item["expectedCitationCount"])
                self.assertIn(item["expectedHeadlineIncludes"], review["recommendation"])
                self.assertIn("重庆本地程序路径", public_text)

                for phrase in item["mustContain"]:
                    self.assertIn(phrase, public_text)

                for phrase in item.get("mustAvoid", []):
                    self.assertNotIn(phrase, public_text)

                if item["expectCompensationRange"]:
                    self.assertIsNotNone(review.get("compensationRange"))
                else:
                    self.assertIsNone(review.get("compensationRange"))


if __name__ == "__main__":
    unittest.main()
