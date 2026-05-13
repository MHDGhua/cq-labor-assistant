"use client";

import { findOffice, getMaterials } from "@/lib/data/arbitration-offices";
import type { PublicAnalysisResponse } from "@/lib/agents/types";

interface ActionCardProps {
  result: PublicAnalysisResponse;
}

export default function ActionCard({ result }: ActionCardProps) {
  const office = findOffice(result.answer + " " + (result.headline || ""));
  const materials = getMaterials(result.scenarioLabel ? mapScenarioLabel(result.scenarioLabel) : "wage_arrears");

  return (
    <div className="action-card">
      <div className="action-card__header">
        <strong>去哪里申请仲裁</strong>
      </div>

      <div className="action-card__office">
        <h4>{office.name}</h4>
        <div className="action-card__info">
          <p><span className="action-card__icon-label">地址</span>{office.address}</p>
          <p><span className="action-card__icon-label">电话</span>{office.phone}</p>
          <p><span className="action-card__icon-label">时间</span>{office.hours}</p>
        </div>
        <div className="action-card__buttons">
          <a
            className="primary action-card__btn"
            href={`https://uri.amap.com/search?keyword=${encodeURIComponent(office.name)}&city=重庆`}
            target="_blank"
            rel="noreferrer"
          >
            导航到这里
          </a>
          <a
            className="primary primary--ghost action-card__btn"
            href={`tel:${office.phone.replace(/-/g, "")}`}
          >
            拨打电话
          </a>
        </div>
      </div>

      <div className="action-card__materials">
        <strong>需要带的材料</strong>
        <ul className="material-list">
          {materials.map((item) => (
            <li key={item.name} className="material-item">
              <span className={`material-badge ${item.required ? "material-badge--required" : "material-badge--optional"}`}>
                {item.required ? "必带" : "有就带"}
              </span>
              <span className="material-name">{item.name}</span>
              {item.note ? <small className="material-note">{item.note}</small> : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="action-card__tip">
        <p>到了之后跟窗口说"我要申请劳动仲裁"就行，工作人员会指导你填表。</p>
      </div>
    </div>
  );
}

function mapScenarioLabel(label: string): string {
  const map: Record<string, string> = {
    "拖欠工资": "wage_arrears",
    "违法解除/辞退": "unlawful_termination",
    "未签书面劳动合同": "no_written_contract",
    "加班费/工时争议": "overtime",
    "劳动关系认定": "labor_relation",
    "社会保险争议": "social_insurance",
    "工伤待遇争议": "work_injury",
    "女职工特殊保护": "female_protection",
    "竞业限制争议": "non_compete",
    "工资福利/休假争议": "pay_benefits",
    "混合争议": "mixed",
  };
  return map[label] || "wage_arrears";
}
