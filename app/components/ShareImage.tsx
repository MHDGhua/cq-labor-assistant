"use client";

import { useRef, useState } from "react";
import type { PublicAnalysisResponse } from "@/lib/agents/types";

interface ShareImageProps {
  result: PublicAnalysisResponse;
}

export default function ShareImage({ result }: ShareImageProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (!cardRef.current || generating) return;
    setGenerating(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#131b1d",
        scale: 2,
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `劳动维权分析-${Date.now()}.png`;
      link.href = url;
      link.click();
    } finally {
      setGenerating(false);
    }
  }

  const riskLabel =
    result.riskLevel === "low" ? "证据较充分" :
    result.riskLevel === "medium" ? "需补充材料" : "信息不足";

  return (
    <div className="share-section">
      <button
        type="button"
        className="primary primary--ghost"
        onClick={handleGenerate}
        disabled={generating}
      >
        {generating ? "生成中..." : "保存为图片（可发微信）"}
      </button>

      <div className="share-card" ref={cardRef}>
        <div className="share-card__header">
          <h3>劳动维权分析报告</h3>
          <span className={`share-risk share-risk--${result.riskLevel}`}>
            {riskLabel}
          </span>
        </div>

        <p className="share-card__scenario">
          类型：{result.scenarioLabel}
        </p>

        <div className="share-card__body">
          <p className="share-card__headline">{result.headline}</p>
          <p className="share-card__answer">{result.answer}</p>
        </div>

        <div className="share-card__steps">
          <strong>接下来要做的：</strong>
          <ol>
            {result.nextSteps.slice(0, 3).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="share-card__footer">
          <p>免费法律援助热线：12348</p>
          <p className="share-card__disclaimer">
            本分析由AI生成，仅供参考，不构成法律意见
          </p>
        </div>
      </div>
    </div>
  );
}