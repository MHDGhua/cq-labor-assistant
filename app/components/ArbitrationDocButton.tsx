"use client";

import { useState } from "react";
import type { PublicAnalysisResponse } from "@/lib/agents/types";
import { generateArbitrationDoc } from "@/lib/utils/arbitration-doc";

interface ArbitrationDocButtonProps {
  result: PublicAnalysisResponse;
}

export default function ArbitrationDocButton({ result }: ArbitrationDocButtonProps) {
  const [generated, setGenerated] = useState(false);

  function handleDownload() {
    const content = generateArbitrationDoc(result);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `仲裁申请书-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setGenerated(true);
  }

  return (
    <div className="arb-doc-section">
      <button
        type="button"
        className="primary"
        onClick={handleDownload}
      >
        {generated ? "已下载，再次下载" : "生成仲裁申请书模板"}
      </button>
      <p className="arb-doc-hint">
        下载后用记事本打开，把"____"替换成你的信息，打印后带去仲裁委
      </p>
    </div>
  );
}
