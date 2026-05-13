"use client";

interface PipelineProgressProps {
  current: number;
  total: number;
  label: string;
}

const steps = [
  { id: 1, name: "理解案情" },
  { id: 2, name: "查找案例" },
  { id: 3, name: "整理建议" },
];

export default function PipelineProgress({ current, total, label }: PipelineProgressProps) {
  return (
    <div className="pipeline-progress">
      <div className="pipeline-steps">
        {steps.map((step) => {
          const status =
            step.id < current ? "done" :
            step.id === current ? "active" :
            "pending";
          return (
            <div key={step.id} className={`pipeline-step pipeline-step--${status}`}>
              <div className="pipeline-step__dot">
                {status === "done" ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <span>{step.id}</span>
                )}
              </div>
              <span className="pipeline-step__label">{step.name}</span>
            </div>
          );
        })}
      </div>
      <p className="pipeline-label">{label}</p>
    </div>
  );
}
