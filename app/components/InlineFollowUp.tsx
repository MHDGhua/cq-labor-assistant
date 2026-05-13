"use client";

import { FormEvent, useState } from "react";

interface InlineFollowUpProps {
  scenarioLabel: string;
  onSubmit: (text: string) => void;
  loading: boolean;
}

export default function InlineFollowUp({ scenarioLabel, onSubmit, loading }: InlineFollowUpProps) {
  const [text, setText] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(`补充信息（${scenarioLabel}）：${trimmed}`);
    setText("");
  }

  return (
    <form className="inline-followup" onSubmit={handleSubmit}>
      <strong className="inline-followup__title">补充更多信息</strong>
      <div className="inline-followup__row">
        <input
          type="text"
          className="inline-followup__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="比如：我入职时间是2023年3月..."
          disabled={loading}
        />
        <button type="submit" className="primary" disabled={loading || !text.trim()}>
          再次分析
        </button>
      </div>
      <p className="inline-followup__hint">
        补充入职时间、工资金额、证据等信息，可以让分析更准确
      </p>
    </form>
  );
}
