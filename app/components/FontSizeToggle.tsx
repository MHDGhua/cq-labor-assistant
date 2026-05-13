"use client";

import { useEffect, useState } from "react";

type FontSize = "normal" | "large" | "xlarge";

const STORAGE_KEY = "cq-labor-font-size";

const labels: Record<FontSize, string> = {
  normal: "标准",
  large: "大字",
  xlarge: "超大",
};

const scales: Record<FontSize, string> = {
  normal: "1",
  large: "1.2",
  xlarge: "1.45",
};

export default function FontSizeToggle() {
  const [size, setSize] = useState<FontSize>("normal");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as FontSize | null;
    if (saved && scales[saved]) {
      setSize(saved);
      document.documentElement.style.setProperty("--font-scale", scales[saved]);
    }
  }, []);

  function cycle() {
    const order: FontSize[] = ["normal", "large", "xlarge"];
    const next = order[(order.indexOf(size) + 1) % order.length];
    setSize(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.style.setProperty("--font-scale", scales[next]);
  }

  return (
    <button
      type="button"
      className="font-toggle"
      onClick={cycle}
      aria-label={`当前字号：${labels[size]}，点击切换`}
    >
      字{size !== "normal" ? ` · ${labels[size]}` : ""}
    </button>
  );
}
