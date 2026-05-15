from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from .agent_workflow import (
    AGENT_TRANSCRIPT_LABELS,
    AgentRuntimeConfig,
    get_agent_runtime_config,
    get_provider_api_key,
)
from .deepseek_client import call_json_completion, call_streaming_completion, parse_json_object


PROJECT_ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE_SEED_FILE = PROJECT_ROOT / "lib" / "data" / "knowledge_docs.json"

SCENARIO_LABELS = {
    "wage_arrears": "拖欠工资",
    "unlawful_termination": "违法解除/辞退",
    "no_written_contract": "未签书面劳动合同",
    "overtime": "加班费/工时争议",
    "labor_relation": "劳动关系认定",
    "social_insurance": "社会保险争议",
    "work_injury": "工伤待遇争议",
    "female_protection": "女职工特殊保护",
    "non_compete": "竞业限制争议",
    "pay_benefits": "工资福利/休假争议",
    "mixed": "混合争议",
}

SCENARIO_KEYWORDS = {
    "wage_arrears": ["拖欠工资", "欠薪", "工资支付", "劳动报酬", "工资", "报酬"],
    "unlawful_termination": ["解除", "辞退", "开除", "裁员", "解除通知", "赔偿"],
    "no_written_contract": ["书面劳动合同", "双倍工资", "未签合同", "劳动合同", "签订"],
    "overtime": ["加班", "加班费", "工时", "排班", "值班", "综合工时"],
    "labor_relation": ["劳动关系", "平台", "骑手", "主播", "家政", "劳务", "承揽", "外包", "派遣"],
    "social_insurance": ["社保", "社会保险", "养老保险", "生育保险", "停保", "缴纳"],
    "work_injury": ["工伤", "受伤", "停工留薪", "劳动能力鉴定", "诊断证明"],
    "female_protection": ["怀孕", "孕期", "产假", "女职工", "三期", "调岗降薪"],
    "non_compete": ["竞业", "竞业限制", "商业秘密", "补偿"],
    "pay_benefits": ["年休假", "最低工资", "停工停产", "生活费", "培训", "服务期"],
    "mixed": ["劳动争议", "仲裁", "证据", "程序", "调解"],
    "unknown": ["劳动争议", "仲裁", "证据"],
}

KNOWLEDGE_CATEGORY_LABELS = {
    "law": "法律规范",
    "judicial_interpretation": "司法解释",
    "local_case": "重庆典型案例",
    "procedure": "重庆程序",
    "policy": "重庆政策",
}

UNSAFE_JUDGMENT_PATTERN = re.compile(
    r"胜诉|败诉|稳赢|必胜|包赢|包赔|必然支持|一定支持|法院会支持|仲裁委会支持|偏向劳动者|偏向公司|偏向用人单位"
)


@dataclass
class LocalCase:
    id: str
    title: str
    scenario: str
    scenario_label: str
    district: str
    year: int
    summary: str
    holding: str
    source_url: str
    source_label: str
    tags: list[str]
    is_custom: bool = False


@dataclass
class KnowledgeDoc:
    id: str
    title: str
    category: str
    region: str
    year: int
    summary: str
    content: str
    source_url: str
    source_label: str
    tags: list[str]
    is_active: bool = True


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", "", value.lower())


COLLOQUIAL_EXPANSION: dict[str, list[str]] = {
    "老板跑路": ["用人单位失联", "拖欠工资"],
    "跑路": ["失联", "拖欠"],
    "赶我走": ["辞退"],
    "赶走": ["辞退"],
    "不要我了": ["辞退"],
    "不让干了": ["辞退", "解除劳动合同"],
    "不用来了": ["辞退", "口头解除"],
    "炒了我": ["辞退"],
    "炒鱿鱼": ["辞退"],
    "没给钱": ["拖欠工资"],
    "不发工资": ["拖欠工资", "欠薪"],
    "扣我钱": ["克扣工资"],
    "黑厂": ["未签劳动合同"],
    "黑心老板": ["用人单位"],
    "没买社保": ["未缴纳社会保险"],
    "不给交社保": ["未缴纳社会保险"],
    "受伤了没人管": ["工伤", "用人单位未申请工伤认定"],
    "干活受伤": ["工伤"],
    "怀起被开了": ["孕期被辞退"],
    "怀孕被开": ["孕期被辞退"],
    "不让休息": ["加班", "未支付加班费"],
    "天天加班": ["加班", "未支付加班费"],
    "义务加班": ["加班", "未支付加班费"],
    "白干": ["拖欠工资", "未支付劳动报酬"],
    "压工资": ["拖欠工资"],
    "拖着不给": ["拖欠工资"],
    "梭边边": ["逃避", "失联"],
    "整不赢": ["维权困难"],
}


def expand_colloquial(text: str) -> str:
    expanded = text
    for colloquial, formal_terms in COLLOQUIAL_EXPANSION.items():
        if colloquial in expanded:
            expanded += "。" + "、".join(formal_terms)
    return expanded


TIME_PATTERNS = [
    (re.compile(r"(\d{4})年(\d{1,2})月"), "ymd"),
    (re.compile(r"去年(\d{1,2})月"), "last_year"),
    (re.compile(r"前年(\d{1,2})月"), "year_before"),
    (re.compile(r"(\d+)个月前"), "months_ago"),
    (re.compile(r"去年"), "last_year_generic"),
    (re.compile(r"前年"), "year_before_generic"),
    (re.compile(r"半年前"), "half_year_ago"),
    (re.compile(r"一年前"), "one_year_ago"),
    (re.compile(r"两年前"), "two_years_ago"),
]


def check_statute_of_limitations(narrative: str) -> dict | None:
    now = datetime.now()
    earliest: datetime | None = None

    for pattern, kind in TIME_PATTERNS:
        match = pattern.search(narrative)
        if not match:
            continue

        candidate: datetime | None = None
        if kind == "ymd":
            year = int(match.group(1))
            month = int(match.group(2))
            if 2000 <= year <= now.year and 1 <= month <= 12:
                candidate = datetime(year, month, 1)
        elif kind == "last_year":
            month = int(match.group(1))
            if 1 <= month <= 12:
                candidate = datetime(now.year - 1, month, 1)
        elif kind == "year_before":
            month = int(match.group(1))
            if 1 <= month <= 12:
                candidate = datetime(now.year - 2, month, 1)
        elif kind == "months_ago":
            months = int(match.group(1))
            if 1 <= months <= 36:
                candidate = now - timedelta(days=months * 30)
        elif kind == "last_year_generic":
            candidate = datetime(now.year - 1, 6, 1)
        elif kind == "year_before_generic":
            candidate = datetime(now.year - 2, 6, 1)
        elif kind == "half_year_ago":
            candidate = now - timedelta(days=180)
        elif kind == "one_year_ago":
            candidate = now - timedelta(days=365)
        elif kind == "two_years_ago":
            candidate = now - timedelta(days=730)

        if candidate and (earliest is None or candidate < earliest):
            earliest = candidate

    if earliest is None:
        return None

    days_elapsed = (now - earliest).days
    if days_elapsed > 300:
        months_elapsed = days_elapsed // 30
        urgency = "high" if days_elapsed > 330 else "medium"
        return {
            "warning": True,
            "daysElapsed": days_elapsed,
            "monthsElapsed": months_elapsed,
            "urgency": urgency,
            "message": f"你描述的事情大约发生在{months_elapsed}个月前。劳动仲裁的申请期限是1年，建议尽快行动。",
        }
    return None


def contains_any(text: str, values: list[str]) -> bool:
    return any(normalize_text(value) in text for value in values)


def dedupe(values):
    result = []
    for value in values:
        if value and value not in result:
            result.append(value)
    return result


def load_seed_knowledge_docs() -> list[KnowledgeDoc]:
    raw = json.loads(KNOWLEDGE_SEED_FILE.read_text(encoding="utf-8"))
    return [
        KnowledgeDoc(
            id=item["id"],
            title=item["title"],
            category=item["category"],
            region=item["region"],
            year=item["year"],
            summary=item["summary"],
            content=item["content"],
            source_url=item["sourceUrl"],
            source_label=item["sourceLabel"],
            tags=item["tags"],
            is_active=item.get("isActive", True),
        )
        for item in raw
    ]


def detect_scenario(text: str) -> str:
    wage = contains_any(text, ["拖欠", "欠薪", "工资没发", "未发工资", "没发工资", "克扣工资", "未足额支付", "足额支付工资", "工资差额", "扣绩效", "绩效", "津贴"])
    termination = contains_any(text, ["辞退", "解除", "开除", "裁员", "被赶走", "不要我来了", "不用来了", "移出工作群"])
    contract = contains_any(text, ["未签", "没签", "没有签", "未签合同", "未订立书面劳动合同", "劳动合同"])
    matches = sum(1 for item in [wage, termination, contract] if item)
    labor_relation = contains_any(text, ["劳动关系", "合作协议", "个体工商户", "平台", "骑手", "主播", "家政", "劳务协议", "承揽", "外包", "派遣"])
    pay_benefits = contains_any(text, ["年休假", "最低工资", "停工停产", "生活费", "培训", "服务期", "违约金"])
    overtime = contains_any(text, ["加班", "加班费", "工时", "值班", "包薪", "排班", "综合工时"])
    if matches > 1:
        return "mixed"
    if contains_any(text, ["怀孕", "孕期", "产假", "女职工", "三期", "孕检"]):
        return "female_protection"
    if contains_any(text, ["工伤", "受伤", "停工留薪", "劳动能力鉴定", "诊断证明"]):
        return "work_injury"
    if contains_any(text, ["竞业", "竞业限制", "商业秘密", "同行"]):
        return "non_compete"
    if pay_benefits:
        return "pay_benefits"
    if termination:
        return "unlawful_termination"
    if labor_relation:
        return "labor_relation"
    if contract:
        return "no_written_contract"
    if contains_any(text, ["社保", "社会保险", "养老保险", "生育保险", "停保", "缴纳", "抚恤金"]):
        return "social_insurance"
    if overtime and not contract:
        return "overtime"
    if wage:
        return "wage_arrears"
    if overtime:
        return "overtime"
    return "unknown"


def build_extraction(narrative: str) -> dict:
    expanded = expand_colloquial(narrative)
    text = normalize_text(expanded)
    scenario = detect_scenario(text)
    facts = []
    if "重庆" in text:
        facts.append("案情涉及重庆地区，可直接匹配重庆本地公开程序和案例。")
    if any(token in text for token in ["公司", "单位", "老板"]):
        facts.append("存在典型用人单位与劳动者争议关系。")
    if scenario == "mixed":
        facts.append("案情同时出现多项争议，适合先拆分为工资、解除和合同三个子问题。")
    elif scenario != "unknown":
        facts.append(f"当前核心争议更偏向于“{SCENARIO_LABELS[scenario]}”。")
    else:
        facts.append("当前描述不足以稳定识别争议类型。")

    evidence = []
    if contains_any(text, ["聊天", "微信", "短信"]):
        evidence.append("聊天记录")
    if contains_any(text, ["工资条", "转账", "银行"]):
        evidence.append("工资发放记录")
    if contains_any(text, ["考勤", "打卡"]):
        evidence.append("考勤或打卡记录")
    if contains_any(text, ["离职", "通知", "解除"]):
        evidence.append("解除通知或离职说明")
    if contains_any(text, ["工牌", "工服", "入职", "社保"]):
        evidence.append("劳动关系辅助证据")
    if not evidence:
        evidence.append("待补充证据：聊天记录、工资记录、考勤记录、劳动关系证明")

    missing = []
    if not contains_any(text, ["入职", "开始工作", "上班"]):
        missing.append("入职时间")
    if not contains_any(text, ["金额", "工资", "补偿", "赔偿"]):
        missing.append("涉及金额")
    if scenario == "unlawful_termination" and not contains_any(text, ["原因", "理由", "通知"]):
        missing.append("公司解除理由和书面通知")
    if scenario == "no_written_contract" and not contains_any(text, ["合同", "签订"]):
        missing.append("书面劳动合同签订情况")

    timeline = []
    if "入职" in text:
        timeline.append("入职时间已出现")
    if contains_any(text, ["拖欠", "欠薪"]):
        timeline.append("存在工资未发或拖欠描述")
    if contains_any(text, ["辞退", "解除", "开除"]):
        timeline.append("存在解除或辞退描述")
    if "仲裁" in text:
        timeline.append("用户已开始考虑仲裁")
    if not timeline:
        timeline.append("待补充时间线：入职、争议发生、沟通、解除、申请仲裁节点")

    keywords = dedupe(
        [
            "拖欠工资" if contains_any(text, ["拖欠", "欠薪", "工资"]) else None,
            "解除争议" if contains_any(text, ["辞退", "解除", "开除", "裁员"]) else None,
            "劳动合同" if contains_any(text, ["合同", "劳动合同"]) else None,
            "工资争议" if contains_any(text, ["绩效", "津贴", "工资差额", "足额支付"]) else None,
            "加班工时" if contains_any(text, ["加班", "工时", "值班"]) else None,
            "劳动关系认定" if contains_any(text, ["劳动关系", "平台", "骑手", "主播", "家政", "劳务", "承揽"]) else None,
            "社会保险" if contains_any(text, ["社保", "社会保险", "养老保险", "停保"]) else None,
            "工伤待遇" if contains_any(text, ["工伤", "受伤", "停工留薪"]) else None,
            "女职工保护" if contains_any(text, ["怀孕", "孕期", "女职工", "产假"]) else None,
            "竞业限制" if contains_any(text, ["竞业", "商业秘密"]) else None,
            "仲裁" if "仲裁" in text else None,
            "证据" if contains_any(text, ["证据", "聊天记录", "工资条"]) else None,
        ]
    )

    return {
        "scenario": scenario,
        "scenarioLabel": SCENARIO_LABELS.get(scenario, "未识别场景"),
        "confidence": 0.38 if scenario == "unknown" else 0.78,
        "facts": dedupe(facts),
        "timeline": timeline,
        "evidence": evidence,
        "missingInfo": missing,
        "keywords": keywords,
    }


def score_case(item: LocalCase, extraction: dict) -> int:
    if extraction["scenario"] == "unknown":
        return 0

    score = 0
    if item.scenario == extraction["scenario"]:
        score += 4
    if extraction["scenario"] == "mixed":
        score += 1
    for keyword in extraction["keywords"]:
        if any(keyword in tag or tag in keyword for tag in item.tags):
            score += 1
    return score


def retrieve_cases(extraction: dict, cases: list[LocalCase]) -> dict:
    ranked = sorted(
        ((item, score_case(item, extraction)) for item in cases),
        key=lambda pair: pair[1],
        reverse=True,
    )
    selected = [item for item, score in ranked if score > 0][:3]
    return {
        "cases": [case_to_payload(case) for case in selected],
        "rationale": [f"{case.scenario_label} · {case.holding}" for case in selected],
    }


def score_knowledge_doc(doc: KnowledgeDoc, extraction: dict) -> int:
    if extraction["scenario"] == "unknown" and not has_labor_context(extraction):
        return 0

    if not doc.is_active:
        return 0

    text = normalize_text(" ".join([doc.title, doc.summary, doc.content, " ".join(doc.tags)]))
    score = 0
    scenario = extraction["scenario"]
    for token in SCENARIO_KEYWORDS.get(scenario, SCENARIO_KEYWORDS["unknown"]):
        if normalize_text(token) in text:
            score += 2
    if doc.region == "重庆市" or "重庆" in doc.region:
        score += 2 if any("重庆" in fact for fact in extraction["facts"]) else 1
    for keyword in extraction["keywords"]:
        if normalize_text(keyword) in text:
            score += 1
    for token in extraction["facts"]:
        if normalize_text(token)[:4] and normalize_text(token)[:4] in text:
            score += 1
    if doc.category in {"law", "judicial_interpretation"}:
        score += 1
    if scenario == "mixed" and doc.category in {"law", "procedure"}:
        score += 1
    return score


def has_labor_context(extraction: dict) -> bool:
    return bool(
        extraction["keywords"]
        or any(
            any(token in fact for token in ["用人单位", "劳动关系", "工资", "解除", "劳动合同", "仲裁", "社保"])
            for fact in extraction["facts"]
        )
    )


def retrieve_knowledge_docs(extraction: dict, docs: list[KnowledgeDoc]) -> dict:
    ranked = sorted(
        ((doc, score_knowledge_doc(doc, extraction)) for doc in docs),
        key=lambda pair: pair[1],
        reverse=True,
    )
    selected = [doc for doc, score in ranked if score > 0][:4]
    return {
        "knowledgeDocs": [knowledge_doc_to_payload(doc) for doc in selected],
        "rationale": [f"{doc.title} · {doc.summary}" for doc in selected],
    }


def build_retrieval(extraction: dict, cases: list[LocalCase], knowledge_docs: list[KnowledgeDoc]) -> dict:
    case_retrieval = retrieve_cases(extraction, cases)
    knowledge_retrieval = retrieve_knowledge_docs(extraction, knowledge_docs)
    return {
        "cases": case_retrieval["cases"],
        "knowledgeDocs": knowledge_retrieval["knowledgeDocs"],
        "rationale": case_retrieval["rationale"],
        "knowledgeRationale": knowledge_retrieval["rationale"],
    }


def knowledge_doc_to_payload(doc: KnowledgeDoc) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "category": doc.category,
        "categoryLabel": KNOWLEDGE_CATEGORY_LABELS.get(doc.category, doc.category),
        "region": doc.region,
        "year": doc.year,
        "summary": doc.summary,
        "sourceUrl": doc.source_url,
        "sourceLabel": doc.source_label,
        "tags": doc.tags,
        "isActive": doc.is_active,
    }


def case_to_payload(case: LocalCase) -> dict:
    return {
        "id": case.id,
        "title": case.title,
        "scenario": case.scenario,
        "scenarioLabel": case.scenario_label,
        "district": case.district,
        "year": case.year,
        "summary": case.summary,
        "holding": case.holding,
        "sourceUrl": case.source_url,
        "sourceLabel": case.source_label,
        "tags": case.tags,
        "isCustom": case.is_custom,
    }


def build_recommendation(scenario: str) -> str:
    if scenario == "wage_arrears":
        return "先核对工资流水和考勤，再看是否需要直接申请仲裁。"
    if scenario == "unlawful_termination":
        return "重点检查解除通知、规章制度和证据链是否完整。"
    if scenario == "no_written_contract":
        return "优先确认入职与书面合同签订时间差。"
    if scenario == "overtime":
        return "先确认工时制度和加班证据，再分类核算加班费。"
    if scenario == "labor_relation":
        return "先判断管理从属性和用工控制，再决定是否主张劳动关系。"
    if scenario == "social_insurance":
        return "先区分补缴、待遇损失和赔偿责任，再选择社保投诉或仲裁路径。"
    if scenario == "work_injury":
        return "先确认工伤认定和停工留薪期材料，再核算待遇差额。"
    if scenario == "female_protection":
        return "重点核对三期保护、调岗降薪依据和工资差额。"
    if scenario == "non_compete":
        return "先核对岗位涉密性、补偿是否支付和限制范围是否过宽。"
    if scenario == "pay_benefits":
        return "先拆分最低工资、年休假、停工工资或服务期违约金项目。"
    if scenario == "mixed":
        return "先拆分争议点，再分别提交证据和诉求。"
    return "当前信息不足，先补齐关键事实再判断。"


def build_compensation_range(scenario: str) -> str | None:
    if scenario == "wage_arrears":
        return "通常优先核对欠薪金额与是否存在加付赔偿金或拖欠利息类主张。"
    if scenario == "unlawful_termination":
        return "通常需要按解除合法性和工龄测算赔偿金或补偿金区间。"
    if scenario == "no_written_contract":
        return "通常重点核算未签合同期间的双倍工资差额。"
    if scenario == "overtime":
        return "通常需要按工时制度、加班证据和休息日/法定节假日类别分别核算。"
    if scenario == "social_insurance":
        return "通常要区分补缴情形、待遇损失和单位过错造成的赔偿责任。"
    if scenario == "work_injury":
        return "通常围绕工伤认定、停工留薪期、劳动能力鉴定和待遇差额核算。"
    if scenario == "female_protection":
        return "通常重点核对孕期/产期/哺乳期保护、调岗降薪依据和工资差额。"
    if scenario == "non_compete":
        return "通常先核对竞业补偿是否支付、限制范围是否过宽和主体是否适格。"
    if scenario == "pay_benefits":
        return "通常需要按最低工资、年休假、停工停产工资或培训服务期分别核算。"
    if scenario == "mixed":
        return "需要拆分不同争议项分别测算。"
    return None


def build_review(extraction: dict, retrieval: dict) -> dict:
    cases = retrieval.get("cases", [])
    knowledge_docs = retrieval.get("knowledgeDocs", [])
    case_count = len(cases)
    doc_count = len(knowledge_docs)
    missing_count = len(extraction["missingInfo"])
    risk_level = (
        "high"
        if extraction["scenario"] == "unknown" or missing_count >= 3
        else "medium"
        if case_count == 0 or doc_count == 0
        else "low"
    )
    decision_signals = build_decision_signals(
        extraction,
        risk_level=risk_level,
        case_count=case_count,
        knowledge_doc_count=doc_count,
    )
    case_titles = "、".join(case["title"] for case in cases) or "暂无"
    doc_titles = "、".join(doc["title"] for doc in knowledge_docs) or "暂无"
    return {
        "riskLevel": risk_level,
        **decision_signals,
        "recommendation": build_recommendation(extraction["scenario"]),
        "analysis": (
            f"你的情况属于“{extraction['scenarioLabel']}”类争议。"
            f"参考的重庆本地案例包括{case_titles}；相关法律依据包括{doc_titles}。"
            "建议重点关注：事实是否完整、证据是否能支撑诉求、以及是否适合先调解后仲裁。"
        ),
        "compensationRange": build_compensation_range(extraction["scenario"]),
        "followUpQuestions": build_follow_up_questions(extraction),
        "cautions": [
            "本结果仅用于信息参考，不构成法律意见。",
            "具体情况请咨询专业律师或拨打12348法律援助热线。",
            "如果存在时效、管辖或证据不足问题，应尽快补充材料。",
        ],
        "nextSteps": build_next_steps(extraction["scenario"]),
        "sourceSummary": {
            "cases": case_titles,
            "knowledgeDocs": doc_titles,
        },
    }


def build_decision_signals(
    extraction: dict,
    *,
    risk_level: str,
    case_count: int,
    knowledge_doc_count: int,
) -> dict:
    missing_count = len(extraction.get("missingInfo", []))
    citation_count = min(2, knowledge_doc_count) + min(1, case_count)
    confidence = float(extraction.get("confidence", 0.5) or 0.5)

    if risk_level == "high":
        confidence -= 0.12
    elif risk_level == "medium":
        confidence -= 0.06
    if missing_count >= 3:
        confidence -= 0.12
    else:
        confidence -= missing_count * 0.03
    if citation_count == 0:
        confidence -= 0.16
    if case_count == 0 and extraction.get("scenario") != "unknown":
        confidence -= 0.05

    normalized_confidence = clamp_confidence(confidence)
    handoff_reasons = dedupe(
        [
            "争议类型未识别，需要人工确认劳动法适用范围。"
            if extraction.get("scenario") == "unknown"
            else None,
            "风险等级为 high，当前信息不足以直接给出稳定路径。"
            if risk_level == "high"
            else None,
            f"缺少{missing_count}项关键信息，需补齐后再评估。"
            if missing_count >= 3
            else None,
            "未命中可引用的重庆案例或法源材料。" if citation_count == 0 else None,
            "系统置信度低于 0.55，建议人工复核。"
            if normalized_confidence < 0.55
            else None,
        ]
    )
    return {
        "confidence": normalized_confidence,
        "confidenceLabel": (
            "high" if normalized_confidence >= 0.72 else "medium" if normalized_confidence >= 0.55 else "low"
        ),
        "handoffRequired": bool(handoff_reasons),
        "handoffReasons": handoff_reasons,
    }


def clamp_confidence(value: float) -> float:
    return max(0.2, min(0.92, round(value, 2)))


def build_next_steps(scenario: str) -> list[str]:
    common = ["整理时间线", "保存聊天、工资和考勤记录", "核对仲裁时效"]
    if scenario == "wage_arrears":
        return [*common, "先申请工资支付相关救济"]
    if scenario == "unlawful_termination":
        return [*common, "保留解除通知与规章制度"]
    if scenario == "no_written_contract":
        return [*common, "确认书面劳动合同签订时间"]
    if scenario == "overtime":
        return [*common, "补齐排班、打卡、审批或主管安排记录"]
    if scenario == "labor_relation":
        return [*common, "补齐平台规则、考勤排班、奖惩和收入结算记录"]
    if scenario == "social_insurance":
        return [*common, "调取社保缴费记录并区分补缴与损失赔偿"]
    if scenario == "work_injury":
        return [*common, "确认工伤认定、诊断证明和停工留薪期材料"]
    if scenario == "female_protection":
        return [*common, "保存孕检材料、调岗通知和工资变化记录"]
    if scenario == "non_compete":
        return [*common, "核对岗位涉密性、补偿支付和限制范围"]
    if scenario == "pay_benefits":
        return [*common, "按最低工资、年休假或停工停产规则拆分金额"]
    if scenario == "mixed":
        return [*common, "把工资、解除和合同拆成三个独立主张"]
    return [*common, "补充入职时间、争议发生时间和诉求金额"]


def build_follow_up_questions(extraction: dict) -> list[str]:
    questions: list[str] = []
    for item in extraction.get("missingInfo", []):
        if item == "入职时间":
            questions.append("你是什么时间入职，是否有入职登记、工牌、社保、排班或工作群记录？")
        elif item == "涉及金额":
            questions.append("争议金额大概是多少，工资标准、欠付月份或差额是如何计算的？")
        elif item == "公司解除理由和书面通知":
            questions.append("公司是否给过书面解除通知，通知里写明了什么解除理由？")
        elif item == "书面劳动合同签订情况":
            questions.append("是否签过书面劳动合同，签订日期和合同起止时间分别是什么？")
        else:
            questions.append(f"请补充：{item}。")

    scenario = extraction.get("scenario")
    if scenario == "unlawful_termination":
        questions.append("公司是否有规章制度、考核记录或违纪处理流程作为解除依据？")
    elif scenario == "overtime":
        questions.append("是否有打卡、排班、加班审批、微信群安排或工作成果提交记录？")
    elif scenario == "social_insurance":
        questions.append("是否能下载社保缴费明细，争议是补缴问题还是待遇损失差额？")
    elif scenario == "labor_relation":
        questions.append("平台或站点是否规定排班、奖惩、接单率、价格或请假规则？")
    elif scenario == "work_injury":
        questions.append("是否已申请工伤认定，手里是否有诊断证明、事故经过和停工留薪期材料？")
    elif scenario == "female_protection":
        questions.append("调岗、降薪或解除发生在孕期、产期还是哺乳期，是否有书面通知？")
    elif scenario == "non_compete":
        questions.append("竞业限制协议约定的范围、期限、补偿标准和实际补偿支付情况是什么？")
    elif scenario == "pay_benefits":
        questions.append("争议具体是最低工资、年休假、停工停产工资、服务期还是其他福利项目？")
    elif scenario == "mixed":
        questions.append("你希望优先主张工资、违法解除、未签合同双倍工资中的哪一项？")
    elif scenario == "unknown":
        questions.append("这件事是否发生在用人单位管理下的工作过程中，核心诉求是工资、解除、合同、社保还是工伤？")

    return dedupe(questions)[:4]


def build_transcript(
    extraction: dict,
    retrieval: dict,
    review: dict,
    overrides: dict[str, str] | None = None,
) -> list[dict]:
    overrides = overrides or {}
    cases = retrieval.get("cases", [])
    knowledge_docs = retrieval.get("knowledgeDocs", [])
    return [
        {
            "agent": AGENT_TRANSCRIPT_LABELS[0],
            "output": overrides.get(
                AGENT_TRANSCRIPT_LABELS[0],
                "\n".join(
                    [
                        f"场景：{extraction['scenarioLabel']}",
                        f"事实：{'；'.join(extraction['facts'])}",
                        f"证据：{'、'.join(extraction['evidence'])}",
                        f"缺口：{'、'.join(extraction['missingInfo']) or '无'}",
                    ]
                ),
            ),
        },
        {
            "agent": AGENT_TRANSCRIPT_LABELS[1],
            "output": "\n".join(
                [
                    "命中的重庆案例："
                    + ("；".join([case["title"] for case in cases]) or "未命中本地案例"),
                    "命中的法条与程序："
                    + (
                        "；".join([doc["title"] for doc in knowledge_docs])
                        or "未命中知识文档"
                    ),
                ]
            ),
        },
        {
            "agent": AGENT_TRANSCRIPT_LABELS[2],
            "output": overrides.get(
                AGENT_TRANSCRIPT_LABELS[2],
                "\n".join(
                    [
                        f"建议：{review['recommendation']}",
                        f"置信度：{review.get('confidence', 0.5)}",
                        "人工交接："
                        + (
                            "；".join(review.get("handoffReasons", []))
                            if review.get("handoffRequired")
                            else "暂不需要"
                        ),
                        f"分析：{review['analysis']}",
                        f"追问：{'；'.join(review.get('followUpQuestions', [])) or '无'}",
                        f"注意：{'；'.join(review['cautions'])}",
                    ]
                ),
            ),
        },
    ]


def build_trace_summary(
    extraction: dict,
    retrieval: dict,
    review: dict,
    transcript: list[dict],
    runtime: AgentRuntimeConfig | None = None,
    extra_quality_flags: list[str] | None = None,
) -> dict:
    config = runtime or get_agent_runtime_config()
    agent_labels = [item["agent"] for item in transcript]
    case_count = len(retrieval.get("cases", []))
    knowledge_doc_count = len(retrieval.get("knowledgeDocs", []))
    missing_info_count = len(extraction.get("missingInfo", []))
    citation_count = min(2, knowledge_doc_count) + min(1, case_count)
    decision_signals = build_decision_signals(
        extraction,
        risk_level=review["riskLevel"],
        case_count=case_count,
        knowledge_doc_count=knowledge_doc_count,
    )

    quality_flags = list(extra_quality_flags or [])
    if len(agent_labels) != len(AGENT_TRANSCRIPT_LABELS) or tuple(agent_labels) != AGENT_TRANSCRIPT_LABELS:
        quality_flags.append("agent链路异常")
    if extraction.get("scenario") == "unknown":
        quality_flags.append("争议类型未识别")
    if missing_info_count:
        quality_flags.append(f"缺少{missing_info_count}项关键信息")
    if case_count == 0:
        quality_flags.append("未命中重庆案例")
    if knowledge_doc_count == 0:
        quality_flags.append("未命中法源材料")
    if config.provider_mode == "local":
        quality_flags.append("本地规则引擎回退")
    elif config.provider_mode == "deepseek" and not config.api_key_configured:
        quality_flags.append("DeepSeek未配置密钥")

    return {
        "providerMode": config.provider_mode,
        "model": config.model,
        "reasoningEffort": config.reasoning_effort,
        "tracingEnabled": config.tracing_enabled,
        "agentCount": len(agent_labels),
        "agentLabels": agent_labels,
        "scenario": extraction["scenario"],
        "scenarioLabel": extraction["scenarioLabel"],
        "riskLevel": review["riskLevel"],
        "confidence": review.get("confidence", decision_signals["confidence"]),
        "confidenceLabel": review.get("confidenceLabel", decision_signals["confidenceLabel"]),
        "handoffRequired": bool(review.get("handoffRequired", decision_signals["handoffRequired"])),
        "handoffReasons": list(review.get("handoffReasons", decision_signals["handoffReasons"])),
        "caseCount": case_count,
        "knowledgeDocCount": knowledge_doc_count,
        "citationCount": citation_count,
        "missingInfoCount": missing_info_count,
        "qualityFlags": dedupe(quality_flags),
    }


def run_analysis_pipeline(
    narrative: str,
    cases: list[LocalCase],
    knowledge_docs: list[KnowledgeDoc],
) -> dict:
    runtime = get_agent_runtime_config()
    extraction = build_extraction(narrative)
    transcript_overrides: dict[str, str] = {}
    extra_quality_flags: list[str] = []

    if runtime.provider_mode == "deepseek" and runtime.api_key_configured:
        api_key = get_provider_api_key()
        if api_key:
            extraction_result = call_deepseek_extraction(
                api_key=api_key,
                runtime=runtime,
                narrative=narrative,
                local_extraction=extraction,
            )
            if extraction_result is not None:
                extraction, raw_extraction = extraction_result
                transcript_overrides[AGENT_TRANSCRIPT_LABELS[0]] = raw_extraction
            else:
                extra_quality_flags.append("DeepSeek案情抽取回退本地")
        else:
            extra_quality_flags.append("DeepSeek未配置密钥")

    retrieval = build_retrieval(extraction, cases, knowledge_docs)
    review = build_review(extraction, retrieval)

    if runtime.provider_mode == "deepseek" and runtime.api_key_configured:
        api_key = get_provider_api_key()
        if api_key:
            review_result = call_deepseek_review(
                api_key=api_key,
                runtime=runtime,
                extraction=extraction,
                retrieval=retrieval,
                local_review=review,
            )
            if review_result is not None:
                review, raw_review = review_result
                transcript_overrides[AGENT_TRANSCRIPT_LABELS[2]] = raw_review
            else:
                extra_quality_flags.append("DeepSeek结论审校回退本地")

    transcript = build_transcript(extraction, retrieval, review, transcript_overrides)
    trace = build_trace_summary(
        extraction,
        retrieval,
        review,
        transcript,
        runtime=runtime,
        extra_quality_flags=extra_quality_flags,
    )
    statute_warning = check_statute_of_limitations(narrative)
    return {
        "extraction": extraction,
        "retrieval": retrieval,
        "review": review,
        "transcript": transcript,
        "trace": trace,
        "statuteWarning": statute_warning,
    }


def call_deepseek_extraction(
    *,
    api_key: str,
    runtime: AgentRuntimeConfig,
    narrative: str,
    local_extraction: dict,
) -> tuple[dict, str] | None:
    prompt = build_deepseek_extraction_prompt(narrative)
    try:
        result = call_json_completion(
            api_key=api_key,
            base_url=runtime.base_url,
            model=runtime.model,
            messages=prompt,
            reasoning_effort=runtime.reasoning_effort,
            timeout=runtime.timeout_seconds,
        )
        remote = parse_json_object(result.content)
        merged = merge_extraction_payload(local_extraction, remote)
        return merged, result.content.strip() or json.dumps(merged, ensure_ascii=False)
    except Exception:
        return None


def call_deepseek_review(
    *,
    api_key: str,
    runtime: AgentRuntimeConfig,
    extraction: dict,
    retrieval: dict,
    local_review: dict,
) -> tuple[dict, str] | None:
    import sys
    import traceback

    prompt = build_deepseek_review_prompt(extraction, retrieval, local_review)
    try:
        review_timeout = max(runtime.timeout_seconds, 90)
        result = call_json_completion(
            api_key=api_key,
            base_url=runtime.base_url,
            model=runtime.model,
            messages=prompt,
            reasoning_effort=runtime.reasoning_effort,
            timeout=review_timeout,
        )
        print(f"[DEEPSEEK REVIEW] raw content length: {len(result.content)}", file=sys.stderr)
        remote = parse_json_object(result.content)
        print(f"[DEEPSEEK REVIEW] parsed keys: {list(remote.keys())}", file=sys.stderr)
        merged = merge_review_payload(local_review, remote)
        unsafe_text = " ".join([
            merged.get("recommendation", ""),
            merged.get("analysis", ""),
            " ".join(merged.get("cautions", [])),
        ])
        if contains_unsafe_judgment(unsafe_text):
            print("[DEEPSEEK REVIEW] blocked by unsafe judgment filter", file=sys.stderr)
            return None
        return merged, result.content.strip() or json.dumps(merged, ensure_ascii=False)
    except Exception as exc:
        print(f"[DEEPSEEK REVIEW ERROR] {type(exc).__name__}: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return None


def stream_deepseek_review(
    *,
    api_key: str,
    runtime: AgentRuntimeConfig,
    extraction: dict,
    retrieval: dict,
    local_review: dict,
):
    import sys

    prompt = build_deepseek_stream_prompt(extraction, retrieval)
    review_timeout = max(runtime.timeout_seconds, 120)
    try:
        token_iter = call_streaming_completion(
            api_key=api_key,
            base_url=runtime.base_url,
            model=runtime.model,
            messages=prompt,
            reasoning_effort=runtime.reasoning_effort,
            timeout=review_timeout,
            json_mode=False,
        )
        full_content = ""
        for token in token_iter:
            full_content += token
            yield ("token", token)

        if contains_unsafe_judgment(full_content):
            print("[DEEPSEEK REVIEW STREAM] blocked by unsafe judgment filter", file=sys.stderr)
            yield ("error", None)
            return

        merged = dict(local_review)
        if len(full_content.strip()) > 30:
            merged["analysis"] = full_content.strip()
        yield ("done", merged)
    except Exception as exc:
        print(f"[DEEPSEEK REVIEW STREAM ERROR] {type(exc).__name__}: {exc}", file=sys.stderr)
        yield ("error", None)


def build_deepseek_stream_prompt(extraction: dict, retrieval: dict) -> list[dict[str, str]]:
    cases_summary = []
    for c in retrieval.get("cases", [])[:3]:
        cases_summary.append(f"- {c['title']}：{c.get('holding', c.get('summary', ''))}")
    docs_summary = []
    for d in retrieval.get("knowledgeDocs", [])[:3]:
        docs_summary.append(f"- {d['title']}：{d.get('summary', '')}")

    system = (
        "你是重庆劳动法律师，正在和劳动者面对面聊天。"
        "直接用'你'称呼对方，语气温暖专业。"
        "针对用户具体事实分析，结合案例法规，给出方向判断和下一步建议。"
        "不要输出JSON，不要用标题格式，直接说话。"
        "控制在300-500字。"
    )
    user = "\n".join([
        f"争议类型：{extraction.get('scenarioLabel', '未识别')}",
        f"事实：{'；'.join(extraction.get('facts', []))}",
        f"时间线：{'；'.join(extraction.get('timeline', []))}",
        f"证据：{'；'.join(extraction.get('evidence', []))}",
        f"缺口：{'；'.join(extraction.get('missingInfo', []))}",
        "",
        "参考案例：" + ("\n".join(cases_summary) if cases_summary else "暂无"),
        "法规：" + ("\n".join(docs_summary) if docs_summary else "暂无"),
        "",
        "请直接给这位劳动者分析他的情况和建议。",
    ])
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

def build_deepseek_extraction_prompt(narrative: str) -> list[dict[str, str]]:
    system = (
        "你是重庆劳动法案情抽取Agent。"
        "你只能分析劳动争议相关事实，不能扩展到其他领域。"
        "必须只输出JSON对象，不要输出Markdown、代码块、解释或多余文字。"
    )
    user = "\n".join(
        [
            "请根据下面的案情叙述抽取结构化信息，保持字段名不变。",
            "输出格式必须包含：scenario, scenarioLabel, confidence, facts, timeline, evidence, missingInfo, keywords。",
            "scenario 只能是 wage_arrears、unlawful_termination、no_written_contract、overtime、labor_relation、social_insurance、work_injury、female_protection、non_compete、pay_benefits、mixed、unknown 之一。",
            "如果无法稳定识别，就使用 unknown。",
            "案情叙述：",
            narrative,
            "期望 JSON 示例：",
            json.dumps(
                {
                    "scenario": "mixed",
                    "scenarioLabel": "混合争议",
                    "confidence": 0.78,
                    "facts": ["..."],
                    "timeline": ["..."],
                    "evidence": ["..."],
                    "missingInfo": ["..."],
                    "keywords": ["..."],
                },
                ensure_ascii=False,
            ),
        ]
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_deepseek_review_prompt(extraction: dict, retrieval: dict, local_review: dict) -> list[dict[str, str]]:
    system = (
        "你是一位经验丰富的重庆劳动法律师，正在和一位普通劳动者对话。"
        "你的任务是根据用户的具体情况，给出温暖、专业、有针对性的分析和建议。"
        "\n\n要求："
        "\n1. 用第二人称'你'直接和用户说话，像朋友一样关心他们的处境"
        "\n2. analysis 字段必须针对用户的具体事实进行分析，不要泛泛而谈"
        "\n3. 结合检索到的重庆本地案例和法规，告诉用户他的情况在实践中通常怎么处理"
        "\n4. recommendation 用一句话说清楚现在最该做什么"
        "\n5. nextSteps 给出3-5个具体可操作的步骤"
        "\n6. followUpQuestions 问用户还需要补充什么信息才能更准确判断"
        "\n7. 不要输出胜诉保证、裁判偏向，但要给出实际有用的方向判断"
        "\n8. 必须只输出JSON对象"
    )
    cases_summary = []
    for c in retrieval.get("cases", [])[:3]:
        cases_summary.append(f"- {c['title']}：{c.get('holding', c.get('summary', ''))}")
    docs_summary = []
    for d in retrieval.get("knowledgeDocs", [])[:4]:
        docs_summary.append(f"- {d['title']}（{d.get('sourceLabel', '')}）：{d.get('summary', '')}")

    user = "\n".join([
        "用户的情况：",
        f"- 争议类型：{extraction.get('scenarioLabel', '未识别')}",
        f"- 事实：{'；'.join(extraction.get('facts', []))}",
        f"- 时间线：{'；'.join(extraction.get('timeline', []))}",
        f"- 现有证据：{'；'.join(extraction.get('evidence', []))}",
        f"- 信息缺口：{'；'.join(extraction.get('missingInfo', []))}",
        "",
        "检索到的重庆本地案例：",
        "\n".join(cases_summary) if cases_summary else "暂无",
        "",
        "相关法律法规：",
        "\n".join(docs_summary) if docs_summary else "暂无",
        "",
        "请输出JSON，包含以下字段：",
        "- riskLevel: low/medium/high（材料完整度）",
        "- confidence: 0-1的小数",
        "- recommendation: 一句话建议（现在最该做什么）",
        "- analysis: 2-4段话的详细分析（针对用户具体情况，结合案例和法规，像律师和当事人面对面聊天一样）",
        "- compensationRange: 赔偿/补偿方向提示（如适用）",
        "- nextSteps: 具体可操作步骤列表",
        "- followUpQuestions: 需要用户补充的信息",
        "- handoffRequired: 是否建议找线下律师（bool）",
        "- handoffReasons: 建议找律师的原因",
        "- cautions: 注意事项",
    ])
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def merge_extraction_payload(local_extraction: dict, remote: dict) -> dict:
    merged = dict(local_extraction)
    merged["scenario"] = local_extraction.get("scenario", "unknown")
    merged["scenarioLabel"] = local_extraction.get("scenarioLabel") or SCENARIO_LABELS.get(
        merged["scenario"],
        "未识别场景",
    )

    if merged["scenario"] == "unknown":
        return merged

    for key in ("facts", "timeline", "evidence", "keywords"):
        values = clean_string_list(remote.get(key))
        if values:
            merged[key] = dedupe(values)

    if not merged.get("scenarioLabel"):
        merged["scenarioLabel"] = SCENARIO_LABELS.get(merged["scenario"], "未识别场景")
    return merged


def merge_review_payload(local_review: dict, remote: dict) -> dict:
    merged = dict(local_review)
    merged["sourceSummary"] = local_review.get("sourceSummary", merged.get("sourceSummary"))

    if remote.get("analysis") and isinstance(remote["analysis"], str) and len(remote["analysis"]) > 20:
        merged["analysis"] = remote["analysis"]
    if remote.get("recommendation") and isinstance(remote["recommendation"], str):
        merged["recommendation"] = remote["recommendation"]
    if remote.get("nextSteps") and isinstance(remote["nextSteps"], list):
        merged["nextSteps"] = [str(s) for s in remote["nextSteps"] if s]
    if remote.get("followUpQuestions") and isinstance(remote["followUpQuestions"], list):
        merged["followUpQuestions"] = [str(q) for q in remote["followUpQuestions"] if q]
    if remote.get("compensationRange") and isinstance(remote["compensationRange"], str):
        merged["compensationRange"] = remote["compensationRange"]
    if remote.get("confidence") is not None:
        try:
            merged["confidence"] = float(remote["confidence"])
        except (TypeError, ValueError):
            pass
    if remote.get("riskLevel") in ("low", "medium", "high"):
        merged["riskLevel"] = remote["riskLevel"]
    return merged


def clean_text_value(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def clean_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def contains_unsafe_judgment(text: str) -> bool:
    return bool(UNSAFE_JUDGMENT_PATTERN.search(text))
