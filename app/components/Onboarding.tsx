"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "cq-labor-onboarded";

interface Step {
  target: string;
  title: string;
  text: string;
  position: "bottom" | "top";
}

const steps: Step[] = [
  {
    target: ".conversation-hero",
    title: "第一步：描述你的情况",
    text: "用自己的话说清楚发生了什么，比如被辞退、拖欠工资等",
    position: "bottom",
  },
  {
    target: ".ask-panel, .guided-input",
    title: "第二步：AI 帮你分析",
    text: "系统会自动查找相关法律和案例，几秒钟出结果",
    position: "bottom",
  },
  {
    target: ".topbar__brand",
    title: "第三步：获得行动建议",
    text: "告诉你该去哪里仲裁、带什么材料、注意什么时效",
    position: "bottom",
  },
];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(-1);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setCurrentStep(0), 800);
    return () => clearTimeout(timer);
  }, []);

  function next() {
    if (currentStep >= steps.length - 1) {
      finish();
    } else {
      setCurrentStep(currentStep + 1);
    }
  }

  function finish() {
    localStorage.setItem(STORAGE_KEY, "1");
    setCurrentStep(-1);
  }

  if (currentStep < 0) return null;

  const step = steps[currentStep];

  return (
    <>
      <div className="onboarding-overlay" onClick={finish} />
      <div className={`onboarding-tooltip onboarding-tooltip--${step.position}`}>
        <div className="onboarding-tooltip__progress">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot ${i === currentStep ? "onboarding-dot--active" : ""} ${i < currentStep ? "onboarding-dot--done" : ""}`}
            />
          ))}
        </div>
        <strong className="onboarding-tooltip__title">{step.title}</strong>
        <p className="onboarding-tooltip__text">{step.text}</p>
        <div className="onboarding-tooltip__actions">
          <button type="button" className="link-button" onClick={finish}>
            跳过
          </button>
          <button type="button" className="primary" onClick={next}>
            {currentStep >= steps.length - 1 ? "开始使用" : "下一步"}
          </button>
        </div>
      </div>
    </>
  );
}
