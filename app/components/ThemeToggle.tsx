"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "cq-labor-theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved) {
      setTheme(saved);
      applyTheme(saved);
    }
  }, []);

  function cycle() {
    const order: Theme[] = ["system", "dark", "light"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const labels: Record<Theme, string> = {
    system: "自动",
    dark: "深色",
    light: "浅色",
  };

  return (
    <button
      type="button"
      className="font-toggle"
      onClick={cycle}
      aria-label={`当前主题：${labels[theme]}，点击切换`}
    >
      {theme === "light" ? "☀" : theme === "dark" ? "🌙" : "◐"} {labels[theme]}
    </button>
  );
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  }
}
