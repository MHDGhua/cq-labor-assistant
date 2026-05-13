"use client";

import { useMemo } from "react";

interface InputHintsProps {
  text: string;
}

interface HintRule {
  id: string;
  label: string;
  patterns: RegExp[];
}

const rules: HintRule[] = [
  {
    id: "time",
    label: "入职时间",
    patterns: [/\d{4}年/, /\d{2,4}[.\-/]\d{1,2}/, /入职/, /上班.*[年月]/, /干了.*[年月]/],
  },
  {
    id: "salary",
    label: "工资金额",
    patterns: [/\d+[元块千万]/, /工资/, /月薪/, /底薪/, /收入/],
  },
  {
    id: "issue",
    label: "发生了什么",
    patterns: [/辞退/, /开除/, /拖欠/, /不给/, /扣/, /没签/, /加班/, /受伤/, /怀孕/, /被/, /不让/],
  },
  {
    id: "evidence",
    label: "有什么证据",
    patterns: [/合同/, /聊天/, /录音/, /截图/, /转账/, /工资条/, /打卡/, /证据/, /记录/],
  },
];

export default function InputHints({ text }: InputHintsProps) {
  const missing = useMemo(() => {
    if (text.length < 5) return [];
    return rules.filter(
      (rule) => !rule.patterns.some((p) => p.test(text))
    );
  }, [text]);

  if (missing.length === 0 || text.length < 10) return null;

  return (
    <div className="input-hints" role="status" aria-live="polite">
      <span className="input-hints__label">建议补充：</span>
      {missing.map((hint) => (
        <span key={hint.id} className="input-hints__chip">{hint.label}</span>
      ))}
    </div>
  );
}
