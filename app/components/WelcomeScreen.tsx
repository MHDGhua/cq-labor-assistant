"use client";

const scenarios = [
  { label: "拖欠工资", prompt: "公司拖欠了我的工资" },
  { label: "被辞退", prompt: "公司口头辞退了我" },
  { label: "没签合同", prompt: "公司一直没签劳动合同" },
  { label: "加班没加班费", prompt: "公司让我加班但不给加班费" },
  { label: "工伤", prompt: "我在工作中受伤了" },
  { label: "社保问题", prompt: "公司没给我交社保" },
];

interface Props {
  onScenarioSelect: (prompt: string) => void;
}

export default function WelcomeScreen({ onScenarioSelect }: Props) {
  return (
    <div className="welcome">
      <div className="welcome__icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </div>
      <h1 className="welcome__title">你的重庆劳动法律顾问</h1>
      <p className="welcome__desc">
        描述你遇到的劳动争议，我会根据重庆本地法规和案例帮你分析，告诉你该怎么做。
      </p>
      <div className="welcome__scenarios">
        {scenarios.map((s) => (
          <button
            key={s.label}
            className="welcome__scenario-btn"
            type="button"
            onClick={() => onScenarioSelect(s.prompt)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
